/**
 * src/pages/admin/Dashboard.jsx — the operations home screen.
 *
 * Built around one question: what needs someone right now?
 *   1. Needs attention — every queue that is waiting on staff, one tap away.
 *   2. Next 12 hours   — every pickup on a time track, coloured by readiness.
 *   3. Last 30 days    — the business numbers, kept to one quiet strip.
 *   4. Trend + fleet, then recent bookings and the live activity feed.
 *
 * Data: the same report endpoints as before (executive, fleet, business-trend),
 * the staff booking list (which now carries each trip's current allocation),
 * and the live counts the realtime context already keeps (dispatch reminder,
 * WhatsApp handoffs, booking requests).
 */
import { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneCall, Truck, ClipboardCheck, Inbox, IdCard, CheckCircle2, PlusCircle, LayoutGrid, RefreshCw,
} from 'lucide-react';
import Card         from '../../components/ui/Card';
import Button       from '../../components/ui/Button';
import TrendChart   from '../../components/dashboard/TrendChart';
import ChannelMix   from '../../components/dashboard/ChannelMix';
import PeakHeatmap  from '../../components/dashboard/PeakHeatmap';
import DonutChart   from '../../components/dashboard/DonutChart';
import PickupBoard, { READINESS, readinessOf } from '../../components/dashboard/PickupBoard';
import StatusBadge  from '../../components/ui/StatusBadge';
import { CardSkeleton } from '../../components/ui/Skeleton';
import ErrorState   from '../../components/ui/ErrorState';
import { useApi }   from '../../hooks/useApi';
import { useAuth }  from '../../hooks/useAuth';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { bookingService, reportsService, bookingOpsService } from '../../services';
import { apiClient } from '../../services/apiClient';
import { formatCurrency, formatDateTime, titleCase } from '../../utils/formatters';
import { attemptWho, attemptState, ATTEMPT_LABEL } from '../../utils/attemptDetails';

// ── Trend buckets ─────────────────────────────────────────────────────────
// Each period is compared with the one before it of the same length:
// last 7 days vs the 7 before, last 8 weeks vs the 8 before, last 6 months
// vs the 6 before. Buckets are built here (UTC days, matching the backend's
// date_trunc) so days with no bookings still show as zero.
const PERIODS = [
  { key: 'daily',   label: '7 days'   },
  { key: 'weekly',  label: '8 weeks'  },
  { key: 'monthly', label: '6 months' },
];
const DAY_MS = 86400000;

function buildBuckets(period, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cur = []; const prev = [];
  if (period === 'monthly') {
    for (let i = 11; i >= 0; i -= 1) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      (i >= 6 ? prev : cur).push({ start, end, label: start.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }) });
    }
  } else {
    const size = period === 'daily' ? 1 : 7;
    const n = period === 'daily' ? 7 : 8;
    for (let i = 2 * n - 1; i >= 0; i -= 1) {
      const end = new Date(today.getTime() + DAY_MS - i * size * DAY_MS);
      const start = new Date(end.getTime() - size * DAY_MS);
      const label = period === 'daily'
        ? start.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
        : start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      (i >= n ? prev : cur).push({ start, end, label });
    }
  }
  return { cur, prev, from: prev[0].start, to: new Date(now.getTime() + 60000) };
}

function sumInto(buckets, series, key) {
  return buckets.map((b) => series.reduce((s, r) => {
    const t = new Date(r.day || r.date).getTime();
    return t >= b.start.getTime() && t < b.end.getTime() ? s + (Number(r[key]) || 0) : s;
  }, 0));
}

/** ₹ in Indian short form for axes: ₹950, ₹12k, ₹3.4L, ₹1.2Cr */
function inrShort(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L`;
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${v}`;
}

function ChangeChip({ now, before }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className="text-xs font-bold rounded-full px-2 py-0.5"
      style={{ backgroundColor: up ? '#DCFCE7' : '#FEE2E2', color: up ? '#166534' : '#991B1B' }}
      title="Compared with the previous period of the same length">
      {up ? '▲' : '▼'} {Math.abs(pct)}% vs previous
    </span>
  );
}

const FEED_LABEL = {
  'booking:created':     { text: 'New booking',        color: '#166534', bg: '#DCFCE7' },
  'booking:attempted':   { text: 'Booking attempt',    color: '#4B5563', bg: '#F3F4F6' },
  'admin:alert':         { text: 'Attempt failed',     color: '#991B1B', bg: '#FEE2E2' },
  'trip:status':         { text: 'Status changed',     color: '#1E3A8A', bg: '#DBEAFE' },
  'booking:allocated':   { text: 'Vehicle assigned',   color: '#5B21B6', bg: '#EDE9FE' },
  'payment:received':    { text: 'Payment received',   color: '#166534', bg: '#DCFCE7' },
  'whatsapp:handoff':    { text: 'WhatsApp: needs a person', color: '#9A3412', bg: '#FFEDD5' },
  'dispatch:unassigned': { text: 'Dispatch reminder',  color: '#991B1B', bg: '#FEE2E2' },
  'booking_request:created': { text: 'Booking request', color: '#1E3A8A', bg: '#DBEAFE' },
  'booking:abandoned':   { text: 'Abandoned checkout', color: '#92400E', bg: '#FEF3C7' },
};

function addr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '';
}
const placeName = (v) => addr(v).split(',')[0].trim() || '—';

function last30Days() {
  const to   = new Date();
  const from = new Date(Date.now() - 30 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const totalOf = (res) => res?.meta?.total ?? res?.pagination?.total ?? 0;

/** One queue that is waiting on staff. Quiet when empty, loud when not. */
function AttentionItem({ icon: Icon, count, label, hint, tone, onClick }) {
  const active = count > 0;
  const tones = {
    red:    { fg: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
    orange: { fg: '#9A3412', bg: '#FFF7ED', border: '#FED7AA' },
    violet: { fg: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE' },
    blue:   { fg: '#1E3A8A', bg: '#EFF6FF', border: '#BFDBFE' },
    amber:  { fg: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="attention-item text-left rounded-xl px-4 py-3 border transition-colors"
      style={{
        backgroundColor: active ? t.bg : '#FFFFFF',
        borderColor: active ? t.border : '#E8E8E4',
        color: active ? t.fg : '#6B7280',
        minWidth: 0,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon size={18} aria-hidden="true" />
        <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: active ? t.fg : '#C4C4BE' }}>
          {count}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold" style={{ color: active ? t.fg : '#374151' }}>{label}</p>
      <p className="text-xs" style={{ color: active ? t.fg : '#9CA3AF', opacity: active ? 0.85 : 1 }}>{hint}</p>
    </button>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="px-5 py-4" style={{ minWidth: 0 }}>
      <p className="text-xs" style={{ color: '#6B7280' }}>{label}</p>
      <p className="text-2xl font-extrabold mt-0.5" style={{ color: '#111', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    feed, lastBookingEventId,
    unassignedSoon = [], handoffCount = 0, newRequestCount = 0,
  } = useAdminRealtimeContext();
  const range = useMemo(() => last30Days(), []);
  const [now, setNow] = useState(Date.now());

  // Keep the "now" line and the pickup window moving.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const executiveApi = useApi(() => reportsService.executive(range), []);
  const fleetApi     = useApi(() => reportsService.fleet(range), []);
  const recentApi    = useApi(() => bookingService.list({ page: 1, limit: 6, sortBy: 'createdAt', order: 'desc' }), []);
  const pendingApi   = useApi(() => bookingService.list({ status: 'PENDING', page: 1, limit: 1 }), []);
  const kycApi       = useApi(() => apiClient.get('/admin/drivers', { params: { kycStatus: 'PENDING', submitted: true, limit: 1, page: 1 } }), []);
  const attemptsApi  = useApi(() => bookingOpsService.attempts({ limit: 5, page: 1 }), []);

  // Every pickup from an hour ago to 12 hours ahead, for the board.
  const [boardTick, setBoardTick] = useState(0);
  const upcomingApi = useApi(() => bookingService.list({
    from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    sortBy: 'pickupAt', order: 'asc', page: 1, limit: 100,
  }), [boardTick]);

  // Trends: one period switch drives both the bookings and revenue charts.
  const [chartPeriod, setChartPeriod] = useState('daily');
  const buckets = useMemo(() => buildBuckets(chartPeriod), [chartPeriod]);
  const trendApi = useApi(() => apiClient.get('/admin/reports/business-trend', {
    params: { from: buckets.from.toISOString(), to: buckets.to.toISOString() },
  }), [chartPeriod]);
  const trend = useMemo(() => {
    const series = trendApi.data?.series || (Array.isArray(trendApi.data) ? trendApi.data : []);
    const cb = sumInto(buckets.cur, series, 'bookings');
    const pb = sumInto(buckets.prev, series, 'bookings');
    const cr = sumInto(buckets.cur, series, 'revenue');
    const pr = sumInto(buckets.prev, series, 'revenue');
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    return {
      bookings: buckets.cur.map((b, i) => ({ label: b.label, value: cb[i], prev: pb[i] })),
      revenue: buckets.cur.map((b, i) => ({ label: b.label, value: cr[i], prev: pr[i] })),
      totals: { b: sum(cb), pb: sum(pb), r: sum(cr), pr: sum(pr) },
    };
  }, [trendApi.data, buckets]);

  // Where bookings come from (last 30 days) and when trips run (last 8 weeks).
  const channelsApi = useApi(() => apiClient.get('/admin/reports/channels', { params: range }), []);
  const peakApi = useApi(() => apiClient.get('/admin/reports/peak-hours', {
    params: { from: new Date(Date.now() - 56 * DAY_MS).toISOString(), to: new Date().toISOString() },
  }), []);

  const refreshAll = () => {
    recentApi.refetch(); executiveApi.refetch(); fleetApi.refetch(); trendApi.refetch();
    pendingApi.refetch(); kycApi.refetch(); attemptsApi.refetch(); setBoardTick((t) => t + 1);
    channelsApi.refetch(); peakApi.refetch();
  };

  // A new booking arrived on the live connection: refresh what it affects.
  useEffect(() => {
    if (!lastBookingEventId) return;
    recentApi.refetch(); executiveApi.refetch(); pendingApi.refetch(); setBoardTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBookingEventId]);
  // And the board every 2 minutes, so assignments made elsewhere show up.
  useEffect(() => {
    const t = setInterval(() => setBoardTick((x) => x + 1), 120000);
    return () => clearInterval(t);
  }, []);

  // Fleet: real backend { fleet: { total, byStatus } } or the mock's array.
  const fleetRaw = fleetApi.data;
  const fleetObj = Array.isArray(fleetRaw) ? null : (fleetRaw?.fleet || fleetRaw || null);
  const fleetTotal = fleetObj?.total ?? 0;
  const fleetStatus = useMemo(() => {
    if (fleetObj?.byStatus) return Object.entries(fleetObj.byStatus).map(([label, value]) => ({ label: titleCase(label), value }));
    if (Array.isArray(fleetRaw)) return fleetRaw.map((v) => ({ label: titleCase(v.type || 'Unknown'), value: v.count || 0 }));
    return [];
  }, [fleetRaw, fleetObj]);
  const onTrip = Number(fleetObj?.byStatus?.ON_TRIP || 0) + Number(fleetObj?.byStatus?.ASSIGNED || 0);

  const upcoming = useMemo(() => upcomingApi.data?.data ?? upcomingApi.data?.items ?? [], [upcomingApi.data]);
  const readyCounts = useMemo(() => {
    const c = {};
    for (const b of upcoming) {
      if (['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(b.status)) continue;
      const k = readinessOf(b); c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [upcoming]);
  const boardBookings = useMemo(() => upcoming.filter((b) => !['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(b.status)), [upcoming]);

  const loading = executiveApi.status === 'loading' && recentApi.status === 'loading';
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }
  if (recentApi.status === 'error' && executiveApi.status === 'error') {
    return <ErrorState message={recentApi.error?.message} onRetry={refreshAll} />;
  }

  const exec = executiveApi.data || {};
  const totalBookings = Number(exec.volume?.totalBookings ?? exec.totalBookings ?? 0);
  const completed     = Number(exec.volume?.completedBookings ?? exec.completedBookings ?? 0);
  const totalRevenue  = Number(exec.cash?.collected ?? exec.totalRevenue ?? 0);
  const recentBookings = recentApi.data?.data ?? recentApi.data?.items ?? [];
  const attempts = attemptsApi.data?.items ?? [];
  const attemptsTotal = attemptsApi.data?.pagination?.total ?? 0;

  const pendingCount = totalOf(pendingApi.data);
  const kycCount = totalOf(kycApi.data);
  const unassignedCount = unassignedSoon.filter((u) => !u.needsConfirmation).length;
  const attention = [
    { key: 'confirm',  icon: ClipboardCheck, count: pendingCount,    label: 'To confirm',         hint: 'New bookings waiting',            tone: 'violet', to: '/admin/dispatch' },
    { key: 'assign',   icon: Truck,          count: unassignedCount, label: 'Need vehicle or driver', hint: 'Pickup within 3 hours',      tone: 'red',    to: '/admin/dispatch' },
    { key: 'whatsapp', icon: PhoneCall,      count: handoffCount,    label: 'WhatsApp waiting',   hint: 'Customers asking for a person',   tone: 'orange', to: '/admin/whatsapp?tab=conversations&filter=handoff' },
    { key: 'requests', icon: Inbox,          count: newRequestCount, label: 'Booking requests',   hint: 'Outside service area',            tone: 'blue',   to: '/admin/booking-requests' },
    { key: 'kyc',      icon: IdCard,         count: kycCount,        label: 'Driver KYC',         hint: 'Applications to review',          tone: 'amber',  to: '/admin/drivers' },
  ];
  const allClear = attention.every((a) => !a.count);
  const today = new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="dash-title text-2xl font-extrabold" style={{ letterSpacing: '-0.02em' }}>
            {greeting(new Date(now))}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="dash-sub text-sm mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refreshAll}>Refresh</Button>
          <Button variant="secondary" size="sm" icon={LayoutGrid} onClick={() => navigate('/admin/dispatch')}>Dispatch board</Button>
          <Button size="sm" icon={PlusCircle} onClick={() => navigate('/admin/bookings?new=1')}>New booking</Button>
        </div>
      </div>

      {/* Needs attention */}
      <section aria-labelledby="attention-h" className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 id="attention-h" className="dash-section text-sm font-bold">Needs attention</h2>
          {allClear && (
            <span className="dash-clear inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5">
              <CheckCircle2 size={14} aria-hidden="true" /> All clear
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {attention.map((a) => (
            <AttentionItem key={a.key} {...a} onClick={() => navigate(a.to)} />
          ))}
        </div>
      </section>

      {/* Next 12 hours */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#111' }}>Next 12 hours</h2>
            <p className="text-xs" style={{ color: '#6B7280' }}>
              {boardBookings.length
                ? `${boardBookings.length} pickup${boardBookings.length > 1 ? 's' : ''}. Tap a trip to open it.`
                : 'No pickups scheduled in the next 12 hours.'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(READINESS).filter(([k]) => readyCounts[k]).map(([k, r]) => (
              <span key={k} className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ backgroundColor: r.bg, color: r.fg }}>
                {readyCounts[k]} {r.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        {upcomingApi.status === 'loading' && !upcoming.length ? (
          <div className="h-[120px] grid place-items-center text-sm" style={{ color: '#9CA3AF' }}>Loading pickups…</div>
        ) : upcomingApi.status === 'error' ? (
          <div className="h-[120px] grid place-items-center text-sm" style={{ color: '#DC2626' }}>Couldn't load pickups. Try Refresh.</div>
        ) : (
          <>
            {/* Phones: a plain list reads better than a sideways-scrolling track. */}
            <div className="sm:hidden">
              {boardBookings.filter((b) => new Date(b.pickupAt).getTime() >= now - 30 * 60000).slice(0, 8).map((b) => {
                const r = READINESS[readinessOf(b)];
                return (
                  <button key={b.id} type="button" onClick={() => navigate(`/admin/bookings/${b.id}`)}
                    className="w-full flex items-center gap-3 py-2.5 text-left" style={{ borderTop: '1px solid #F3F4F6' }}>
                    <span className="text-sm font-bold shrink-0" style={{ width: 74, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111' }}>
                      {new Date(b.pickupAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate" style={{ color: '#111' }}>{placeName(b.pickupAddress)} to {placeName(b.dropAddress)}</span>
                      <span className="block text-xs truncate" style={{ color: '#6B7280' }}>{b.bookingNumber}</span>
                    </span>
                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 shrink-0" style={{ backgroundColor: r.bg, color: r.fg }}>{r.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="hidden sm:block">
              <PickupBoard bookings={boardBookings} now={now} onOpen={(b) => navigate(`/admin/bookings/${b.id}`)} />
            </div>
          </>
        )}
      </Card>

      {/* Last 30 days */}
      <section aria-labelledby="month-h" className="mb-6">
        <h2 id="month-h" className="dash-section text-sm font-bold mb-2">Last 30 days</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border bg-white month-strip" style={{ borderColor: '#E8E8E4' }}>
          <Stat label="Bookings" value={totalBookings.toLocaleString('en-IN')} sub={completed ? `${completed.toLocaleString('en-IN')} completed` : undefined} />
          <Stat label="Revenue collected" value={formatCurrency(totalRevenue)} />
          <Stat label="Fleet" value={fleetTotal} sub={fleetTotal ? `${onTrip} on trips now` : undefined} />
          <Stat label="Checkout attempts" value={attemptsTotal.toLocaleString('en-IN')} sub="Started on the website or app" />
        </div>
      </section>

      {/* Trends */}
      <section aria-labelledby="trends-h" className="mb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h2 id="trends-h" className="dash-section text-sm font-bold">Trends</h2>
          <div role="tablist" aria-label="Period" className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#EDEDE8' }}>
            {PERIODS.map((p) => (
              <button key={p.key} role="tab" aria-selected={chartPeriod === p.key} onClick={() => setChartPeriod(p.key)}
                style={{
                  fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  backgroundColor: chartPeriod === p.key ? '#FFC107' : 'transparent', color: '#111',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
              <div>
                <h3 className="text-base font-bold" style={{ color: '#111' }}>Bookings made</h3>
                <p className="text-2xl font-extrabold mt-0.5" style={{ color: '#111', fontVariantNumeric: 'tabular-nums' }}>
                  {trend.totals.b.toLocaleString('en-IN')}
                  <span className="text-sm font-medium ml-2" style={{ color: '#6B7280' }}>in the last {PERIODS.find((p) => p.key === chartPeriod).label}</span>
                </p>
              </div>
              <ChangeChip now={trend.totals.b} before={trend.totals.pb} />
            </div>
            {trendApi.status === 'loading' ? (
              <div className="h-[240px] grid place-items-center text-sm" style={{ color: '#9CA3AF' }}>Loading…</div>
            ) : trendApi.status === 'error' ? (
              <div className="h-[240px] grid place-items-center text-sm" style={{ color: '#DC2626' }}>Couldn't load the booking trend.</div>
            ) : (
              <TrendChart data={trend.bookings} type="bar" valueName="Bookings" prevName="Previous period" format={(n) => Math.round(n).toLocaleString('en-IN')} />
            )}
          </Card>
          <Card>
            <h3 className="text-base font-bold mb-3" style={{ color: '#111' }}>Bookings by source</h3>
            {channelsApi.status === 'loading' ? (
              <div className="h-[200px] grid place-items-center text-sm" style={{ color: '#9CA3AF' }}>Loading…</div>
            ) : channelsApi.status === 'error' ? (
              <p className="text-sm py-6" style={{ color: '#DC2626' }}>Couldn't load booking sources.</p>
            ) : (
              <ChannelMix channels={channelsApi.data?.channels || []} formatMoney={(n) => formatCurrency(n)} />
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
              <div>
                <h3 className="text-base font-bold" style={{ color: '#111' }}>Revenue from completed trips</h3>
                <p className="text-2xl font-extrabold mt-0.5" style={{ color: '#111', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(trend.totals.r)}
                  <span className="text-sm font-medium ml-2" style={{ color: '#6B7280' }}>in the last {PERIODS.find((p) => p.key === chartPeriod).label}</span>
                </p>
              </div>
              <ChangeChip now={trend.totals.r} before={trend.totals.pr} />
            </div>
            {trendApi.status === 'loading' ? (
              <div className="h-[240px] grid place-items-center text-sm" style={{ color: '#9CA3AF' }}>Loading…</div>
            ) : trendApi.status === 'error' ? (
              <div className="h-[240px] grid place-items-center text-sm" style={{ color: '#DC2626' }}>Couldn't load the revenue trend.</div>
            ) : (
              <TrendChart data={trend.revenue} type="line" valueName="Revenue" prevName="Previous period" format={inrShort} />
            )}
          </Card>
          <Card>
            <h3 className="text-base font-bold mb-4" style={{ color: '#111' }}>Fleet right now</h3>
            {fleetStatus.length > 0
              ? <DonutChart data={fleetStatus} size={140} />
              : <p className="text-sm text-center py-8" style={{ color: '#9CA3AF' }}>Add vehicles to see the fleet here.</p>}
          </Card>
        </div>

        <Card>
          <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
            <div>
              <h3 className="text-base font-bold" style={{ color: '#111' }}>Busy times</h3>
              <p className="text-xs" style={{ color: '#6B7280' }}>Pickups by day and hour over the last 8 weeks. Plan driver shifts around the darker slots.</p>
            </div>
          </div>
          {peakApi.status === 'loading' ? (
            <div className="h-[200px] grid place-items-center text-sm" style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : peakApi.status === 'error' ? (
            <p className="text-sm py-6" style={{ color: '#DC2626' }}>Couldn't load busy times.</p>
          ) : (
            <PeakHeatmap cells={peakApi.data?.cells || []} />
          )}
        </Card>
      </section>

      {/* Recent bookings + live activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card padded={false} className="lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-base font-bold" style={{ color: '#111' }}>Recent bookings</h2>
            <button className="text-sm font-semibold" style={{ color: '#2563EB' }} onClick={() => navigate('/admin/bookings')}>View all</button>
          </div>
          {recentBookings.length === 0 ? (
            <p className="px-5 pb-6 text-sm" style={{ color: '#9CA3AF' }}>New bookings will show up here.</p>
          ) : recentBookings.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50"
              style={{ borderTop: idx === 0 ? '1px solid #F3F4F6' : 'none', borderBottom: '1px solid #F3F4F6' }}
              onClick={() => navigate(`/admin/bookings/${b.id}`)}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#111' }}>
                  {(b.customer?.user?.name && !/^guest$/i.test(b.customer.user.name) ? b.customer.user.name : null) || b.guestName || b.corporate?.companyName || 'Customer'}
                </p>
                <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                  {placeName(b.pickupAddress)} to {placeName(b.dropAddress)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <StatusBadge status={b.status} />
                <p className="text-xs mt-1" style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(b.pickupAt || b.createdAt)}</p>
              </div>
            </button>
          ))}
        </Card>

        <Card padded={false}>
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-base font-bold" style={{ color: '#111' }}>Live activity</h2>
          </div>
          <div className="max-h-[420px] overflow-y-auto" style={{ borderTop: '1px solid #F3F4F6' }}>
            {feed.length === 0 && attempts.length === 0 && (
              <p className="px-5 py-6 text-sm" style={{ color: '#9CA3AF' }}>New bookings, payments and alerts appear here as they happen.</p>
            )}
            {feed.slice(0, 30).map((item) => {
              const cfg = FEED_LABEL[item.kind] || { text: titleCase(String(item.kind || '').replace(/[:_]/g, ' ')), color: '#4B5563', bg: '#F3F4F6' };
              const detail = item.text || [
                item.bookingNumber || item.requestNumber || item.customerName || item.name,
                item.status ? titleCase(item.status) : null,
                item.reason || null,
                item.amount ? `₹${Number(item.amount).toLocaleString('en-IN')}` : null,
              ].filter(Boolean).join(', ');
              return (
                <div key={item.id} className="px-5 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.text}</span>
                    <span className="text-xs" style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(item.at)}</span>
                  </div>
                  {detail && <p className="mt-1.5 text-xs" style={{ color: '#374151' }}>{detail}</p>}
                </div>
              );
            })}
            {feed.length === 0 && attempts.map((a) => {
              const who = attemptWho(a);
              const oc = ATTEMPT_LABEL[attemptState(a).outcome] || a.outcome;
              return (
                <div key={a.id} className="px-5 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F3F4F6', color: '#4B5563' }}>{oc || 'Checkout attempt'}</span>
                    <span className="text-xs" style={{ color: '#9CA3AF' }}>{formatDateTime(a.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: '#374151' }}>
                    {who.name}{who.phone ? `, ${who.phone}` : ''}{a.pickupAddress ? `: ${placeName(a.pickupAddress)} to ${placeName(a.dropAddress)}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
