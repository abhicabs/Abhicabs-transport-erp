/**
 * AdminRealtimeContext — establishes exactly ONE Socket.IO connection for the
 * whole admin session and shares it via context, so multiple components
 * (Navbar's live indicator, Dashboard's activity feed, Dispatch board, etc.)
 * can all react to the same live events without opening duplicate sockets.
 *
 * The backend auto-joins this identity to the right rooms based on role
 * (ADMIN → `dispatch` + `admin`, OPS → `dispatch`) — see the backend's
 * src/realtime/rooms.js. This provider just listens for whatever the
 * backend pushes to those rooms.
 *
 * Events (see backend src/realtime/bridge.js for exact payload shapes):
 *   booking:created    — a new booking was made (customer website OR ERP)
 *   booking:attempted  — a booking attempt happened (in-flight)
 *   admin:alert        — a booking attempt FAILED — needs admin attention
 *   trip:status        — a booking's status changed
 *   booking:allocated  — a driver/vehicle was assigned
 *   payment:received   — a payment came in
 *
 * Booking requests are NOT a socket event on the current backend (it emits
 * booking_request.created internally but never forwards it to sockets), so
 * new requests are detected by polling GET /admin/booking-requests — see
 * pollRequests below.
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import { API_BASE_URL, USE_MOCK, apiClient } from '../services/apiClient';
import { getToken } from '../services/authStorage';
import { contactService, bookingService, bookingOpsService } from '../services';
import { useAuth } from '../hooks/useAuth';
import { PERMISSIONS } from '../constants';
import { playNotificationSound } from '../lib/notificationSound';

const AdminRealtimeContext = createContext({
  connected: false, feed: [], lastEventId: null, lastBookingEventId: null,
  newRequestCount: 0, requestTick: 0, refreshRequestCount: () => {},
  bookingAlerts: [],
  confirmBookingAlert: async () => {},
  dismissBookingAlert: () => {},
  removeBookingAlert: () => {},
});

const MAX_FEED_ITEMS = 30;
const FEED_STORAGE_KEY = 'abhi_realtime_feed';

// ── New-booking confirm/dismiss alerts ──────────────────────────────────────
// A new booking arrives PENDING and must be explicitly confirmed by a human.
// Each such booking becomes an "alert" that:
//   • first shows as a centre-screen confirm/dismiss popup (NewBookingPopup),
//   • and, once dismissed, keeps nagging as a corner notification card
//     (BookingAlertStack) until it is confirmed — hence `dismissed` per alert.
// Alerts are persisted so a page reload doesn't silently drop an un-actioned
// booking; on mount they are re-validated against the backend and any that are
// no longer PENDING (confirmed/cancelled elsewhere) are cleared.
const ALERTS_STORAGE_KEY = 'abhi_new_booking_alerts';
const MAX_ALERTS = 20;

function loadPersistedAlerts() {
  try {
    const raw = sessionStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw).slice(0, MAX_ALERTS);
  } catch { /* ignore */ }
  return [];
}

function persistAlerts(alerts) {
  try { sessionStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS))); } catch { /* ignore */ }
}

// Addresses come back as either a plain string or { address } / { formattedAddress }.
function addrText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '';
}

function loadPersistedFeed() {
  try {
    const raw = sessionStorage.getItem(FEED_STORAGE_KEY);
    if (raw) return JSON.parse(raw).slice(0, MAX_FEED_ITEMS);
  } catch { /* ignore */ }
  return [];
}

function persistFeed(feed) {
  try { sessionStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feed)); } catch { /* ignore */ }
}

export function AdminRealtimeProvider({ children, enabled = true }) {
  const toast = useToast();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState(loadPersistedFeed);


  // FIX: nothing in this app ever played a sound — every event only ever
  // produced a toast + a feed entry. pushFeedItem is the one place every
  // realtime event (booking created, attempted, allocated, trip status,
  // payment received, abandoned checkout) already funnels through, so a
  // single ping call here covers all of them without touching each
  // individual socket.on handler below.
  const pushFeedItem = useCallback((item) => {
    setFeed((prev) => {
      const updated = [{ ...item, id: `${Date.now()}-${Math.random()}`, at: item.at || new Date().toISOString() }, ...prev].slice(0, MAX_FEED_ITEMS);
      persistFeed(updated);
      return updated;
    });
    playNotificationSound();
  }, []);

  // ── Booking requests (polling) ────────────────────────────────────────
  // The backend has no socket event for a new booking request, so this polls
  // GET /admin/booking-requests?status=NEW (BOOKING_MANAGE) every 30 s:
  //   • newRequestCount  — server total of NEW requests, for the sidebar badge
  //   • a NEW id not seen before → toast + sound + feed entry (pushFeedItem)
  //   • requestTick bumps so the Booking Requests page reloads its list
  // The first poll only records what already exists, so nothing toasts on load.
  // The backend lists the queue OLDEST first (max 100 per call), so the newest
  // requests are read from the END of the list using skip.
  const { hasPermission } = useAuth();
  const canSeeRequests = hasPermission(PERMISSIONS.BOOKINGS_VIEW);
  const canManageBookings = hasPermission(PERMISSIONS.BOOKINGS_MANAGE);

  // ── New-booking confirm/dismiss alerts ────────────────────────────────────
  // Tracks the newest booking:created event so the Dashboard can refetch its
  // cards when a booking arrives (it reads `lastBookingEventId`).
  const [lastBookingEventId, setLastBookingEventId] = useState(null);
  const [bookingAlerts, setBookingAlerts] = useState(loadPersistedAlerts);

  // Add a fresh alert (deduped by booking id). Only PENDING bookings qualify.
  const upsertBookingAlert = useCallback((alert) => {
    setBookingAlerts((prev) => {
      if (prev.some((a) => a.id === alert.id)) return prev; // already tracking this booking
      const next = [{ ...alert, dismissed: false }, ...prev].slice(0, MAX_ALERTS);
      persistAlerts(next);
      return next;
    });
  }, []);

  // Dismiss → the popup closes but the booking moves to the nagging corner stack.
  const dismissBookingAlert = useCallback((id) => {
    setBookingAlerts((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a));
      persistAlerts(next);
      return next;
    });
  }, []);

  // Remove entirely (confirmed, or no longer PENDING).
  const removeBookingAlert = useCallback((id) => {
    setBookingAlerts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      persistAlerts(next);
      return next;
    });
  }, []);

  // Confirm a booking straight from the alert. Sends a note so it's traceable
  // and satisfies backends that expect a confirmation remark. Throws on failure
  // so the calling component can keep its spinner/row until it actually succeeds.
  const confirmBookingAlert = useCallback(async (id) => {
    await bookingOpsService.confirm(id, { confirmationNote: 'Confirmed from new-booking alert on dashboard' });
    removeBookingAlert(id);
  }, [removeBookingAlert]);

  // Build an alert from a booking:created payload, enriching it with the full
  // booking record when possible (the socket payload is often minimal).
  const queueBookingAlert = useCallback(async (payload) => {
    if (!canManageBookings) return; // only users who can confirm should be nagged
    const bookingId = payload?.bookingId || payload?.id;
    if (!bookingId) return;
    // Don't filter on payload.status here — the socket payload often has no
    // status field at all (slimBooking defaults to 'PENDING' but the raw
    // event from the service omits it entirely). Always try to show the popup.

    // Try to enrich with full booking data, but NEVER let a failed fetch
    // silently prevent the popup from showing.
    let full = null;
    try { full = await bookingService.get(bookingId); } catch { /* fall back to payload */ }
    const b = full || {};
    const status = b.status || payload.status || 'PENDING';

    // Only skip if we CONFIRMED from the backend that it's past PENDING.
    // If the fetch failed (full === null), assume PENDING and show the popup.
    if (full && status !== 'PENDING') return;

    upsertBookingAlert({
      id: bookingId,
      bookingNumber: b.bookingNumber || payload.bookingNumber || '',
      customerName: b.customer?.user?.name || b.guestName || payload.customerName || payload.guestName || 'Customer',
      customerPhone: b.customer?.user?.phone || b.guestPhone || payload.customerPhone || payload.guestPhone || '',
      pickupAddress: addrText(b.pickupAddress ?? payload.pickupAddress),
      dropAddress: addrText(b.dropAddress ?? payload.dropAddress),
      vehicleClass: b.vehicleClass || payload.vehicleClass || '',
      tripType: b.tripType || payload.tripType || '',
      pickupAt: b.pickupAt || payload.pickupAt || null,
      estimatedFare: Number(b.finalFare ?? b.estimatedFare ?? payload.estimatedFare ?? 0),
      status: 'PENDING',
      at: new Date().toISOString(),
    });
  }, [canManageBookings, upsertBookingAlert]);

  // Refs so the once-created socket effect always calls the latest versions.
  const queueBookingAlertRef = useRef(queueBookingAlert);
  queueBookingAlertRef.current = queueBookingAlert;
  const removeBookingAlertRef = useRef(removeBookingAlert);
  removeBookingAlertRef.current = removeBookingAlert;

  // On mount (and whenever realtime turns on), re-validate any persisted alerts
  // against the backend and drop the ones that are no longer PENDING — e.g. a
  // booking confirmed on the Bookings page before a reload shouldn't keep nagging.
  useEffect(() => {
    if (!enabled || USE_MOCK || !canManageBookings) return undefined;
    let cancelled = false;
    (async () => {
      const current = loadPersistedAlerts();
      if (!current.length) return;
      const results = await Promise.allSettled(current.map((a) => bookingService.get(a.id)));
      if (cancelled) return;
      const statusById = {};
      current.forEach((a, i) => {
        const r = results[i];
        // Only drop when we KNOW it's past PENDING; on fetch error, keep it.
        statusById[a.id] = r.status === 'fulfilled' ? (r.value?.status || 'PENDING') : 'PENDING';
      });
      setBookingAlerts((prev) => {
        const next = prev.filter((a) => (statusById[a.id] ?? a.status) === 'PENDING');
        persistAlerts(next);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [enabled, canManageBookings]);

  const [newRequestCount, setNewRequestCount] = useState(0);
  const [requestTick, setRequestTick] = useState(0);
  const seenRequestIdsRef = useRef(new Set());
  const requestPollFirstRunRef = useRef(true);

  const pollRequests = useCallback(async () => {
    if (!canSeeRequests || USE_MOCK) return;
    try {
      const head = await apiClient.get('/admin/booking-requests', { params: { status: 'NEW', take: 1 } });
      const total = Number(head?.total ?? 0);
      setNewRequestCount(total);
      if (total === 0) { requestPollFirstRunRef.current = false; return; }

      const take = 50;
      const page = await apiClient.get('/admin/booking-requests', {
        params: { status: 'NEW', take, skip: Math.max(total - take, 0) },
      });
      const rows = page?.requests ?? [];

      if (requestPollFirstRunRef.current) {
        rows.forEach((r) => seenRequestIdsRef.current.add(r.id));
        requestPollFirstRunRef.current = false;
        return;
      }
      const fresh = rows.filter((r) => !seenRequestIdsRef.current.has(r.id));
      fresh.forEach((r) => {
        seenRequestIdsRef.current.add(r.id);
        const pickup = r.pickupAddress ? String(r.pickupAddress).split(',')[0] : '';
        const drop = r.dropAddress ? String(r.dropAddress).split(',')[0] : '';
        const route = pickup && drop ? `${pickup} → ${drop}` : pickup;
        const parts = [r.contactName, route, r.vehicleClass].filter(Boolean);
        toast.info(`New booking request ${r.requestNumber || ''}${parts.length ? ` — ${parts.join(' · ')}` : ''}`, { duration: 8000 });
        pushFeedItem({
          kind: 'booking_request:created',
          requestId: r.id, requestNumber: r.requestNumber, tripType: r.tripType,
          vehicleClass: r.vehicleClass, pickupAddress: r.pickupAddress, dropAddress: r.dropAddress,
          pickupAt: r.pickupAt, returnAt: r.returnAt, contactName: r.contactName, at: r.createdAt,
        });
      });
      if (fresh.length) setRequestTick((t) => t + 1);
    } catch { /* best-effort: the next poll retries */ }
  }, [canSeeRequests, pushFeedItem, toast]);

  useEffect(() => {
    if (!enabled) return undefined;
    pollRequests();
    const interval = setInterval(pollRequests, 30000);
    return () => clearInterval(interval);
  }, [enabled, pollRequests]);

  // Called after a status change on the Booking Requests page so the badge
  // drops immediately instead of at the next poll.
  const refreshRequestCount = pollRequests;

  // NEW: abandoned-checkout notifications, via polling — NOT a real-time
  // push. The customer website logs an abandoned checkout as a genuine
  // Contact/Support record (topic "Abandoned Booking"), but creating a
  // contact triggers no socket event at all on the backend (checked
  // contact.service.js directly). Polling this endpoint periodically is
  // the honest, best-available approximation of "notify admin" without a
  // backend change — noticeably faster than "whenever someone happens to
  // open Support," but not instant like the other events in this file.
  const seenAbandonedIdsRef = useRef(new Set());
  const abandonedPollFirstRunRef = useRef(true);

  useEffect(() => {
    if (!enabled || USE_MOCK) return undefined;
    let cancelled = false;

    async function pollAbandoned() {
      try {
        const res = await contactService.list({ search: 'Abandoned Booking', limit: 10, sortBy: 'createdAt', order: 'desc' });
        if (cancelled) return;
        const items = res?.items ?? [];
        // First run just records what already exists — nothing here is
        // "new", so nothing should toast on initial page load.
        if (abandonedPollFirstRunRef.current) {
          items.forEach((c) => seenAbandonedIdsRef.current.add(c.id));
          abandonedPollFirstRunRef.current = false;
          return;
        }
        const freshOnes = items.filter((c) => !seenAbandonedIdsRef.current.has(c.id));
        freshOnes.forEach((c) => {
          seenAbandonedIdsRef.current.add(c.id);
          pushFeedItem({ kind: 'booking:abandoned', contactId: c.id, name: c.name, mobile: c.mobile, message: c.message });
          toast.info(`Abandoned booking — ${c.name} (${c.mobile})`, { duration: 6000 });
        });
      } catch {
        // Best-effort only — a failed poll just tries again next interval.
      }
    }

    pollAbandoned();
    const interval = setInterval(pollAbandoned, 60000); // every 60s
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, pushFeedItem, toast]);

  useEffect(() => {
    if (!enabled || USE_MOCK) return undefined;
    const token = getToken();
    if (!token) return undefined;

    let socket;
    let cancelled = false;

    (async () => {
      try {
        const { io } = await import('socket.io-client');
        if (cancelled) return;

        const socketBase = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

        socket = io(socketBase, {
          auth: { token },
          // Start with websocket, fall back to polling if websocket fails
          // (Cloudflare Workers, some proxies don't support sticky WS)
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000,
          timeout: 20000,
        });
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        // On reconnect attempt, refresh the token in case it expired
        socket.io.on('reconnect_attempt', () => {
          const freshToken = getToken();
          if (freshToken) {
            socket.auth = { token: freshToken };
          }
        });

        socket.on('connect_error', (err) => {
          setConnected(false);
          // If auth failed, try refreshing the token for next attempt
          if (err.message?.includes('auth') || err.message?.includes('jwt') || err.message?.includes('token')) {
            const freshToken = getToken();
            if (freshToken && freshToken !== socket.auth?.token) {
              socket.auth = { token: freshToken };
            }
          }
          console.warn('[realtime] connection failed:', err.message);
        });

        socket.on('booking:created', (payload) => {
          toast.success(
            `New booking ${payload.bookingNumber || payload.bookingId} — ${payload.vehicleClass || 'vehicle'} (${payload.status})`,
            { duration: 6000 }
          );
          pushFeedItem({ kind: 'booking:created', ...payload });

          // Let the Dashboard know a booking (not just any event) arrived, so it
          // refetches its KPI/recent-booking cards.
          setLastBookingEventId(`${Date.now()}-${payload.bookingId || payload.bookingNumber || ''}`);

          // Raise a confirm/dismiss alert — the centre-screen popup appears, and
          // if the admin dismisses it, it keeps nagging in the corner stack
          // until the booking is confirmed.
          queueBookingAlertRef.current(payload);

          // REMOVED: this used to silently POST to
          // /admin/dispatch/bookings/:id/auto-assign the instant a new
          // booking arrived, with no human in the loop. That endpoint does
          // not exist on the backend (dispatch.routes.js has no auto-assign
          // route — allocation is manual-only, see allocation.service.js),
          // so every call already failed; but the intent — assign a driver
          // and vehicle without an Admin choosing them — is exactly the
          // automatic-assignment behaviour this system must not have.
          // A new booking now only surfaces here as a toast + feed item;
          // an Admin opens the Dispatch board, reviews "Suggested drivers"
          // for the booking, and explicitly presses Assign. Nothing on this
          // screen assigns a driver or vehicle on its own.
        });

        // FIX: an attempt only ever silently joined the feed list — no
        // toast at all unless it went on to FAIL. So "someone is trying to
        // book right now" produced no visible notification, only a change
        // to the bell badge count and (as of the sound fix) a ping — easy
        // to miss if the admin wasn't already looking at the bell dropdown.
        // Every attempt now visibly announces itself the moment it happens,
        // not just the ones that go wrong.
        socket.on('booking:attempted', (payload) => {
          if (payload.outcome === 'FAILED') return; // admin:alert covers this louder, below
          const pickup = payload.pickupAddress ? String(payload.pickupAddress).split(',')[0] : '';
          const drop = payload.dropAddress ? String(payload.dropAddress).split(',')[0] : '';
          const route = pickup && drop ? `${pickup} → ${drop}` : pickup || '';
          const who = payload.guestName || payload.customerName || '';
          const parts = [who, route, payload.tripType?.replace(/_/g, ' ')].filter(Boolean);
          toast.info(`Booking attempt${parts.length ? ` — ${parts.join(' · ')}` : ''}`, { duration: 5000 });
          pushFeedItem({ kind: 'booking:attempted', ...payload });
        });

        socket.on('admin:alert', (payload) => {
          toast.error(`Booking attempt failed — ${payload.reason || 'unknown reason'}`, { duration: 8000 });
          pushFeedItem({ kind: 'admin:alert', ...payload });
        });

        socket.on('trip:status', (payload) => {
          pushFeedItem({ kind: 'trip:status', ...payload });
          // If a tracked new-booking moved past PENDING (confirmed/cancelled/etc.
          // anywhere), stop nagging about it.
          const bid = payload.bookingId || payload.id;
          if (bid && payload.status && payload.status !== 'PENDING') {
            removeBookingAlertRef.current(bid);
          }
        });

        socket.on('booking:allocated', (payload) => {
          toast.info(`Booking ${payload.bookingId} allocated a vehicle`, { duration: 5000 });
          pushFeedItem({ kind: 'booking:allocated', ...payload });
        });

        socket.on('payment:received', (payload) => {
          toast.success(`Payment received — ₹${payload.amount} (${payload.purpose})`, { duration: 5000 });
          pushFeedItem({ kind: 'payment:received', ...payload });
        });
      } catch (err) {
        console.warn('[realtime] socket.io-client unavailable:', err.message);
      }
    })();

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // FIX: this used to only track the most recent `booking:created` event, so
  // the Navbar's unread bell counter never incremented for payments, alerts,
  // allocations, or trip-status changes — only new bookings. Now tracks the
  // most recent event of ANY kind (feed is newest-first, so feed[0] is it).
  const lastEventId = feed[0]?.id || null;

  return (
    <AdminRealtimeContext.Provider value={{
      connected, feed, lastEventId, lastBookingEventId,
      newRequestCount, requestTick, refreshRequestCount,
      bookingAlerts, confirmBookingAlert, dismissBookingAlert, removeBookingAlert,
    }}>
      {children}
    </AdminRealtimeContext.Provider>
  );
}

export function useAdminRealtimeContext() {
  return useContext(AdminRealtimeContext);
}