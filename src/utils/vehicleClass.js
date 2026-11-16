/**
 * src/utils/vehicleClass.js
 *
 * Why vehicle classes looked "case sensitive":
 * a class is stored as plain text in three places with no link between them
 * (vehicle_catalog.key, fare_configs.vehicle_class, vehicles.vehicle_class —
 * see vehicleCatalogService). Older vehicles were typed by hand as "Sedan",
 * "Swift Dzire", "INNOVA" etc., while bookings carry the catalogue key
 * ("swift-dzire"). Every screen compared them with `===`, and the backend's
 * assign check does the same, so "Swift-Dzire" ≠ "swift-dzire" and the
 * vehicle simply never showed up for the booking.
 *
 * classKey() ignores case, spaces, hyphens and underscores, so
 * "Swift Dzire", "swift_dzire", "SWIFT-DZIRE" and "swift-dzire" are one class.
 */
import { apiClient } from '../services/apiClient';

export const classKey = (c) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const sameClass = (a, b) => classKey(a) === classKey(b);

/** The catalogue's own spelling of a class, if the catalogue has it. */
export const canonicalClass = (raw, catalogueKeys = []) =>
  catalogueKeys.find((k) => sameClass(k, raw)) ?? raw;

/**
 * The backend only accepts a vehicle whose class is byte-for-byte equal to the
 * booking's. Before assigning, make them equal:
 *   - same class, different spelling  → correct the vehicle record to the
 *     catalogue spelling (it IS the same class, this just fixes the data);
 *   - genuinely different class       → change the booking to the vehicle's
 *     class (PATCH /admin/bookings/:id/vehicle — the backend re-quotes fare).
 * Returns what was changed so the caller can tell the user.
 */
export async function alignClasses({ booking, vehicle, catalogueKeys = [] }) {
  const out = { vehicleFixedTo: null, bookingChangedTo: null };
  const b = booking?.vehicleClass;
  const v = vehicle?.vehicleClass;
  if (!b || !v || b === v) return out;

  const target = sameClass(b, v) ? canonicalClass(b, catalogueKeys) : canonicalClass(v, catalogueKeys);

  if (v !== target) {
    await apiClient.patch(`/admin/vehicles/${vehicle.id}`, { vehicleClass: target });
    out.vehicleFixedTo = target;
  }
  if (b !== target) {
    await apiClient.patch(`/admin/bookings/${booking.id}/vehicle`, { vehicleClass: target });
    out.bookingChangedTo = target;
  }
  return out;
}
