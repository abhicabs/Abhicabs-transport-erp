/**
 * src/pages/admin/DriverDetail.jsx  —  /admin/drivers/:id   (id = driver userId)
 *
 * Opened by clicking a driver on the Drivers roster / performance table.
 * Shows the driver's profile, assigned vehicle, KYC documents, lifetime
 * performance and their COMPLETE trip history (see driverTripsService for how
 * the history is resolved against the backend).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, IdCard, Car, Star, CalendarCheck, CheckCircle2,
  XCircle, Navigation, IndianRupee, FileText, Image as ImageIcon, Route as RouteIcon, RefreshCw,
} from 'lucide-react';
import Breadcrumb   from '../../components/ui/Breadcrumb';
import Card         from '../../components/ui/Card';
import Badge        from '../../components/ui/Badge';
import Button       from '../../components/ui/Button';
import StatusBadge  from '../../components/ui/StatusBadge';
import DataTable    from '../../components/ui/DataTable';
import SearchInput  from '../../components/ui/SearchInput';
import Select       from '../../components/ui/Select';
import Alert        from '../../components/ui/Alert';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState   from '../../components/ui/ErrorState';
import DriverFormDrawer    from '../../components/driver/DriverFormDrawer';
import AssignVehicleDrawer from '../../components/driver/AssignVehicleDrawer';
import { useApi }   from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { apiClient } from '../../services/apiClient';
import { driverService, vehicleService, reportsService } from '../../services';
import { createDriverTripLoader } from '../../services/driverTripsService';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '../../utils/formatters';

const KYC_TONE = { PENDING: 'amber', VERIFIED: 'green', REJECTED: 'red', SUSPENDED: 'slate' };
const DOC_LABELS = {
  LICENCE: 'Driving Licence', AADHAAR: 'Aadhaar Card', PHOTO: 'Driver Photo',
  RC: 'Vehicle RC', INSURANCE: 'Insurance', PUC: 'PUC Certificate',
};
const ACTIVE_STATUSES = ['ALLOCATED', 'EN_ROUTE', 'REACHED', 'ARRIVED', 'ONGOING'];
const TRIP_STATUS_OPTIONS = [...ACTIVE_STATUSES, 'COMPLETED', 'CANCELLED'];
const PAGE_SIZE = 10;

function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '—';
}

function customerOf(b) {
  const name = b.customer?.user?.name;
  const guest = !name || name.toLowerCase().startsWith('guest');
  return {
    name:  guest ? (b.guestName || b.corporate?.companyName || 'Guest') : name,
    phone: guest ? (b.guestPhone || '') : (b.customer?.user?.phone || ''),
  };
}

function StatCard({ icon: Icon, label, value, tone = 'primary', hint }) {
  const TONES = {
    primary: { bg: '#eef2fb', color: '#3B65DB' },
    green:   { bg: '#f0fdf4', color: '#38B763' },
    amber:   { bg: '#fffbeb', color: '#F59E0B' },
    red:     { bg: '#fef2f2', color: '#DC2626' },
    purple:  { bg: '#f5f3ff', color: '#7c3aed' },
  };
  const t = TONES[tone] || TONES.primary;
  return (
    <Card className="flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: t.bg }}>
        <Icon size={20} style={{ color: t.color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="text-xs font-medium" style={{ color: '#6B7280' }}>{label}</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: '#1F2937' }}>{value}</p>
        {hint && <p className="text-[11px]" style={{ color: '#9CA3AF' }}>{hint}</p>}
      </div>
    </Card>
  );
}

function InfoList({ rows }) {
  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-xs font-medium" style={{ color: '#6B7280' }}>{label}</span>
          <span className="text-xs font-semibold text-right" style={{ color: '#1F2937', wordBreak: 'break-word' }}>{value || '—'}</span>
        </div>
      ))}
    </div>
  );
}

// ── Trip history hook ──────────────────────────────────────────────────────
function useDriverTrips(userId) {
  const [state, setState] = useState({ status: 'loading', trips: [], hasMore: false, mode: null, scanned: 0, error: null });
  const loaderRef = useRef(null);
  const runId = useRef(0);

  const loadMore = useCallback(async (reset = false) => {
    const id = reset ? ++runId.current : runId.current;
    if (reset) {
      loaderRef.current = createDriverTripLoader(userId);
      setState({ status: 'loading', trips: [], hasMore: false, mode: null, scanned: 0, error: null });
    } else {
      setState((s) => ({ ...s, status: 'loadingMore' }));
    }
    const isCancelled = () => id !== runId.current;
    try {
      const res = await loaderRef.current.next({
        isCancelled,
        onProgress: ({ scanned }) => { if (!isCancelled()) setState((s) => ({ ...s, scanned })); },
      });
      if (isCancelled()) return;
      setState((s) => {
        const seen = new Set(s.trips.map((t) => t.id));
        const merged = [...s.trips, ...res.trips.filter((t) => !seen.has(t.id))];
        merged.sort((a, b) => new Date(b.pickupAt || b.createdAt) - new Date(a.pickupAt || a.createdAt));
        return { status: 'success', trips: merged, hasMore: res.hasMore, mode: res.mode, scanned: res.scanned, error: null };
      });
    } catch (error) {
      if (!isCancelled()) setState((s) => ({ ...s, status: 'error', error }));
    }
  }, [userId]);

  useEffect(() => { loadMore(true); return () => { runId.current += 1; }; }, [loadMore]);

  return { ...state, loadMore: () => loadMore(false), reload: () => loadMore(true) };
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function DriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [editOpen,   setEditOpen]   = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [viewDoc,    setViewDoc]    = useState(null);

  const driverApi = useApi(async () => {
    const data = await apiClient.get(`/admin/drivers/${id}`);
    return data?.driver || data;
  }, [id]);
  const d = driverApi.data;

  // Resolve the assigned vehicle's details from the fleet when the driver
  // record only carries assignedVehicleId (same approach as the roster).
  const vehicleApi = useApi(async () => {
    if (!d?.assignedVehicleId || d?.assignedVehicle?.registrationNumber) return d?.assignedVehicle || null;
    try { return await vehicleService.get(d.assignedVehicleId); }
    catch { return null; }
  }, [d?.assignedVehicleId, d?.assignedVehicle?.registrationNumber]);
  const vehicle = d?.assignedVehicle?.registrationNumber ? d.assignedVehicle : vehicleApi.data;

  // Lifetime performance (offers / acceptance / earnings) from the report endpoint.
  const perfApi = useApi(async () => {
    if (!d) return null;
    const from = d.createdAt ? new Date(d.createdAt).toISOString() : new Date(Date.now() - 365 * 86400000).toISOString();
    const res = await reportsService.driverPerformance({ from, to: new Date().toISOString() });
    const list = res?.drivers || (Array.isArray(res) ? res : []);
    return list.find((r) => r.driverId === id || r.userId === id) || null;
  }, [d?.userId, d?.createdAt]);
  const perf = perfApi.data;

  const trips = useDriverTrips(id);

  // ── Trip filters (client-side over the loaded history) ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.trips.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (!q) return true;
      const c = customerOf(t);
      return [t.bookingNumber, c.name, c.phone, addr(t.pickupAddress), addr(t.dropAddress)]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [trips.trips, search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / PAGE_SIZE));
  const pageRows = filteredTrips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const all = trips.trips;
    const completed = all.filter((t) => t.status === 'COMPLETED');
    return {
      total:     all.length,
      completed: completed.length,
      cancelled: all.filter((t) => t.status === 'CANCELLED').length,
      active:    all.filter((t) => ACTIVE_STATUSES.includes(t.status)),
      value:     completed.reduce((s, t) => s + Number(t.finalFare ?? t.estimatedFare ?? 0), 0),
      lastTrip:  completed[0]?.pickupAt || null,
    };
  }, [trips.trips]);

  if (driverApi.status === 'loading') return <LoadingState label="Loading driver…" />;
  if (driverApi.status === 'error')   return <ErrorState message={driverApi.error?.message} onRetry={driverApi.refetch} />;
  if (!d) return <ErrorState message="Driver not found" />;

  const isTemp = d.driverType === 'TEMPORARY';
  const name = d.user?.name || d.name || 'Driver';
  const documents = Object.entries(d.documents || {}).filter(([k, v]) => !k.startsWith('__') && v?.url);
  const statsLoading = trips.status === 'loading';
  const historyComplete = !trips.hasMore;

  const handleEdit = async (values) => {
    await driverService.update(d.userId || id, values);
    toast.success('Driver updated');
    driverApi.refetch();
  };
  const handleAssign = async (spec) => {
    await driverService.assignVehicle(d.userId || id, spec);
    toast.success('Vehicle assigned');
    driverApi.refetch();
  };

  const columns = [
    { key: 'bookingNumber', header: 'Booking #',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.bookingNumber || '—'}</span> },
    { key: 'customer', header: 'Customer',
      render: (r) => { const c = customerOf(r); return (
        <div>
          <p style={{ fontWeight: 600, color: '#1F2937', fontSize: 13 }}>{c.name}</p>
          <p style={{ fontSize: 12.5, color: '#9CA3AF' }}>{c.phone}</p>
        </div>
      ); } },
    { key: 'route', header: 'Route',
      render: (r) => { const from = addr(r.pickupAddress); const to = addr(r.dropAddress); return (
        <div style={{ maxWidth: 240 }} title={`${from} → ${to}`}>
          <p style={{ color: '#1F2937', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{from.split(',')[0]}</p>
          <p style={{ color: '#6B7280', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {to.split(',')[0]}</p>
        </div>
      ); } },
    { key: 'tripType', header: 'Type',
      render: (r) => <span style={{ fontSize: 13 }}>{r.tripType?.replace(/_/g, ' ') || '—'}</span> },
    { key: 'vehicle', header: 'Vehicle',
      render: (r) => (
        <div>
          {(r._allocatedVehicle || r.allocations?.[0]?.vehicle)?.registrationNumber && <p style={{ fontSize: 13, color: '#1F2937' }}>{(r._allocatedVehicle || r.allocations[0].vehicle).registrationNumber}</p>}
          <p style={{ fontSize: 12.5, color: '#6B7280' }}>{titleCase(r.vehicleClass || '—')}</p>
        </div>
      ) },
    { key: 'pickupAt', header: 'Pickup', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.pickupAt)}</span> },
    { key: 'fare', header: 'Fare', render: (r) => formatCurrency(Number(r.finalFare ?? r.estimatedFare) || 0) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: 'Drivers', to: '/admin/drivers' }, { label: name }]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} aria-label="Back"
            className="h-9 w-9 rounded-lg grid place-items-center border"
            style={{ borderColor: '#E5E7EB', backgroundColor: '#fff' }}>
            <ArrowLeft size={18} style={{ color: '#6B7280' }} />
          </button>
          {d.documents?.PHOTO?.url && (
            <img src={d.documents.PHOTO.url} alt={name}
              className="h-12 w-12 rounded-full object-cover border" style={{ borderColor: '#E5E7EB' }} />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: '#1F2937' }}>{name}</h1>
              {isTemp ? <Badge tone="purple">Temporary</Badge> : <Badge tone="slate">Regular</Badge>}
              <Badge tone={KYC_TONE[d.kycStatus] || 'slate'}>KYC {titleCase(d.kycStatus || '—')}</Badge>
              {d.user?.isActive === false && <Badge tone="red">Deactivated</Badge>}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: d.isOnline ? '#38B763' : '#9CA3AF' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.isOnline ? '#38B763' : '#D1D5DB' }} />
                {d.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {d.user?.phone && <span className="flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}><Phone size={13} />{d.user.phone}</span>}
              {d.user?.email && <span className="flex items-center gap-1 text-sm" style={{ color: '#6B7280' }}><Mail size={13} />{d.user.email}</span>}
              {d.licenceNumber && <span className="flex items-center gap-1 text-sm font-mono" style={{ color: '#6B7280' }}><IdCard size={13} />{d.licenceNumber}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={vehicle || d.assignedVehicleId ? 'secondary' : 'primary'} icon={Car} onClick={() => setAssignOpen(true)}>
            {vehicle || d.assignedVehicleId ? 'Change Vehicle' : 'Assign Vehicle'}
          </Button>
          {!isTemp && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit driver</Button>}
        </div>
      </div>

      {/* Active trip banner */}
      {stats.active.length > 0 && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3 cursor-pointer flex-wrap"
          style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}
          onClick={() => navigate(`/admin/bookings/${stats.active[0].id}`)}>
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1d4ed8' }}>
            <Navigation size={15} /> Currently on trip {stats.active[0].bookingNumber} — {addr(stats.active[0].pickupAddress).split(',')[0]} → {addr(stats.active[0].dropAddress).split(',')[0]}
          </span>
          <StatusBadge status={stats.active[0].status} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard icon={CalendarCheck} label="Total Trips" tone="primary"
          value={statsLoading ? '…' : `${stats.total}${historyComplete ? '' : '+'}`} />
        <StatCard icon={CheckCircle2} label="Completed" tone="green" value={statsLoading ? '…' : stats.completed}
          hint={stats.lastTrip ? `Last: ${formatDate(stats.lastTrip)}` : undefined} />
        <StatCard icon={XCircle} label="Cancelled" tone="red" value={statsLoading ? '…' : stats.cancelled} />
        <StatCard icon={IndianRupee} label="Completed Trip Value" tone="purple" value={statsLoading ? '…' : formatCurrency(stats.value)} />
        <StatCard icon={Star} label="Rating" tone="amber"
          value={d.ratingCount > 0 ? `★ ${Number(d.ratingAvg ?? 0).toFixed(1)}` : '—'}
          hint={d.ratingCount > 0 ? `${d.ratingCount} rating${d.ratingCount > 1 ? 's' : ''}` : 'No ratings yet'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Profile */}
        <Card>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#1F2937' }}>Profile</h2>
          <InfoList rows={[
            ['Name', name],
            ['Phone', d.user?.phone],
            ['Email', d.user?.email],
            ['Driver type', isTemp ? 'Temporary' : 'Regular'],
            ['Licence no.', d.licenceNumber],
            ['Licence expiry', d.licenceExpiry ? formatDate(d.licenceExpiry) : null],
            ['KYC status', titleCase(d.kycStatus || '')],
            ['KYC submitted', d.submittedAt ? formatDateTime(d.submittedAt) : null],
            ['Joined', formatDate(d.createdAt)],
            ['Last seen', d.lastPingAt ? formatDateTime(d.lastPingAt) : null],
            ['Account', d.user?.isActive === false ? 'Deactivated' : 'Active'],
          ]} />
        </Card>

        {/* Vehicle + performance */}
        <Card>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#1F2937' }}>Assigned Vehicle</h2>
          {vehicle || d.assignedVehicleId ? (
            <InfoList rows={[
              ['Registration', vehicle?.registrationNumber || (vehicleApi.status === 'loading' ? 'Loading…' : 'Assigned')],
              ['Class', vehicle?.vehicleClass ? titleCase(vehicle.vehicleClass) : null],
              ['Make / model', vehicle?.makeModel],
              ['Status', vehicle?.status ? titleCase(vehicle.status) : null],
            ]} />
          ) : (
            <p className="text-sm" style={{ color: '#D97706', fontWeight: 600 }}>No vehicle assigned</p>
          )}

          <h2 className="text-sm font-bold mt-6 mb-4" style={{ color: '#1F2937' }}>Lifetime Performance</h2>
          {perfApi.status === 'loading' ? (
            <p className="text-xs" style={{ color: '#9CA3AF' }}>Loading…</p>
          ) : perf ? (
            <InfoList rows={[
              ['Offers received', String(perf.offersReceived ?? perf.offers ?? 0)],
              ['Acceptance rate', `${Math.round(Number(perf.acceptanceRate ?? 0) * 100)}%`],
              ['Completed trips', String(perf.completedTrips ?? 0)],
              ['Earnings', formatCurrency(perf.earnings ?? 0)],
            ]} />
          ) : (
            <p className="text-xs" style={{ color: '#9CA3AF' }}>No performance data reported for this driver.</p>
          )}
        </Card>

        {/* Documents */}
        <Card>
          <h2 className="text-sm font-bold mb-4" style={{ color: '#1F2937' }}>Documents</h2>
          {documents.length === 0 ? (
            <div className="text-center py-6">
              <FileText size={32} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
              <p className="text-xs" style={{ color: '#9CA3AF' }}>No documents uploaded</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {documents.map(([type, doc]) => (
                <button key={type} type="button" onClick={() => setViewDoc({ type, doc })}
                  className="rounded-lg overflow-hidden border text-left" style={{ borderColor: '#E5E7EB' }}>
                  <div style={{ height: 72, backgroundColor: '#F9FAFB' }}>
                    {doc.url
                      ? <img src={doc.url} alt={type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div className="h-full grid place-items-center"><ImageIcon size={22} style={{ color: '#D1D5DB' }} /></div>}
                  </div>
                  <p className="px-2 py-1.5 text-[11.5px] font-semibold" style={{ color: '#1F2937' }}>{DOC_LABELS[type] || titleCase(type)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Trip history */}
      <Card padded={false}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#1F2937' }}>
              <RouteIcon size={15} /> Trip History
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
              {trips.status === 'loading'
                ? (trips.scanned ? `Searching bookings… ${trips.scanned} checked` : 'Loading trips…')
                : `${filteredTrips.length} of ${trips.trips.length} trip${trips.trips.length === 1 ? '' : 's'} shown`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput value={search} onChange={setSearch} placeholder="Booking #, customer, place…" style={{ minWidth: 240 }} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="All statuses"
              searchable={false}
              options={[{ value: '', label: 'All statuses' }, ...TRIP_STATUS_OPTIONS.map((s) => ({ value: s, label: titleCase(s.replace(/_/g, ' ')) }))]} />
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={trips.reload}>Refresh</Button>
          </div>
        </div>

        {trips.mode === 'scan' && trips.hasMore && trips.status !== 'loading' && (
          <div className="px-5 pb-3">
            <Alert type="info">
              Showing trips from the most recent {trips.scanned} bookings. Use “Load older trips” below to search further back.
            </Alert>
          </div>
        )}

        <div className="px-5 pb-5">
          <DataTable
            columns={columns}
            rows={pageRows}
            status={trips.status === 'loading' ? 'loading' : trips.status === 'error' ? 'error' : 'success'}
            error={trips.error}
            onRetry={trips.reload}
            onRowClick={(r) => navigate(`/admin/bookings/${r.id}`)}
            page={page}
            limit={PAGE_SIZE}
            total={filteredTrips.length}
            totalPages={totalPages}
            onPageChange={filteredTrips.length > PAGE_SIZE ? setPage : undefined}
            emptyTitle={trips.trips.length ? 'No trips match your filters' : 'No trips yet'}
            emptyDescription={trips.trips.length ? 'Try a different search or status.' : 'This driver has not been assigned any trips.'}
          />
          {trips.hasMore && trips.status !== 'loading' && (
            <div className="flex justify-center mt-4">
              <Button variant="secondary" loading={trips.status === 'loadingMore'} onClick={trips.loadMore}>
                {trips.status === 'loadingMore' ? `Searching… ${trips.scanned} checked` : 'Load older trips'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Document viewer */}
      {viewDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setViewDoc(null)}>
          <div style={{ maxWidth: 800, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ color: '#fff', fontWeight: 600, marginBottom: 12 }}>{DOC_LABELS[viewDoc.type] || titleCase(viewDoc.type)}</p>
            <img src={viewDoc.doc.url} alt={viewDoc.type} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' }} />
            <div className="mt-3"><Button variant="secondary" onClick={() => setViewDoc(null)}>Close</Button></div>
          </div>
        </div>
      )}

      <DriverFormDrawer open={editOpen} onClose={() => setEditOpen(false)} initial={d} onSubmit={handleEdit} />
      <AssignVehicleDrawer open={assignOpen} onClose={() => setAssignOpen(false)} onSubmit={handleAssign} driver={d} />
    </div>
  );
}
