/**
 * src/pages/admin/SurgePricing.jsx
 *
 * Surge pricing admin — uses existing backend routes only:
 *   GET    /admin/surge/rules
 *   PATCH  /admin/surge/rules/:tier
 *   GET    /admin/surge/areas
 *   POST   /admin/surge/areas
 *   PATCH  /admin/surge/areas/:id
 *   DELETE /admin/surge/areas/:id
 *   GET    /admin/surge/areas/classify?lat=&lng=
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, ToggleRight, MapPin, Zap, Clock, Search, Save,
} from 'lucide-react';
import PageHeader   from '../../components/ui/PageHeader';
import Button       from '../../components/ui/Button';
import IconButton   from '../../components/ui/IconButton';
import Badge        from '../../components/ui/Badge';
import Modal        from '../../components/ui/Modal';
import FormField    from '../../components/ui/FormField';
import Input        from '../../components/ui/Input';
import Select       from '../../components/ui/Select';
import Textarea     from '../../components/ui/Textarea';
import Alert        from '../../components/ui/Alert';
import LoadingState from '../../components/ui/LoadingState';
import SearchInput  from '../../components/ui/SearchInput';
import { useToast } from '../../hooks/useToast';
import { surgeService } from '../../services/surgeService';

const TIERS = ['METRO', 'DISTRICT', 'TALUKA', 'VILLAGE'];

const TIER_META = {
  METRO:    { icon: '🏙️', label: 'Metro', desc: 'City / urban — drivers nearby', bg: '#EFF6FF', color: '#1D4ED8', tone: 'blue' },
  DISTRICT: { icon: '🏢', label: 'District', desc: 'District HQ with fleet presence', bg: '#F5F3FF', color: '#6D28D9', tone: 'purple' },
  TALUKA:   { icon: '🏘️', label: 'Taluka', desc: 'Town / semi-urban — moderate supply', bg: '#FFF7ED', color: '#C2410C', tone: 'amber' },
  VILLAGE:  { icon: '🌾', label: 'Village', desc: 'Rural — limited driver supply', bg: '#F0FDF4', color: '#15803D', tone: 'green' },
};

const TIER_OPTIONS = TIERS.map((t) => ({ value: t, label: `${TIER_META[t].icon} ${TIER_META[t].label} — ${TIER_META[t].desc}` }));

// ── Surge Fee Setup (PATCH /rules/:tier only — rules must be seeded) ──────

function SurgeFeeSetup({ rules, onSave }) {
  const ruleMap = {};
  rules.forEach((r) => { ruleMap[r.tier] = r; });

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(null);
  const [dirty, setDirty] = useState({});

  // Rebuild form when rules change (initial load / after save)
  useEffect(() => {
    const f = {};
    rules.forEach((r) => {
      f[r.tier] = {
        immediatePct: String(r.immediatePct),
        standardPct: String(r.standardPct),
        immediateWithinMinutes: String(r.immediateWithinMinutes),
      };
    });
    setForm(f);
    setDirty({});
  }, [rules]);

  const set = (tier, key, val) => {
    setForm((f) => ({ ...f, [tier]: { ...f[tier], [key]: val } }));
    setDirty((d) => ({ ...d, [tier]: true }));
  };

  const save = async (tier) => {
    setSaving(tier);
    try {
      await onSave(tier, {
        immediatePct: Number(form[tier].immediatePct) || 0,
        standardPct: Number(form[tier].standardPct) || 0,
        immediateWithinMinutes: Number(form[tier].immediateWithinMinutes) || 60,
      });
      setDirty((d) => ({ ...d, [tier]: false }));
    } finally { setSaving(null); }
  };

  if (rules.length === 0) {
    return (
      <Alert type="info">
        No surge rules found. Seed the database with METRO, DISTRICT, TALUKA, and VILLAGE rules to configure surge fees here.
      </Alert>
    );
  }

  return (
    <div style={{
      borderRadius: 16, border: '1.5px solid #E8E8E4', backgroundColor: '#fff',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1.5px solid #F0F0EC',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'linear-gradient(135deg, #FFFBEA 0%, #FFF8E1 100%)',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: '#FFC107', display: 'grid', placeItems: 'center',
          boxShadow: '0 4px 12px rgba(255,193,7,0.3)',
        }}>
          <Zap size={18} color="#111" />
        </div>
        <div>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#111' }}>Surge Fee Setup</p>
          <p style={{ fontSize: 12.5, color: '#92400E', fontWeight: 500 }}>
            Set the surge percentage for each area tier. Changes apply to new quotes only.
          </p>
        </div>
      </div>

      {/* Tier rows — only tiers that have rules */}
      <div>
        {rules.map((rule, i) => {
          const tier = rule.tier;
          const m = TIER_META[tier] || TIER_META.METRO;
          const f = form[tier];
          if (!f) return null;

          return (
            <div
              key={tier}
              style={{
                padding: '16px 20px',
                borderBottom: i < rules.length - 1 ? '1px solid #F0F0EC' : 'none',
                display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
              }}
            >
              {/* Tier info */}
              <div style={{ minWidth: 160, flex: '0 0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 14, color: m.color }}>{m.label}</p>
                    <p style={{ fontSize: 11.5, color: '#6B7280', fontWeight: 500 }}>{m.desc}</p>
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div style={{ display: 'flex', gap: 10, flex: 1, alignItems: 'flex-end', flexWrap: 'wrap', minWidth: 300 }}>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                    <Clock size={10} className="inline -mt-0.5 mr-0.5" /> Immediate %
                  </label>
                  <Input type="number" min="0" max="100" value={f.immediatePct}
                    onChange={(e) => set(tier, 'immediatePct', e.target.value)}
                    style={{ textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                    <Zap size={10} className="inline -mt-0.5 mr-0.5" /> Scheduled %
                  </label>
                  <Input type="number" min="0" max="100" value={f.standardPct}
                    onChange={(e) => set(tier, 'standardPct', e.target.value)}
                    style={{ textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4 }}>
                    Window (min)
                  </label>
                  <Input type="number" min="1" max="1440" value={f.immediateWithinMinutes}
                    onChange={(e) => set(tier, 'immediateWithinMinutes', e.target.value)}
                    style={{ textAlign: 'center' }} />
                </div>
                <Button
                  size="sm" icon={Save}
                  onClick={() => save(tier)}
                  loading={saving === tier}
                  disabled={!dirty[tier]}
                  style={!dirty[tier] ? {} : { backgroundColor: '#22A65A', boxShadow: '0 3px 8px rgba(34,166,90,0.25)' }}
                >
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Explainer */}
      <div style={{
        padding: '12px 20px', backgroundColor: '#FAFAFA',
        borderTop: '1px solid #F0F0EC', fontSize: 12, color: '#6B7280',
      }}>
        <strong>Immediate %</strong> is added when the booking is within the window of pickup.
        <strong> Scheduled %</strong> is added to all bookings regardless of timing.
        The higher of the two applies.
      </div>
    </div>
  );
}

// ── Karnataka Districts with approximate centres ───────────────────────────

const KARNATAKA_DISTRICTS = [
  { name: 'Bengaluru Urban',  lat: 12.9716, lng: 77.5946, radius: 30 },
  { name: 'Bengaluru Rural',  lat: 13.1318, lng: 77.3960, radius: 35 },
  { name: 'Mysuru',           lat: 12.2958, lng: 76.6394, radius: 30 },
  { name: 'Mangaluru (DK)',   lat: 12.9141, lng: 74.8560, radius: 30 },
  { name: 'Hubli-Dharwad',    lat: 15.3647, lng: 75.1240, radius: 25 },
  { name: 'Belagavi',         lat: 15.8497, lng: 74.4977, radius: 35 },
  { name: 'Kalaburagi',       lat: 17.3297, lng: 76.8343, radius: 35 },
  { name: 'Tumakuru',         lat: 13.3379, lng: 77.1173, radius: 30 },
  { name: 'Ramanagara',       lat: 12.7159, lng: 77.2810, radius: 25 },
  { name: 'Mandya',           lat: 12.5218, lng: 76.8951, radius: 25 },
  { name: 'Hassan',           lat: 13.0068, lng: 76.1004, radius: 30 },
  { name: 'Chikkamagaluru',   lat: 13.3161, lng: 75.7720, radius: 30 },
  { name: 'Shivamogga',       lat: 13.9299, lng: 75.5681, radius: 30 },
  { name: 'Davangere',        lat: 14.4644, lng: 75.9218, radius: 25 },
  { name: 'Chitradurga',      lat: 14.2226, lng: 76.3984, radius: 30 },
  { name: 'Ballari',          lat: 15.1394, lng: 76.9214, radius: 30 },
  { name: 'Raichur',          lat: 16.2120, lng: 77.3439, radius: 30 },
  { name: 'Bidar',            lat: 17.9104, lng: 77.5199, radius: 30 },
  { name: 'Vijayapura',       lat: 16.8302, lng: 75.7100, radius: 30 },
  { name: 'Bagalkot',         lat: 16.1691, lng: 75.6615, radius: 25 },
  { name: 'Gadag',            lat: 15.4166, lng: 75.6263, radius: 20 },
  { name: 'Haveri',           lat: 14.7951, lng: 75.3989, radius: 25 },
  { name: 'Uttara Kannada',   lat: 14.6681, lng: 74.6899, radius: 40 },
  { name: 'Udupi',            lat: 13.3389, lng: 74.7421, radius: 25 },
  { name: 'Kodagu (Coorg)',   lat: 12.4244, lng: 75.7382, radius: 25 },
  { name: 'Chamarajanagar',   lat: 11.9261, lng: 76.9437, radius: 25 },
  { name: 'Kolar',            lat: 13.1360, lng: 78.1292, radius: 25 },
  { name: 'Chikkaballapur',   lat: 13.4355, lng: 77.7315, radius: 25 },
  { name: 'Yadgir',           lat: 16.7700, lng: 77.1383, radius: 25 },
  { name: 'Koppal',           lat: 15.3547, lng: 76.1546, radius: 25 },
].sort((a, b) => a.name.localeCompare(b.name));

const DISTRICT_OPTIONS = KARNATAKA_DISTRICTS.map((d) => ({ value: d.name, label: d.name }));

// ── Area Form Modal ────────────────────────────────────────────────────────

function AreaFormModal({ open, onClose, initial, onSubmit }) {
  const isEdit = !!initial;
  const [mode, setMode] = useState('district'); // 'district' or 'custom'
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [form, setForm] = useState({
    name: '', tier: 'TALUKA', centreLat: '', centreLng: '', radiusKm: '25', note: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && initial) {
      setMode('custom');
      setSelectedDistrict('');
      setForm({
        name: initial.name || '', tier: initial.tier || 'TALUKA',
        centreLat: String(initial.centreLat ?? ''), centreLng: String(initial.centreLng ?? ''),
        radiusKm: String(initial.radiusKm ?? 25), note: initial.note || '',
      });
    } else if (open) {
      setMode('district');
      setSelectedDistrict('');
      setForm({ name: '', tier: 'TALUKA', centreLat: '', centreLng: '', radiusKm: '25', note: '' });
    }
    setErrors({});
  }, [open, initial]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const handleDistrictSelect = (districtName) => {
    setSelectedDistrict(districtName);
    const d = KARNATAKA_DISTRICTS.find((x) => x.name === districtName);
    if (d) {
      setForm((f) => ({
        ...f,
        name: d.name,
        centreLat: String(d.lat),
        centreLng: String(d.lng),
        radiusKm: String(d.radius),
      }));
      setErrors({});
    }
  };

  const submit = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.centreLat === '' || isNaN(Number(form.centreLat))) errs.centreLat = 'Required';
    if (form.centreLng === '' || isNaN(Number(form.centreLng))) errs.centreLng = 'Required';
    if (!form.radiusKm || Number(form.radiusKm) < 1) errs.radiusKm = 'Min 1 km';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await onSubmit({
        name: form.name.trim(), tier: form.tier,
        centreLat: Number(form.centreLat), centreLng: Number(form.centreLng),
        radiusKm: Number(form.radiusKm),
        ...(form.note.trim() && { note: form.note.trim() }),
      });
      onClose();
    } catch (err) { setErrors({ name: err.message || 'Failed to save' }); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Area' : 'Add Surge Area'} maxWidth={520}>
      <div className="space-y-4">

        {/* Mode toggle — only on create */}
        {!isEdit && (
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, backgroundColor: '#F3F4F6' }}>
            {[
              { key: 'district', label: '📍 Pick District', desc: 'Select from Karnataka districts' },
              { key: 'custom',   label: '🗺️ Custom Area',   desc: 'Enter lat/lng manually' },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); setSelectedDistrict(''); setForm((f) => ({ ...f, name: '', centreLat: '', centreLng: '', radiusKm: '25' })); }}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                  backgroundColor: mode === m.key ? '#fff' : 'transparent',
                  boxShadow: mode === m.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: mode === m.key ? '#111' : '#6B7280', margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 11, color: '#9A9A9A', margin: '2px 0 0', fontWeight: 500 }}>{m.desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* District picker */}
        {mode === 'district' && !isEdit && (
          <FormField label="District" required error={errors.name}>
            <Select
              value={selectedDistrict}
              onChange={(e) => handleDistrictSelect(e.target.value)}
              options={DISTRICT_OPTIONS}
              placeholder="Select a district…"
              searchable
            />
          </FormField>
        )}

        {/* Custom name input — only for custom mode or edit */}
        {(mode === 'custom' || isEdit) && (
          <FormField label="Area name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Whitefield Tech Park" disabled={isEdit} />
          </FormField>
        )}

        {/* Tier */}
        <FormField label="Tier" required>
          <Select value={form.tier} onChange={(e) => set('tier', e.target.value)} options={TIER_OPTIONS} />
        </FormField>

        {/* Coordinates — shown for both modes, editable */}
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Latitude" required error={errors.centreLat}>
            <Input type="number" step="any" value={form.centreLat}
              onChange={(e) => set('centreLat', e.target.value)} placeholder="12.9716" />
          </FormField>
          <FormField label="Longitude" required error={errors.centreLng}>
            <Input type="number" step="any" value={form.centreLng}
              onChange={(e) => set('centreLng', e.target.value)} placeholder="77.5946" />
          </FormField>
          <FormField label="Radius (km)" required error={errors.radiusKm}>
            <Input type="number" min="1" max="200" value={form.radiusKm}
              onChange={(e) => set('radiusKm', e.target.value)} placeholder="25" />
          </FormField>
        </div>

        {/* Auto-filled info for district mode */}
        {mode === 'district' && selectedDistrict && (
          <div style={{
            padding: '8px 12px', borderRadius: 10, backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0', fontSize: 12, color: '#15803D',
          }}>
            📍 <strong>{selectedDistrict}</strong> — centre at {form.centreLat}, {form.centreLng} with {form.radiusKm} km radius. Adjust if needed.
          </div>
        )}

        <FormField label="Note" hint="Internal — why this area, who requested it.">
          <Textarea value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} />
        </FormField>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={submit}>{isEdit ? 'Save Changes' : 'Add Area'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Classify Tester ────────────────────────────────────────────────────────

function ClassifyTester() {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const test = async () => {
    if (!lat || !lng) return;
    setLoading(true);
    try { setResult(await surgeService.classify(Number(lat), Number(lng))); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const m = result ? (TIER_META[result.tier] || TIER_META.METRO) : null;

  return (
    <div style={{ borderRadius: 14, border: '1.5px solid #E8E8E4', padding: 16, backgroundColor: '#FAFAFA' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
        <Search size={12} className="inline -mt-0.5 mr-1" /> Test a Coordinate
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <div style={{ flex: 1, minWidth: 100 }}>
          <Input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <Input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" />
        </div>
        <Button size="sm" onClick={test} loading={loading}>Classify</Button>
      </div>
      {result && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, backgroundColor: m.bg, border: `1px solid ${m.color}22` }}>
          <p style={{ fontWeight: 700, fontSize: 13.5, color: m.color }}>
            {m.icon} {result.tier}{result.matched && result.area ? ` — ${result.area.name}` : ' — no area matched (fallback)'}
          </p>
          {result.area && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{result.area.distanceKm} km from centre</p>}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function SurgePricing() {
  const toast = useToast();
  const [rules, setRules] = useState([]);
  const [areas, setAreas] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [rulesRes, areasRes] = await Promise.all([surgeService.listRules(), surgeService.listAreas()]);
      setRules(rulesRes.rules || []);
      setAreas(areasRes.areas || []);
      setStatus('success');
    } catch (e) { toast.error(e.message || 'Failed to load'); setStatus('error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // PATCH /rules/:tier
  const handleSaveRule = async (tier, body) => {
    await surgeService.updateRule(tier, body);
    toast.success(`${tier} surge updated — applies to new quotes`);
    load();
  };

  // POST /areas
  const handleCreateArea = async (body) => { await surgeService.createArea(body); toast.success(`${body.name} added`); load(); };
  // PATCH /areas/:id
  const handleUpdateArea = async (body) => { await surgeService.updateArea(editingArea.id, body); toast.success('Area updated'); setEditingArea(null); load(); };
  // DELETE /areas/:id
  const handleDeactivateArea = async (area) => {
    if (!confirm(`Retire "${area.name}"?`)) return;
    await surgeService.deactivateArea(area.id); toast.success(`${area.name} retired`); load();
  };
  // PATCH /areas/:id { isActive: true }
  const handleReactivateArea = async (area) => {
    await surgeService.updateArea(area.id, { isActive: true }); toast.success(`${area.name} reactivated`); load();
  };

  const q = search.toLowerCase();
  const filteredAreas = areas.filter((a) => !q || a.name.toLowerCase().includes(q) || a.tier.toLowerCase().includes(q));

  if (status === 'loading') return <LoadingState label="Loading surge pricing…" />;

  return (
    <div>
      <PageHeader
        title="Surge Pricing"
        description="Configure surge fees per tier and define which areas fall under each tier."
        actions={<Button icon={Plus} onClick={() => { setEditingArea(null); setFormOpen(true); }}>Add Area</Button>}
      />

      {/* 1. Surge Fee Setup */}
      <div style={{ marginBottom: 24 }}>
        <SurgeFeeSetup rules={rules} onSave={handleSaveRule} />
      </div>

      {/* 2. Classify tester */}
      <div style={{ marginBottom: 24 }}>
        <ClassifyTester />
      </div>

      {/* 3. Service Areas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B7280' }}>
            <MapPin size={12} className="inline -mt-0.5 mr-1" /> Service Areas ({areas.length})
          </p>
          <SearchInput value={search} onChange={setSearch} placeholder="Search areas…" style={{ maxWidth: 220 }} />
        </div>

        {filteredAreas.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', borderRadius: 14, border: '1.5px dashed #E8E8E4', backgroundColor: '#FAFAFA' }}>
            <MapPin size={32} className="mx-auto mb-2" style={{ color: '#D1D5DB' }} />
            <p style={{ fontWeight: 700, fontSize: 14, color: '#6B7280' }}>
              {search ? 'No areas match' : 'No surge areas yet'}
            </p>
            <p style={{ fontSize: 12.5, color: '#9A9A9A', marginTop: 4 }}>
              Add areas to map locations to tiers for location-based surge pricing.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAreas.map((area) => {
              const m = TIER_META[area.tier] || TIER_META.METRO;
              return (
                <div key={area.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 14,
                  border: '1.5px solid #E8E8E4', backgroundColor: '#fff',
                  opacity: area.isActive ? 1 : 0.55,
                }}>
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>
                      {area.name}
                      {!area.isActive && <Badge tone="slate" className="ml-2">Retired</Badge>}
                    </p>
                    <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                      <Badge tone={m.tone} className="mr-2">{area.tier}</Badge>
                      {area.centreLat.toFixed(4)}, {area.centreLng.toFixed(4)} · {area.radiusKm} km
                      {area.note && <span style={{ color: '#9A9A9A' }}> — {area.note}</span>}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <IconButton icon={Pencil} size="sm" label="Edit"
                      onClick={() => { setEditingArea(area); setFormOpen(true); }} />
                    {area.isActive
                      ? <IconButton icon={Trash2} size="sm" label="Retire" variant="danger" onClick={() => handleDeactivateArea(area)} />
                      : <IconButton icon={ToggleRight} size="sm" label="Reactivate" onClick={() => handleReactivateArea(area)} />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AreaFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingArea(null); }}
        initial={editingArea}
        onSubmit={editingArea ? handleUpdateArea : handleCreateArea}
      />
    </div>
  );
}
