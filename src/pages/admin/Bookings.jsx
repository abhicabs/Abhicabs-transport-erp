import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, PhoneCall } from 'lucide-react';
import PageHeader    from '../../components/ui/PageHeader';
import FilterBar     from '../../components/ui/FilterBar';
import DataTable     from '../../components/ui/DataTable';
import Button        from '../../components/ui/Button';
import Input         from '../../components/ui/Input';
import StatusBadge   from '../../components/ui/StatusBadge';
import BookingFormDrawer from '../../components/booking/BookingFormDrawer';
import ConfirmBookingModal from '../../components/booking/ConfirmBookingModal';
import { useResourceList } from '../../hooks/useResourceList';
import { bookingService }  from '../../services';
import { bookingOpsService } from '../../services/bookingOpsService';
import { useToast }        from '../../hooks/useToast';
import { PERMISSIONS }     from '../../constants';
import { useAuth }         from '../../hooks/useAuth';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { formatCurrency, formatDateTime, titleCase } from '../../utils/formatters';
import { dateFilterProps } from '../../utils/dateRange';

// All filters are SERVER-SIDE — sent directly as query params to /admin/bookings
// Backend listBookingsQuerySchema accepts:
//   status, tripType, from, to, search, sortBy, order, page, limit

const BOOKING_STATUSES = ['PENDING','CONFIRMED','ALLOCATED','EN_ROUTE','ONGOING','COMPLETED','CANCELLED','EXPIRED'];
const TRIP_TYPES       = ['ONE_WAY','ROUND_TRIP','AIRPORT','HOURLY'];
const SORT_OPTIONS     = ['createdAt','pickupAt','estimatedFare','status'];

function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '—';
}

export default function Bookings() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission(PERMISSIONS.BOOKINGS_MANAGE);

  // Server-side filters passed directly to useResourceList → backend query params
  const list = useResourceList(bookingService, {
    filterDefaults: { status: '', tripType: '', from: '', to: '' },
    sortBy: 'createdAt',
    sortDir: 'desc',
    limit: 10,
  });
  const dates = dateFilterProps(list);

  const { removeBookingAlert } = useAdminRealtimeContext();

  const [formOpen, setFormOpen] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Deep link from the new-booking alert (popup / corner stack): a Confirm there
  // lands on /admin/bookings?confirm=<id> and opens the call-and-confirm modal
  // for that booking. We fetch the booking directly so it works even when the
  // row isn't on the current page or passes the active filter, then strip the
  // param so a refresh or closing the modal doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  // /admin/bookings?new=1 opens the form straight away (dashboard, customer
  // pages). &customer=<id>&cname=&cphone= pre-selects that customer.
  const [formCustomer, setFormCustomer] = useState(null);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const cid = searchParams.get('customer');
    setFormCustomer(cid ? { userId: cid, name: searchParams.get('cname') || 'Customer', phone: searchParams.get('cphone') || '' } : null);
    setFormOpen(true);
    const next = new URLSearchParams(searchParams);
    ['new', 'customer', 'cname', 'cphone'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const confirmId = searchParams.get('confirm');
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (!confirmId || deepLinkHandled.current) return undefined;
    deepLinkHandled.current = true;
    let cancelled = false;
    bookingService.get(confirmId)
      .then((b) => { if (!cancelled && b) setConfirmingBooking(b); })
      .catch(() => { if (!cancelled) toast.error('Could not open that booking to confirm'); })
      .finally(() => {
        if (cancelled) return;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('confirm');
          return next;
        }, { replace: true });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmId]);

  const handleConfirmBooking = async (bookingId, confirmationNote) => {
    setConfirmLoading(true);
    try {
      await bookingOpsService.confirm(bookingId, { confirmationNote });
      toast.success('Booking confirmed — customer notified');
      // Clear this booking from the new-booking alert stack now that it's
      // actually confirmed (it was kept there through the redirect).
      removeBookingAlert?.(bookingId);
      setConfirmingBooking(null);
      list.reload();
    } catch (err) {
      toast.error(err.message || 'Failed to confirm booking');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleAddNoteKeepPending = async (bookingId, note, followUp) => {
    // No backend endpoint for note-only update on PENDING bookings.
    // Save locally so admin can see the note when they come back.
    try {
      const key = 'abhi_booking_notes';
      const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
      existing[bookingId] = {
        note,
        by: user?.name || 'Admin',
        at: new Date().toISOString(),
        ...(followUp && { followUp }),
      };
      sessionStorage.setItem(key, JSON.stringify(existing));
      const msg = followUp
        ? `Note saved with follow-up on ${new Date(followUp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — booking stays pending`
        : 'Note saved — booking stays pending';
      toast.success(msg);
      setConfirmingBooking(null);
    } catch {
      toast.error('Failed to save note');
    }
  };

  const handleCancelFromModal = async (bookingId, reason) => {
    setConfirmLoading(true);
    try {
      await bookingOpsService.cancel(bookingId, { reason, cancelledByType: 'ADMIN' });
      toast.success('Booking cancelled');
      setConfirmingBooking(null);
      list.reload();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel booking');
    } finally {
      setConfirmLoading(false);
    }
  };

  // FRONTEND-ONLY fetch of cancellation reasons: the LIST endpoint
  // (BOOKING_LIST_SELECT on the backend) never included cancellationReason
  // at all — only the single-booking detail endpoint does. Changing that is
  // a backend edit; per instruction this stays frontend-only instead, so
  // for each CANCELLED row currently on screen, fetch its full detail once
  // (bookingService.get already hits the real, existing GET /admin/bookings/:id)
  // and cache the reason locally. Bounded cost: at most one extra request
  // per cancelled booking actually visible on the current page (≤ page size),
  // never re-fetched once cached.
  const [reasons, setReasons] = useState({});
  const fetchingRef = useRef(new Set());

  useEffect(() => {
    (list.rows || []).forEach((r) => {
      if (r.status !== 'CANCELLED') return;
      if (reasons[r.id] !== undefined) return;
      if (fetchingRef.current.has(r.id)) return;
      fetchingRef.current.add(r.id);
      bookingService.get(r.id)
        .then((full) => setReasons((prev) => ({ ...prev, [r.id]: full?.cancellationReason || null })))
        .catch(() => setReasons((prev) => ({ ...prev, [r.id]: null })))
        .finally(() => fetchingRef.current.delete(r.id));
    });
  }, [list.rows]);

  const columns = [
    {
      key: 'bookingNumber', header: 'Booking #',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.bookingNumber || '—'}</span>,
    },
    {
      key: 'customer', header: 'Customer',
      render: (r) => {
        const userName = r.customer?.user?.name;
        const isGuest = !userName || userName === 'Guest' || userName.startsWith('guest');
        const displayName = isGuest
          ? (r.guestName || r.corporate?.companyName || 'Guest')
          : (userName || r.corporate?.companyName || '—');
        const displayPhone = isGuest
          ? (r.guestPhone || '')
          : (r.customer?.user?.phone || '');
        return (
          <div>
            <p style={{ fontWeight: 600, color: '#1F2937', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              {displayName}
              {isGuest && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, backgroundColor: '#FEF3C7', color: '#92400E' }}>GUEST</span>}
            </p>
            {displayPhone && <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>{displayPhone}</p>}
          </div>
        );
      },
    },
    {
      key: 'status', header: 'Status',
      render: (r) => {
        const loaded = reasons[r.id];
        const isLoading = r.status === 'CANCELLED' && loaded === undefined;
        // Check for follow-up on pending bookings
        let followUp = null;
        if (r.status === 'PENDING') {
          try {
            const stored = JSON.parse(sessionStorage.getItem('abhi_booking_notes') || '{}');
            if (stored[r.id]?.followUp) followUp = new Date(stored[r.id].followUp);
          } catch { /* ignore */ }
        }
        const isOverdue = followUp && followUp < new Date();
        return (
          <div>
            <StatusBadge status={r.status} />
            {r.status === 'PENDING' && followUp && (
              <p
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  marginTop: 4, fontSize: 11, fontWeight: 700,
                  color: isOverdue ? '#DC2626' : '#2563EB',
                }}
                title={`Follow-up: ${followUp.toLocaleString('en-IN')}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  <circle cx="16" cy="16" r="2" />
                </svg>
                {isOverdue ? 'Overdue · ' : ''}
                {followUp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {', '}
                {followUp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            )}
            {r.status === 'PENDING' && canManage && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingBooking(r); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  marginTop: 6, padding: '4px 10px', borderRadius: 8,
                  border: '1.5px solid #BBF7D0', backgroundColor: '#F0FDF4',
                  color: '#15803D', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#DCFCE7'; e.currentTarget.style.borderColor = '#22C55E'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F0FDF4'; e.currentTarget.style.borderColor = '#BBF7D0'; }}
              >
                <PhoneCall size={11} /> Call & Confirm
              </button>
            )}
            {r.status === 'CANCELLED' && (
              <p
                className="mt-1 truncate"
                style={{ fontSize: 11.5, color: isLoading ? '#9CA3AF' : '#B91C1C', maxWidth: 160 }}
                title={loaded || (isLoading ? 'Loading…' : 'No reason was recorded.')}
              >
                {isLoading ? 'Loading reason…' : (loaded || 'No reason recorded')}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'route', header: 'Route',
      render: (r) => {
        const full = `${addr(r.pickupAddress)} → ${addr(r.dropAddress)}`;
        // Full address is still there (title = hover tooltip, and it's
        // still sent to the server unchanged) — just not forced into view
        // for every row when the first line of each address already
        // identifies the pickup/drop clearly enough for a list scan.
        const short = `${addr(r.pickupAddress).split(',')[0]} → ${addr(r.dropAddress).split(',')[0]}`;
        return (
          <span style={{ color: '#6B7280', fontSize: 13.5 }} title={full}>
            {short}
          </span>
        );
      },
    },
    {
      key: 'tripType', header: 'Type',
      render: (r) => <span style={{ fontSize: 13.5, color: '#6B7280' }}>{r.tripType?.replace(/_/g,' ') || '—'}</span>,
    },
    {
      key: 'vehicleClass', header: 'Class',
      render: (r) => <span style={{ fontSize: 13.5, color: '#6B7280' }}>{titleCase(r.vehicleClass || '—')}</span>,
    },
    {
      key: 'fare', header: 'Fare', sortable: true,
      render: (r) => formatCurrency(Number(r.finalFare ?? r.estimatedFare) || 0),
    },
    {
      key: 'pickupAt', header: 'Pickup', sortable: true,
      render: (r) => formatDateTime(r.pickupAt),
    },
  ];

  const handleCreated = (booking, { confirmed, discount } = {}) => {
    const off = discount ? `, ${formatCurrency(Number(discount))} discount` : '';
    toast.success(`${booking?.bookingNumber || 'Booking'} created${confirmed ? ' and confirmed' : ' (Pending)'}${off}`);
    list.reload();
  };

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="All bookings start as PENDING. Call the customer, verify details, then confirm."
        actions={canManage && (
          <Button icon={Plus} onClick={() => { setFormCustomer(null); setFormOpen(true); }}>New booking</Button>
        )}
      />

      <FilterBar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search booking # or customer name…"
        filters={[
          {
            name: 'status',
            value: list.filters.status,
            onChange: (v) => list.setFilter('status', v),
            placeholder: 'All statuses',
            options: BOOKING_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
          },
          {
            name: 'tripType',
            value: list.filters.tripType,
            onChange: (v) => list.setFilter('tripType', v),
            placeholder: 'All trip types',
            options: TRIP_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })),
          },
          {
            name: 'sortBy',
            value: list.sortBy,
            onChange: (v) => list.onSort(v, list.sortDir),
            placeholder: 'Sort by',
            options: SORT_OPTIONS.map((s) => ({ value: s, label: titleCase(s.replace(/([A-Z])/g, ' $1')) })),
          },
        ]}
        extra={
          <div className="flex items-center gap-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }} title="Filters by pickup date">Pickup from</label>
            <Input type="date" title="Filters by pickup date" value={dates.fromValue} max={dates.toValue || undefined}
              onChange={(e) => dates.onFromChange(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>to</label>
            <Input type="date" title="Filters by pickup date" value={dates.toValue} min={dates.fromValue || undefined}
              onChange={(e) => dates.onToChange(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }} />
          </div>
        }
      />

      <DataTable
        columns={columns}
        rows={list.rows}
        status={list.status}
        error={list.error}
        onRetry={list.refetch}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.onSort}
        page={list.page}
        limit={list.meta?.limit}
        total={list.meta?.total}
        totalPages={list.meta?.totalPages}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        onRowClick={(r) => navigate(`/admin/bookings/${r.id}`)}
        emptyTitle="No bookings found"
        emptyDescription="Try adjusting your filters or date range."
      />

      <BookingFormDrawer open={formOpen} onClose={() => setFormOpen(false)} onCreated={handleCreated} initialCustomer={formCustomer} />

      <ConfirmBookingModal
        open={!!confirmingBooking}
        onClose={() => setConfirmingBooking(null)}
        booking={confirmingBooking}
        onConfirm={handleConfirmBooking}
        onAddNote={handleAddNoteKeepPending}
        onCancel={handleCancelFromModal}
        loading={confirmLoading}
      />
    </div>
  );
}
