/**
 * BookingFormDrawer — staff create a booking for a customer (phone bookings,
 * walk-ins, corporate requests). Works with the current backend:
 *
 *   customer   search existing customers, or add a new one inline
 *              (services/customerCreateService.js)
 *   places     suggestions from GET /fares/autocomplete; free text also works,
 *              the backend geocodes the address it receives
 *   fares      POST /fares/options prices every vehicle class for the trip,
 *              so staff pick a class with its price in front of them
 *   create     POST /admin/bookings with customerId (staff book on behalf)
 *   confirm    optionally PATCH /admin/bookings/:id/confirm straight away,
 *              since staff usually agree the trip on the phone
 *
 * The server always prices the booking itself; the prices shown here are the
 * same quote the rider app shows, for reference.
 *
 * Props: open, onClose, onCreated(booking, { confirmed }), initialCustomer ({ userId, name, phone })
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X, Users, BadgePercent } from 'lucide-react';
import Drawer    from '../ui/Drawer';
import FormField from '../ui/FormField';
import Input     from '../ui/Input';
import Select    from '../ui/Select';
import Button    from '../ui/Button';
import Alert     from '../ui/Alert';
import Textarea  from '../ui/Textarea';
import PlaceInput from './PlaceInput';
import { apiClient } from '../../services/apiClient';
import { bookingService, vehicleCatalogService } from '../../services';
import { createCustomer, indianMobile } from '../../services/customerCreateService';
import { formatCurrency, titleCase } from '../../utils/formatters';
import { VEHICLE_CLASSES } from '../../constants';

const DEFAULT_CITY_ID = 1; // Bengaluru; the fare quote may return a different operating city

const TRIP_TYPES = [
  { value: 'ONE_WAY',    label: 'One way' },
  { value: 'ROUND_TRIP', label: 'Round trip' },
  { value: 'AIRPORT',    label: 'Airport' },
  { value: 'HOURLY',     label: 'Rental' },
];
const PAYMENT_MODES = [
  { value: 'ZERO',    label: 'Pay on trip (cash / UPI to driver)' },
  { value: 'PARTIAL', label: 'Partial advance (payment link)' },
  { value: 'FULL',    label: 'Full payment now (payment link)' },
];
const RENTAL_HOURS = [2, 4, 6, 8, 10, 12].map((h) => ({ value: String(h), label: `${h} hours` }));

const pad = (n) => String(n).padStart(2, '0');
function defaultWhen() {
  // The next half hour that is at least 30 minutes away.
  const d = new Date(Date.now() + 30 * 60000);
  if (d.getMinutes() === 0 || d.getMinutes() === 30) d.setSeconds(0, 0);
  else d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

const EMPTY = () => ({
  tripType: 'ONE_WAY', pickup: '', drop: '', ...defaultWhen(), returnDate: '', rentalHours: '4',
  vehicleClass: '', paymentMode: 'ZERO', notes: '',
  otherTraveller: false, travellerName: '', travellerPhone: '', confirmNow: true,
  // Discount: 'NONE' | 'PROMO' (an existing promo code) | 'CUSTOM' (staff gives ₹ or % off)
  discountMode: 'NONE', promoCode: '', customType: 'FLAT', customValue: '', customReason: '',
});

const DISCOUNT_MODES = [
  { value: 'NONE',   label: 'No discount' },
  { value: 'PROMO',  label: 'Promo code' },
  { value: 'CUSTOM', label: 'Give discount' },
];

/**
 * A staff discount is issued as a ONE-USE promo code made for this booking
 * (POST /admin/discounts), then applied like any promo. That way the backend
 * prices it, stores it on the booking ("₹X less ₹Y"), records who gave it and
 * why in the audit log, and it can never be reused.
 */
function staffCode() {
  const bytes = new Uint8Array(4);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return `STAFF${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 7)}`;
}

const sectionTitle = { color: '#6B7280', letterSpacing: '0.04em' };
const realEmail = (e) => (e && !e.endsWith('.invalid') && !e.endsWith('placeholder.local') ? e : null);

function Segmented({ value, onChange, options }) {
  return (
    <div className="grid gap-1 p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))`, backgroundColor: '#F3F4F6' }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className="text-xs font-bold rounded-md py-2"
          style={{ backgroundColor: value === o.value ? '#FFC107' : 'transparent', color: '#111' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function BookingFormDrawer({ open, onClose, onCreated, initialCustomer = null }) {
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, val) => setV((p) => ({ ...p, [k]: val }));

  // ── Customer ───────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState(initialCustomer);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [newCust, setNewCust] = useState(null); // { name, phone, email } while adding
  const [newCustBusy, setNewCustBusy] = useState(false);
  const [newCustNote, setNewCustNote] = useState(null);

  useEffect(() => {
    if (!open) return;
    setV(EMPTY()); setErrors({}); setFailure(null); setQuery(''); setResults([]); setNewCust(null); setNewCustNote(null);
    setCustomer(initialCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || customer) return undefined;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        // Customers (search covers name, email and phone), plus customer
        // accounts with no profile yet — e.g. added here but never booked.
        const [c, u] = await Promise.all([
          apiClient.get('/admin/customers', { params: { search: q, limit: 8, page: 1 } }).catch(() => null),
          apiClient.get('/admin/users', { params: { search: q, role: 'USER', limit: 8 } }).catch(() => null),
        ]);
        const list = [];
        const seen = new Set();
        for (const r of (c?.data ?? c?.items ?? [])) {
          seen.add(r.userId);
          list.push({ userId: r.userId, name: r.user?.name, phone: r.user?.phone, email: r.user?.email });
        }
        for (const r of (u?.data ?? u?.items ?? [])) {
          if (seen.has(r.id)) continue;
          list.push({ userId: r.id, name: r.name, phone: r.phone, email: r.email });
        }
        setResults(list.slice(0, 10));
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, customer]);

  const addCustomer = async () => {
    if (!newCust) return;
    if ((newCust.name || '').trim().length < 2 || !indianMobile(newCust.phone)) {
      setNewCustNote({ type: 'error', text: 'Enter a name and a valid 10-digit mobile number.' });
      return;
    }
    setNewCustBusy(true); setNewCustNote(null);
    try {
      const c = await createCustomer(newCust);
      setCustomer(c);
      setNewCust(null);
      setNewCustNote(c.existed ? { type: 'info', text: `${c.name} already had an account, so that customer was selected.` } : null);
    } catch (e) {
      setNewCustNote({ type: 'error', text: e.message || 'Could not add the customer' });
    } finally { setNewCustBusy(false); }
  };

  // ── Vehicle classes + live fares ───────────────────────────────────────
  const [catalogue, setCatalogue] = useState(
    VEHICLE_CLASSES.map((c) => ({ value: c, label: titleCase(String(c).replace(/[-_]/g, ' ')) })),
  );
  useEffect(() => {
    if (!open) return;
    vehicleCatalogService.classOptions().then((opts) => {
      if (opts?.length) {
        setCatalogue(opts.filter((o) => o.isActive !== false).map((o) => ({
          value: o.value,
          label: o.label && o.label !== o.value ? o.label : titleCase(String(o.value).replace(/[-_]/g, ' ')),
        })));
      }
    }).catch(() => {});
  }, [open]);

  const hourly = v.tripType === 'HOURLY';
  const pickupAtIso = useMemo(() => {
    if (!v.date || !v.time) return null;
    const d = new Date(`${v.date}T${v.time}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [v.date, v.time]);

  const [fares, setFares] = useState({ status: 'idle', byClass: {}, cityId: null, km: null, error: null });
  const quoteReady = Boolean(v.pickup.trim().length >= 3 && (hourly || v.drop.trim().length >= 3) && pickupAtIso
    && (v.tripType !== 'ROUND_TRIP' || v.returnDate));
  useEffect(() => {
    if (!open || !quoteReady) { setFares((f) => ({ ...f, status: 'idle' })); return undefined; }
    const t = setTimeout(async () => {
      setFares((f) => ({ ...f, status: 'loading', error: null }));
      try {
        const res = await apiClient.post('/fares/options', {
          cityId: DEFAULT_CITY_ID,
          tripType: v.tripType,
          pickup: { address: v.pickup.trim() },
          ...(hourly ? { rentalHours: Number(v.rentalHours) } : { drop: { address: v.drop.trim() } }),
          pickupAt: pickupAtIso,
          ...(v.tripType === 'ROUND_TRIP' ? { returnAt: v.returnDate } : {}),
        });
        const byClass = {};
        for (const o of res?.options || []) byClass[o.vehicleClass] = Number(o.tax?.payable ?? o.payable ?? o.total) || null;
        setFares({ status: 'ready', byClass, cityId: res?.trip?.cityId || null, km: res?.trip?.totalKm ?? null, error: null });
      } catch (e) {
        setFares({ status: 'error', byClass: {}, cityId: null, km: null, error: e.message || 'Could not price this trip' });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [open, quoteReady, v.pickup, v.drop, v.tripType, v.returnDate, v.rentalHours, pickupAtIso, hourly]);

  const classes = useMemo(() => {
    const list = catalogue.map((c) => ({ ...c, price: fares.byClass[c.value] ?? null }));
    if (fares.status === 'ready') {
      // Classes not sold for this trip have no price; list them last.
      list.sort((a, b) => (a.price == null) - (b.price == null) || (a.price || 0) - (b.price || 0));
    }
    return list;
  }, [catalogue, fares]);

  // Once fares are in, classes not sold for this trip are tucked away.
  const [showAllClasses, setShowAllClasses] = useState(false);
  const priced = classes.filter((c) => c.price != null);
  const hiddenCount = fares.status === 'ready' && priced.length ? classes.length - priced.length : 0;
  const visibleClasses = hiddenCount && !showAllClasses ? priced : classes;

  // ── Discount ───────────────────────────────────────────────────────────
  const selectedPrice = fares.byClass[v.vehicleClass] ?? null;
  const [promoCheck, setPromoCheck] = useState(null); // { ok, amount, payable, reason, code }
  const [checkingPromo, setCheckingPromo] = useState(false);
  useEffect(() => { setPromoCheck(null); }, [v.promoCode, v.vehicleClass, selectedPrice, v.discountMode]);

  const checkPromo = async () => {
    const code = v.promoCode.trim().toUpperCase();
    if (code.length < 3) { setPromoCheck({ ok: false, reason: 'Enter the promo code' }); return; }
    if (selectedPrice == null) { setPromoCheck({ ok: false, reason: 'Fill the trip and choose a vehicle first, to see the discount.' }); return; }
    setCheckingPromo(true);
    try {
      const r = await apiClient.post('/discounts/check', { code, fareTotal: selectedPrice, tripType: v.tripType });
      setPromoCheck(r?.ok ? { ok: true, code, amount: Number(r.amount), payable: Number(r.payable) } : { ok: false, reason: r?.reason || 'That promo code is not valid' });
    } catch (e) {
      setPromoCheck({ ok: false, reason: e.message || 'Could not check the code' });
    } finally { setCheckingPromo(false); }
  };

  const customAmount = useMemo(() => {
    const val = Number(v.customValue);
    if (!val || val <= 0 || selectedPrice == null) return null;
    const amt = v.customType === 'PERCENT' ? (selectedPrice * Math.min(val, 100)) / 100 : Math.min(val, selectedPrice);
    return Math.round(amt * 100) / 100;
  }, [v.customValue, v.customType, selectedPrice]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!customer) e.customer = 'Choose a customer or add a new one';
    if (v.pickup.trim().length < 3) e.pickup = 'Enter the pickup address';
    if (!hourly && v.drop.trim().length < 3) e.drop = 'Enter the drop address';
    if (!pickupAtIso) e.when = 'Enter the pickup date and time';
    else if (new Date(pickupAtIso).getTime() < Date.now() - 5 * 60000) e.when = 'Pickup time is in the past';
    if (v.tripType === 'ROUND_TRIP') {
      if (!v.returnDate) e.returnDate = 'Return date is required for a round trip';
      else if (v.returnDate < v.date) e.returnDate = 'Return date cannot be before the pickup date';
    }
    if (!v.vehicleClass) e.vehicleClass = 'Choose a vehicle';
    if (v.discountMode === 'PROMO' && v.promoCode.trim().length < 3) e.promoCode = 'Enter the promo code';
    if (v.discountMode === 'CUSTOM') {
      const val = Number(v.customValue);
      if (!val || val <= 0) e.customValue = 'Enter the discount';
      else if (v.customType === 'PERCENT' && val > 100) e.customValue = 'Cannot be more than 100%';
      else if (v.customType === 'FLAT' && selectedPrice != null && val >= selectedPrice) e.customValue = 'Must be less than the fare';
      if (v.customReason.trim().length < 3) e.customReason = 'Say why (e.g. regular customer, complaint)';
    }
    if (v.otherTraveller) {
      if (v.travellerName.trim().length < 2) e.travellerName = 'Enter the traveller’s name';
      if (!indianMobile(v.travellerPhone)) e.travellerPhone = 'Enter a valid 10-digit mobile number';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true); setFailure(null);
    const payload = {
      customerId: customer.userId,
      cityId: fares.cityId || DEFAULT_CITY_ID,
      vehicleClass: v.vehicleClass,
      tripType: v.tripType,
      pickup: { address: v.pickup.trim() },
      ...(hourly ? { rentalHours: Number(v.rentalHours) } : { drop: { address: v.drop.trim() } }),
      pickupAt: pickupAtIso,
      ...(v.tripType === 'ROUND_TRIP' ? { returnAt: v.returnDate } : {}),
      scheduled: true,
      paymentMode: v.paymentMode,
      ...(v.notes.trim() ? { specialRequests: v.notes.trim() } : {}),
      ...(v.otherTraveller ? { guestName: v.travellerName.trim(), guestPhone: indianMobile(v.travellerPhone) } : {}),
    };
    let staffDiscountId = null;
    try {
      if (v.discountMode === 'PROMO') payload.promoCode = v.promoCode.trim().toUpperCase();
      if (v.discountMode === 'CUSTOM') {
        const code = staffCode();
        let created;
        try {
          created = await apiClient.post('/admin/discounts', {
            code,
            description: `Staff discount for ${customer.name || 'customer'}: ${v.customReason.trim()}`.slice(0, 200),
            type: v.customType,
            value: Number(v.customValue),
            maxUses: 1,
            maxUsesPerCustomer: 1,
            appliesTo: 'ALL_BOOKINGS',
            expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
            isActive: true,
          });
        } catch (err) {
          if (err?.status === 403) throw new Error('Your login cannot give discounts. Ask an admin, or use a promo code.');
          throw err;
        }
        staffDiscountId = created?.discount?.id ?? created?.id ?? null;
        payload.promoCode = code;
      }
      const res = await bookingService.create(payload);
      const booking = res?.booking || res;
      staffDiscountId = null; // used by the booking; keep it as the record
      let confirmed = false;
      if (v.confirmNow && booking?.id) {
        try {
          await apiClient.patch(`/admin/bookings/${booking.id}/confirm`, { note: 'Booked by staff from the ERP' });
          confirmed = true;
        } catch { /* created; it can still be confirmed from the list */ }
      }
      const discount = booking?.fareBasis?.discount?.amount ?? (v.discountMode === 'CUSTOM' ? customAmount : promoCheck?.amount) ?? null;
      onCreated?.(booking, { confirmed, discount: v.discountMode !== 'NONE' ? discount : null });
      onClose();
    } catch (e) {
      // The booking failed: retire the one-use code so it can't be used later.
      if (staffDiscountId) apiClient.delete(`/admin/discounts/${staffDiscountId}`).catch(() => {});
      setFailure(e.message || 'Could not create the booking');
    } finally { setSaving(false); }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New booking"
      footer={<>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} loading={saving}>Create booking</Button>
      </>}
    >
      {failure && <Alert type="error" className="mb-4">{failure}</Alert>}
      <div className="space-y-5">
        {/* Customer */}
        <section>
          <p className="text-xs font-bold uppercase mb-2" style={sectionTitle}>Customer</p>
          {customer ? (
            <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#FFF8E1', border: '1px solid #FFE082' }}>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: '#111' }}>{customer.name || 'Customer'}</p>
                <p className="text-xs" style={{ color: '#6B7280' }}>{customer.phone || realEmail(customer.email) || ''}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setNewCustNote(null); }} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: '#111' }}>
                <X size={13} aria-hidden="true" /> Change
              </button>
            </div>
          ) : newCust ? (
            <div className="space-y-2 rounded-lg p-3" style={{ backgroundColor: '#F9F9F7', border: '1px solid #EEEEEA' }}>
              <p className="text-sm font-bold" style={{ color: '#111' }}>New customer</p>
              <Input value={newCust.name} onChange={(e) => setNewCust((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" />
              <Input value={newCust.phone} onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))} placeholder="Mobile number (10 digits)" inputMode="tel" />
              <Input value={newCust.email} onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))} placeholder="Email (optional)" type="email" />
              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="secondary" onClick={() => { setNewCust(null); setNewCustNote(null); }}>Back to search</Button>
                <Button size="sm" loading={newCustBusy} onClick={addCustomer}>Add customer</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg border px-3" style={{ borderColor: errors.customer ? '#DC2626' : '#E5E7EB', height: 40 }}>
                <Search size={15} style={{ color: '#9CA3AF' }} aria-hidden="true" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, mobile or email"
                  aria-label="Search customers" className="flex-1 outline-none text-sm" style={{ background: 'transparent', minWidth: 0 }} />
              </div>
              {query.trim().length >= 2 && (
                <div className="mt-1 rounded-lg border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                  {searching && <p className="px-3 py-2 text-xs" style={{ color: '#9CA3AF' }}>Searching…</p>}
                  {!searching && results.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: '#9CA3AF' }}>No customer found. Add them as a new customer.</p>}
                  {results.map((r, i) => (
                    <button key={r.userId} type="button" onClick={() => { setCustomer(r); setQuery(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50" style={{ borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
                      <span className="block text-sm font-semibold" style={{ color: '#111' }}>{r.name || 'Unnamed'}</span>
                      <span className="block text-xs" style={{ color: '#6B7280' }}>{[r.phone, realEmail(r.email)].filter(Boolean).join(', ')}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setNewCust({ name: '', phone: /^\d{6,}$/.test(query.trim()) ? query.trim() : '', email: '' })}
                className="mt-2 text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                <UserPlus size={15} aria-hidden="true" /> New customer
              </button>
            </>
          )}
          {errors.customer && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{errors.customer}</p>}
          {newCustNote && <Alert type={newCustNote.type === 'error' ? 'error' : 'info'} className="mt-2">{newCustNote.text}</Alert>}

          <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: '#111', cursor: 'pointer' }}>
            <input type="checkbox" checked={v.otherTraveller} onChange={(e) => set('otherTraveller', e.target.checked)} />
            <Users size={14} aria-hidden="true" /> Someone else is travelling
          </label>
          {v.otherTraveller && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <FormField label="Traveller name" required error={errors.travellerName}>
                <Input value={v.travellerName} onChange={(e) => set('travellerName', e.target.value)} />
              </FormField>
              <FormField label="Traveller mobile" required error={errors.travellerPhone}>
                <Input value={v.travellerPhone} onChange={(e) => set('travellerPhone', e.target.value)} inputMode="tel" />
              </FormField>
            </div>
          )}
        </section>

        {/* Trip */}
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase" style={sectionTitle}>Trip</p>
          <Segmented value={v.tripType} onChange={(t) => set('tripType', t)} options={TRIP_TYPES} />
          <FormField label="Pickup" required error={errors.pickup}>
            <PlaceInput value={v.pickup} onChange={(x) => set('pickup', x)} placeholder="Search pickup address" invalid={!!errors.pickup} />
          </FormField>
          {hourly ? (
            <FormField label="Rental duration" hint="The car stays with the customer; no fixed drop.">
              <Select value={v.rentalHours} onChange={(e) => set('rentalHours', e.target.value)} options={RENTAL_HOURS} searchable={false} />
            </FormField>
          ) : (
            <FormField label={v.tripType === 'AIRPORT' ? 'Drop (airport or address)' : 'Drop'} required error={errors.drop}>
              <PlaceInput value={v.drop} onChange={(x) => set('drop', x)}
                placeholder={v.tripType === 'AIRPORT' ? 'e.g. Kempegowda International Airport' : 'Search drop address'} invalid={!!errors.drop} />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pickup date" required error={errors.when}>
              <Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} />
            </FormField>
            <FormField label="Pickup time" required>
              <Input type="time" value={v.time} onChange={(e) => set('time', e.target.value)} />
            </FormField>
          </div>
          {v.tripType === 'ROUND_TRIP' && (
            <FormField label="Return date" required error={errors.returnDate} hint="Date only; the fare counts calendar days.">
              <Input type="date" min={v.date || undefined} value={v.returnDate} onChange={(e) => set('returnDate', e.target.value)} />
            </FormField>
          )}
        </section>

        {/* Vehicle */}
        <section>
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-xs font-bold uppercase" style={sectionTitle}>Vehicle</p>
            <span className="text-xs text-right" style={{ color: '#6B7280' }}>
              {fares.status === 'loading' ? 'Getting fares…'
                : fares.status === 'ready' && fares.km ? `${Math.round(fares.km)} km`
                : !quoteReady ? 'Fares appear once pickup, drop and time are filled' : ''}
            </span>
          </div>
          {fares.status === 'error' && <Alert type="warning" className="mb-2">{fares.error}</Alert>}
          <div className="grid grid-cols-2 gap-2">
            {visibleClasses.map((c) => {
              const on = v.vehicleClass === c.value;
              const unavailable = fares.status === 'ready' && c.price == null;
              return (
                <button key={c.value} type="button" onClick={() => set('vehicleClass', c.value)} aria-pressed={on}
                  className="text-left rounded-lg border px-3 py-2.5"
                  style={{
                    borderColor: on ? '#111' : errors.vehicleClass ? '#FCA5A5' : '#E5E7EB',
                    backgroundColor: on ? '#FFF8E1' : '#fff', boxShadow: on ? 'inset 0 0 0 1px #111' : 'none',
                    opacity: unavailable ? 0.55 : 1,
                  }}>
                  <span className="block text-sm font-bold" style={{ color: '#111' }}>{c.label}</span>
                  <span className="block text-xs mt-0.5" style={{ color: unavailable ? '#9CA3AF' : '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    {c.price != null ? formatCurrency(c.price) : unavailable ? 'Not offered for this trip' : ' '}
                  </span>
                </button>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setShowAllClasses((x) => !x)} className="mt-2 text-xs font-semibold" style={{ color: '#2563EB' }}>
              {showAllClasses ? 'Hide vehicles not offered for this trip' : `Show ${hiddenCount} more (not offered for this trip)`}
            </button>
          )}
          {errors.vehicleClass && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{errors.vehicleClass}</p>}
        </section>

        {/* Discount */}
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase flex items-center gap-1.5" style={sectionTitle}>
            <BadgePercent size={14} aria-hidden="true" /> Discount
          </p>
          <Segmented value={v.discountMode} onChange={(m) => set('discountMode', m)} options={DISCOUNT_MODES} />

          {v.discountMode === 'PROMO' && (
            <div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input value={v.promoCode} onChange={(e) => set('promoCode', e.target.value.toUpperCase())} placeholder="Promo code, e.g. WELCOME100" />
                </div>
                <Button size="sm" variant="secondary" loading={checkingPromo} onClick={checkPromo}>Check</Button>
              </div>
              {errors.promoCode && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{errors.promoCode}</p>}
              {promoCheck && (
                <p className="text-xs mt-1.5 font-semibold" style={{ color: promoCheck.ok ? '#15803D' : '#B91C1C' }}>
                  {promoCheck.ok
                    ? `${formatCurrency(promoCheck.amount)} off. Customer pays ${formatCurrency(promoCheck.payable)}.`
                    : promoCheck.reason}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>The code is checked again for this customer when the booking is created.</p>
            </div>
          )}

          {v.discountMode === 'CUSTOM' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#E5E7EB' }}>
                  {[['FLAT', '₹ off'], ['PERCENT', '% off']].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => set('customType', k)} aria-pressed={v.customType === k}
                      className="px-3 text-xs font-bold" style={{ backgroundColor: v.customType === k ? '#111' : '#fff', color: v.customType === k ? '#fff' : '#111', height: 40 }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1">
                  <Input value={v.customValue} onChange={(e) => set('customValue', e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder={v.customType === 'PERCENT' ? 'e.g. 10' : 'e.g. 200'} inputMode="decimal" />
                </div>
              </div>
              {errors.customValue && <p className="text-xs" style={{ color: '#DC2626' }}>{errors.customValue}</p>}
              <FormField label="Reason" required error={errors.customReason} hint="Saved with the booking for the record.">
                <Input value={v.customReason} onChange={(e) => set('customReason', e.target.value)} placeholder="e.g. Regular customer, service complaint" />
              </FormField>
              {customAmount != null && (
                <p className="text-xs font-semibold" style={{ color: '#15803D' }}>
                  {formatCurrency(customAmount)} off. Customer pays about {formatCurrency(selectedPrice - customAmount)}.
                </p>
              )}
              {selectedPrice == null && <p className="text-xs" style={{ color: '#9CA3AF' }}>Choose a vehicle to see the discounted fare.</p>}
            </div>
          )}
        </section>

        {/* Payment & notes */}
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase" style={sectionTitle}>Payment &amp; notes</p>
          <FormField label="Payment">
            <Select value={v.paymentMode} onChange={(e) => set('paymentMode', e.target.value)} options={PAYMENT_MODES} searchable={false} />
          </FormField>
          <FormField label="Notes for the driver / team" hint="Optional: luggage, child seat, landmark…">
            <Textarea rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
          </FormField>
          <label className="flex items-start gap-2 text-sm" style={{ color: '#111', cursor: 'pointer' }}>
            <input type="checkbox" className="mt-1" checked={v.confirmNow} onChange={(e) => set('confirmNow', e.target.checked)} />
            <span>
              <strong>Confirm the booking now</strong>
              <span className="block text-xs" style={{ color: '#6B7280' }}>Untick to leave it Pending for someone to confirm later.</span>
            </span>
          </label>
        </section>
      </div>
    </Drawer>
  );
}
