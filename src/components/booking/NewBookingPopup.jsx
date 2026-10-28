import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Car, Phone, MapPin, Clock, CheckCircle } from 'lucide-react';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { formatCurrency, formatDateTime, titleCase } from '../../utils/formatters';

/**
 * NewBookingPopup — the centre-screen dialog that appears the instant a new
 * booking arrives (socket `booking:created`). Two actions only:
 *   • Confirm  → routes to the real call-and-confirm flow (ConfirmBookingModal
 *                on the Bookings page) so the admin calls the customer and
 *                leaves a remark before confirming. The booking is moved to the
 *                corner stack on the way, so it stays visible until the
 *                confirmation actually goes through (a cancelled confirm leaves
 *                it pending in the stack).
 *   • Dismiss  → closes the popup, dropping the booking into the corner
 *                notification stack (BookingAlertStack) where it keeps nagging
 *                until it is confirmed.
 * Clicking the backdrop or pressing Escape behaves like Dismiss, so a booking
 * is never silently lost. When several bookings are waiting, they are shown one
 * at a time (the top of the undismissed queue).
 */
export default function NewBookingPopup() {
  const { bookingAlerts, dismissBookingAlert } = useAdminRealtimeContext();
  const navigate = useNavigate();

  const queue = bookingAlerts.filter((a) => !a.dismissed);
  const active = queue[0] || null;

  if (!active) return null;

  const handleConfirm = () => {
    // Move it to the stack so this popup closes (and doesn't overlay the modal),
    // then open the call-and-confirm flow for this booking.
    dismissBookingAlert(active.id);
    navigate(`/admin/bookings?confirm=${active.id}`);
  };

  const handleDismiss = () => {
    dismissBookingAlert(active.id);
  };

  const route = [active.pickupAddress, active.dropAddress]
    .map((a) => (a ? String(a).split(',')[0] : ''))
    .filter(Boolean)
    .join('  →  ');

  return createPortal(
    <div
      style={S.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
      role="presentation"
    >
      <div style={S.card} role="dialog" aria-modal="true" aria-label="New booking received">
        <div style={S.iconWrap}>
          <Car size={26} color="#111111" strokeWidth={2.2} />
        </div>

        <h2 style={S.title}>New booking received</h2>
        <p style={S.subtitle}>
          Call &amp; verify the details, then confirm. If you dismiss, it will keep
          showing in the corner until the booking is confirmed.
        </p>

        {/* Booking summary */}
        <div style={S.summary}>
          <div style={S.summaryHead}>
            <span style={S.bookingNo}>{active.bookingNumber || 'New booking'}</span>
            <span style={S.pendingPill}>PENDING</span>
          </div>

          <div style={S.row}>
            <Phone size={14} style={S.rowIcon} />
            <span style={S.name}>{active.customerName}</span>
            {active.customerPhone && <span style={S.phone}>{active.customerPhone}</span>}
          </div>

          {route && (
            <div style={S.row}>
              <MapPin size={14} style={S.rowIcon} />
              <span style={S.route}>{route}</span>
            </div>
          )}

          <div style={S.metaRow}>
            {(active.vehicleClass || active.tripType) && (
              <span style={S.meta}>
                <Car size={13} style={{ color: '#9A9A9A' }} />
                {titleCase(active.vehicleClass || '')}
                {active.vehicleClass && active.tripType ? ' · ' : ''}
                {active.tripType ? active.tripType.replace(/_/g, ' ') : ''}
              </span>
            )}
            {active.pickupAt && (
              <span style={S.meta}>
                <Clock size={13} style={{ color: '#9A9A9A' }} />
                {formatDateTime(active.pickupAt)}
              </span>
            )}
          </div>

          {Number(active.estimatedFare) > 0 && (
            <div style={S.fareRow}>
              <span style={S.fareLabel}>Estimated fare</span>
              <span style={S.fareValue}>{formatCurrency(Number(active.estimatedFare))}</span>
            </div>
          )}
        </div>

        {queue.length > 1 && (
          <p style={S.moreHint}>
            +{queue.length - 1} more new booking{queue.length - 1 > 1 ? 's' : ''} waiting
          </p>
        )}

        <div style={S.actions}>
          <button type="button" style={S.dismissBtn} onClick={handleDismiss}>
            Dismiss
          </button>
          <button type="button" style={S.confirmBtn} onClick={handleConfirm}>
            <CheckCircle size={17} />
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(17,17,17,0.45)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px 12px',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    animation: 'abhiFadeIn 0.18s ease-out',
  },
  card: {
    width: '100%', maxWidth: 440, background: '#fff', borderRadius: 22,
    padding: '24px 20px 18px', textAlign: 'center',
    boxShadow: '0 24px 60px rgba(17,17,17,0.28)',
    animation: 'abhiPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    margin: 'auto',
  },
  iconWrap: {
    width: 62, height: 62, margin: '0 auto 14px', borderRadius: '50%',
    background: 'radial-gradient(circle at 50% 40%, #FFF3C4 0%, #FFE082 100%)',
    display: 'grid', placeItems: 'center',
    boxShadow: '0 8px 20px rgba(255,193,7,0.35)',
  },
  title: { fontSize: 20, fontWeight: 800, color: '#111', margin: '0 0 6px' },
  subtitle: { fontSize: 13.5, lineHeight: 1.5, color: '#6B7280', margin: '0 auto 18px', maxWidth: 360 },
  summary: {
    textAlign: 'left', borderRadius: 14, border: '1.5px solid #EDEDE8',
    background: '#FAFAF8', padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 9,
  },
  summaryHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  bookingNo: { fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: '#6B7280' },
  pendingPill: { padding: '3px 10px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 800 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowIcon: { color: '#9A9A9A', flexShrink: 0 },
  name: { fontSize: 13.5, fontWeight: 700, color: '#111' },
  phone: { fontSize: 12.5, fontWeight: 600, color: '#3B65DB' },
  route: { fontSize: 13, fontWeight: 600, color: '#374151' },
  metaRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  meta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: '#374151' },
  fareRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderRadius: 10, background: '#fff', border: '1px solid #EDEDE8',
  },
  fareLabel: { fontSize: 12.5, fontWeight: 600, color: '#6B7280' },
  fareValue: { fontSize: 15.5, fontWeight: 800, color: '#111' },
  moreHint: { fontSize: 12, fontWeight: 700, color: '#92400E', margin: '12px 0 0' },
  actions: { display: 'flex', gap: 10, marginTop: 18 },
  dismissBtn: {
    flex: 1, padding: '12px 16px', borderRadius: 13, cursor: 'pointer',
    border: '1.5px solid #E5E7EB', background: '#fff', color: '#374151',
    fontSize: 14.5, fontWeight: 700,
  },
  confirmBtn: {
    flex: 1, padding: '12px 16px', borderRadius: 13, cursor: 'pointer',
    border: 'none', background: '#22A65A', color: '#fff',
    fontSize: 14.5, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    boxShadow: '0 6px 16px rgba(34,166,90,0.32)',
  },
};