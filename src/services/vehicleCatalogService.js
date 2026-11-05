/**
 * Vehicle catalogue service — the source of truth for vehicle CLASSES.
 *
 * A "vehicle class" is a model tier (swift-dzire, ertiga, innova-crysta,
 * fortuner, mercedes-e …), not a size bucket. It is the join key across three
 * tables — `vehicle_catalog.key`, `fare_configs.vehicle_class` and
 * `vehicles.vehicle_class` — with no foreign key holding them together, so a
 * class typed by hand in one place and not the others is priceable but not
 * browsable, or browsable but not dispatchable.
 *
 * This existed only as a hardcoded `['hatchback','sedan','suv','tempo']` in
 * THREE separate frontend files. That list was already wrong: the backend's
 * 20260922140000_fleet_models and 20260923120000_oneway_and_luxury migrations
 * seeded 13 model-level classes and RETIRED `sedan` (it duplicated
 * swift-dzire at the same price). Hardcoding the list here again — even with
 * the right values — would just restart the drift, so it is fetched.
 *
 * GET /vehicles is the public browse endpoint (no auth), response shape
 * { success, data: { count, vehicles } }.
 */
import { apiClient } from './apiClient';

// Last-resort fallback ONLY for when the catalogue request itself fails.
// Deliberately the real seeded keys, not the old four.
const FALLBACK_CLASSES = [
  'swift-dzire', 'ertiga', 'innova', 'innova-crysta', 'innova-hycross',
  'fortuner', 'mercedes-e', 'tempo-12', 'tempo-17',
  'urbania-13', 'urbania-16', 'urbania-maharaja',
  'benz-22', 'benz-28', 'benz-33',
  'hatchback', 'suv', 'tempo',
];

function unwrap(res) {
  if (!res || typeof res !== 'object') return {};
  const body = res.data && res.data.success !== undefined ? res.data : res;
  return body && body.data !== undefined ? body.data : body;
}

export const vehicleCatalogService = {
  /**
   * Full catalogue rows — key, name, seats, blurb, etc.
   * `includeInactive` matters for admin screens: `sedan` is retired but still
   * has live fare cards, so hiding it would make those cards unexplainable.
   */
  async list({ includeInactive = false } = {}) {
    const data = unwrap(
      await apiClient.get('/vehicles', {
        params: includeInactive ? { includeInactive: true } : {},
      }),
    );
    return data.vehicles || [];
  },

  /**
   * Just the class keys, for dropdowns.
   * Returns [{ value, label }] ready for <Select options={...} />.
   */
  async classOptions({ includeInactive = false } = {}) {
    try {
      const rows = await this.list({ includeInactive });
      if (rows.length) {
        return rows.map((v) => ({
          value: v.key,
          label: v.name || v.key,
          seats: v.seats,
          isActive: v.isActive !== false,
        }));
      }
    } catch {
      /* fall through to the static list below */
    }
    return FALLBACK_CLASSES.map((k) => ({ value: k, label: k, seats: null, isActive: true }));
  },

  /**
   * Classes valid for a RATE CARD, from
   * GET /admin/fare-configs/vehicle-classes — which is authoritative for
   * pricing in a way the browse catalogue is not: it unions the classes that
   * already have fare configs with those on active vehicles, so a class that
   * exists only as a priced config (or only as a real vehicle) still appears.
   * Also returns the trip types the backend accepts, so those stop being a
   * hardcoded list that can drift.
   *
   * Catalogue names are merged in for readable labels — this endpoint returns
   * bare keys like "innova-crysta".
   */
  /** GET /admin/vehicles/booking/status — which classes are disabled and global toggle */
  async bookingStatus() {
    const res = await apiClient.get('/admin/vehicles/booking/status');
    return unwrap(res);
  },

  /** PATCH /admin/vehicles/:key/booking — enable/disable one class */
  async setBooking(key, enabled, reason = '') {
    const res = await apiClient.patch(`/admin/vehicles/${key}/booking`, { enabled, ...(reason ? { reason } : {}) });
    return unwrap(res);
  },

  /** PATCH /admin/vehicles/booking/all — enable/disable ALL classes */
  async setBookingAll(enabled, reason = '') {
    const res = await apiClient.patch('/admin/vehicles/booking/all', { enabled, ...(reason ? { reason } : {}) });
    return unwrap(res);
  },

  async rateCardOptions() {
    const [classesRes, catalogue] = await Promise.all([
      apiClient.get('/admin/fare-configs/vehicle-classes').catch(() => null),
      this.list({ includeInactive: true }).catch(() => []),
    ]);

    const nameByKey = {};
    catalogue.forEach((v) => { if (v.key) nameByKey[v.key] = v.name || v.key; });

    const data = unwrap(classesRes);
    const keys = data.vehicleClasses || [];
    const tripTypes = data.tripTypes || ['ONE_WAY', 'ROUND_TRIP', 'AIRPORT', 'HOURLY'];

    const classes = (keys.length ? keys : FALLBACK_CLASSES).map((k) => ({
      value: k,
      label: nameByKey[k] || k,
    }));

    return { classes, tripTypes };
  },
};
