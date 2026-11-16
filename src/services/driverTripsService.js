/**
 * src/services/driverTripsService.js
 *
 * Loads the full trip history of ONE driver for the Driver Detail page.
 *
 * Why this isn't a single `bookingService.list({ driverId })` call:
 * the admin booking LIST (BOOKING_LIST_SELECT) doesn't return the assigned
 * driver, and the list validator isn't documented to accept `driverId`. A zod
 * schema that silently strips unknown keys would then return EVERY booking —
 * and the page would show other drivers' trips as this driver's. So:
 *
 *   1. SERVER MODE — ask GET /admin/bookings?driverId=… and VERIFY the filter
 *      was honoured by comparing its total with the unfiltered total. If it
 *      is smaller, the backend filtered → page through it and we're done.
 *
 *   2. SCAN MODE (fallback) — walk the booking list newest-first and resolve
 *      each candidate's driver through the existing
 *      GET /admin/dispatch/bookings/:id/allocation endpoint (the same one
 *      LiveTracking/Dispatch already use). Work is done in batches so the
 *      page shows results quickly and offers "Load older trips" for the rest.
 *
 * As soon as the backend supports `driverId` on /admin/bookings, step 1
 * passes automatically and step 2 is never used — no frontend change needed.
 */
import { apiClient } from './apiClient';

const PAGE_SIZE      = 100;  // backend max page size
const MAX_PAGES      = 50;   // safety cap (5,000 bookings)
const SCAN_BATCH     = 200;  // candidate bookings checked per "Load more"
const CONCURRENCY    = 6;    // parallel allocation lookups

// Only these statuses can ever have had a driver allocated.
const DRIVER_STATUSES = new Set([
  'ALLOCATED', 'EN_ROUTE', 'REACHED', 'ARRIVED', 'ONGOING', 'COMPLETED', 'CANCELLED',
]);
// Finished bookings never change driver again — safe to cache across drivers.
const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
const allocationCache = new Map(); // bookingId → { driverId, vehicle } | null

const rowsOf = (res) => res?.data ?? res?.items ?? res?.bookings ?? [];
const metaOf = (res) => res?.meta ?? res?.pagination ?? {};

/** Driver id carried on the booking row itself, if the backend includes it. */
function inlineDriverId(b) {
  return b?.allocations?.[0]?.driverId
    ?? b?.allocation?.driverId
    ?? b?.driverId
    ?? b?.driver?.userId
    ?? null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function resolveAllocation(booking) {
  if (allocationCache.has(booking.id)) return allocationCache.get(booking.id);
  let result = null;
  try {
    const res = await apiClient.get(`/admin/dispatch/bookings/${booking.id}/allocation`);
    const a = res?.allocation ?? res?.data?.allocation ?? null;
    if (a) {
      result = {
        driverId: a.driverId ?? a.driver?.userId ?? null,
        vehicle:  a.vehicle ?? null,
        allocatedAt: a.createdAt ?? a.assignedAt ?? null,
      };
    }
  } catch {
    result = null; // 404 = never allocated
  }
  if (FINAL_STATUSES.has(booking.status)) allocationCache.set(booking.id, result);
  return result;
}

const isValidationError = (e) =>
  e?.status === 400 || e?.status === 422 || e?.code === 'VALIDATION_ERROR';

/**
 * Returns a loader for one driver. Call `next()` repeatedly while `hasMore`.
 *   next({ onProgress, isCancelled }) → { trips, hasMore, mode, scanned }
 */
export function createDriverTripLoader(userId) {
  let mode = null;         // 'server' | 'scan'
  let page = 1;
  let totalPages = Infinity;
  let queue = [];          // scan-mode candidates not yet checked
  let scanned = 0;

  async function detectServerFilter() {
    let filtered;
    try {
      filtered = await apiClient.get('/admin/bookings', {
        params: { driverId: userId, page: 1, limit: PAGE_SIZE, sortBy: 'pickupAt', order: 'desc' },
      });
    } catch (e) {
      if (isValidationError(e)) return null; // backend rejects driverId → scan
      throw e;
    }
    const all = await apiClient.get('/admin/bookings', { params: { page: 1, limit: 1 } });
    const fTotal = metaOf(filtered).total ?? rowsOf(filtered).length;
    const aTotal = metaOf(all).total;
    // Same total as the unfiltered list → driverId was ignored.
    if (aTotal == null || (aTotal > 0 && fTotal >= aTotal)) return null;
    return filtered;
  }

  async function loadServer(first, { isCancelled }) {
    const trips = [];
    const keep = (r) => { const d = inlineDriverId(r); return d == null || d === userId; };
    trips.push(...rowsOf(first).filter(keep));
    const pages = Math.min(metaOf(first).totalPages ?? 1, MAX_PAGES);
    for (let p = 2; p <= pages && !isCancelled?.(); p++) {
      const res = await apiClient.get('/admin/bookings', {
        params: { driverId: userId, page: p, limit: PAGE_SIZE, sortBy: 'pickupAt', order: 'desc' },
      });
      trips.push(...rowsOf(res).filter(keep));
    }
    return { trips, hasMore: false, mode: 'server', scanned: trips.length };
  }

  async function loadScanBatch({ onProgress, isCancelled }) {
    const found = [];
    let checkedThisBatch = 0;

    while (checkedThisBatch < SCAN_BATCH && !isCancelled?.()) {
      if (queue.length === 0) {
        if (page > totalPages || page > MAX_PAGES) break;
        const res = await apiClient.get('/admin/bookings', {
          params: { page, limit: PAGE_SIZE, sortBy: 'pickupAt', order: 'desc' },
        });
        totalPages = metaOf(res).totalPages ?? 1;
        page += 1;
        queue = rowsOf(res).filter((b) => DRIVER_STATUSES.has(b.status));
        if (queue.length === 0) continue;
      }

      const take = queue.splice(0, SCAN_BATCH - checkedThisBatch);
      const allocs = await mapLimit(take, CONCURRENCY, (b) => {
        const inline = inlineDriverId(b);
        return inline != null ? { driverId: inline, vehicle: null } : resolveAllocation(b);
      });
      take.forEach((b, i) => {
        if (allocs[i]?.driverId === userId) {
          found.push({ ...b, _allocatedVehicle: allocs[i].vehicle, _allocatedAt: allocs[i].allocatedAt });
        }
      });
      checkedThisBatch += take.length;
      scanned += take.length;
      onProgress?.({ scanned, foundInBatch: found.length });
    }

    const hasMore = queue.length > 0 || (page <= totalPages && page <= MAX_PAGES);
    return { trips: found, hasMore, mode: 'scan', scanned };
  }

  return {
    async next(opts = {}) {
      if (mode === null) {
        const first = await detectServerFilter();
        if (first) { mode = 'server'; return loadServer(first, opts); }
        mode = 'scan';
      }
      return loadScanBatch(opts);
    },
  };
}
