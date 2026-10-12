/**
 * Admin — business-wide payments listing, cash handover reconciliation, and
 * refund viewing. Endpoint: /api/v1/admin/payments
 *
 * REAL backend contract (verified against routes/adminPayment.routes.js):
 *   GET /admin/payments        — paginated list. This is the ONLY route here.
 *
 * Everything else below is reconstructed on the FRONTEND from endpoints that
 * do exist, because the backend has no dedicated route for them:
 *   • Cash handovers  ← /admin/payments?method=CASH&status=CAPTURED
 *                       + /admin/audit?action=CASH_COLLECTED + /admin/drivers
 *   • Refundable      ← /payments/booking/:bookingId  (sum captured − refunded)
 *   • Refund history  ← /admin/payments?purpose=REFUND  (a filter on the list)
 *
 * Refund ISSUING (POST) has no backend route and cannot be safely faked —
 * it moves real money and writes finance ledgers. createRefund() therefore
 * throws a clear error instead of hitting a 404, and the Refunds tab shows the
 * form as view-only until POST /admin/payments/refunds exists.
 */
import { apiClient } from './apiClient';
import { getStoredUser } from './authStorage';

/* ------------------------------------------------------------------ *
 * Cash handover helpers (frontend-only)
 * ------------------------------------------------------------------ */

const PAGE_LIMIT = 100;  // backend max for every list endpoint
const MAX_PAGES  = 20;   // safety cap → up to 2,000 rows per source
const CACHE_MS   = 15000;

/** Confirmations, kept in this browser: { [paymentId]: { confirmedAt, confirmedBy, note } } */
const cashHandoverStore = {
  KEY: 'abhi_cash_handovers_v1',
  read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch { return {}; }
  },
  write(obj) {
    try { localStorage.setItem(this.KEY, JSON.stringify(obj)); } catch { /* storage full / blocked */ }
  },
};

/** Fetch every page of a list endpoint (stops at MAX_PAGES). */
async function fetchAllPages(url, params = {}) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await apiClient.get(url, { params: { ...params, page, limit: PAGE_LIMIT } });
    const rows = res?.items ?? res?.data ?? (Array.isArray(res) ? res : []);
    out.push(...rows);
    totalPages = res?.pagination?.totalPages ?? res?.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGES);
  return out;
}

// List + summary are requested together on every refresh — share one load.
let cashCache = null; // { at, promise }

function loadCashHandoverRows() {
  if (cashCache && Date.now() - cashCache.at < CACHE_MS) return cashCache.promise;
  const promise = buildCashHandoverRows().catch((e) => { cashCache = null; throw e; });
  cashCache = { at: Date.now(), promise };
  return promise;
}

async function buildCashHandoverRows() {
  // 1. Every captured cash payment (the source of truth). Refund records are
  //    excluded — they are money going OUT, not cash a driver holds.
  const payments = (await fetchAllPages('/admin/payments', {
    method: 'CASH', status: 'CAPTURED', sortBy: 'paidAt', order: 'desc',
  })).filter((p) => p.purpose !== 'REFUND');

  // 2. Who collected it: the driver app writes a CASH_COLLECTED audit entry
  //    (actor = the driver, entityId = the booking). Needs AUDIT_VIEW; if the
  //    audit log can't be read, rows still show, just without a driver name.
  const collectorByBooking = new Map();
  try {
    const audits = await fetchAllPages('/admin/audit', { action: 'CASH_COLLECTED' });
    for (const a of audits) {
      if (a.entityId && !collectorByBooking.has(a.entityId)) {
        collectorByBooking.set(a.entityId, { id: a.actorId || a.actor?.id || null, name: a.actor?.name || null });
      }
    }
  } catch { /* no audit access — driver column shows "—" */ }

  // 3. Driver phone numbers (optional nicety).
  const phoneByDriver = new Map();
  try {
    const drivers = await fetchAllPages('/admin/drivers');
    for (const d of drivers) {
      const id = d.userId || d.user?.id || d.id;
      if (id) phoneByDriver.set(id, { name: d.user?.name || d.name || null, phone: d.user?.phone || d.phone || null });
    }
  } catch { /* phone just won't show */ }

  const confirmed = cashHandoverStore.read();

  return payments.map((p) => {
    const collector = collectorByBooking.get(p.bookingId) || null;
    const driverId = collector?.id || null;
    const extra = driverId ? phoneByDriver.get(driverId) : null;
    const c = confirmed[p.id] || null;
    return {
      id: p.id,
      amount: p.amount,
      status: c ? 'CONFIRMED' : 'PENDING',
      driverId,
      driver: driverId
        ? { userId: driverId, user: { name: collector?.name || extra?.name || 'Driver', phone: extra?.phone || '' } }
        : null,
      createdAt: p.paidAt || p.createdAt,
      confirmedAt: c?.confirmedAt || null,
      confirmedBy: c?.confirmedBy || null,
      note: c?.note || null,
      payment: { id: p.id, paidAt: p.paidAt, booking: p.booking || null },
    };
  });
}

export const adminPaymentsService = {
  async list(params = {}) {
    return apiClient.get('/admin/payments', { params });
  },

  /** Convenience: same list(), pre-filtered to refund records. */
  async listRefunds(params = {}) {
    return apiClient.get('/admin/payments', { params: { ...params, purpose: 'REFUND' } });
  },

  // ---- Cash handovers (FRONTEND-ONLY) ---------------------------------------
  // The backend has no /admin/payments/cash-handovers routes, so this is
  // assembled from endpoints that DO exist:
  //   GET /admin/payments?method=CASH&status=CAPTURED  → every cash collection
  //   GET /admin/audit?action=CASH_COLLECTED           → which driver collected it
  //   GET /admin/drivers                               → driver phone numbers
  // "Confirm receipt" is stored in this browser (localStorage) — see
  // cashHandoverStore below — because there is no backend endpoint to save it.

  // ---- Cash handovers — now uses real backend endpoints ----------------------
  //   GET  /admin/payments/cash-handovers     → list all cash payments
  //   POST /admin/payments/:id/reconcile      → confirm receipt

  async cashHandovers(params = {}) {
    try {
      const res = await apiClient.get('/admin/payments/cash-handovers', { params });
      const items = Array.isArray(res?.data) ? res.data : res?.items || [];
      return {
        data: items.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          status: p.reconciledAt ? 'CONFIRMED' : 'PENDING',
          driverId: null,
          driver: null,
          createdAt: p.paidAt || p.createdAt,
          confirmedAt: p.reconciledAt || null,
          confirmedBy: p.reconciledBy ? { id: p.reconciledBy } : null,
          note: p.reconcileNote || null,
          payment: { id: p.id, paidAt: p.paidAt, booking: p.booking || null },
        })),
        meta: res?.meta || res?.pagination || { page: 1, total: items.length },
      };
    } catch {
      // Fallback to the assembled approach if endpoint doesn't exist yet
      const { page = 1, limit = 10, status, driverId } = params;
      let rows = await loadCashHandoverRows();
      if (status)   rows = rows.filter((r) => r.status === status);
      if (driverId) rows = rows.filter((r) => r.driverId === driverId);
      const total = rows.length;
      const paged = rows.slice((page - 1) * limit, page * limit);
      return { data: paged, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
    }
  },

  /** { drivers: [{driverId, driverName, driverPhone, pendingAmount, pendingCount}], totalPending } */
  async cashHandoverSummary() {
    const pending = (await loadCashHandoverRows()).filter((r) => r.status === 'PENDING');
    const byDriver = new Map();
    let totalPending = 0;
    for (const r of pending) {
      const amt = Number(r.amount) || 0;
      totalPending += amt;
      const key = r.driverId || 'unknown';
      const cur = byDriver.get(key) || {
        driverId: key,
        driverName: r.driver?.user?.name || 'Unknown driver',
        driverPhone: r.driver?.user?.phone || null,
        pendingAmount: 0,
        pendingCount: 0,
      };
      cur.pendingAmount += amt;
      cur.pendingCount += 1;
      byDriver.set(key, cur);
    }
    const drivers = [...byDriver.values()]
      .map((d) => ({ ...d, pendingAmount: Math.round(d.pendingAmount * 100) / 100 }))
      .sort((a, b) => b.pendingAmount - a.pendingAmount);
    return { drivers, totalPending: Math.round(totalPending * 100) / 100 };
  },

  async confirmCashHandover(id, note) {
    try {
      const res = await apiClient.post(`/admin/payments/${id}/reconcile`, { note: note || null });
      cashCache = null;
      return res;
    } catch (apiErr) {
      // Fallback to localStorage if backend endpoint doesn't exist yet
      const store = cashHandoverStore.read();
      if (store[id]) throw new Error('This cash handover is already confirmed');
      const me = getStoredUser();
      store[id] = {
        confirmedAt: new Date().toISOString(),
        confirmedBy: { id: me?.id || null, name: me?.name || me?.email || 'Admin' },
        note: note || null,
      };
      cashHandoverStore.write(store);
      cashCache = null;
      return { id, status: 'CONFIRMED', ...store[id] };
    }
  },

  // ---- Refunds --------------------------------------------------------------

  /**
   * Refundable balance for a booking, RECONSTRUCTED (no /admin/payments/refundable
   * route exists). Pass the booking object returned by findBookingByNumber so we
   * can show its number/customer without a second lookup; a bare id also works.
   *
   * Captured / refunded come from GET /payments/booking/:bookingId (needs
   * PAYMENT_VIEW). If that call is not permitted, we fall back to the booking's
   * own advancePaid / refundAmount fields.
   *
   * Returns { booking, totalCaptured, alreadyRefunded, refundable, payments }.
   */
  async refundableBalance(bookingOrId) {
    const b = (bookingOrId && typeof bookingOrId === 'object') ? bookingOrId : null;
    const bookingId = b ? b.id : bookingOrId;

    let payments = [];
    try {
      const res = await apiClient.get(`/payments/booking/${bookingId}`);
      payments = res?.payments ?? res?.data ?? (Array.isArray(res) ? res : []);
    } catch {
      payments = []; // no PAYMENT_VIEW on this booking route — use booking fields
    }

    const sum = (pred) => payments.filter(pred).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    let totalCaptured   = sum((p) => p.status === 'CAPTURED' && p.purpose !== 'REFUND');
    let alreadyRefunded = sum((p) => p.purpose === 'REFUND');

    if (payments.length === 0 && b) {
      totalCaptured   = Number(b.advancePaid ?? 0);
      alreadyRefunded = Number(b.refundAmount ?? 0);
    }

    const refundable = Math.max(0, Math.round((totalCaptured - alreadyRefunded) * 100) / 100);

    return {
      booking: {
        id: bookingId,
        bookingNumber: b?.bookingNumber || null,
        status: b?.status || null,
        customerName: b?.customer?.user?.name || b?.guestName || 'Customer',
        customerPhone: b?.customer?.user?.phone || b?.guestPhone || '',
      },
      totalCaptured,
      alreadyRefunded,
      refundable,
      payments,
    };
  },

  /**
   * Recording a refund needs POST /admin/payments/refunds, which does NOT exist
   * on the backend yet. We refuse loudly rather than 404 silently, and never
   * fake a finance record locally. Re-point this at apiClient.post once the
   * backend route lands.
   */
  async createRefund(_payload) {
    throw new Error(
      'Refund recording is not available yet — the backend route ' +
      'POST /admin/payments/refunds has not been built. You can still view the ' +
      'refundable balance and past refunds here.'
    );
  },

  /**
   * Look up a booking by its human-readable number (ABH-2026-000123) so the
   * refund form can take what staff actually have on hand — not a UUID.
   * Reuses the existing customer-facing lookup route; staff roles bypass its
   * ownership filter server-side (booking.service.js findByNumber).
   */
  async findBookingByNumber(bookingNumber) {
    const data = await apiClient.get(`/bookings/number/${encodeURIComponent(bookingNumber)}`);
    return data.booking || data;
  },

  // ---- Payment Links / QR / Collections (booking-centric) -----------------

  /** Create (or reuse) a Razorpay payment link for a booking. */
  async createPaymentLink(bookingId) {
    return apiClient.post(`/admin/payments/bookings/${bookingId}/link`);
  },

  /** Create (or reuse) a QR code for a booking. */
  async createPaymentQR(bookingId) {
    return apiClient.post(`/admin/payments/bookings/${bookingId}/qr`);
  },

  /** All payment collections for a booking (links, QRs, orders, cash). */
  async getCollections(bookingId) {
    return apiClient.get(`/admin/payments/bookings/${bookingId}/collections`);
  },

  /** Cancel a payment / payment link by its payment id. */
  async cancelPayment(paymentId) {
    return apiClient.post(`/admin/payments/${paymentId}/cancel`);
  },

  /** Resend payment notification. medium: 'sms' | 'email'. */
  async resendPayment(paymentId, medium) {
    return apiClient.post(`/admin/payments/${paymentId}/resend`, { medium });
  },

  // ---- Standalone Payment Link (no booking) -------------------------------

  /** Create a manual payment link — no booking required. */
  async createStandaloneLink(body) {
    return apiClient.post('/admin/payments/link', body);
  },
};
