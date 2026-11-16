import { useEffect, useMemo, useState } from 'react';
import Drawer from '../ui/Drawer';
import FormField from '../ui/FormField';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { vehicleService, vehicleCatalogService } from '../../services';
import { classKey } from '../../utils/vehicleClass';

/**
 * Assign a vehicle to a driver -- from the vehicles that ALREADY EXIST in the
 * fleet. Nothing is typed and no class is chosen here: a vehicle keeps the class
 * it has in the fleet, so a driver can never be given a vehicle under a class
 * that a booking can't use ("Vehicle is sedan, booking needs swift-dzire").
 *
 * Listed: active vehicles that are in service and whose class is a current
 * catalogue class (the classes bookings are made for). Vehicles in maintenance,
 * retired vehicles, and vehicles left on a retired class such as `sedan` are not
 * offered; the ones hidden for their class are named below the list, so it is
 * clear why a vehicle is missing and where to fix it (Vehicles -> edit class).
 *
 * To use a vehicle that is not in the fleet yet, add it under Vehicles first.
 */
const OUT_OF_SERVICE = ['MAINTENANCE', 'INACTIVE'];
const byReg = (a, b) => String(a.registrationNumber).localeCompare(String(b.registrationNumber));

export default function AssignVehicleDrawer({ open, onClose, onSubmit, driver }) {
  const [fleet, setFleet] = useState({ status: 'loading', vehicles: [], classNames: null, error: '' });
  const [vehicleId, setVehicleId] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFleet({ status: 'loading', vehicles: [], classNames: null, error: '' });
    setVehicleId('');
    setAttempted(false);
    setSubmitError('');
    (async () => {
      try {
        const [vehicles, catalogue] = await Promise.all([
          vehicleService.listAll(),
          // If the catalogue cannot be read, the class filter is skipped rather than
          // hiding the whole fleet.
          vehicleCatalogService.list({ includeInactive: false }).catch(() => null),
        ]);
        if (cancelled) return;
        const classNames = catalogue && catalogue.length
          ? new Map(catalogue.map((c) => [classKey(c.key), c.name || c.key])) // keyed case-insensitively
          : null;
        setFleet({ status: 'ready', vehicles, classNames, error: '' });
      } catch (e) {
        if (!cancelled) setFleet({ status: 'error', vehicles: [], classNames: null, error: e.message || 'Could not load the fleet.' });
      }
    })();
    return () => { cancelled = true; };
  }, [open, reloadTick]);

  const { options, hidden } = useMemo(() => {
    const inService = fleet.vehicles.filter((v) => v.isActive !== false && !OUT_OF_SERVICE.includes(v.status));
    const classOk = (v) => !fleet.classNames || fleet.classNames.has(classKey(v.vehicleClass));
    return {
      options: inService.filter(classOk).sort(byReg).map((v) => ({
        value: v.id,
        label: [
          v.registrationNumber,
          fleet.classNames?.get(classKey(v.vehicleClass)) || v.vehicleClass,
          v.seatingCapacity ? `${v.seatingCapacity} seats` : null,
        ].filter(Boolean).join(' \u00b7 '),
      })),
      hidden: inService.filter((v) => !classOk(v)).sort(byReg),
    };
  }, [fleet]);

  // "Change vehicle": start on the one the driver already has, if it is still offered.
  useEffect(() => {
    if (fleet.status !== 'ready' || !driver?.assignedVehicleId) return;
    if (options.some((o) => o.value === driver.assignedVehicleId)) {
      setVehicleId((cur) => cur || driver.assignedVehicleId);
    }
  }, [fleet.status, options, driver?.assignedVehicleId]);

  const submit = async () => {
    setAttempted(true);
    setSubmitError('');
    if (!vehicleId) return;
    setSubmitting(true);
    try {
      await onSubmit({ assignedVehicleId: vehicleId });
      onClose();
    } catch (e) {
      setSubmitError(e.message || 'Could not assign the vehicle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const loading = fleet.status === 'loading';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assign a Vehicle"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={submitting} disabled={loading || fleet.status === 'error'}>Assign</Button>
        </>
      }
    >
      {submitError && <Alert type="error" className="mb-4">{submitError}</Alert>}

      <div className="space-y-4">
        <Alert type="info" className="mb-4">
          Assigning a vehicle to <strong>{driver?.user?.name || driver?.user?.email}</strong>.
        </Alert>

        {fleet.status === 'error' && (
          <Alert type="error">
            Couldn't load the fleet: {fleet.error}{' '}
            <button type="button" onClick={() => setReloadTick((t) => t + 1)} style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              Try again
            </button>
          </Alert>
        )}

        <FormField
          label="Vehicle"
          required
          error={attempted && !vehicleId ? 'Select a vehicle' : undefined}
          hint="Only vehicles already in your fleet can be assigned. To use a new vehicle, add it under Vehicles first."
        >
          <Select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            placeholder={loading ? 'Loading vehicles\u2026' : 'Select a vehicle'}
            searchable
            options={options}
          />
        </FormField>

        {fleet.status === 'ready' && options.length === 0 && (
          <Alert type="warning">
            No vehicle in the fleet can be assigned yet. Add one under <strong>Vehicles</strong> (using a current
            vehicle class), then come back.
          </Alert>
        )}

        {fleet.status === 'ready' && hidden.length > 0 && (
          <p className="text-xs" style={{ color: '#92400E' }}>
            Not listed: {hidden.slice(0, 4).map((v) => `${v.registrationNumber} (${v.vehicleClass})`).join(', ')}
            {hidden.length > 4 ? ` and ${hidden.length - 4} more` : ''}. Their class is no longer a current class, so
            bookings can't be dispatched to them. Change the class under Vehicles to use them.
          </p>
        )}
      </div>
    </Drawer>
  );
}
