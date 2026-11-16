import { useEffect, useState } from 'react';
import Drawer from '../ui/Drawer';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { useForm } from '../../hooks/useForm';
import { required, isPhone } from '../../utils/validators';
import { cleanPhoneInput, parseIndianMobile } from '../../utils/phone';
import { vehicleCatalogService } from '../../services';

/**
 * Add a temporary (hired) driver: name, mobile, and the vehicle they will
 * use (registration number + class). Assigning a vehicle to an EXISTING driver is
 * a separate screen, AssignVehicleDrawer, which only offers vehicles already in
 * the fleet.
 */
// vehicleClass starts empty and is filled with the first REAL class once the
// catalogue loads. It used to default to 'sedan', a class the fleet has retired:
// a vehicle saved as sedan can never be dispatched to a booking for one of the
// current model classes (swift-dzire, ertiga, ...), which the backend refuses
// with "Vehicle is sedan, booking needs swift-dzire".
const EMPTY = {
  name: '', mobile: '', email: '',
  vehicleNumber: '', vehicleClass: '',
};

// Same rule as the backend (normaliseRegistration): spaces, dashes and other
// punctuation are ignored, and what is left must be 6-16 letters/digits.
const isVehicleNumber = (value) => {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return ''; // "required" reports the empty case
  return cleaned.length < 6 || cleaned.length > 16
    ? 'Enter a valid vehicle number, e.g. KA 01 AB 1234'
    : '';
};

export default function TemporaryDriverModal({ open, onClose, onSubmit }) {
  const [classOptions, setClassOptions] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // classOptions() returns [{ value: key, label: name, seats }] from the live
    // catalogue (retired classes such as `sedan` are left out). The previous code
    // read `res.data` / `res.classes` off what is actually an array, so the list
    // never filled in and "Sedan" was the only choice.
    vehicleCatalogService.classOptions({ includeInactive: false }).then((opts) => {
      if (cancelled || !opts.length) return;
      setClassOptions(opts);
      // Pick the first real class unless one is already chosen.
      setValues((v) => (v.vehicleClass ? v : { ...v, vehicleClass: opts[0].value }));
    });
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { values, errors, touched, submitting, submitError, setValue, setFieldTouched, handleSubmit, setValues } = useForm({
    initialValues: EMPTY,
    schema: {
      name: [required('Name')],
      mobile: [required('Mobile number'), isPhone],
      vehicleNumber: [required('Vehicle number'), isVehicleNumber],
      vehicleClass: [required('Vehicle class')],
    },
    onSubmit: async (vals) => {
      await onSubmit({
        name: vals.name.trim(),
        mobile: parseIndianMobile(vals.mobile) || vals.mobile.trim(),
        vehicleNumber: vals.vehicleNumber.trim().toUpperCase().replace(/\s+/g, ''),
        vehicleClass: vals.vehicleClass,
        ...(seatsFor(vals.vehicleClass) && { seatingCapacity: seatsFor(vals.vehicleClass) }),
      });
      onClose();
    },
  });

  useEffect(() => { if (open) setValues(EMPTY); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const seatsFor = (cls) => classOptions.find((o) => o.value === cls)?.seats || undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add Temporary Driver"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} loading={submitting}>Create</Button>
        </>
      }
    >
      {submitError && <Alert type="error" className="mb-4">{submitError}</Alert>}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Driver name" required error={touched.name && errors.name}>
              <Input value={values.name} onChange={(e) => setValue('name', e.target.value)}
                onBlur={() => setFieldTouched('name')} placeholder="e.g. Ramesh K" autoFocus />
            </FormField>
            <FormField label="Mobile number" required error={touched.mobile && errors.mobile}>
              <Input type="tel" inputMode="numeric" value={values.mobile}
                onChange={(e) => setValue('mobile', cleanPhoneInput(e.target.value))}
                onBlur={() => setFieldTouched('mobile')} placeholder="e.g. 9876543210" />
            </FormField>
          </div>
          {/* Email field removed: the backend has no email sign-in and ignored it
              (a temporary driver gets a placeholder address). Their mobile is what identifies them. */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vehicle number" required error={touched.vehicleNumber && errors.vehicleNumber}
              hint="The registration number of the car this driver will use.">
              <Input value={values.vehicleNumber}
                onChange={(e) => setValue('vehicleNumber', e.target.value.toUpperCase())}
                onBlur={() => setFieldTouched('vehicleNumber')}
                placeholder="KA 01 AB 1234" />
            </FormField>
            <FormField label="Vehicle class">
              <Select value={values.vehicleClass} onChange={(e) => setValue('vehicleClass', e.target.value)}
                placeholder="Select vehicle class" options={classOptions} />
            </FormField>
          </div>
        </form>
    </Drawer>
  );
}
