import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, Building2, CalendarCheck, Gift, Star, ShieldCheck } from 'lucide-react';
import { useApi }   from '../../hooks/useApi';
import { adminCustomersService, bookingService } from '../../services';
import Breadcrumb   from '../../components/ui/Breadcrumb';
import Card         from '../../components/ui/Card';
import StatusBadge  from '../../components/ui/StatusBadge';
import Badge        from '../../components/ui/Badge';
import Button       from '../../components/ui/Button';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState   from '../../components/ui/ErrorState';
import EmptyState   from '../../components/ui/EmptyState';
import Drawer       from '../../components/ui/Drawer';
import FormField    from '../../components/ui/FormField';
import Input        from '../../components/ui/Input';
import Select       from '../../components/ui/Select';
import { useToast } from '../../hooks/useToast';
import { useForm }  from '../../hooks/useForm';
import { formatCurrency, formatDate, formatDateTime, titleCase, accountTypeLabel } from '../../utils/formatters';
import { getTierForPoints, getNextTier } from '../../lib/loyaltyTiers';

// Where a booking was made. The backend stores it as booking.meta.channel and
// returns it on the staff booking list as `channel`; ?channel= filters on it.
const CHANNELS = [
  { key: '',         label: 'All' },
  { key: 'WEBSITE',  label: 'Website' },
  { key: 'APP',      label: 'App' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'ADMIN',    label: 'Admin / ERP' },
];
const CHANNEL_STYLE = {
  WEBSITE:  { label: 'Website',  bg: '#eff6ff', color: '#1d4ed8' },
  APP:      { label: 'App',      bg: '#f5f3ff', color: '#6d28d9' },
  WHATSAPP: { label: 'WhatsApp', bg: '#ecfdf5', color: '#047857' },
  ADMIN:    { label: 'Admin',    bg: '#fff7ed', color: '#c2410c' },
  OTHER:    { label: 'Other',    bg: '#f3f4f6', color: '#4b5563' },
};
function ChannelTag({ channel }) {
  const c = CHANNEL_STYLE[channel] || CHANNEL_STYLE.OTHER;
  return (
    <span className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.color }}>{c.label}</span>
  );
}
const BOOKINGS_PER_PAGE = 10;

function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '—';
}

function StatCard({ icon: Icon, label, value, tone = 'primary' }) {
  const TONES = {
    primary: { bg: '#eef2fb', color: '#3B65DB' },
    green:   { bg: '#f0fdf4', color: '#38B763' },
    amber:   { bg: '#fffbeb', color: '#F59E0B' },
    purple:  { bg: '#f5f3ff', color: '#7c3aed' },
  };
  const t = TONES[tone] || TONES.primary;
  return (
    <Card className="flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0"
        style={{ backgroundColor: t.bg }}>
        <Icon size={20} style={{ color: t.color }} />
      </div>
      <div>
        <p className="text-xs font-medium" style={{ color: '#6B7280' }}>{label}</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: '#1F2937' }}>{value}</p>
      </div>
    </Card>
  );
}

function LoyaltyStatCard({ points }) {
  const tier = getTierForPoints(points);
  const next = getNextTier(points);
  return (
    <Card className="flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0"
        style={{ backgroundColor: tier ? `${tier.color}22` : '#fffbeb' }}>
        <Gift size={20} style={{ color: tier?.color || '#F59E0B' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="text-xs font-medium" style={{ color: '#6B7280' }}>Loyalty</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-lg font-bold" style={{ color: '#1F2937' }}>{points} pts</p>
          {tier && (
            <span style={{
              padding: '2px 10px', borderRadius: 7, fontSize: 11, fontWeight: 800,
              color: '#fff', backgroundColor: tier.color,
            }}>
              {tier.name}
            </span>
          )}
        </div>
        {next && (
          <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
            {next.pointsNeeded} more trip{next.pointsNeeded !== 1 ? 's' : ''} to {next.name}
          </p>
        )}
      </div>
    </Card>
  );
}

export default function CustomerDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const toast     = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const customer = useApi(() => adminCustomersService.get(id), [id]);
  const [channel, setChannel] = useState('');
  const [bookingPage, setBookingPage] = useState(1);
  useEffect(() => { setBookingPage(1); }, [channel, id]);

  const bookings = useApi(
    () => bookingService.list({
      customerId: id, page: bookingPage, limit: BOOKINGS_PER_PAGE, sortBy: 'createdAt',
      ...(channel ? { channel } : {}),
    }),
    [id, channel, bookingPage]
  );
  const bookingMeta = bookings.data?.meta ?? bookings.data?.pagination ?? {};
  const bookingPages = bookingMeta.totalPages ?? 1;

  // How many of this customer's bookings came from each channel (one tiny
  // request per channel: limit=1, read the total).
  const channelCounts = useApi(async () => {
    const entries = await Promise.all(CHANNELS.map(async (c) => {
      try {
        const res = await bookingService.list({ customerId: id, page: 1, limit: 1, ...(c.key ? { channel: c.key } : {}) });
        return [c.key, (res?.meta ?? res?.pagination)?.total ?? null];
      } catch { return [c.key, null]; }
    }));
    return Object.fromEntries(entries);
  }, [id]);

  // FIX: "Total Bookings" / "Completed" / "Total Spend" used to be computed
  // from the same 10-row "Recent Bookings" preview above — accurate only for
  // a customer with 10 or fewer bookings ever, silently wrong for anyone
  // with more history than that. GET /admin/bookings already supports
  // filtering by customerId (confirmed against the real backend validator),
  // so this fetches the customer's FULL booking history (paging through in
  // batches of 100, the backend's max page size) and computes real totals
  // from all of it — frontend-only, no backend change needed.
  const [fullStats, setFullStats] = useState({ status: 'loading', total: 0, completed: 0, spend: 0 });

  useEffect(() => {
    let cancelled = false;
    setFullStats({ status: 'loading', total: 0, completed: 0, spend: 0 });

    async function loadAll() {
      let page = 1;
      let totalPages = 1;
      let total = 0, completed = 0, spend = 0;
      do {
        const res = await bookingService.list({ customerId: id, page, limit: 100, sortBy: 'createdAt' });
        const rows = res?.data ?? res?.items ?? [];
        const meta = res?.meta ?? res?.pagination;
        totalPages = meta?.totalPages ?? 1;
        total += rows.length;
        for (const b of rows) {
          if (b.status === 'COMPLETED') {
            completed += 1;
            spend += Number(b.finalFare ?? b.estimatedFare ?? 0);
          }
        }
        page += 1;
      } while (page <= totalPages && !cancelled);

      if (!cancelled) setFullStats({ status: 'ready', total, completed, spend });
    }

    loadAll().catch(() => { if (!cancelled) setFullStats((s) => ({ ...s, status: 'error' })); });
    return () => { cancelled = true; };
  }, [id]);

  // adminCustomersService.get() returns customer object directly (already unwrapped)
  const c = customer.data;
  const recentBookings = bookings.data?.data ?? bookings.data?.items ?? bookings.data ?? [];

  // Guest contact details come from a booking. Remember the first one found so
  // the header doesn't change when the source filter or page changes.
  const [guestContact, setGuestContact] = useState(null);
  useEffect(() => { setGuestContact(null); }, [id]);
  useEffect(() => {
    if (guestContact) return;
    const found = (Array.isArray(recentBookings) ? recentBookings : []).find((b) => b.guestName || b.guestPhone);
    if (found) setGuestContact({ guestName: found.guestName, guestPhone: found.guestPhone, guestEmail: found.guestEmail });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.data]);

  const { values, errors, touched, submitting, setValue, setFieldTouched, handleSubmit, setValues } = useForm({
    initialValues: {
      accountType: c?.accountType || 'RETAIL',
      notes:       c?.notes || '',
    },
    onSubmit: async (vals) => {
      await adminCustomersService.update(id, vals);
      toast.success('Customer updated');
      setEditOpen(false);
      customer.refetch();
    },
  });

  // Sync form when customer data loads (useForm initialValues are evaluated before API resolves)
  useEffect(() => {
    if (c) setValues({ accountType: c.accountType || 'RETAIL', notes: c.notes || '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.userId]);

  if (customer.status === 'loading') return <LoadingState label="Loading customer…" />;
  if (customer.status === 'error')   return <ErrorState message={customer.error?.message} onRetry={customer.refetch} />;
  if (!c) return <ErrorState message="Customer not found" />;

  // Real totals across the customer's ENTIRE booking history
  const totalSpend     = fullStats.spend;
  const completedCount = fullStats.completed;
  const totalBookingsCount = fullStats.status === 'ready' ? fullStats.total : (c.totalBookings ?? 0);

  // Detect guest customer and extract real contact info from their bookings
  const isGuest = (() => {
    if (typeof c.isGuest === 'boolean') return c.isGuest;
    const email = (c.user?.email || '').toLowerCase();
    return email.endsWith('@guest.invalid') || email.endsWith('@placeholder.local')
      || email.startsWith('guest-') || email.startsWith('guest.')
      || c.user?.name === 'Guest';
  })();

  // For guests, pull real name/phone/email from their most recent booking
  const guestBooking = isGuest ? guestContact : null;
  const displayName  = isGuest
    ? (guestBooking?.guestName || 'Guest Customer')
    : (c.user?.name || '—');
  const displayPhone = isGuest
    ? (guestBooking?.guestPhone || null)
    : (c.user?.phone || null);
  const displayEmail = isGuest
    ? (guestBooking?.guestEmail || null)
    : (c.user?.email || null);

  return (
    <div>
      <Breadcrumb items={[{ label: 'Customers', to: '/admin/customers' }, { label: displayName }]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-lg grid place-items-center border"
            style={{ borderColor: '#E5E7EB', backgroundColor: '#fff' }}>
            <ArrowLeft size={18} style={{ color: '#6B7280' }} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: '#1F2937' }}>{displayName}</h1>
              <Badge tone={c.accountType === 'CORPORATE' ? 'blue' : 'slate'}>{accountTypeLabel(c.accountType)}</Badge>
              {isGuest && <Badge tone="amber">Guest</Badge>}
              {c.user?.isActive === false && <Badge tone="red">Inactive</Badge>}
              {c.isLive && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ backgroundColor: '#f0fdf4', color: '#22A65A' }}
                  title="Customer's app is open right now"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#22A65A' }} />
                  Live now
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {displayPhone && (
                <span className="flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}>
                  <Phone size={13} />{displayPhone}
                </span>
              )}
              {displayEmail && (
                <span className="flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}>
                  <Mail size={13} />{displayEmail}
                </span>
              )}
              {isGuest && !displayPhone && !displayEmail && (
                <span className="text-sm" style={{ color: '#9CA3AF' }}>Web checkout — no registered account</span>
              )}
              {c.corporate?.companyName && (
                <span className="flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}>
                  <Building2 size={13} />{c.corporate.companyName}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit customer</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={CalendarCheck} label="Total Bookings"  value={fullStats.status === 'loading' ? '…' : totalBookingsCount} tone="primary" />
        <StatCard icon={CalendarCheck} label="Completed"       value={fullStats.status === 'loading' ? '…' : completedCount}     tone="green" />
        <LoyaltyStatCard points={c.loyaltyPoints ?? 0} />
        <StatCard icon={Star}          label="Total Spend"     value={fullStats.status === 'loading' ? '…' : formatCurrency(totalSpend)} tone="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile card */}
        <Card>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#1F2937' }}>Profile</h2>
          <div className="space-y-3">
            {[
              ['Name',         displayName],
              ['Phone',        displayPhone || (isGuest ? 'Not provided' : null)],
              ['Email',        displayEmail || (isGuest ? 'No account' : null)],
              ['Account type', accountTypeLabel(c.accountType)],
              ...(isGuest ? [['Type', 'Guest checkout (no login)']] : []),
              ['Joined',       formatDate(c.createdAt)],
              ...(c.corporate ? [['Company', c.corporate.companyName], ['GSTIN', c.corporate.gstin]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: '#6B7280' }}>{label}</span>
                <span className="text-xs font-semibold text-right" style={{ color: '#1F2937' }}>{value || '—'}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent bookings */}
        <Card padded={false} className="lg:col-span-2">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold" style={{ color: '#1F2937' }}>Bookings</h2>
              <div className="flex gap-1.5 flex-wrap">
                {CHANNELS.map((c) => {
                  const active = channel === c.key;
                  const count = channelCounts.data?.[c.key];
                  return (
                    <button key={c.key || 'all'} type="button" onClick={() => setChannel(c.key)}
                      className="text-xs font-semibold rounded-full px-3 py-1 border"
                      style={{
                        backgroundColor: active ? '#1F2937' : '#fff',
                        color: active ? '#fff' : '#374151',
                        borderColor: active ? '#1F2937' : '#E5E7EB',
                      }}>
                      {c.label}{count != null ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {bookings.status === 'loading' && <LoadingState label="Loading bookings…" />}
          {bookings.status !== 'loading' && recentBookings.length === 0 && (
            <EmptyState icon={CalendarCheck}
              title={channel ? `No ${CHANNELS.find((c) => c.key === channel)?.label} bookings` : 'No bookings yet'}
              description={channel ? 'Try another source.' : 'This customer has not made any bookings yet.'} />
          )}
          {recentBookings.length > 0 && (
            <div>
              {recentBookings.map((b, idx) => (
                <div key={b.id}
                  className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50"
                  style={{ borderBottom: idx < recentBookings.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                  onClick={() => navigate(`/admin/bookings/${b.id}`)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <ChannelTag channel={b.channel} />
                      <p className="text-sm font-medium truncate" style={{ color: '#1F2937' }}>
                        {addr(b.pickupAddress)} → {addr(b.dropAddress)}
                      </p>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                      {b.bookingNumber ? `${b.bookingNumber} · ` : ''}{b.tripType?.replace(/_/g,' ')} · {titleCase(b.vehicleClass || '—')} · {formatDateTime(b.pickupAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <StatusBadge status={b.status} />
                    <p className="text-xs font-bold mt-1" style={{ color: '#1F2937' }}>
                      {formatCurrency(Number(b.finalFare ?? b.estimatedFare) || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {bookingPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F3F4F6' }}>
              <span className="text-xs" style={{ color: '#6B7280' }}>
                Page {bookingPage} of {bookingPages}{bookingMeta.total != null ? ` · ${bookingMeta.total} bookings` : ''}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={bookingPage <= 1} onClick={() => setBookingPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={bookingPage >= bookingPages} onClick={() => setBookingPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Edit drawer */}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit customer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button loading={submitting} onClick={handleSubmit}>Save changes</Button>
          </>
        }>
        <div className="space-y-4">
          <FormField label="Account type">
            <Select value={values.accountType}
              onChange={(e) => setValue('accountType', e.target.value)}
              options={[{ value:'RETAIL', label:'Personal' }, { value:'CORPORATE', label:'Corporate' }]} />
          </FormField>
          <FormField label="Internal notes">
            <Input as="textarea" rows={3} value={values.notes || ''}
              onChange={(e) => setValue('notes', e.target.value)}
              placeholder="Notes visible only to staff…" />
          </FormField>
        </div>
      </Drawer>
    </div>
  );
}
