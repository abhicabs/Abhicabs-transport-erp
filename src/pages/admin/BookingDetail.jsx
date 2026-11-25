import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, MapPin, Package, IndianRupee, Calendar, Phone,
  CheckCircle, XCircle, Truck, PlayCircle, ClipboardList, FileText, Navigation,
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { bookingService, bookingOpsService, adminService, vehicleService, vehicleCatalogService } from '../../services';
import { apiClient } from '../../services/apiClient';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Input from '../../components/ui/Input';
import FormField from '../../components/ui/FormField';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { PERMISSIONS, BOOKING_TRANSITIONS, BOOKING_STATUS } from '../../constants';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '../../utils/formatters';
import { sameClass, alignClasses, fareBody, fareChoiceError } from '../../utils/vehicleClass';
import { announceBookingChange, onBookingChange } from '../../utils/bookingSync';
import FareChoice, { DEFAULT_FARE_CHOICE } from '../../components/booking/FareChoice';

// Helper: backend returns pickupAddress/dropAddress as { address: "..." } objects
function addr(val) {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  return val.address || val.formattedAddress || JSON.stringify(val);
}



// ── Transition config — label/icon per target status ───────────────────────
const TRANSITION_BTN = {
  [BOOKING_STATUS.CONFIRMED]: { label: 'Confirm Booking',  icon: CheckCircle, variant: 'primary' },
  [BOOKING_STATUS.ALLOCATED]: { label: 'Assign Driver',    icon: Truck,       variant: 'primary', needsAssign: true },
  [BOOKING_STATUS.EN_ROUTE]:  { label: 'Mark En Route',    icon: Navigation,  variant: 'primary' },
  [BOOKING_STATUS.ONGOING]:   { label: 'Start Trip',       icon: PlayCircle,  variant: 'primary' },
  [BOOKING_STATUS.COMPLETED]: { label: 'Complete Booking', icon: CheckCircle, variant: 'primary' },
  [BOOKING_STATUS.CANCELLED]: { label: 'Cancel Booking',   icon: XCircle,     variant: 'danger'  },
};

// ── Assign vehicle modal ────────────────────────────────────────────────────
// The backend's /admin/dispatch/bookings/:id/assign accepts { vehicleId,
// driverId } — driverId is optional (assignSchema in dispatch.schemas.js).
// A driver roster DOES exist (GET /admin/drivers, the same endpoint the
// Drivers page and Dispatch board already use) — the previous version of
// this modal claimed otherwise and only ever sent vehicleId, so a booking
// could be assigned a vehicle but never a driver from this screen.
//
// FIX: online drivers are now ranked by LIVE distance to this booking's
// pickup point, not just listed alphabetically. A driver who's online only
// means their GPS ping reached the backend recently (see location.service.js
// markOnline/ingestPing) — it says nothing about where they physically are
// relative to this specific pickup. Without ranking by distance, "easy to
// assign" really meant "guess which of these names is actually nearby."
// This reuses the exact same GET /admin/location/nearby lookup the Dispatch
// board's own "Suggest drivers" feature already uses, so both screens agree
// on who's closest.
function AssignModal({ open, onClose, onAssign, booking }) {
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesTick, setVehiclesTick] = useState(0);
  const [drivers, setDrivers] = useState([]);
  const [loadingDistances, setLoadingDistances] = useState(false);
  // Fare when the picked vehicle is another class (re-quote / keep / custom).
  const [fare, setFare] = useState(DEFAULT_FARE_CHOICE);
  // What each class would cost for this trip, to show beside "Re-quote".
  const [quotes, setQuotes] = useState([]);

  useEffect(() => { setFare(DEFAULT_FARE_CHOICE); }, [vehicleId]);

  useEffect(() => {
    if (!open || !booking?.id) return;
    let cancelled = false;
    apiClient.get(`/admin/bookings/${booking.id}/vehicle-options`)
      .then((r) => { if (!cancelled) setQuotes(r?.options || []); })
      .catch(() => { if (!cancelled) setQuotes([]); });
    return () => { cancelled = true; };
  }, [open, booking?.id]);
  const quoteFor = (cls) => {
    const q = quotes.find((o) => sameClass(o.vehicleClass, cls));
    return q ? Number(q.total) : null;
  };

  // The backend refuses a vehicle whose class differs from the booking's
  // ("Vehicle is sedan, booking needs swift-dzire"). The Dispatch board already
  // hides those; this list offered every available vehicle, so the wrong one
  // could be picked and only failed after pressing Assign.
  //
  // Locking the list to the booking's class left ops stuck whenever no vehicle
  // of that exact class was free (the modal listed nothing and Assign stayed
  // disabled). Like the Dispatch board, every free vehicle is now offered:
  // same-class vehicles first, any other class marked, and picking one moves
  // the booking to that class (fare re-quoted) on Assign — see alignClasses.
  const wantedClass = booking?.vehicleClass || '';
  // Compared ignoring case / spaces / hyphens — "Swift Dzire" is swift-dzire.
  const isMatch = (v) => !wantedClass || sameClass(v.vehicleClass, wantedClass);
  const matchingVehicles = vehicles.filter(isMatch);
  const sortedVehicles = [...vehicles].sort((a, b) => (isMatch(b) - isMatch(a))
    || String(a.registrationNumber || '').localeCompare(String(b.registrationNumber || '')));
  const pickedVehicle = vehicles.find((v) => v.id === vehicleId);
  const pickedOtherClass = pickedVehicle && !isMatch(pickedVehicle);
  const ownDriver = (vid) => drivers.find((d) => d.assignedVehicleId && d.assignedVehicleId === vid);

  // Available vehicles, read straight from the fleet (the database), NOT from
  // /admin/dispatch/vehicles: that list is cached by the backend for up to a
  // minute and the cache is only cleared when a vehicle is assigned or released,
  // not when one is edited or added. Change a vehicle's class under Vehicles and
  // the dispatch list kept showing the old class, so this modal reported "no
  // available swift-dzire vehicle" for a vehicle that had just become one.
  // The fleet list needs the vehicle permission; if it is refused (a dispatcher
  // without it) the dispatch list is used instead.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVehiclesLoading(true);
    (async () => {
      let list;
      try {
        const all = await vehicleService.listAll();
        list = all.filter((v) => v.isActive !== false && v.status === 'AVAILABLE');
      } catch {
        const r = await apiClient.get('/admin/dispatch/vehicles');
        list = r?.vehicles || [];
      }
      if (!cancelled) setVehicles(list);
    })()
      .catch(() => { if (!cancelled) setVehicles([]); })
      .finally(() => { if (!cancelled) setVehiclesLoading(false); });
    return () => { cancelled = true; };
  }, [open, vehiclesTick]);

  useEffect(() => {
    if (!open) return;

    // All KYC-verified drivers, online ones first. Filtering to online-only
    // (status: 'online') usually returned nobody — a driver whose app isn't
    // open right now still drives a vehicle and can be booked ahead for a
    // scheduled trip. The Dispatch board lists everyone too; keep them in step.
    setLoadingDistances(true);
    (async () => {
      const all = [];
      let page = 1, totalPages = 1;
      do {
        const res = await apiClient.get('/admin/drivers', { params: { kycStatus: 'VERIFIED', limit: 100, page } });
        all.push(...(res?.data ?? res?.items ?? []));
        totalPages = res?.meta?.totalPages ?? res?.pagination?.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages && page <= 20);
      return all;
    })()
      .then(async (list) => {
        const lat = booking?.pickupLat, lng = booking?.pickupLng;
        const onlineFirst = (arr) => [...arr].sort((a, b) => Number(!!b.isOnline) - Number(!!a.isOnline));
        if (!list.length || lat == null || lng == null) {
          setDrivers(onlineFirst(list.map((d) => ({ ...d, distanceKm: null }))));
          return;
        }
        try {
          const nearby = await apiClient.get('/admin/location/nearby', {
            params: { lat: Number(lat), lng: Number(lng), radiusKm: 25, limit: 100 },
          });
          const distanceByDriverId = new Map(
            (nearby.data?.drivers || nearby.drivers || []).map((n) => [n.driverId, n.distanceKm])
          );
          const withDistance = list.map((d) => ({
            ...d,
            distanceKm: distanceByDriverId.has(d.userId)
              ? Number(distanceByDriverId.get(d.userId).toFixed(2))
              : null,
          }));
          withDistance.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            if (a.distanceKm == null && b.distanceKm == null) return 0;
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm - b.distanceKm;
          });
          setDrivers(withDistance);
        } catch {
          // Redis/location lookup down is not a reason to hide the driver
          // list — just fall back to online-first, unranked by distance.
          setDrivers(onlineFirst(list.map((d) => ({ ...d, distanceKm: null }))));
        }
      })
      .catch(() => setDrivers([]))
      .finally(() => setLoadingDistances(false));
  }, [open, booking?.pickupLat, booking?.pickupLng]);

  const fareError = pickedOtherClass ? fareChoiceError(fare) : null;

  const submit = async () => {
    if (!vehicleId || fareError) return;
    setLoading(true);
    // No driver picked: send the vehicle's own driver, otherwise the trip
    // reaches no driver app.
    const effectiveDriverId = driverId || ownDriver(vehicleId)?.userId || undefined;
    const ok = await onAssign(vehicleId, effectiveDriverId, pickedVehicle, pickedOtherClass ? fare : null);
    setLoading(false);
    if (ok === false) return; // keep the modal open so the error can be fixed
    setDriverId('');
    setVehicleId('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign vehicle" size="sm"
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={loading} onClick={submit} disabled={!vehicleId || !!fareError} title={fareError || undefined}>Assign</Button>
      </>}
    >
      <div className="space-y-4">
        <FormField
          label="Vehicle"
          required
          hint={wantedClass ? `${wantedClass} vehicles are listed first. Picking another class changes the booking to that class — you choose the fare.` : undefined}
        >
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder={vehiclesLoading ? 'Loading vehicles\u2026' : 'Select vehicle'}
            options={sortedVehicles.map((v) => ({
              value: v.id,
              label: `${v.registrationNumber} · ${v.makeModel || v.vehicleClass}${v.seatingCapacity ? ` (${v.seatingCapacity} seats)` : ''}${isMatch(v) ? '' : ` — ${v.vehicleClass} (different class)`}`,
            }))} />
        </FormField>
        <button
          type="button"
          onClick={() => setVehiclesTick((t) => t + 1)}
          disabled={vehiclesLoading}
          style={{ fontSize: 12, fontWeight: 600, color: '#3B65DB', background: 'none', border: 'none', cursor: vehiclesLoading ? 'default' : 'pointer', padding: 0, marginTop: -8 }}
        >
          {vehiclesLoading ? 'Loading vehicles\u2026' : 'Refresh vehicle list'}
        </button>
        {!vehiclesLoading && vehicles.length === 0 && (
          <Alert type="warning">No available vehicles right now. Add one in Vehicles, or release a vehicle from another trip.</Alert>
        )}
        {!vehiclesLoading && wantedClass && vehicles.length > 0 && matchingVehicles.length === 0 && !pickedVehicle && (
          <Alert type="warning">
            No available <strong>{wantedClass}</strong> vehicle. You can still pick one of the other {vehicles.length} vehicle{vehicles.length > 1 ? 's' : ''} above — the booking will move to that class and you choose the fare (re-quote, keep or custom).
            If a vehicle's class is just misspelt (e.g. "dezire"), correct it under Vehicles instead.
          </Alert>
        )}
        {pickedOtherClass && (
          <>
            <Alert type="warning">
              Booking is <strong>{wantedClass}</strong>, {pickedVehicle.registrationNumber} is <strong>{pickedVehicle.vehicleClass}</strong>.
              Assigning will change the booking to {pickedVehicle.vehicleClass}.
            </Alert>
            <FareChoice
              value={fare}
              onChange={setFare}
              newClass={pickedVehicle.vehicleClass}
              currentFare={booking?.estimatedFare != null ? Number(booking.estimatedFare) : null}
              quotedFare={quoteFor(pickedVehicle.vehicleClass)}
            />
          </>
        )}
        <FormField
          label="Driver"
          hint={loadingDistances ? 'Ranking by live distance to pickup…' : (vehicleId && !driverId && ownDriver(vehicleId) ? `Left empty, ${ownDriver(vehicleId).user?.name || 'this vehicle\'s driver'} (drives this vehicle) gets the trip.` : 'Online drivers first, nearest to pickup first.')}
        >
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} placeholder="Select driver (optional)"
            options={drivers.map((d, i) => ({
              value: d.userId,
              label: `${i === 0 && d.isOnline && d.distanceKm != null ? '⭐ ' : ''}${d.user?.name || 'Unnamed'} · ${d.user?.phone || ''}${d.isOnline ? (d.distanceKm != null ? ` — ${d.distanceKm} km away` : ' — online') : ' — offline'}${vehicleId && d.assignedVehicleId === vehicleId ? ' · drives this vehicle' : ''}`,
            }))} />
        </FormField>
        {drivers.length === 0 && !loadingDistances && (
          <Alert type="info">No KYC-verified drivers found — you can still assign the vehicle and add a driver later via Reassign.</Alert>
        )}
      </div>
    </Modal>
  );
}



// ── Edit fare modal (FARE_EDIT) ─────────────────────────────────────────────
// PATCH /admin/bookings/:id/fare { fare, reason }. Same class, new price. The
// backend re-splits what's owed against what's already paid, logs who/why, and
// tells the customer. A lower fare than already collected is reported as a
// refund due — nothing is refunded automatically.
function EditFareModal({ open, onClose, booking, onSaved }) {
  const toast = useToast();
  const [fare, setFare] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setFare(''); setReason(''); } }, [open]);

  const current = Number(booking?.estimatedFare || 0);
  const paid = Number(booking?.advancePaid || 0);
  const n = Number(fare);
  const valid = n > 0 && n !== current && reason.trim().length >= 3;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await apiClient.patch(`/admin/bookings/${booking.id}/fare`, { fare: n, reason: reason.trim() });
      const refund = Number(res?.change?.refundDue || 0);
      toast.success(`Fare updated to ${formatCurrency(n)}${refund > 0 ? ` — ${formatCurrency(refund)} to refund` : ''}`);
      onSaved?.(res?.booking);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not update the fare');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit fare" size="sm"
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={saving} onClick={save} disabled={!valid}>Save fare</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-xs" style={{ color: '#6B7280' }}>
          Current fare: <strong>{formatCurrency(current)}</strong>{paid > 0 && <> · already paid {formatCurrency(paid)}</>}.
          The class stays <strong>{booking?.vehicleClass}</strong>.
        </p>
        <FormField label="New fare (₹)" required>
          <Input value={fare} onChange={(e) => setFare(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={String(Math.round(current))} />
        </FormField>
        <FormField label="Reason" required hint="Saved in the audit log and the booking's fare history.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Extra stop agreed, corporate rate, complaint" maxLength={500} />
        </FormField>
        {n > 0 && n !== current && (
          <Alert type={n > current ? 'warning' : 'info'}>
            {formatCurrency(Math.abs(n - current))} {n > current ? 'more' : 'less'} than now.
            {paid > 0 && (n >= paid
              ? ` Customer will owe ${formatCurrency(n - paid)}.`
              : ` ${formatCurrency(paid - n)} will be due as a refund (not refunded automatically).`)}
            {' '}The customer gets a notification.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

// ── Cancel modal — requires a real, typed reason ────────────────────────────
// Previously "Cancel Booking" called transition() straight away with a
// hardcoded reason: 'Cancelled by admin' baked into the code — every admin
// cancellation therefore stored that exact same generic string, forever,
// regardless of why it was actually cancelled. This asks for the real one.
function CancelModal({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cancel booking" size="sm"
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Back</Button>
        <Button variant="danger" size="sm" loading={loading} onClick={submit}>Cancel booking</Button>
      </>}
    >
      <div className="space-y-4">
        <FormField label="Reason for cancellation" hint="Shown on the booking record — be specific, this is what the customer and reports will see.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested cancellation due to change of plans" />
        </FormField>
      </div>
    </Modal>
  );
}

// ── Confirm modal — call the customer, then confirm with an optional remark ──
// A booking sits in PENDING until an admin confirms it (backend makes this the
// ONLY way out of PENDING — payment does not auto-confirm). This is where ops
// records what happened on the call ("customer confirmed by phone", "asked to
// call back at 6pm", etc.) before moving it to CONFIRMED.
//
// The remark travels as `note` on PATCH /admin/bookings/:id/confirm. It is
// persisted only if the backend confirm handler forwards it (see the optional
// backend patch in the notes) — the confirm itself works either way.
function ConfirmModal({ open, onClose, onConfirm, bookingNumber }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await onConfirm(note.trim());
      setNote('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Confirm booking" size="sm"
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Back</Button>
        <Button variant="primary" size="sm" loading={loading} onClick={submit}>Confirm booking</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: '#6B7280' }}>
          {bookingNumber ? <>Confirm <strong>{bookingNumber}</strong> and move it out of Pending.</> : 'Confirm this booking and move it out of Pending.'}
        </p>
        <FormField label="Remark (optional)" hint="Note from the confirmation call — e.g. who you spoke to, or anything the driver/ops should know.">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed with customer by phone; pickup gate is at the rear." />
        </FormField>
      </div>
    </Modal>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function BookingDetail() {
  const { id: bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.BOOKINGS_MANAGE);
  const canEditFare = hasPermission(PERMISSIONS.FARE_EDIT);
  const [editFareOpen, setEditFareOpen] = useState(false);

  const fetchBooking = useCallback(() => bookingService.get(bookingId), [bookingId]);
  const { data: booking, status, error, refetch, setData } = useApi(fetchBooking, [bookingId]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [vehicleChangeOpen, setVehicleChangeOpen] = useState(false);
  const [vehicleOptions, setVehicleOptions] = useState(null);
  const [changingVehicle, setChangingVehicle] = useState(false);
  const [selectedNewClass, setSelectedNewClass] = useState('');
  const [changeFare, setChangeFare] = useState(DEFAULT_FARE_CHOICE);
  const [catalogueClasses, setCatalogueClasses] = useState([]);
  const [hasInvoice, setHasInvoice] = useState(false);

  // ── Live sync ────────────────────────────────────────────────────────────
  // A vehicle assigned, class changed or fare re-priced on the Dispatch board
  // (this tab, another tab, or another staff member via the socket) reloads
  // this booking in place — quietly, without the full-page loading state.
  useEffect(() => {
    if (!bookingId) return undefined;
    let timer = null;
    const silentRefresh = () => {
      clearTimeout(timer);
      // Small debounce: one assign fires several events (class change, allocation, status).
      timer = setTimeout(() => {
        bookingService.get(bookingId).then((b) => { if (b) setData(b); }).catch(() => {});
      }, 300);
    };
    const off = onBookingChange(({ bookingId: changed }) => {
      if (!changed || String(changed) === String(bookingId)) silentRefresh();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') silentRefresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { off(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [bookingId, setData]);

  useEffect(() => {
    if (!booking) return;
    adminService.getInvoiceForBooking(booking.id)
      .then((inv) => setHasInvoice(!!inv))
      .catch(() => setHasInvoice(false));
  }, [booking]);

  if (status === 'loading') return <LoadingState label="Loading booking…" />;
  if (status === 'error') return <ErrorState message={error?.status === 404 ? 'Booking not found.' : error?.message} onRetry={refetch} />;

  const nextStatuses = BOOKING_TRANSITIONS[booking.status] || [];

  // ── Transition handler — goes through bookingOpsService's dedicated
  // PATCH actions (confirm/allocate/en-route/start/complete/cancel), never
  // a generic PUT with a raw status field. ──────────────────────────────
  const transition = async (nextStatus, extraData = {}) => {
    setTransitioning(true);
    try {
      const updated = await bookingOpsService.transition(booking.id, nextStatus, extraData);
      setData(updated.booking || updated);
      announceBookingChange(booking.id);
      toast.success(`Booking → ${nextStatus.replace('_', ' ')}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTransitioning(false);
    }
  };

  // Cancellation is its own flow (not a generic transition) because it needs
  // a real, admin-typed reason — see CancelModal above. This is also where
  // the request-body field name is fixed: it used to send { cancelledBy },
  // but the backend's adminCancelSchema expects `cancelledByType`
  // (confirmed in lifecycle.schemas.js) — cancelledBy was silently dropped
  // by Zod (unknown keys are stripped, not rejected), so the service was
  // always falling back to its own 'ADMIN' default anyway. Harmless for
  // this screen specifically (an admin cancelling should say ADMIN), but
  // the field name is fixed here for correctness rather than left wrong.
  const handleCancel = async (reason) => {
    try {
      const updated = await bookingOpsService.cancel(booking.id, { reason, cancelledByType: 'ADMIN' });
      setData(updated.booking || updated);
      announceBookingChange(booking.id);
      toast.success('Booking cancelled');
    } catch (e) {
      toast.error(e.message);
      throw e; // keep the modal open on failure
    }
  };

  // Confirm (PENDING → CONFIRMED) with an optional call remark. The remark is
  // sent as `note`; see ConfirmModal above. Kept separate from the generic
  // transition() so ops always gets the remark prompt on confirm.
  const handleConfirm = async (note) => {
    try {
      const updated = await bookingOpsService.confirm(
        booking.id,
        note ? { note } : {},
      );
      setData(updated.booking || updated);
      announceBookingChange(booking.id);
      toast.success('Booking confirmed');
    } catch (e) {
      toast.error(e.message);
      throw e; // keep the modal open on failure
    }
  };

  const handleAssign = async (vehicleId, driverId, vehicle, fare = null) => {
    setTransitioning(true);
    try {
      // Same class but spelled differently ("Swift-Dzire" vs "swift-dzire"):
      // the backend compares exactly, so correct the vehicle's spelling first.
      // A different class moves the booking to the vehicle's class (re-quoted).
      if (vehicle) {
        let catalogueKeys = [];
        try { catalogueKeys = (await vehicleCatalogService.classOptions({ includeInactive: true })).map((o) => o.value); } catch { /* spelling fallback only */ }
        const aligned = await alignClasses({ booking, vehicle, catalogueKeys, fare });
        if (aligned.bookingChangedTo) announceBookingChange(booking.id);
        if (aligned.bookingChangedTo) toast.success(`Booking changed to ${aligned.bookingChangedTo} — fare re-quoted`);
      }
      // The real endpoint returns { allocation }, not the full updated
      // booking — refetch the booking fresh so its status reflects the
      // new allocation correctly rather than guessing at a merge.
      await apiClient.post(`/admin/dispatch/bookings/${booking.id}/assign`, { vehicleId, driverId });
      toast.success(driverId ? 'Vehicle and driver assigned' : 'Vehicle assigned');
      refetch();
      announceBookingChange(booking.id);
      return true;
    } catch (e) {
      toast.error(e.message);
      refetch(); // the class may already have changed before the assign failed
      return false;
    } finally {
      setTransitioning(false);
    }
  };

  // ── Vehicle class change (Sedan → SUV etc.) ─────────────────────────────
  const openVehicleChange = async () => {
    try {
      const res = await apiClient.get(`/admin/bookings/${booking.id}/vehicle-options`);
      const options = res?.options || res?.vehicleOptions || res || [];
      setVehicleOptions(Array.isArray(options) ? options : []);
      // Every catalogue class can be picked, not only the ones with a rate card
      // for this trip — those just need the fare kept or typed.
      try { setCatalogueClasses(await vehicleCatalogService.classOptions()); } catch { setCatalogueClasses([]); }
      setSelectedNewClass('');
      setChangeFare(DEFAULT_FARE_CHOICE);
      setVehicleChangeOpen(true);
    } catch (e) {
      toast.error(e.message || 'Could not load vehicle options');
    }
  };

  const handleVehicleChange = async () => {
    if (!selectedNewClass) { toast.error('Select a vehicle class'); return; }
    const err = fareChoiceError(changeFare);
    if (err) { toast.error(err); return; }
    setChangingVehicle(true);
    try {
      const updated = await apiClient.patch(`/admin/bookings/${booking.id}/vehicle`, { vehicleClass: selectedNewClass, ...fareBody(changeFare) });
      setData(updated.booking || updated);
      announceBookingChange(booking.id);
      const how = changeFare.fareMode === 'keep' ? 'fare kept' : changeFare.fareMode === 'custom' ? 'fare set' : 'fare re-quoted';
      toast.success(`Vehicle changed to ${selectedNewClass} — ${how}`);
      setVehicleChangeOpen(false);
      refetch();
    } catch (e) {
      toast.error(e.message || 'Vehicle change failed');
    } finally { setChangingVehicle(false); }
  };

  // Invoices are auto-generated by the backend when a booking is completed.
  // There is no manual create endpoint — mark Complete to trigger invoice generation.

  // Real field names confirmed against BOOKING_SELECT in src/models/booking.model.js:
  //   pickupAddress, dropAddress, vehicleClass, tripType, estimatedFare/finalFare,
  //   pickupAt, customer.user.{name, phone} — NOT pickup/drop/cargoType/weightTon/
  //   clientName/clientPhone/scheduledAt/assignedDriverName, which don't exist.
  // Guest checkout: the account is a throwaway named "Guest" with no phone. The
  // name and number the customer typed are already stored on the booking
  // (guestName / guestPhone), so show those for guest bookings.
  const accountName = booking.customer?.user?.name;
  const isGuest =
    !accountName ||
    accountName.toLowerCase().startsWith('guest') ||
    (booking.customer?.user?.email || '').toLowerCase().endsWith('@guest.invalid');
  const customerName = isGuest
    ? (booking.guestName || booking.corporate?.companyName || 'Guest')
    : (accountName || booking.corporate?.companyName || 'Unknown customer');
  const customerPhone = isGuest ? booking.guestPhone : booking.customer?.user?.phone;
  const fare = booking.finalFare ?? booking.estimatedFare;

  const infoRows = [
    { icon: MapPin, label: 'Pickup', value: booking.pickupAddress },
    // The backend stores intermediate stops the customer added at booking
    // time as booking.stops — a JSON array of { lat, lng, address, addressId },
    // up to 10, always present (defaults to [] when there are none). This
    // page never read it at all, so a customer's chosen stops were silently
    // dropped from the admin view even though the data was there in every
    // API response — Drop just appeared right after Pickup regardless of
    // what was actually booked.
    ...(Array.isArray(booking.stops) && booking.stops.length > 0
      ? booking.stops.map((stop, i) => ({
          icon: MapPin,
          label: `Stop ${i + 1}`,
          value: stop.address || (stop.lat && stop.lng ? `${stop.lat}, ${stop.lng}` : 'Unnamed stop'),
        }))
      : []),
    { icon: MapPin, label: 'Drop', value: booking.dropAddress },
    { icon: Package, label: 'Vehicle Class', value: `${booking.vehicleClass} · ${booking.tripType}` },
    { icon: IndianRupee, label: 'Fare', value: formatCurrency(fare) },
    // Promo or staff discount, as saved when the booking was priced.
    ...(booking.fareBasis?.discount ? [{
      icon: IndianRupee,
      label: 'Discount',
      value: `− ${formatCurrency(Number(booking.fareBasis.discount.amount) || 0)} (${booking.fareBasis.discount.code}${booking.fareBasis.discount.code?.startsWith('STAFF') ? ', given by staff' : ''}), before discount ${formatCurrency(Number(booking.fareBasis.discount.grossTotal) || 0)}`,
    }] : []),
    { icon: Calendar, label: 'Pickup Time', value: formatDateTime(booking.pickupAt) },
    // Round trips carry a return DATE only. The backend stores it as the end of
    // that day in IST, so it is formatted in IST and never shown with a time.
    ...(booking.tripType === 'ROUND_TRIP' && booking.returnAt
      ? [{ icon: Calendar, label: 'Return Date', value: formatDate(booking.returnAt, { timeZone: 'Asia/Kolkata' }) }]
      : []),
    ...(customerPhone ? [{ icon: Phone, label: 'Customer Phone', value: customerPhone }] : []),
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: 'Bookings', to: '/admin/bookings' }, { label: booking.id }]} />
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(-1)} className="mb-3 -ml-2">
        Back
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: '#1F2937' }}>
                  {customerName}
                  {isGuest && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, backgroundColor: '#FEF3C7', color: '#92400E' }}>GUEST</span>
                  )}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{booking.bookingNumber}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            <dl className="grid sm:grid-cols-2 gap-4">
              {infoRows.map((r) => (
                <div key={r.label} className="flex items-start gap-2.5">
                  <r.icon size={15} style={{ color: '#6B7280' }} className="mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-xs" style={{ color: '#6B7280' }}>{r.label}</dt>
                    <dd className="text-sm font-semibold mt-0.5" style={{ color: '#1F2937' }}>{r.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          {/* FIX: the backend has always returned cancellationReason,
              cancelledAt, cancelledByType and cancellationFee for a
              cancelled booking (confirmed in BOOKING_SELECT) — this screen
              just never rendered any of them, so a cancelled booking looked
              identical to any other except for its status badge. */}
          {booking.status === BOOKING_STATUS.CANCELLED && (
            <Card style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
              <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5" style={{ color: '#B91C1C' }}>
                <XCircle size={14} /> Cancellation details
              </h3>
              <dl className="space-y-2.5">
                <div>
                  <dt className="text-xs" style={{ color: '#7F1D1D' }}>Reason</dt>
                  <dd className="text-sm font-medium mt-0.5" style={{ color: '#1F2937' }}>
                    {booking.cancellationReason || 'No reason was recorded.'}
                  </dd>
                </div>
                <div className="flex gap-6 flex-wrap">
                  {booking.cancelledByType && (
                    <div>
                      <dt className="text-xs" style={{ color: '#7F1D1D' }}>Cancelled by</dt>
                      <dd className="text-sm font-medium mt-0.5" style={{ color: '#1F2937' }}>{titleCase(booking.cancelledByType)}</dd>
                    </div>
                  )}
                  {booking.cancelledAt && (
                    <div>
                      <dt className="text-xs" style={{ color: '#7F1D1D' }}>Cancelled at</dt>
                      <dd className="text-sm font-medium mt-0.5" style={{ color: '#1F2937' }}>{formatDateTime(booking.cancelledAt)}</dd>
                    </div>
                  )}
                  {Number(booking.cancellationFee) > 0 && (
                    <div>
                      <dt className="text-xs" style={{ color: '#7F1D1D' }}>Cancellation fee</dt>
                      <dd className="text-sm font-medium mt-0.5" style={{ color: '#1F2937' }}>{formatCurrency(booking.cancellationFee)}</dd>
                    </div>
                  )}
                </div>
              </dl>
            </Card>
          )}

          {(booking.statusHistory || []).length > 0 && (
            <Card>
              <h3 className="font-bold text-sm mb-4" style={{ color: '#1F2937' }}>
                <ClipboardList size={14} className="inline mr-1.5" style={{ color: '#6B7280' }} />
                Status History
              </h3>
              <ol className="border-l-2 pl-4 space-y-3" style={{ borderColor: '#E5E7EB' }}>
                {booking.statusHistory.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#3B65DB' }} />
                    <p className="text-xs font-semibold" style={{ color: '#1F2937' }}>
                      {h.from} → {h.to?.replace('_', ' ')}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{formatDateTime(h.at)} · by {h.by}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {canManage && (
          <div className="space-y-3">
            <Card>
              <h3 className="font-bold text-sm mb-3" style={{ color: '#1F2937' }}>Actions</h3>

              {nextStatuses.length === 0 ? (
                <p className="text-xs" style={{ color: '#6B7280' }}>
                  No further actions available for this booking.
                </p>
              ) : (
                <div className="space-y-2">
                  {nextStatuses.map((ns) => {
                    const cfg = TRANSITION_BTN[ns];
                    if (!cfg) return null;
                    return (
                      <Button
                        key={ns}
                        className="w-full"
                        variant={cfg.variant}
                        icon={cfg.icon}
                        loading={transitioning}
                        onClick={() => {
                          if (cfg.needsAssign) setAssignOpen(true);
                          else if (ns === BOOKING_STATUS.CANCELLED) setCancelOpen(true);
                          else if (ns === BOOKING_STATUS.CONFIRMED) setConfirmOpen(true);
                          else transition(ns);
                        }}
                      >
                        {cfg.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Fare edit — FARE_EDIT only, same statuses the backend allows */}
            {canEditFare && ['PENDING', 'CONFIRMED', 'ALLOCATED'].includes(booking.status) && (
              <Card>
                <h3 className="font-bold text-sm mb-3" style={{ color: '#1F2937' }}>Fare</h3>
                <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
                  Change the price without changing the vehicle. Already-paid amounts are kept.
                </p>
                <Button className="w-full" variant="secondary" icon={IndianRupee} onClick={() => setEditFareOpen(true)}>
                  Edit Fare
                </Button>
              </Card>
            )}

            {/* Vehicle class change — the statuses the backend allows (PENDING/CONFIRMED/ALLOCATED) */}
            {['PENDING', 'CONFIRMED', 'ALLOCATED'].includes(booking.status) && (
              <Card>
                <h3 className="font-bold text-sm mb-3" style={{ color: '#1F2937' }}>Change Vehicle</h3>
                <p className="text-xs mb-2" style={{ color: '#6B7280' }}>
                  Switch to a different vehicle class. The fare is re-quoted at the new class's rate{canEditFare ? ', or you can keep it or set your own' : ''}.
                </p>
                <Button className="w-full" variant="secondary" icon={Truck} onClick={openVehicleChange}>
                  Change Vehicle Class
                </Button>
              </Card>
            )}

            <Card>
              <h3 className="font-bold text-sm mb-3" style={{ color: '#1F2937' }}>Finance</h3>
              <div className="space-y-2">
                {hasInvoice ? (
                  <Button
                    className="w-full"
                    variant="secondary"
                    icon={FileText}
                    onClick={() => navigate('/admin/invoices')}
                  >
                    View Invoice →
                  </Button>
                ) : (
                  <p className="text-xs" style={{ color: '#6B7280' }}>
                    Invoice is auto-generated by the backend when this booking is marked <strong>Completed</strong>.
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} onAssign={handleAssign} booking={booking} />
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={handleCancel} />
      <EditFareModal open={editFareOpen} onClose={() => setEditFareOpen(false)} booking={booking}
        onSaved={(b) => { if (b) setData(b); refetch(); announceBookingChange(booking.id); }} />
      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirm} bookingNumber={booking.bookingNumber} />

      {/* Vehicle Change Modal
          GET /admin/bookings/:id/vehicle-options returns
          { options: [{ vehicleClass, name, seats, current, total, difference }] }.
          The Select component only renders its `options` prop — the old
          <option> children were silently dropped, so the menu opened empty.
          The fare also read estimatedFare/fare, which the endpoint never sends
          (it's `total`), so every class would have shown ₹0. */}
      <Modal open={vehicleChangeOpen} onClose={() => setVehicleChangeOpen(false)} title="Change Vehicle Class" size="sm"
        footer={<><Button variant="secondary" onClick={() => setVehicleChangeOpen(false)}>Cancel</Button>
          <Button loading={changingVehicle} onClick={handleVehicleChange} disabled={!selectedNewClass || !!fareChoiceError(changeFare)}>
            {changeFare.fareMode === 'keep' ? 'Change class' : changeFare.fareMode === 'custom' ? 'Change & set fare' : 'Change & Re-quote'}
          </Button></>}>
        {(() => {
          const optFare = (o) => Number(o.total ?? o.estimatedFare ?? o.fare ?? 0);
          const priced = (vehicleOptions || []).filter((o) => !o.current && !sameClass(o.vehicleClass, booking.vehicleClass));
          // Catalogue classes with no rate card for this trip: selectable, but
          // the fare must be kept or typed (re-quote would fail).
          const unpriced = catalogueClasses
            .filter((c) => !sameClass(c.value, booking.vehicleClass) && !priced.some((o) => sameClass(o.vehicleClass, c.value)))
            .map((c) => ({ vehicleClass: c.value, name: c.label, seats: c.seats, unpriced: true }));
          const others = [...priced, ...unpriced];
          if (!others.length) {
            return <p className="text-sm" style={{ color: '#6B7280' }}>No other vehicle classes are available for this trip.</p>;
          }
          const opt = others.find((o) => o.vehicleClass === selectedNewClass);
          const currentFare = Number(booking.estimatedFare || 0);
          const newFare = !opt ? null
            : changeFare.fareMode === 'keep' ? currentFare
              : changeFare.fareMode === 'custom' ? (Number(changeFare.customFare) > 0 ? Number(changeFare.customFare) : null)
                : (opt.unpriced ? null : optFare(opt));
          const diff = newFare != null ? newFare - currentFare : 0;
          return (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: '#6B7280' }}>
                Current class: <strong>{booking.vehicleClass}</strong> at {formatCurrency(currentFare)}. Pick a new class, then choose how the fare is set.
              </p>
              <FormField label="New Vehicle Class">
                <Select
                  value={selectedNewClass}
                  onChange={(e) => { setSelectedNewClass(e.target.value); setChangeFare(DEFAULT_FARE_CHOICE); }}
                  placeholder="Select…"
                  options={others.map((o) => ({
                    value: o.vehicleClass,
                    label: `${o.name || o.vehicleClass}${o.seats ? ` · ${o.seats} seats` : ''} — ${o.unpriced ? 'no rate card, set fare' : formatCurrency(optFare(o))}`,
                  }))}
                />
              </FormField>
              {opt && (
                <FareChoice
                  value={changeFare}
                  onChange={setChangeFare}
                  newClass={opt.name || opt.vehicleClass}
                  currentFare={currentFare}
                  quotedFare={opt.unpriced ? null : optFare(opt)}
                />
              )}
              {opt && newFare != null && (
                <Alert type={diff > 0 ? 'warning' : 'info'}>
                  New fare: {formatCurrency(newFare)}
                  {diff !== 0 && <span> ({formatCurrency(Math.abs(diff))} {diff > 0 ? 'more' : 'less'})</span>}
                  . Already-paid amounts will be adjusted.
                </Alert>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}