/**
 * src/pages/admin/VehicleDetail.jsx  —  /admin/vehicles/:id
 *
 * Opened by clicking a vehicle on the Vehicles page. Shows who drives it now,
 * every driver it has been assigned to (with from / to dates), every driver
 * who has taken it on a trip (count, first and last trip), and the trip list.
 *
 * Data: GET /admin/vehicles/:id/history (backend vehicleAssignment.service).
 * Regular-assignment dates are recorded from the day that endpoint was
 * deployed; trip history is complete.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Car, User, Users, Route as RouteIcon, History, Phone } from 'lucide-react';
import Breadcrumb   from '../../components/ui/Breadcrumb';
import Card         from '../../components/ui/Card';
import Badge        from '../../components/ui/Badge';
import StatusBadge  from '../../components/ui/StatusBadge';
import DataTable    from '../../components/ui/DataTable';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState   from '../../components/ui/ErrorState';
import Alert        from '../../components/ui/Alert';
import { useApi }   from '../../hooks/useApi';
import { apiClient } from '../../services/apiClient';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '../../utils/formatters';

const PAGE_SIZE = 10;

function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '—';
}

function daysBetween(from, to) {
  const ms = new Date(to || Date.now()) - new Date(from);
  const d = Math.max(0, Math.round(ms / 86400000));
  return d === 0 ? 'less than a day' : `${d} day${d === 1 ? '' : 's'}`;
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <Card padded={false} className="mb-5">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#1F2937' }}>
          <Icon size={15} /> {title}
        </h2>
        {hint && <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{hint}</p>}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tripPage, setTripPage] = useState(1);

  const api = useApi(() => apiClient.get(`/admin/vehicles/${id}/history`), [id]);
  const data = api.data || {};
  const v = data.vehicle;
  const trips = useMemo(() => data.trips || [], [data.trips]);
  const tripPages = Math.max(1, Math.ceil(trips.length / PAGE_SIZE));
  const tripRows = trips.slice((tripPage - 1) * PAGE_SIZE, tripPage * PAGE_SIZE);

  if (api.status === 'loading') return <LoadingState label="Loading vehicle…" />;
  if (api.status === 'error') return <ErrorState message={api.error?.message} onRetry={api.refetch} />;
  if (!v) return <ErrorState message="Vehicle not found" />;

  const current = data.currentDriver;
  const openDriver = (driverId) => driverId && navigate(`/admin/drivers/${driverId}`);

  const assignmentColumns = [
    { key: 'driver', header: 'Driver', render: (r) => (
      <div>
        <p style={{ fontWeight: 600, color: '#3B65DB' }}>{r.driverName || 'Unknown driver'}</p>
        {r.driverPhone && <p style={{ fontSize: 12.5, color: '#6B7280' }}>{r.driverPhone}</p>}
      </div>
    ) },
    { key: 'from', header: 'Assigned from', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.from)}</span> },
    { key: 'to', header: 'Assigned until', render: (r) => r.to
      ? <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.to)}</span>
      : <Badge tone="green">Current</Badge> },
    { key: 'duration', header: 'Duration', render: (r) => <span style={{ color: '#6B7280' }}>{daysBetween(r.from, r.to)}</span> },
    { key: 'by', header: 'Assigned by', render: (r) => <span style={{ color: '#6B7280' }}>{r.assignedBy || '—'}</span> },
  ];

  const driverColumns = [
    { key: 'driver', header: 'Driver', render: (r) => (
      <div>
        <p style={{ fontWeight: 600, color: r.driverId ? '#3B65DB' : '#9CA3AF' }}>{r.driverName}</p>
        {r.driverPhone && <p style={{ fontSize: 12.5, color: '#6B7280' }}>{r.driverPhone}</p>}
      </div>
    ) },
    { key: 'trips', header: 'Trips', render: (r) => <span style={{ fontWeight: 600 }}>{r.trips}</span> },
    { key: 'first', header: 'First trip', render: (r) => formatDate(r.firstAt) },
    { key: 'last', header: 'Last trip', render: (r) => formatDate(r.lastAt) },
  ];

  const tripColumns = [
    { key: 'booking', header: 'Booking #', render: (r) => <span className="font-mono text-xs" style={{ color: '#6B7280' }}>{r.booking?.bookingNumber || '—'}</span> },
    { key: 'driver', header: 'Driver', render: (r) => (
      <span style={{ color: r.driverName ? '#1F2937' : '#9CA3AF' }}>{r.driverName || 'No driver'}</span>
    ) },
    { key: 'route', header: 'Route', render: (r) => {
      const from = addr(r.booking?.pickupAddress); const to = addr(r.booking?.dropAddress);
      return (
        <div style={{ maxWidth: 240 }} title={`${from} → ${to}`}>
          <p style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{from.split(',')[0]}</p>
          <p style={{ fontSize: 12.5, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {to.split(',')[0]}</p>
        </div>
      );
    } },
    { key: 'pickup', header: 'Pickup', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.booking?.pickupAt)}</span> },
    { key: 'assigned', header: 'Assigned on', render: (r) => <span style={{ whiteSpace: 'nowrap', color: '#6B7280' }}>{formatDateTime(r.assignedAt)}</span> },
    { key: 'fare', header: 'Fare', render: (r) => formatCurrency(Number(r.booking?.finalFare ?? r.booking?.estimatedFare) || 0) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.booking?.status} /> },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: 'Vehicles', to: '/admin/vehicles' }, { label: v.registrationNumber }]} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="h-9 w-9 rounded-lg grid place-items-center border"
          style={{ borderColor: '#E5E7EB', backgroundColor: '#fff' }}>
          <ArrowLeft size={18} style={{ color: '#6B7280' }} />
        </button>
        <div className="h-11 w-11 rounded-xl grid place-items-center" style={{ backgroundColor: '#eef2fb' }}>
          <Car size={20} style={{ color: '#3B65DB' }} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono" style={{ color: '#1F2937' }}>{v.registrationNumber}</h1>
            <StatusBadge status={v.status} />
            {v.isTemporary && <Badge tone="purple">Temporary</Badge>}
            {v.isActive === false && <Badge tone="red">Inactive</Badge>}
          </div>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            {[titleCase(v.vehicleClass || ''), v.makeModel, v.colour, v.seatingCapacity ? `${v.seatingCapacity} seats` : null].filter(Boolean).join(' · ')}
            {v.createdAt ? ` · added ${formatDate(v.createdAt)}` : ''}
          </p>
        </div>
      </div>

      {/* Current driver */}
      <Card className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full grid place-items-center" style={{ backgroundColor: current ? '#f0fdf4' : '#fffbeb' }}>
            <User size={18} style={{ color: current ? '#15803d' : '#B45309' }} />
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: '#6B7280' }}>Current driver</p>
            {current ? (
              <p className="text-sm font-bold" style={{ color: '#1F2937' }}>
                {current.name}
                {current.isTemporary && <span className="ml-2"><Badge tone="purple">Temporary</Badge></span>}
              </p>
            ) : (
              <p className="text-sm font-bold" style={{ color: '#B45309' }}>No driver assigned</p>
            )}
            {current && (
              <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#6B7280' }}>
                {current.phone && <><Phone size={11} /> {current.phone}</>}
                {current.since && <span>{current.phone ? ' · ' : ''}since {formatDate(current.since)}</span>}
              </p>
            )}
          </div>
        </div>
        {current && (
          <button type="button" onClick={() => openDriver(current.driverId)}
            className="text-sm font-semibold" style={{ color: '#3B65DB' }}>View driver →</button>
        )}
      </Card>

      {/* Assignment history */}
      <Section icon={History} title="Assignment history"
        hint={data.historySince
          ? `Each time this vehicle was given to or taken from a driver. Recorded since ${formatDate(data.historySince)}.`
          : 'Each time this vehicle is given to or taken from a driver is recorded from now on. Trips below show who drove it before that.'}>
        <DataTable columns={assignmentColumns} rows={data.assignments || []} rowKey="from" serial={false}
          onRowClick={(r) => openDriver(r.driverId)}
          emptyTitle="No assignment changes recorded yet"
          emptyDescription="The next time this vehicle is assigned to a driver it will appear here." />
      </Section>

      {/* Drivers who drove it on trips */}
      <Section icon={Users} title="Drivers who drove it on trips" hint="Everyone who took this vehicle on a booking, with their first and last trip.">
        <DataTable columns={driverColumns} rows={data.drivers || []} rowKey="driverId" serial={false}
          onRowClick={(r) => openDriver(r.driverId)}
          emptyTitle="No trips yet" emptyDescription="This vehicle hasn't been assigned to any booking." />
      </Section>

      {/* Trips */}
      <Section icon={RouteIcon} title={`Trips (${trips.length})`} hint="Every booking this vehicle was assigned to, newest first.">
        {trips.length >= 500 && <Alert type="info" className="mb-3">Showing the latest 500 trips.</Alert>}
        <DataTable columns={tripColumns} rows={tripRows} rowKey="allocationId"
          onRowClick={(r) => r.booking?.id && navigate(`/admin/bookings/${r.booking.id}`)}
          page={tripPage} limit={PAGE_SIZE} total={trips.length} totalPages={tripPages}
          onPageChange={trips.length > PAGE_SIZE ? setTripPage : undefined}
          emptyTitle="No trips yet" emptyDescription="This vehicle hasn't been assigned to any booking." />
      </Section>
    </div>
  );
}
