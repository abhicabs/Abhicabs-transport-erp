/**
 * src/services/compatService.js
 *
 * Works with the backend you have deployed today. Each function first tries
 * the newer endpoint; if the server doesn't have it (a 404 / "route not
 * found"), it works out the same answer from endpoints that already exist —
 * mainly the staff booking list, which already returns each trip's current
 * allocation (driver + vehicle). If the backend is updated later, the newer,
 * faster endpoints are used automatically with no frontend change.
 */
import { apiClient, EndpointNotImplementedError } from './apiClient';

const missing = (e) => e instanceof EndpointNotImplementedError || e?.status === 404;
const rowsOf = (res) => res?.data ?? res?.items ?? [];
const pagesOf = (res) => res?.meta?.totalPages ?? res?.pagination?.totalPages ?? 1;

/** Every booking page for a query (pickup-date window), capped. */
async function allBookings(params, maxPages = 10) {
  const out = [];
  let page = 1; let total = 1;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get('/admin/bookings', { params: { ...params, page, limit: 100 } });
    out.push(...rowsOf(res));
    total = pagesOf(res);
    page += 1;
  } while (page <= total && page <= maxPages);
  return out;
}

const customerNameOf = (b) => {
  const n = b.customer?.user?.name;
  return n && !/^guest$/i.test(n) ? n : (b.guestName || 'Customer');
};

/* ── Trips picking up soon with no vehicle / driver ───────────────────── */

export async function unassignedSoon(hours = 3) {
  try {
    const res = await apiClient.get('/admin/dispatch/unassigned-soon', { params: { hours } });
    return res?.items ?? res?.data?.items ?? [];
  } catch (e) {
    if (!missing(e)) throw e;
  }
  const now = Date.now();
  const rows = await allBookings({
    from: new Date(now - 2 * 3600000).toISOString(),
    to: new Date(now + hours * 3600000).toISOString(),
    sortBy: 'pickupAt', order: 'asc',
  }, 3);
  return rows
    .map((b) => {
      const alloc = b.allocations?.[0];
      const live = alloc && alloc.status !== 'RELEASED';
      let missingWhat = null;
      if (b.status === 'PENDING' || b.status === 'CONFIRMED') missingWhat = 'VEHICLE_AND_DRIVER';
      else if (b.status === 'ALLOCATED' && (!live || !alloc.driverId)) missingWhat = live ? 'DRIVER' : 'VEHICLE_AND_DRIVER';
      if (!missingWhat) return null;
      return {
        id: b.id,
        bookingNumber: b.bookingNumber,
        status: b.status,
        needsConfirmation: b.status === 'PENDING',
        missing: missingWhat,
        pickupAt: b.pickupAt,
        minutesToPickup: Math.round((new Date(b.pickupAt).getTime() - now) / 60000),
        customerName: customerNameOf(b),
        vehicleNumber: live ? alloc.vehicle?.registrationNumber || null : null,
      };
    })
    .filter(Boolean);
}

/* ── Busy times: pickups by weekday × hour ─────────────────────────────── */

export async function peakHours(days = 56) {
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const to = new Date().toISOString();
  try {
    const res = await apiClient.get('/admin/reports/peak-hours', { params: { from, to } });
    return res?.cells ?? [];
  } catch (e) {
    if (!missing(e)) throw e;
  }
  // Up to 1,500 trips, bucketed in the browser's time (India for your team).
  const rows = await allBookings({ from, to, sortBy: 'pickupAt', order: 'desc' }, 15);
  const counts = new Map();
  for (const b of rows) {
    if (['CANCELLED', 'EXPIRED', 'ATTEMPTED'].includes(b.status) || !b.pickupAt) continue;
    const d = new Date(b.pickupAt);
    const key = `${d.getDay()}:${d.getHours()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([k, bookings]) => {
    const [dow, hour] = k.split(':').map(Number);
    return { dow, hour, bookings };
  });
}

/* ── Bookings by source (needs the newer backend; null when unavailable) ─ */

export async function channelMix(range) {
  try {
    const res = await apiClient.get('/admin/reports/channels', { params: range });
    return res?.channels ?? [];
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/* ── Vehicle page: drivers and trips for one vehicle ──────────────────── */

export async function vehicleHistory(id) {
  try {
    const res = await apiClient.get(`/admin/vehicles/${id}/history`);
    return { ...res, assignmentsAvailable: true };
  } catch (e) {
    if (!missing(e)) throw e;
  }

  const vehicleRes = await apiClient.get(`/admin/vehicles/${id}`);
  const vehicle = vehicleRes?.vehicle || vehicleRes;

  // Current driver = whoever has this vehicle as their assigned one.
  let currentDriver = null;
  let page = 1; let pages = 1;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get('/admin/drivers', { params: { page, limit: 100 } });
    const d = rowsOf(res).find((x) => x.assignedVehicleId === id);
    if (d) {
      currentDriver = { driverId: d.userId, name: d.user?.name, phone: d.user?.phone, isActive: d.user?.isActive, isTemporary: d.driverType === 'TEMPORARY' || d.isTemporary, since: null };
      break;
    }
    pages = pagesOf(res);
    page += 1;
  } while (page <= pages && page <= 10);

  // Trips: bookings this vehicle was allocated to. The list carries each
  // booking's LATEST allocation, so a trip later moved to another vehicle has
  // no driver we can name for this one.
  const rows = await allBookings({ vehicleId: id, sortBy: 'pickupAt', order: 'desc' }, 5);
  const trips = rows.map((b) => {
    const a = b.allocations?.[0];
    const ours = a && a.vehicleId === id;
    return {
      allocationId: (a && ours && a.id) || `b-${b.id}`,
      driverId: ours ? a.driverId : null,
      driverName: ours ? a.driver?.user?.name || null : null,
      driverPhone: ours ? a.driver?.user?.phone || null : null,
      assignedAt: (ours && a.createdAt) || b.createdAt,
      current: ours && a.status === 'ACTIVE',
      booking: b,
    };
  });

  const byDriver = new Map();
  for (const t of trips) {
    if (!t.driverId) continue;
    const row = byDriver.get(t.driverId) || { driverId: t.driverId, driverName: t.driverName || 'Driver', driverPhone: t.driverPhone, trips: 0, firstAt: t.assignedAt, lastAt: t.assignedAt };
    row.trips += 1;
    if (t.assignedAt < row.firstAt) row.firstAt = t.assignedAt;
    if (t.assignedAt > row.lastAt) row.lastAt = t.assignedAt;
    byDriver.set(t.driverId, row);
  }

  return {
    vehicle,
    currentDriver,
    assignments: [],
    assignmentsAvailable: false,
    drivers: [...byDriver.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt)),
    trips,
    historySince: null,
  };
}

/* ── Temporary drivers: let them into the driver app ─────────────────── */

/**
 * The backend saves a driver hired from Dispatch with KYC "Pending", and the
 * driver app sends Pending drivers to the KYC screens. Approving them here
 * (the same call the KYC tab's Approve button makes) lets them work at once.
 * Never throws: the hire itself already succeeded.
 */
export async function approveTemporaryDriver(userId) {
  if (!userId) return false;
  try {
    await apiClient.patch(`/admin/drivers/${userId}`, { kycStatus: 'VERIFIED' });
    return true;
  } catch {
    return false;
  }
}
