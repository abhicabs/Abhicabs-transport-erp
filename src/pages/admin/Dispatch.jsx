/**
 * src/pages/admin/Dispatch.jsx
 *
 * FIX: board.data?.vehicles?.vehicles was always [] because the backend's
 * dispatch.service.board() returns:
 *   { pending: { count, bookings }, live: { count, trips }, vehicles: { count, available } }
 * The key is `available`, not `vehicles`. Changed line:
 *   board.data?.vehicles?.vehicles  →  board.data?.vehicles?.available
 */
import { useState, useCallback, useEffect } from 'react';
import { Truck, Radio, AlertCircle, User, RefreshCw, UserPlus, ChevronDown } from 'lucide-react';
import PageHeader   from '../../components/ui/PageHeader';
import Card         from '../../components/ui/Card';
import Select       from '../../components/ui/Select';
import Input        from '../../components/ui/Input';
import FormField    from '../../components/ui/FormField';
import Button       from '../../components/ui/Button';
import StatusBadge  from '../../components/ui/StatusBadge';
import EmptyState   from '../../components/ui/EmptyState';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState   from '../../components/ui/ErrorState';
import Badge        from '../../components/ui/Badge';
import { useApi }   from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { apiClient } from '../../services/apiClient';
import { dispatchService } from '../../services/dispatchService';
import { bookingOpsService } from '../../services/bookingOpsService';
import { formatCurrency, formatDateTime, titleCase } from '../../utils/formatters';

function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || '—';
}

export default function Dispatch() {
  const toast = useToast();
  const { lastBookingEventId } = useAdminRealtimeContext();

  const [assignments, setAssignments] = useState({});
  const [assigning,   setAssigning]   = useState({});
  const [suggestions, setSuggestions] = useState({}); // bookingId -> { loading, items, error }

  // Manual entry mode — per-booking toggle between dropdown & free-text
  const [manualMode, setManualMode] = useState({});
  const [manualData, setManualData] = useState({});
  const [addingTemp, setAddingTemp] = useState({});

  const setManualField = (bookingId, key, value) =>
    setManualData((p) => ({ ...p, [bookingId]: { ...p[bookingId], [key]: value } }));

  const toggleManual = (bookingId) => {
    setManualMode((p) => ({ ...p, [bookingId]: !p[bookingId] }));
  };

  const board = useApi(() => apiClient.get('/admin/dispatch/board'), []);

  const driversApi = useApi(
    () => apiClient.get('/admin/drivers', {
      params: { kycStatus: 'VERIFIED', limit: 100, page: 1 },
    }),
    []
  );

  useEffect(() => {
    if (!lastBookingEventId) return;
    board.refetch();
  }, [lastBookingEventId]);

  const pendingBookings = board.data?.pending?.bookings || [];
  const liveTrips       = board.data?.live?.trips || [];

  // FIXED: backend returns `available`, not `vehicles`, inside the vehicles object
  // dispatch.service.board() → { vehicles: { count, available: [...] } }
  const availableVehicles = board.data?.vehicles?.available || [];

  const allDrivers    = driversApi.data?.items ?? driversApi.data?.data ?? [];
  const sortedDrivers = [...allDrivers].sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return 0;
  });

  const assignedVehicleIds = new Set(
    Object.values(assignments).filter((a) => a.done).map((a) => a.vehicleId)
  );
  const assignedDriverIds = new Set(
    Object.values(assignments).filter((a) => a.done && a.driverId).map((a) => a.driverId)
  );

  // Create a temporary driver + vehicle via backend, then auto-assign
  const addAndAssign = useCallback(async (bookingId) => {
    const m = manualData[bookingId] || {};
    if (!m.driverName?.trim()) { toast.error('Enter driver name'); return; }
    if (!m.mobile?.trim()) { toast.error('Enter mobile number'); return; }
    if (!m.vehicleNumber?.trim()) { toast.error('Enter vehicle number'); return; }

    const booking = pendingBookings.find((b) => b.id === bookingId);
    const vehicleClass = m.vehicleClass?.trim() || booking?.vehicleClass || 'sedan';

    setAddingTemp((p) => ({ ...p, [bookingId]: true }));
    try {
      const res = await apiClient.post('/admin/temporary-drivers', {
        name: m.driverName.trim(),
        mobile: m.mobile.trim(),
        vehicleNumber: m.vehicleNumber.trim(),
        vehicleClass,
      });
      const tempDriver = res?.data?.driver || res?.driver || res?.data || {};
      const vehicleId = tempDriver.vehicle?.id;
      const driverId = tempDriver.userId;

      if (!vehicleId) throw new Error('Temporary driver created but no vehicle ID returned');

      await apiClient.post(`/admin/dispatch/bookings/${bookingId}/assign`, {
        vehicleId,
        ...(driverId ? { driverId } : {}),
      });

      setAssignments((p) => ({ ...p, [bookingId]: { vehicleId, driverId, done: true } }));
      toast.success(`${m.driverName.trim()} (${m.vehicleNumber.trim()}) added and assigned`);
      setTimeout(() => { board.refetch(); driversApi.refetch(); }, 800);
    } catch (e) {
      toast.error(e.message || 'Failed to add driver');
    } finally {
      setAddingTemp((p) => ({ ...p, [bookingId]: false }));
    }
  }, [manualData, pendingBookings, toast, board, driversApi]);

  function vehiclesForBooking(booking) {
    return availableVehicles.filter((v) => {
      if (assignedVehicleIds.has(v.id)) return false;
      if (booking.vehicleClass && v.vehicleClass !== booking.vehicleClass) return false;
      return true;
    });
  }

  function driversForBooking() {
    return sortedDrivers.filter((d) => !assignedDriverIds.has(d.userId));
  }

  const setField = (bookingId, key, value) =>
    setAssignments((p) => ({ ...p, [bookingId]: { ...p[bookingId], [key]: value } }));

  const assign = useCallback(async (bookingId) => {
    const a = assignments[bookingId];
    if (!a?.vehicleId) { toast.error('Select a vehicle before assigning.'); return; }
    setAssigning((p) => ({ ...p, [bookingId]: true }));
    try {
      await apiClient.post(`/admin/dispatch/bookings/${bookingId}/assign`, {
        vehicleId: a.vehicleId,
        ...(a.driverId ? { driverId: a.driverId } : {}),
      });
      setAssignments((p) => ({ ...p, [bookingId]: { ...p[bookingId], done: true } }));
      const vehicle = availableVehicles.find((v) => v.id === a.vehicleId);
      const driver  = sortedDrivers.find((d) => d.userId === a.driverId);
      toast.success(
        `${vehicle?.registrationNumber || 'Vehicle'} assigned` +
        (driver ? ` to ${driver.user?.name}` : '')
      );
      setTimeout(() => board.refetch(), 800);
    } catch (e) {
      toast.error(e.message || 'Assignment failed');
    } finally {
      setAssigning((p) => ({ ...p, [bookingId]: false }));
    }
  }, [assignments, availableVehicles, sortedDrivers, toast, board]);

  const reassign = useCallback(async (bookingId) => {
    const a = assignments[`reassign-${bookingId}`];
    if (!a?.vehicleId && !a?.driverId) {
      toast.error('Select a new vehicle or driver to reassign.');
      return;
    }
    setAssigning((p) => ({ ...p, [`reassign-${bookingId}`]: true }));
    try {
      // The backend's reassign requires a vehicleId (assignSchema). When the
      // dispatcher is only swapping the DRIVER, reuse the booking's current
      // vehicle so the request validates instead of failing with a 400.
      let vehicleId = a.vehicleId || null;
      if (!vehicleId) {
        const alloc = await dispatchService.allocation(bookingId);
        vehicleId = alloc?.allocation?.vehicleId ?? alloc?.vehicleId ?? null;
        if (!vehicleId) {
          toast.error('Select a vehicle to reassign.');
          setAssigning((p) => ({ ...p, [`reassign-${bookingId}`]: false }));
          return;
        }
      }
      await apiClient.patch(`/admin/dispatch/bookings/${bookingId}/reassign`, {
        vehicleId,
        ...(a.driverId  ? { driverId:  a.driverId  } : {}),
      });
      setAssignments((p) => ({ ...p, [`reassign-${bookingId}`]: { ...p[`reassign-${bookingId}`], done: true } }));
      toast.success('Booking reassigned successfully');
      setTimeout(() => board.refetch(), 800);
    } catch (e) {
      toast.error(e.message || 'Reassignment failed');
    } finally {
      setAssigning((p) => ({ ...p, [`reassign-${bookingId}`]: false }));
    }
  }, [assignments, toast, board]);

  // Read-only suggestions — nearest available, matching-class vehicle+driver.
  // Built entirely from existing endpoints (no backend change):
  //   1. availableVehicles + sortedDrivers — already loaded on this page
  //   2. GET /admin/bookings/:id            — pickupLat/pickupLng
  //   3. GET /admin/location/nearby         — live driver distances (Redis GEO)
  // This NEVER assigns anything by itself; it only fills the Vehicle/Driver
  // selects below so the Admin can review and confirm with the Assign button.
  // There is deliberately no auto-assign action anywhere in this screen.
  const suggestDrivers = useCallback(async (bookingId) => {
    setSuggestions((p) => ({ ...p, [bookingId]: { loading: true, items: [], error: null } }));
    try {
      const booking = pendingBookings.find((b) => b.id === bookingId);
      const candidateVehicles = booking ? vehiclesForBooking(booking) : [];

      // Vehicle -> assigned driver, from the drivers list already fetched
      // for this page (GET /admin/drivers).
      const driverByVehicleId = new Map(
        sortedDrivers
          .filter((d) => d.assignedVehicleId)
          .map((d) => [d.assignedVehicleId, d])
      );

      // Distance ranking is best-effort: needs pickup coordinates and a live
      // Redis GEO position for the driver. Either can legitimately be
      // missing (no ping yet, Redis down) — that just means "distance
      // unknown", never a reason to fail the whole suggestion list.
      let distanceByDriverId = new Map();
      try {
        const detail = await bookingOpsService.getOne(bookingId);
        const bk = detail?.data?.booking || detail?.booking || detail?.data || null;
        const lat = bk?.pickupLat, lng = bk?.pickupLng;
        if (lat != null && lng != null) {
          const nearby = await dispatchService.nearbyDrivers(Number(lat), Number(lng), { radiusKm: 25, limit: 50 });
          const list = nearby?.data?.drivers || nearby?.drivers || [];
          distanceByDriverId = new Map(list.map((d) => [d.driverId, d.distanceKm]));
        }
      } catch (_) {
        // Live location unavailable — suggestions still work, just unranked.
      }

      const items = candidateVehicles.map((v) => {
        const driver = driverByVehicleId.get(v.id) || null;
        const distanceKm = driver ? distanceByDriverId.get(driver.userId) : undefined;
        return {
          vehicleId: v.id,
          vehicleType: v.vehicleClass,
          registrationNumber: v.registrationNumber,
          driverId: driver?.userId || null,
          driverName: driver?.user?.name || null,
          distanceKm: typeof distanceKm === 'number' ? Number(distanceKm.toFixed(2)) : null,
          locationUnavailable: !!driver && typeof distanceKm !== 'number',
          recommended: false,
        };
      });

      items.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
      if (items.length && items[0].distanceKm != null) items[0].recommended = true;

      setSuggestions((p) => ({ ...p, [bookingId]: { loading: false, items, error: null } }));
      if (items.length === 0) toast.error('No available vehicle matches this booking\'s class right now.');
    } catch (e) {
      setSuggestions((p) => ({ ...p, [bookingId]: { loading: false, items: [], error: e.message || 'Could not load suggestions' } }));
      toast.error(e.message || 'Could not load driver suggestions');
    }
  }, [pendingBookings, sortedDrivers, toast]);

  // Selecting a suggestion only fills the form fields — it is still the
  // Admin who has to press "Assign" to actually commit it.
  const applySuggestion = useCallback((bookingId, s) => {
    setField(bookingId, 'vehicleId', s.vehicleId);
    if (s.driverId) setField(bookingId, 'driverId', s.driverId);
  }, []);

  if (board.status === 'loading') return <LoadingState label="Loading dispatch board…" />;
  if (board.status === 'error')   return <ErrorState message={board.error?.message} onRetry={board.refetch} />;

  return (
    <div>
      <PageHeader
        title="Dispatch Board"
        description="Assign vehicles and drivers to bookings — select from fleet or enter a temporary driver manually."
        actions={
          <div className="flex items-center gap-3">
            {availableVehicles.length > 0 && (
              <Badge tone="green">{availableVehicles.length} vehicle{availableVehicles.length > 1 ? 's' : ''} available</Badge>
            )}
            {liveTrips.length > 0 && (
              <Badge tone="blue">{liveTrips.length} live trip{liveTrips.length > 1 ? 's' : ''}</Badge>
            )}
            <button onClick={() => { board.refetch(); driversApi.refetch(); }}
              className="text-xs font-medium flex items-center gap-1" style={{ color: '#3B65DB' }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        }
      />

      {availableVehicles.length === 0 && pendingBookings.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-4"
          style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <AlertCircle size={16} style={{ color: '#92400E', marginTop: 1, flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>No vehicles currently available</p>
            <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
              All vehicles are on trips or inactive. Reassign a live trip's vehicle below once one frees up.
            </p>
          </div>
        </div>
      )}

      {pendingBookings.length === 0 && liveTrips.length === 0 ? (
        <Card>
          <EmptyState icon={Radio} title="Dispatch queue is clear"
            description="No pending bookings need assignment right now." />
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingBookings.map((b) => {
            const a               = assignments[b.id] || {};
            const matchingVehicles = vehiclesForBooking(b);
            const availableDrivers = driversForBooking();
            const isDone          = a.done;

            return (
              <Card key={b.id}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: '#1F2937' }}>
                          {b.customer?.user?.name || 'Unknown customer'}
                        </p>
                        <StatusBadge status={isDone ? 'ALLOCATED' : b.status} />
                        <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>{b.bookingNumber}</span>
                      </div>
                      <p className="text-sm" style={{ color: '#6B7280' }}>
                        {addr(b.pickupAddress)} → {addr(b.dropAddress)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: '#6B7280' }}>
                        <span>{titleCase(b.vehicleClass || '—')}</span>
                        <span style={{ color: '#D1D5DB' }}>·</span>
                        <span>{b.tripType?.replace('_', ' ')}</span>
                        <span style={{ color: '#D1D5DB' }}>·</span>
                        <span className="font-semibold" style={{ color: '#1F2937' }}>{formatCurrency(b.estimatedFare)}</span>
                        <span style={{ color: '#D1D5DB' }}>·</span>
                        <span>{formatDateTime(b.pickupAt)}</span>
                        {b.customer?.user?.phone && (
                          <><span style={{ color: '#D1D5DB' }}>·</span><span>{b.customer.user.phone}</span></>
                        )}
                      </div>
                    </div>
                  </div>

                  {isDone ? (
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                      style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <Truck size={15} style={{ color: '#16a34a' }} />
                      <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>Assigned successfully</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {suggestions[b.id]?.items?.length > 0 && (
                        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: '#F5F7FF', border: '1px solid #DCE3FB' }}>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: '#3B65DB' }}>Suggested drivers</p>
                          <div className="flex flex-col gap-1">
                            {suggestions[b.id].items.map((s) => (
                              <button
                                key={s.vehicleId}
                                type="button"
                                onClick={() => applySuggestion(b.id, s)}
                                className="flex items-center justify-between gap-2 text-xs rounded-md px-2 py-1.5 text-left"
                                style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="font-medium" style={{ color: '#1F2937' }}>
                                    {s.driverName || 'Vehicle only (no driver assigned)'}
                                  </span>
                                  <span style={{ color: '#9CA3AF' }}>{s.registrationNumber} · {titleCase(s.vehicleType || '')}</span>
                                </span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <span style={{ color: '#6B7280' }}>
                                    {s.distanceKm != null ? `${s.distanceKm} KM away` : 'Location unavailable'}
                                  </span>
                                  {s.recommended && <Badge tone="green">Recommended</Badge>}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] mt-1.5" style={{ color: '#6B7280' }}>
                            These are suggestions only — nothing is assigned until you select one below and click Assign.
                          </p>
                        </div>
                      )}
                      {/* ── Mode toggle ── */}
                      <div className="flex items-center gap-2 mb-1">
                        <button type="button" onClick={() => toggleManual(b.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold"
                          style={{
                            padding: '4px 10px', borderRadius: 8, border: '1px solid #E5E7EB', cursor: 'pointer',
                            backgroundColor: manualMode[b.id] ? '#EFF6FF' : '#F9FAFB',
                            color: manualMode[b.id] ? '#1D4ED8' : '#6B7280',
                          }}>
                          {manualMode[b.id]
                            ? <><ChevronDown size={12} /> Select from fleet</>
                            : <><UserPlus size={12} /> Enter driver manually</>}
                        </button>
                        {manualMode[b.id] && <Badge tone="blue">Temporary hire</Badge>}
                      </div>

                      {manualMode[b.id] ? (
                        /* ── Manual entry mode ── */
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <FormField label="Driver name" required style={{ margin: 0 }}>
                              <Input value={manualData[b.id]?.driverName || ''}
                                onChange={(e) => setManualField(b.id, 'driverName', e.target.value)}
                                placeholder="Ramesh Kumar" />
                            </FormField>
                            <FormField label="Mobile number" required style={{ margin: 0 }}>
                              <Input value={manualData[b.id]?.mobile || ''}
                                onChange={(e) => setManualField(b.id, 'mobile', e.target.value)}
                                placeholder="9876543210" />
                            </FormField>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <FormField label="Vehicle number" required style={{ margin: 0 }}>
                              <Input value={manualData[b.id]?.vehicleNumber || ''}
                                onChange={(e) => setManualField(b.id, 'vehicleNumber', e.target.value)}
                                placeholder="KA 01 AB 1234" />
                            </FormField>
                            <FormField label="Vehicle class" style={{ margin: 0 }}
                              hint={b.vehicleClass ? `Booking: ${titleCase(b.vehicleClass)}` : ''}>
                              <Input value={manualData[b.id]?.vehicleClass || ''}
                                onChange={(e) => setManualField(b.id, 'vehicleClass', e.target.value)}
                                placeholder={b.vehicleClass || 'sedan'} />
                            </FormField>
                          </div>
                          <div className="flex justify-end">
                            <Button size="sm" icon={UserPlus} loading={addingTemp[b.id]}
                              onClick={() => addAndAssign(b.id)}>
                              Add Driver & Assign
                            </Button>
                          </div>
                        </>
                      ) : (
                        /* ── Dropdown selection mode ── */
                        <>
                          <div className="flex gap-2 items-center">
                            <Truck size={15} style={{ color: '#6B7280', flexShrink: 0 }} />
                            {matchingVehicles.length === 0 ? (
                              <div className="flex-1 rounded-lg px-3 py-2 text-xs"
                                style={{ backgroundColor: '#FEF9C3', border: '1px solid #FDE047', color: '#854D0E' }}>
                                {availableVehicles.length === 0
                                  ? 'No vehicles available'
                                  : `No ${titleCase(b.vehicleClass || '')} available — ${availableVehicles.length} other class${availableVehicles.length > 1 ? 'es' : ''} free`}
                              </div>
                            ) : (
                              <Select
                                value={a.vehicleId || ''}
                                placeholder={`Vehicle — ${matchingVehicles.length} ${titleCase(b.vehicleClass || '')} available`}
                                onChange={(e) => setField(b.id, 'vehicleId', e.target.value)}
                                options={matchingVehicles.map((v) => ({
                                  value: v.id,
                                  label: `${v.registrationNumber} · ${v.makeModel} · ${v.seatingCapacity} seats`,
                                }))}
                              />
                            )}
                          </div>

                          <div className="flex gap-2 items-center">
                            <User size={15} style={{ color: '#6B7280', flexShrink: 0 }} />
                            <Select
                              value={a.driverId || ''}
                              placeholder={
                                availableDrivers.length === 0
                                  ? 'No verified drivers available'
                                  : `Driver (optional) — ${availableDrivers.filter((d) => d.isOnline).length} online · ${availableDrivers.filter((d) => !d.isOnline).length} offline`
                              }
                              onChange={(e) => setField(b.id, 'driverId', e.target.value || undefined)}
                              options={[
                                { value: '', label: 'No driver (assign vehicle only)' },
                                ...availableDrivers.map((d) => ({
                                  value: d.userId,
                                  label: `${d.user?.name}${d.isOnline ? ' 🟢 Online' : ' ⚪ Offline'} · ${d.user?.phone || ''}`,
                                })),
                              ]}
                            />
                          </div>

                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="secondary"
                              loading={suggestions[b.id]?.loading}
                              onClick={() => suggestDrivers(b.id)}>
                              Suggest drivers
                            </Button>
                            <Button size="sm"
                              disabled={!a.vehicleId}
                              loading={assigning[b.id]}
                              onClick={() => assign(b.id)}>
                              Assign
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          {liveTrips.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-4 mb-2">
                <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                <span className="text-xs font-semibold" style={{ color: '#6B7280' }}>
                  LIVE TRIPS — REASSIGN IF NEEDED
                </span>
                <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              </div>

              {liveTrips.map((t) => {
                const aKey         = `reassign-${t.id}`;
                const a            = assignments[aKey] || {};
                const isDone       = a.done;
                const currentAlloc = t.allocations?.[0];
                const currentDriver  = currentAlloc?.driver?.user;
                const currentVehicle = currentAlloc?.vehicle;
                const matchingVehicles = vehiclesForBooking(t);
                const availableDrivers = driversForBooking().filter(
                  (d) => d.userId !== currentAlloc?.driverId
                );

                return (
                  <Card key={t.id} style={{ borderLeft: '3px solid #3B65DB' }}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-sm" style={{ color: '#1F2937' }}>
                            {t.customer?.user?.name || 'Unknown customer'}
                          </p>
                          <StatusBadge status={t.status} />
                          <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>{t.bookingNumber}</span>
                        </div>
                        <p className="text-sm" style={{ color: '#6B7280' }}>
                          {addr(t.pickupAddress)} → {addr(t.dropAddress)}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                          {currentVehicle && (
                            <span className="flex items-center gap-1" style={{ color: '#374151' }}>
                              <Truck size={11} />
                              <strong>{currentVehicle.registrationNumber}</strong> {currentVehicle.makeModel}
                            </span>
                          )}
                          {currentDriver && (
                            <span className="flex items-center gap-1" style={{ color: '#374151' }}>
                              <User size={11} />
                              <strong>{currentDriver.name}</strong> {currentDriver.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {isDone ? (
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                          style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <Truck size={15} style={{ color: '#16a34a' }} />
                          <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>Reassigned successfully</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-semibold" style={{ color: '#6B7280' }}>
                            Reassign to a different driver or vehicle:
                          </p>
                          <div className="flex gap-2 items-center">
                            <Truck size={15} style={{ color: '#6B7280', flexShrink: 0 }} />
                            <Select
                              value={a.vehicleId || ''}
                              placeholder={matchingVehicles.length > 0
                                ? `New vehicle (${matchingVehicles.length} available) — optional`
                                : 'No other vehicles available'}
                              onChange={(e) => setField(aKey, 'vehicleId', e.target.value || undefined)}
                              options={[
                                { value: '', label: 'Keep current vehicle' },
                                ...matchingVehicles.map((v) => ({
                                  value: v.id,
                                  label: `${v.registrationNumber} · ${v.makeModel} · ${v.seatingCapacity} seats`,
                                })),
                              ]}
                            />
                          </div>
                          <div className="flex gap-2 items-center">
                            <User size={15} style={{ color: '#6B7280', flexShrink: 0 }} />
                            <Select
                              value={a.driverId || ''}
                              placeholder={availableDrivers.length > 0
                                ? `New driver (${availableDrivers.filter((d) => d.isOnline).length} online)`
                                : 'No other drivers available'}
                              onChange={(e) => setField(aKey, 'driverId', e.target.value || undefined)}
                              options={[
                                { value: '', label: 'Keep current driver' },
                                ...availableDrivers.map((d) => ({
                                  value: d.userId,
                                  label: `${d.user?.name}${d.isOnline ? ' 🟢 Online' : ' ⚪ Offline'} · ${d.user?.phone || ''}`,
                                })),
                              ]}
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button size="sm" variant="secondary"
                              disabled={!a.vehicleId && !a.driverId}
                              loading={assigning[aKey]}
                              onClick={() => reassign(t.id)}>
                              Reassign
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
