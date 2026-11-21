/**
 * NewCustomerDrawer — add a customer from the ERP (phone bookings, walk-ins,
 * corporate contacts). Name and mobile are required; email and a home address
 * are optional. See services/customerCreateService.js for how this works on
 * the current backend.
 *
 * Props: open, onClose, onCreated(customer, { bookNow })
 */
import { useState } from 'react';
import Drawer    from '../ui/Drawer';
import Button    from '../ui/Button';
import FormField from '../ui/FormField';
import Input     from '../ui/Input';
import Alert     from '../ui/Alert';
import { createCustomer, indianMobile } from '../../services/customerCreateService';

const EMPTY = { name: '', phone: '', email: '', line1: '', landmark: '', city: 'Bengaluru', state: 'Karnataka', pincode: '' };

export default function NewCustomerDrawer({ open, onClose, onCreated }) {
  const [v, setV] = useState(EMPTY);
  const [withAddress, setWithAddress] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null); // 'save' | 'book' | null
  const [failure, setFailure] = useState(null);

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const close = () => { setV(EMPTY); setErrors({}); setFailure(null); setWithAddress(false); onClose(); };

  const validate = () => {
    const e = {};
    if (v.name.trim().length < 2) e.name = 'Enter the customer’s name';
    if (!indianMobile(v.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email or leave it empty';
    if (withAddress) {
      if (v.line1.trim().length < 3) e.line1 = 'Enter the address';
      if (v.city.trim().length < 2) e.city = 'Enter the city';
      if (v.state.trim().length < 2) e.state = 'Enter the state';
      if (!/^[1-9][0-9]{5}$/.test(v.pincode.trim())) e.pincode = 'Enter a 6-digit pincode';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (bookNow) => {
    if (!validate()) return;
    setSaving(bookNow ? 'book' : 'save'); setFailure(null);
    try {
      const customer = await createCustomer({
        name: v.name, phone: v.phone, email: v.email,
        address: withAddress ? { line1: v.line1, landmark: v.landmark, city: v.city, state: v.state, pincode: v.pincode } : null,
      });
      onCreated?.(customer, { bookNow, hadAddress: withAddress });
      close();
    } catch (e) {
      setFailure(e.message || 'Could not add the customer');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Add customer"
      footer={<>
        <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
        <Button variant="secondary" size="sm" loading={saving === 'save'} disabled={!!saving} onClick={() => submit(false)}>Save customer</Button>
        <Button size="sm" loading={saving === 'book'} disabled={!!saving} onClick={() => submit(true)}>Save &amp; book a trip</Button>
      </>}
    >
      {failure && <Alert type="error" className="mb-4">{failure}</Alert>}
      <div className="space-y-4">
        <FormField label="Full name" required error={errors.name}>
          <Input value={v.name} onChange={set('name')} placeholder="Ravi Kumar" autoFocus />
        </FormField>
        <FormField label="Mobile number" required error={errors.phone}
          hint="They can sign in to the Abhi Cabs app with an SMS code to this number.">
          <Input value={v.phone} onChange={set('phone')} placeholder="9876543210" inputMode="tel" />
        </FormField>
        <FormField label="Email" error={errors.email} hint="Optional. Used for invoices and receipts.">
          <Input value={v.email} onChange={set('email')} placeholder="ravi@example.com" type="email" />
        </FormField>

        <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#111', cursor: 'pointer' }}>
          <input type="checkbox" checked={withAddress} onChange={(e) => setWithAddress(e.target.checked)} />
          Save a home address
        </label>
        {withAddress && (
          <div className="space-y-3 rounded-xl p-3" style={{ backgroundColor: '#F9F9F7', border: '1px solid #EEEEEA' }}>
            <FormField label="Address" required error={errors.line1}>
              <Input value={v.line1} onChange={set('line1')} placeholder="House no., street, area" />
            </FormField>
            <FormField label="Landmark">
              <Input value={v.landmark} onChange={set('landmark')} placeholder="Near…" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="City" required error={errors.city}><Input value={v.city} onChange={set('city')} /></FormField>
              <FormField label="State" required error={errors.state}><Input value={v.state} onChange={set('state')} /></FormField>
            </div>
            <FormField label="Pincode" required error={errors.pincode}>
              <Input value={v.pincode} onChange={set('pincode')} placeholder="560034" inputMode="numeric" />
            </FormField>
          </div>
        )}

        <p className="text-xs" style={{ color: '#6B7280' }}>
          If this mobile number already belongs to a customer, that customer is used instead of creating a duplicate.
        </p>
      </div>
    </Drawer>
  );
}
