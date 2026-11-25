/**
 * src/utils/bookingSync.js
 *
 * "A booking changed — anyone showing it, reload it."
 *
 * Dispatch and the booking page are separate screens (and often separate tabs).
 * Assigning a vehicle, changing the class or re-pricing on one left the other
 * showing the old vehicle / class / fare until a manual reload.
 *
 * announceBookingChange(id) reaches:
 *   - the same tab        (window event)
 *   - other open tabs     (BroadcastChannel)
 * and AdminRealtimeContext calls it for socket events too (trip:status,
 * booking:allocated, trip:vehicle_changed, payment:received), so a change made
 * by another staff member on another machine arrives the same way.
 */
const EVENT = 'abhicabs:booking-changed';
const CHANNEL = 'abhicabs-bookings';

let channel = null;
try {
  channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
} catch { channel = null; }

export function announceBookingChange(bookingId, { local = true, broadcast = true } = {}) {
  const detail = { bookingId: bookingId || null, at: Date.now() };
  if (local && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  if (broadcast && channel) { try { channel.postMessage(detail); } catch { /* closed */ } }
}

/** cb({ bookingId }) — bookingId is null for "something changed, refresh all". Returns unsubscribe. */
export function onBookingChange(cb) {
  const onLocal = (e) => cb(e.detail || {});
  const onRemote = (e) => cb(e.data || {});
  window.addEventListener(EVENT, onLocal);
  channel?.addEventListener('message', onRemote);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    channel?.removeEventListener('message', onRemote);
  };
}
