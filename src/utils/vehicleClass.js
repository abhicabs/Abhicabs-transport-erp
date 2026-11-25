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
 * `fare` decides the booking's new fare when its class changes:
 *   { fareMode: 'requote' }                       rate card (default)
 *   { fareMode: 'keep', reason }                  customer's fare stays
 *   { fareMode: 'custom', customFare, reason }    typed amount
 * keep / custom need the FARE_EDIT permission on the backend.
 * Returns what was changed so the caller can tell the user.
 */
export async function alignClasses({ booking, vehicle, catalogueKeys = [], fare = null }) {
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
    await apiClient.patch(`/admin/bookings/${booking.id}/vehicle`, { vehicleClass: target, ...fareBody(fare) });
    out.bookingChangedTo = target;
  }
  return out;
}

/** Request body fields for PATCH /admin/bookings/:id/vehicle from a fare choice. */
export function fareBody(fare) {
  if (!fare || !fare.fareMode || fare.fareMode === 'requote') {
    return fare?.reason ? { fareMode: 'requote', reason: fare.reason } : {};
  }
  return {
    fareMode: fare.fareMode,
    ...(fare.fareMode === 'custom' ? { customFare: Number(fare.customFare) } : {}),
    reason: fare.reason || undefined,
  };
}

/** Why a fare choice can't be sent yet, or null when it can. */
export function fareChoiceError(fare) {
  if (!fare || !fare.fareMode || fare.fareMode === 'requote') return null;
  if (fare.fareMode === 'custom' && !(Number(fare.customFare) > 0)) return 'Enter the new fare';
  if (!String(fare.reason || '').trim()) return 'Give a reason for setting the fare by hand';
  return null;
}
