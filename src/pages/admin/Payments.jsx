import { useState, useEffect, useCallback } from 'react';
import { Banknote, CreditCard, Landmark, Wallet, Smartphone, Search, RotateCcw, Link2, Plus, ExternalLink, Copy, XCircle, RefreshCw, Send, QrCode } from 'lucide-react';
import PageHeader  from '../../components/ui/PageHeader';
import PageTabs from '../../components/ui/PageTabs';
import FilterBar   from '../../components/ui/FilterBar';
import DataTable   from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import Badge        from '../../components/ui/Badge';
import Button        from '../../components/ui/Button';
import Input          from '../../components/ui/Input';
import Select        from '../../components/ui/Select';
import FormField    from '../../components/ui/FormField';
import Textarea      from '../../components/ui/Textarea';
import Modal          from '../../components/ui/Modal';
import Alert         from '../../components/ui/Alert';
import IconButton    from '../../components/ui/IconButton';
import LoadingState  from '../../components/ui/LoadingState';
import SearchInput   from '../../components/ui/SearchInput';
import Switch        from '../../components/ui/Switch';
import { useResourceList }    from '../../hooks/useResourceList';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { adminPaymentsService } from '../../services';
import { formatCurrency, formatDateTime, titleCase } from '../../utils/formatters';
import { PERMISSIONS } from '../../constants';
import { dateFilterProps } from '../../utils/dateRange';

// Backend listPaymentsQuerySchema accepts:
//   status, method, purpose, from, to, bookingId, sortBy, order, page, limit
// ALL SERVER-SIDE — no client-side filtering needed.

const PAYMENT_STATUSES = ['CREATED','AUTHORISED','CAPTURED','PARTIALLY_PAID','FAILED','REFUNDED'];
const PAYMENT_METHODS  = ['UPI','CARD','NETBANKING','WALLET','CASH'];
const SORT_OPTIONS     = ['createdAt','paidAt','amount'];

const METHOD_ICON = {
  UPI: Smartphone, CARD: CreditCard, NETBANKING: Landmark, WALLET: Wallet, CASH: Banknote,
};

// ─────────────────────────────────────────────────────────────────────────────
// Payments tab — the original page, unchanged
// ─────────────────────────────────────────────────────────────────────────────
function PaymentsTab() {
  const list = useResourceList(adminPaymentsService, {
    filterDefaults: { status: '', method: '', from: '', to: '' },
    sortBy: 'createdAt',
    sortDir: 'desc',
    limit: 10,
  });
  const dates = dateFilterProps(list);

  const columns = [
    {
      key: 'booking', header: 'Booking',
      render: (r) => (
        <div>
          <p className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.booking?.bookingNumber || r.bookingId}</p>
          <p style={{ fontWeight: 600, color: '#1F2937', fontSize: 13 }}>{r.booking?.customer?.user?.name || '—'}</p>
          <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>{r.booking?.customer?.user?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'amount', header: 'Amount', sortable: true,
      render: (r) => <span style={{ fontWeight: 700, color: '#1F2937' }}>{formatCurrency(r.amount)}</span>,
    },
    {
      key: 'method', header: 'Method',
      render: (r) => {
        const Icon = METHOD_ICON[r.method] || CreditCard;
        return (
          <span className="flex items-center gap-1.5" style={{ fontSize: 13 }}>
            <Icon size={13} style={{ color: '#6B7280' }} />{titleCase(r.method || '—')}
          </span>
        );
      },
    },
    {
      key: 'purpose', header: 'Purpose',
      render: (r) => <span style={{ color: '#6B7280', fontSize: 13 }}>{titleCase(r.purpose || '—')}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'paidAt', header: 'Paid At', sortable: true,
      render: (r) => r.paidAt ? formatDateTime(r.paidAt) : <span style={{ color: '#9CA3AF' }}>—</span>,
    },
    {
      key: 'failureReason', header: 'Notes',
      render: (r) => r.failureReason
        ? <span style={{ color: '#EF4444', fontSize: 13.5 }}>{r.failureReason}</span>
        : <span style={{ color: '#9CA3AF' }}>—</span>,
    },
  ];

  return (
    <>
      <FilterBar
        searchPlaceholder="Search not supported on this endpoint"
        filters={[
          {
            name: 'status',
            value: list.filters.status,
            onChange: (v) => list.setFilter('status', v),
            placeholder: 'All statuses',
            options: PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
          },
          {
            name: 'method',
            value: list.filters.method,
            onChange: (v) => list.setFilter('method', v),
            placeholder: 'All methods',
            options: PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
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
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }} title="Filters by payment date">From</label>
            <Input type="date" title="Filters by payment date" value={dates.fromValue} max={dates.toValue || undefined}
              onChange={(e) => dates.onFromChange(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>To</label>
            <Input type="date" title="Filters by payment date" value={dates.toValue} min={dates.fromValue || undefined}
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
        emptyTitle="No payments found"
        emptyDescription="Try adjusting your filters or date range."
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Handovers tab — reconciling cash a driver collected on the road
// against cash that's actually reached the office. Every CASH payment a
// driver collects (payment.service.js collectCash) gets a PENDING row here;
// an admin with PAYMENT_RECONCILE confirms it once the money is physically in.
// ─────────────────────────────────────────────────────────────────────────────

// Adapts adminPaymentsService's cash-handover methods to the { list() }
// shape useResourceList expects.
const cashHandoverListAdapter = { list: (params) => adminPaymentsService.cashHandovers(params) };

function CashHandoversTab() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canConfirm = hasPermission(PERMISSIONS.CASH_HANDOVER_CONFIRM);

  const summary = useApi(() => adminPaymentsService.cashHandoverSummary(), []);
  const list = useResourceList(cashHandoverListAdapter, {
    filterDefaults: { status: 'PENDING', driverId: '' },
    sortBy: undefined,
    limit: 10,
  });

  const [confirming, setConfirming] = useState(null); // the row being confirmed
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const openConfirm = (row) => { setConfirming(row); setNote(''); };
  const closeConfirm = () => { setConfirming(null); setNote(''); };

  const doConfirm = async () => {
    setSaving(true);
    try {
      await adminPaymentsService.confirmCashHandover(confirming.id, note.trim() || undefined);
      toast.success('Cash handover confirmed');
      closeConfirm();
      list.refetch();
      summary.refetch();
    } catch (e) {
      toast.error(e.message || 'Could not confirm handover');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'driver', header: 'Driver',
      render: (r) => (
        <div>
          <p style={{ fontWeight: 600, color: '#1F2937', fontSize: 13 }}>{r.driver?.user?.name || '—'}</p>
          <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>{r.driver?.user?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'trip', header: 'Trip',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.payment?.booking?.bookingNumber || '—'}</span>,
    },
    {
      key: 'amount', header: 'Amount',
      render: (r) => <span style={{ fontWeight: 700, color: '#1F2937' }}>{formatCurrency(r.amount)}</span>,
    },
    {
      key: 'collectedAt', header: 'Collected',
      render: (r) => formatDateTime(r.payment?.paidAt || r.createdAt),
    },
    {
      key: 'status', header: 'Status',
      render: (r) => (
        <Badge tone={r.status === 'CONFIRMED' ? 'green' : 'amber'}>{r.status}</Badge>
      ),
    },
    {
      key: 'confirmedBy', header: 'Confirmed by',
      render: (r) => r.confirmedBy
        ? <span style={{ fontSize: 12.5, color: '#6B7280' }}>{r.confirmedBy.name}<br/>{formatDateTime(r.confirmedAt)}</span>
        : <span style={{ color: '#9CA3AF' }}>—</span>,
    },
    {
      key: 'actions', header: '',
      render: (r) => r.status === 'PENDING' && canConfirm ? (
        <Button size="sm" onClick={() => openConfirm(r)}>Confirm receipt</Button>
      ) : null,
    },
  ];

  return (
    <>
      {/* Per-driver cash-in-hand summary */}
      {summary.status === 'success' && summary.data && (
        summary.data.drivers.length === 0 ? (
          <div className="rounded-xl border px-4 py-3 mb-4" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <p className="text-sm font-semibold" style={{ color: '#15803d' }}>No cash currently outstanding with any driver.</p>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#6B7280' }}>
              Cash in hand — {formatCurrency(summary.data.totalPending)} total pending
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.data.drivers.map((d) => (
                <div key={d.driverId} className="rounded-xl border px-4 py-3" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
                  <p className="text-sm font-bold" style={{ color: '#92400e' }}>{d.driverName}</p>
                  <p className="text-xs" style={{ color: '#92400e', opacity: 0.8 }}>{d.driverPhone || ''}</p>
                  <p className="text-xl font-black mt-1" style={{ color: '#92400e' }}>{formatCurrency(d.pendingAmount)}</p>
                  <p className="text-xs" style={{ color: '#92400e', opacity: 0.8 }}>{d.pendingCount} trip{d.pendingCount === 1 ? '' : 's'} awaiting handover</p>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <FilterBar
        searchPlaceholder=""
        filters={[
          {
            name: 'status',
            value: list.filters.status,
            onChange: (v) => list.setFilter('status', v),
            placeholder: 'All statuses',
            options: [{ value: 'PENDING', label: 'Pending' }, { value: 'CONFIRMED', label: 'Confirmed' }],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={list.rows}
        status={list.status}
        error={list.error}
        onRetry={list.refetch}
        page={list.page}
        limit={list.meta?.limit}
        total={list.meta?.total}
        totalPages={list.meta?.totalPages}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        emptyTitle="No cash handovers found"
        emptyDescription="Cash collected by drivers on completed trips will appear here."
      />

      <Modal open={!!confirming} onClose={closeConfirm} title="Confirm cash handover" size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeConfirm} disabled={saving}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={doConfirm}>Confirm receipt</Button>
          </>
        }>
        {confirming && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Confirming that <strong>{formatCurrency(confirming.amount)}</strong> collected by{' '}
              <strong>{confirming.driver?.user?.name}</strong> for trip{' '}
              <span className="font-mono">{confirming.payment?.booking?.bookingNumber}</span> has been
              physically received.
            </p>
            <FormField label="Note (optional)">
              <Textarea
                value={note} onChange={(e) => setNote(e.target.value)}
                rows={3} maxLength={300}
                placeholder="e.g. Handed to accounts on Tuesday collection round"
              />
            </FormField>
          </div>
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Refunds tab — record a refund against a booking, and see refund history.
// Not a gateway integration: this is the auditable record of a refund that
// was actually issued (bank transfer, UPI, cash handback), validated against
// what the booking can actually still refund.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_REFUND_FORM = { bookingNumber: '', amount: '', method: 'UPI', reason: '', reference: '', notes: '' };

function RefundsTab() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_REFUND_FORM);
  const [errors, setErrors] = useState({});
  const [lookingUp, setLookingUp] = useState(false);
  const [booking, setBooking] = useState(null);       // { id, bookingNumber, status, customerName, customerPhone }
  const [balance, setBalance] = useState(null);        // { totalCaptured, alreadyRefunded, refundable }
  const [submitting, setSubmitting] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const history = useResourceList(
    { list: (params) => adminPaymentsService.listRefunds(params) },
    { sortBy: 'createdAt', sortDir: 'desc', limit: 10 },
  );

  const lookupBooking = async () => {
    const num = form.bookingNumber.trim();
    if (!num) { setErrors((e) => ({ ...e, bookingNumber: 'Enter a booking number.' })); return; }
    setErrors((e) => ({ ...e, bookingNumber: undefined }));
    setLookingUp(true);
    setBooking(null);
    setBalance(null);
    try {
      const b = await adminPaymentsService.findBookingByNumber(num);
      const bal = await adminPaymentsService.refundableBalance(b);
      setBooking(bal.booking);
      setBalance(bal);
    } catch (e) {
      toast.error(e.message || 'Booking not found');
    } finally {
      setLookingUp(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_REFUND_FORM);
    setBooking(null);
    setBalance(null);
    setErrors({});
  };

  const submit = async () => {
    const nextErrors = {};
    if (!booking) nextErrors.bookingNumber = 'Look up a booking first.';
    const amountNum = Number(form.amount);
    if (form.amount === '' || !Number.isFinite(amountNum) || amountNum <= 0) {
      nextErrors.amount = 'Enter a refund amount greater than zero.';
    } else if (balance && amountNum > Number(balance.refundable)) {
      nextErrors.amount = `Only ${formatCurrency(balance.refundable)} is refundable on this booking.`;
    }
    if (form.reason.trim().length < 5) nextErrors.reason = 'Give a reason (at least 5 characters) — this is what a finance audit will read later.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const refund = await adminPaymentsService.createRefund({
        bookingId: booking.id,
        amount: amountNum,
        method: form.method,
        reason: form.reason.trim(),
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success(`₹${refund.amount} refund recorded for ${refund.bookingNumber}`);
      resetForm();
      history.refetch();
    } catch (e) {
      toast.error(e.message || 'Could not record refund');
    } finally {
      setSubmitting(false);
    }
  };

  const historyColumns = [
    {
      key: 'booking', header: 'Booking',
      render: (r) => (
        <div>
          <p className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.booking?.bookingNumber || r.bookingId}</p>
          <p style={{ fontWeight: 600, color: '#1F2937', fontSize: 13 }}>{r.booking?.customer?.user?.name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'amount', header: 'Amount',
      render: (r) => <span style={{ fontWeight: 700, color: '#DC2626' }}>-{formatCurrency(r.amount)}</span>,
    },
    {
      key: 'method', header: 'Method',
      render: (r) => {
        const Icon = METHOD_ICON[r.method] || CreditCard;
        return (
          <span className="flex items-center gap-1.5" style={{ fontSize: 13 }}>
            <Icon size={13} style={{ color: '#6B7280' }} />{titleCase(r.method || '—')}
          </span>
        );
      },
    },
    {
      key: 'reason', header: 'Reason',
      render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{r.refundReason || '—'}</span>,
    },
    {
      key: 'paidAt', header: 'Issued', sortable: true,
      render: (r) => formatDateTime(r.paidAt || r.createdAt),
    },
  ];

  return (
    <>
      <div className="rounded-2xl border p-5 mb-6" style={{ borderColor: '#E5E7EB', backgroundColor: '#fff' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#1F2937' }}>Issue a refund</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
          <div className="sm:col-span-2">
            <FormField label="Booking number" required error={errors.bookingNumber}
              hint="e.g. ABH-2026-000123 — as given to the customer.">
              <Input
                value={form.bookingNumber}
                onChange={(e) => { set('bookingNumber', e.target.value); setErrors((er) => ({ ...er, bookingNumber: undefined })); }}
                placeholder="ABH-2026-000123"
              />
            </FormField>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" icon={Search} loading={lookingUp} onClick={lookupBooking} style={{ marginBottom: 4 }}>
              Look up
            </Button>
          </div>
        </div>

        {booking && balance && (
          <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: '#eef2fb' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-bold" style={{ color: '#1F2937' }}>{booking.bookingNumber} — {booking.customerName || 'Customer'}</p>
                <p className="text-xs" style={{ color: '#6B7280' }}>{booking.customerPhone} · Status: {titleCase(booking.status)}</p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-[11px] uppercase font-bold" style={{ color: '#6B7280' }}>Collected</p>
                  <p className="text-sm font-bold" style={{ color: '#1F2937' }}>{formatCurrency(balance.totalCaptured)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-bold" style={{ color: '#6B7280' }}>Already refunded</p>
                  <p className="text-sm font-bold" style={{ color: '#1F2937' }}>{formatCurrency(balance.alreadyRefunded)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-bold" style={{ color: '#3B65DB' }}>Refundable</p>
                  <p className="text-sm font-black" style={{ color: '#3B65DB' }}>{formatCurrency(balance.refundable)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <FormField label="Refund amount (₹)" required error={errors.amount}>
            <Input type="number" min="0" value={form.amount}
              onChange={(e) => { set('amount', e.target.value); setErrors((er) => ({ ...er, amount: undefined })); }}
              placeholder="e.g. 500" disabled={!booking} />
          </FormField>
          <FormField label="Refund method" required hint="How the money actually went back — not how it was collected.">
            <Select value={form.method} onChange={(e) => set('method', e.target.value)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} disabled={!booking} />
          </FormField>
        </div>

        <FormField label="Reason" required error={errors.reason} className="mb-2"
          hint="What a finance audit will read later — be specific.">
          <Textarea
            value={form.reason} onChange={(e) => { set('reason', e.target.value); setErrors((er) => ({ ...er, reason: undefined })); }}
            rows={2} maxLength={300} disabled={!booking}
            error={errors.reason}
            placeholder="e.g. Customer cancelled after driver no-show; full advance refunded"
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <FormField label="Reference (optional)" hint="Bank UTR, UPI ref, or cheque no.">
            <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} disabled={!booking} placeholder="e.g. UTR1234567890" />
          </FormField>
          <FormField label="Internal notes (optional)">
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={!booking} placeholder="Anything else worth recording" />
          </FormField>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={resetForm}>Reset</Button>
          {/* Disabled until POST /admin/payments/refunds exists on the backend.
              Re-enable by restoring: disabled={!booking} */}
          <Button size="sm" loading={submitting} disabled title="Refund recording needs a backend route that isn't built yet" onClick={submit}>Record Refund</Button>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#6B7280' }}>Refund history</p>
      <DataTable
        columns={historyColumns}
        rows={history.rows}
        status={history.status}
        error={history.error}
        onRetry={history.refetch}
        page={history.page}
        limit={history.meta?.limit}
        total={history.meta?.total}
        totalPages={history.meta?.totalPages}
        onPageChange={history.setPage}
        onLimitChange={history.setLimit}
        emptyTitle="No refunds recorded yet"
        emptyDescription="Refunds issued from this screen will show up here."
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Links tab — booking-centric: link / QR / collections / cancel / resend
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION_STATUS_TONE = {
  CREATED: 'blue', AUTHORISED: 'amber', CAPTURED: 'green',
  PARTIALLY_PAID: 'amber', FAILED: 'red', REFUNDED: 'purple',
  CANCELLED: 'slate', created: 'blue', paid: 'green', cancelled: 'slate',
  expired: 'slate', partially_paid: 'amber',
};

function PaymentLinksTab() {
  const toast = useToast();

  // Tab mode: 'booking' or 'manual'
  const [mode, setMode] = useState('booking');

  // ── Booking-linked state ──
  const [bookingInput, setBookingInput] = useState('');
  const [booking, setBooking] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [linkResult, setLinkResult] = useState(null);
  const [qrResult, setQrResult] = useState(null);
  const [actionId, setActionId] = useState(null);

  // ── Standalone (manual) state ──
  const [manualForm, setManualForm] = useState({
    amount: '', customerName: '', customerPhone: '', customerEmail: '',
    description: '', expireByMinutes: '', sendSms: true, sendEmail: false,
  });
  const [manualErrors, setManualErrors] = useState({});
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState(null);

  const setMF = (k, v) => { setManualForm((f) => ({ ...f, [k]: v })); setManualErrors((e) => ({ ...e, [k]: undefined })); };

  // ── Shared helpers ──
  const copyLink = (url) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Copy failed')
    );
  };

  // ── Booking-linked handlers ──
  const lookupBooking = async () => {
    const val = bookingInput.trim();
    if (!val) return;
    setLookupLoading(true); setLookupError(''); setBooking(null);
    setCollections([]); setLinkResult(null); setQrResult(null);
    try {
      const b = await adminPaymentsService.findBookingByNumber(val);
      if (!b || !b.id) throw new Error('Booking not found');
      setBooking(b);
      loadCollections(b.id);
    } catch (e) { setLookupError(e.message || 'Not found'); }
    finally { setLookupLoading(false); }
  };

  const loadCollections = async (bookingId) => {
    setCollectionsLoading(true);
    try {
      const res = await adminPaymentsService.getCollections(bookingId);
      const items = res?.data?.collections || res?.collections || res?.data?.payments || res?.payments || res?.data || [];
      setCollections(Array.isArray(items) ? items : []);
    } catch { setCollections([]); }
    finally { setCollectionsLoading(false); }
  };

  const createLink = async () => {
    if (!booking) return;
    setLinkLoading(true); setLinkResult(null);
    try {
      const res = await adminPaymentsService.createPaymentLink(booking.id);
      const link = res?.data?.payment || res?.data?.link || res?.payment || res?.link || res?.data || res;
      setLinkResult(link);
      toast.success(link.reused ? 'Existing link returned' : 'Payment link created');
      loadCollections(booking.id);
    } catch (e) { toast.error(e.message || 'Failed'); }
    finally { setLinkLoading(false); }
  };

  const createQR = async () => {
    if (!booking) return;
    setQrLoading(true); setQrResult(null);
    try {
      const res = await adminPaymentsService.createPaymentQR(booking.id);
      const qr = res?.data?.payment || res?.data?.qr || res?.payment || res?.qr || res?.data || res;
      setQrResult(qr);
      toast.success('QR code generated');
      loadCollections(booking.id);
    } catch (e) { toast.error(e.message || 'Failed'); }
    finally { setQrLoading(false); }
  };

  const handleCancel = async (paymentId) => {
    if (!confirm('Cancel this payment?')) return;
    setActionId(paymentId);
    try {
      await adminPaymentsService.cancelPayment(paymentId);
      toast.success('Payment cancelled');
      if (booking) loadCollections(booking.id);
    } catch (e) { toast.error(e.message || 'Cancel failed'); }
    finally { setActionId(null); }
  };

  const handleResend = async (paymentId, medium) => {
    setActionId(paymentId);
    try {
      await adminPaymentsService.resendPayment(paymentId, medium);
      toast.success(`Notification resent via ${medium.toUpperCase()}`);
    } catch (e) { toast.error(e.message || 'Resend failed'); }
    finally { setActionId(null); }
  };

  // ── Standalone handler ──
  const submitManualLink = async () => {
    const f = manualForm;
    const errs = {};
    if (!f.amount || Number(f.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!f.customerPhone.trim()) errs.customerPhone = 'Required';
    if (f.customerPhone && !/^\+?\d{10,13}$/.test(f.customerPhone.replace(/\s/g, ''))) errs.customerPhone = 'Invalid phone';
    if (f.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.customerEmail)) errs.customerEmail = 'Invalid email';
    setManualErrors(errs);
    if (Object.keys(errs).length) return;

    setManualLoading(true);
    try {
      const res = await adminPaymentsService.createStandaloneLink({
        amount: Number(f.amount),
        customerPhone: f.customerPhone.trim(),
        customerName: f.customerName.trim() || undefined,
        customerEmail: f.customerEmail.trim() || undefined,
        description: f.description.trim() || undefined,
        notifyBySms: f.sendSms,
        notifyByEmail: f.sendEmail,
        // Backend expects hours, not minutes
        expiresInHours: (f.expireByMinutes && Number(f.expireByMinutes) > 0)
          ? Math.max(1, Math.ceil(Number(f.expireByMinutes) / 60))
          : undefined,
      });
      const link = res?.data?.payment || res?.data?.link || res?.payment || res?.link || res?.data || res;
      setManualResult(link);
      toast.success(res?.message || 'Payment link created');
    } catch (e) { toast.error(e.message || 'Failed to create payment link'); }
    finally { setManualLoading(false); }
  };

  const fare = booking ? (booking.finalFare ?? booking.estimatedFare ?? booking.amount) : null;

  return (
    <div className="space-y-5 mt-4">
      {/* ── Mode selector ── */}
      <div className="flex gap-2">
        {[
          { key: 'booking', label: 'From Booking', icon: '📋' },
          { key: 'manual', label: 'Manual Link', icon: '✏️' },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => { setMode(t.key); setManualResult(null); }}
            style={{
              padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13,
              border: `2px solid ${mode === t.key ? '#3B65DB' : '#E8E8E4'}`,
              backgroundColor: mode === t.key ? '#EFF6FF' : '#fff',
              color: mode === t.key ? '#1D4ED8' : '#6B7280',
              cursor: 'pointer',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* BOOKING MODE                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === 'booking' && (
        <>
          {/* Step 1: Lookup */}
          <div style={{ padding: '16px 20px', borderRadius: 14, backgroundColor: '#F9FAFB', border: '1.5px solid #E8E8E4' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#6B7280' }}>1. Find Booking</p>
            <div className="flex gap-2 items-end">
              <FormField label="Booking number or ID" style={{ flex: 1, margin: 0 }}>
                <Input value={bookingInput} onChange={(e) => setBookingInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupBooking()} placeholder="ABH-2026-000123" />
              </FormField>
              <Button loading={lookupLoading} onClick={lookupBooking} style={{ marginBottom: 1 }}>
                <Search size={14} className="mr-1" /> Look up
              </Button>
            </div>
            {lookupError && <Alert type="warning" className="mt-3">{lookupError}</Alert>}
            {booking && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{booking.bookingNumber || booking.id}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                      {booking.customer?.user?.name || booking.guestName || 'Customer'}
                      {(booking.customer?.user?.phone || booking.guestPhone) && ` · ${booking.customer?.user?.phone || booking.guestPhone}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={booking.status} />
                    {fare && <span style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>₹{Number(fare).toLocaleString('en-IN')}</span>}
                  </div>
                </div>
                {(booking.advancePaid != null || booking.balanceDue != null) && (
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: '#6B7280' }}>
                    {booking.advancePaid != null && <span>Advance: <strong style={{ color: '#15803D' }}>₹{Number(booking.advancePaid).toLocaleString('en-IN')}</strong></span>}
                    {booking.balanceDue != null && Number(booking.balanceDue) > 0 && <span>Balance: <strong style={{ color: '#DC2626' }}>₹{Number(booking.balanceDue).toLocaleString('en-IN')}</strong></span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Generate */}
          {booking && (
            <div style={{ padding: '16px 20px', borderRadius: 14, backgroundColor: '#F9FAFB', border: '1.5px solid #E8E8E4' }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#6B7280' }}>2. Send Payment Link or QR</p>
              <div className="flex gap-3 flex-wrap">
                <Button icon={Link2} loading={linkLoading} onClick={createLink}>Generate Payment Link</Button>
                <Button icon={QrCode} variant="secondary" loading={qrLoading} onClick={createQR}>Generate QR Code</Button>
              </div>
              {linkResult && (linkResult.shareUrl || linkResult.shortUrl || linkResult.short_url) && (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, backgroundColor: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#15803D', marginBottom: 6 }}>✓ Payment Link {linkResult.reused ? '(existing)' : 'Created'}</p>
                  <div className="flex items-center gap-2">
                    <a href={linkResult.shareUrl || linkResult.shortUrl || linkResult.short_url} target="_blank" rel="noopener noreferrer"
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#3B65DB', wordBreak: 'break-all' }}>{linkResult.shareUrl || linkResult.shortUrl || linkResult.short_url}</a>
                    <IconButton icon={Copy} size="sm" label="Copy" onClick={() => copyLink(linkResult.shareUrl || linkResult.shortUrl || linkResult.short_url)} />
                    <IconButton icon={ExternalLink} size="sm" label="Open" onClick={() => window.open(linkResult.shareUrl || linkResult.shortUrl || linkResult.short_url, '_blank')} />
                  </div>
                </div>
              )}
              {qrResult && (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1D4ED8', marginBottom: 6 }}>✓ QR Code Generated</p>
                  {(qrResult.qrImageUrl || qrResult.image_url || qrResult.qr_image) && (
                    <div className="flex justify-center my-2">
                      <img src={qrResult.qrImageUrl || qrResult.image_url || qrResult.qr_image} alt="QR"
                        style={{ width: 200, height: 200, borderRadius: 10, border: '1px solid #E5E7EB' }} />
                    </div>
                  )}
                  {(qrResult.shareUrl || qrResult.shortUrl || qrResult.short_url) && (
                    <div className="flex items-center gap-2 mt-2">
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#3B65DB', wordBreak: 'break-all' }}>{(qrResult.shareUrl || qrResult.shortUrl || qrResult.short_url).replace('https://', '')}</span>
                      <IconButton icon={Copy} size="sm" label="Copy" onClick={() => copyLink(qrResult.shareUrl || qrResult.shortUrl || qrResult.short_url)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Collections */}
          {booking && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B7280' }}>3. Collections ({collections.length})</p>
                <button onClick={() => loadCollections(booking.id)} className="text-xs font-medium flex items-center gap-1"
                  style={{ color: '#3B65DB', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              {collectionsLoading ? <LoadingState label="Loading collections…" /> : collections.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', borderRadius: 14, border: '1.5px dashed #E8E8E4', backgroundColor: '#FAFAFA' }}>
                  <Banknote size={28} className="mx-auto mb-2" style={{ color: '#D1D5DB' }} />
                  <p style={{ fontWeight: 700, fontSize: 13.5, color: '#6B7280' }}>No payment records yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {collections.map((p) => {
                    const amt = Number(p.amount || 0);
                    const st = p.status || 'CREATED';
                    const isLive = ['CREATED', 'AUTHORISED', 'created'].includes(st);
                    const isCaptured = ['CAPTURED', 'paid'].includes(st);
                    const isCancelled = ['FAILED', 'REFUNDED', 'CANCELLED', 'cancelled', 'expired'].includes(st);
                    const url = p.shareUrl || p.shortUrl || p.short_url || null;
                    const method = p.method || p.purpose || '';
                    return (
                      <div key={p.id || p.providerOrderId} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 14,
                        border: `1.5px solid ${isCaptured ? '#BBF7D0' : '#E8E8E4'}`,
                        backgroundColor: isCaptured ? '#F0FDF4' : '#fff', opacity: isCancelled ? 0.55 : 1,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>₹{amt.toLocaleString('en-IN')}</span>
                            <Badge tone={COLLECTION_STATUS_TONE[st] || 'slate'}>{titleCase(String(st).replace(/_/g, ' '))}</Badge>
                            {method && <Badge tone="slate">{titleCase(String(method).replace(/_/g, ' '))}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#6B7280' }}>
                            {p.paidAt && <span>Paid {formatDateTime(p.paidAt)}</span>}
                            {!p.paidAt && p.createdAt && <span>Created {formatDateTime(p.createdAt)}</span>}
                          </div>
                          {url && (
                            <button onClick={() => copyLink(url)} className="flex items-center gap-1 text-xs mt-1"
                              style={{ color: '#3B65DB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              <Link2 size={10} /> {url.replace('https://', '')}
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                          {url && <IconButton icon={Copy} size="sm" label="Copy" onClick={() => copyLink(url)} />}
                          {isLive && (
                            <>
                              <IconButton icon={Smartphone} size="sm" label="SMS" loading={actionId === p.id} onClick={() => handleResend(p.id, 'sms')} />
                              <IconButton icon={Send} size="sm" label="Email" loading={actionId === p.id} onClick={() => handleResend(p.id, 'email')} />
                              <IconButton icon={XCircle} size="sm" label="Cancel" variant="danger" loading={actionId === p.id} onClick={() => handleCancel(p.id)} />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!booking && !lookupLoading && (
            <div style={{ padding: '40px 16px', textAlign: 'center', borderRadius: 14, border: '1.5px dashed #E8E8E4', backgroundColor: '#FAFAFA' }}>
              <Link2 size={28} className="mx-auto mb-2" style={{ color: '#D1D5DB' }} />
              <p style={{ fontWeight: 700, fontSize: 13.5, color: '#6B7280' }}>Enter a booking number above</p>
              <p style={{ fontSize: 12, color: '#9A9A9A', marginTop: 4 }}>Amount is auto-calculated from the booking fare.</p>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MANUAL / STANDALONE MODE                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === 'manual' && (
        <div style={{ padding: '20px 24px', borderRadius: 14, backgroundColor: '#F9FAFB', border: '1.5px solid #E8E8E4' }}>
          {manualResult ? (
            /* ── Success ── */
            <div>
              <div style={{ padding: '16px', borderRadius: 14, backgroundColor: '#F0FDF4', border: '1.5px solid #BBF7D0', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#15803D', marginBottom: 8 }}>✓ Payment link created</p>
                <div className="space-y-2" style={{ fontSize: 13, color: '#374151' }}>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#6B7280' }}>Amount</span>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>₹{Number(manualResult.amount || manualForm.amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#6B7280' }}>Customer</span>
                    <span style={{ fontWeight: 600 }}>{manualResult.payerName || manualForm.customerName}{(manualResult.payerPhone || manualForm.customerPhone) ? ` · ${manualResult.payerPhone || manualForm.customerPhone}` : ''}</span>
                  </div>
                  {(manualResult.shareUrl || manualResult.shortUrl || manualResult.short_url) && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Payment Link</p>
                      <div className="flex items-center gap-2">
                        <a href={manualResult.shareUrl || manualResult.shortUrl || manualResult.short_url} target="_blank" rel="noopener noreferrer"
                          style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#3B65DB', wordBreak: 'break-all' }}>
                          {manualResult.shareUrl || manualResult.shortUrl || manualResult.short_url}
                        </a>
                        <IconButton icon={Copy} size="sm" label="Copy" onClick={() => copyLink(manualResult.shareUrl || manualResult.shortUrl || manualResult.short_url)} />
                        <IconButton icon={ExternalLink} size="sm" label="Open" onClick={() => window.open(manualResult.shareUrl || manualResult.shortUrl || manualResult.short_url, '_blank')} />
                      </div>
                    </div>
                  )}
                  {manualForm.sendSms && <p style={{ fontSize: 12, color: '#15803D', marginTop: 4 }}>📱 SMS sent to {manualResult.payerPhone || manualForm.customerPhone}</p>}
                  {manualForm.sendEmail && manualForm.customerEmail && <p style={{ fontSize: 12, color: '#15803D' }}>✉️ Email sent to {manualResult.payerEmail || manualForm.customerEmail}</p>}
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => {
                  setManualResult(null);
                  setManualForm({ amount: '', customerName: '', customerPhone: '', customerEmail: '', description: '', expireByMinutes: '', sendSms: true, sendEmail: false });
                }}>Create Another</Button>
                <Button onClick={() => { setManualResult(null); setMode('booking'); }}>Done</Button>
              </div>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#6B7280' }}>
                Create Payment Link (no booking)
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Amount (₹)" required error={manualErrors.amount}>
                    <Input type="number" min="1" step="0.01" value={manualForm.amount}
                      onChange={(e) => setMF('amount', e.target.value)} placeholder="4250" />
                  </FormField>
                  <FormField label="Customer name" error={manualErrors.customerName}>
                    <Input value={manualForm.customerName}
                      onChange={(e) => setMF('customerName', e.target.value)} placeholder="Rajesh Kumar" />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Phone" required error={manualErrors.customerPhone} hint="SMS is sent here">
                    <Input value={manualForm.customerPhone}
                      onChange={(e) => setMF('customerPhone', e.target.value)} placeholder="9876543210" />
                  </FormField>
                  <FormField label="Email (optional)" error={manualErrors.customerEmail}>
                    <Input type="email" value={manualForm.customerEmail}
                      onChange={(e) => setMF('customerEmail', e.target.value)} placeholder="customer@example.com" />
                  </FormField>
                </div>
                <FormField label="Description" hint="Shown on the Razorpay payment page">
                  <Input value={manualForm.description}
                    onChange={(e) => setMF('description', e.target.value)} placeholder="Balance payment for trip" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Auto-expire (hours)" hint="Empty = 24h default">
                    <Input type="number" min="1" max="720" value={manualForm.expireByMinutes}
                      onChange={(e) => setMF('expireByMinutes', e.target.value)} placeholder="e.g. 24" />
                  </FormField>
                  <div className="space-y-2" style={{ paddingTop: 22 }}>
                    <Switch checked={manualForm.sendSms} onChange={(v) => setMF('sendSms', v)} label="Send SMS" />
                    <Switch checked={manualForm.sendEmail} onChange={(v) => setMF('sendEmail', v)} label="Send Email" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <Button icon={Send} loading={manualLoading} onClick={submitManualLink}>
                    Create Payment Link
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page — four tabs
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'payments', label: 'Payments' },
  { key: 'payment-links', label: 'Payment Links', icon: Link2 },
  { key: 'cash-handovers', label: 'Cash Handovers' },
  { key: 'refunds', label: 'Refunds' },
];

export default function Payments() {
  const [activeTab, setActiveTab] = useState('payments');

  return (
    <div>
      <PageHeader
        title="Payments"
        description="All payment records, Razorpay payment links, driver cash-handover reconciliation, and refunds."
      />

      <PageTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'payments'       && <PaymentsTab />}
      {activeTab === 'payment-links'  && <PaymentLinksTab />}
      {activeTab === 'cash-handovers' && <CashHandoversTab />}
      {activeTab === 'refunds'        && <RefundsTab />}
    </div>
  );
}