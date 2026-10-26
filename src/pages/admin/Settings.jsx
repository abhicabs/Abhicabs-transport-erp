import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Key, Bell, Building2, Shield, Trophy, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PageTabs from '../../components/ui/PageTabs';
import Card       from '../../components/ui/Card';
import FormField  from '../../components/ui/FormField';
import Input      from '../../components/ui/Input';
import Button     from '../../components/ui/Button';
import Alert      from '../../components/ui/Alert';
import Badge      from '../../components/ui/Badge';
import { useToast } from '../../hooks/useToast';
import { APP_NAME } from '../../constants';
import { authService } from '../../services';
import { apiClient } from '../../services/apiClient';
import { getTiers, saveTiers } from '../../lib/loyaltyTiers';

const TABS = [
  { key: 'company',       label: 'Company',       icon: Building2 },
  { key: 'loyalty',       label: 'Loyalty Tiers',  icon: Trophy    },
  { key: 'notifications', label: 'Notifications', icon: Bell      },
  { key: 'security',      label: 'Security',      icon: Shield    },
  { key: 'api',           label: 'API Keys',      icon: Key       },
];

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative" onClick={() => onChange(!checked)}>
        <div className="w-10 h-5 rounded-full transition-colors"
          style={{ backgroundColor: checked ? '#FFC107' : '#E8E8E4' }} />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
      <span className="text-sm font-medium" style={{ color: '#111111' }}>{label}</span>
    </label>
  );
}

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState('company');
  const [showKey, setShowKey] = useState(false);

  const [company, setCompany] = useState({
    name: APP_NAME, supportEmail: 'ops@abhicabs.in',
    phone: '+91 98765 43210', address: 'Bengaluru, Karnataka, India',
    gstin: '', pan: '', cin: '',
  });

  const [notifs, setNotifs] = useState({
    emailOnNewBooking: true, emailOnCancellation: true,
    smsOnDriverAssign: true, whatsappOnConfirm: true,
    pushOnNewBooking: false,
  });

  const [security, setSecurity] = useState({
    current: '', newPass: '', confirm: '',
  });
  const [changingPass, setChangingPass] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    apiClient.get('/admin/settings/company').then((res) => {
      const data = res?.data ?? res;
      if (data && typeof data === 'object') setCompany((prev) => ({ ...prev, ...data }));
    }).catch(() => {});
    apiClient.get('/admin/settings/notifications').then((res) => {
      const data = res?.data ?? res;
      if (data && typeof data === 'object') setNotifs((prev) => ({ ...prev, ...data }));
    }).catch(() => {});
  }, []);

  const [savingCompany, setSavingCompany] = useState(false);
  const [savingNotifs, setSavingNotifs] = useState(false);

  const saveCompany = async () => {
    setSavingCompany(true);
    try {
      await apiClient.put('/admin/settings/company', company);
      toast.success('Company details saved');
    } catch (e) {
      toast.error(e.message || 'Could not save company settings');
    } finally { setSavingCompany(false); }
  };
  const saveNotifs = async () => {
    setSavingNotifs(true);
    try {
      await apiClient.put('/admin/settings/notifications', notifs);
      toast.success('Notification preferences saved');
    } catch (e) {
      toast.error(e.message || 'Could not save notification preferences');
    } finally { setSavingNotifs(false); }
  };

  // Change password DOES have a real, working backend endpoint
  // (POST /auth/change-password, already wired in authService.changePassword)
  // — this previously never called it and just showed a fake success toast,
  // which is worse than doing nothing: an admin could believe their real
  // login password had changed when it had not. Now it actually calls it.
  const changePass = async () => {
    if (!security.current) { toast.error('Enter current password'); return; }
    if (!security.newPass || security.newPass.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (security.newPass !== security.confirm) { toast.error('Passwords do not match'); return; }
    setChangingPass(true);
    try {
      await authService.changePassword({ currentPassword: security.current, newPassword: security.newPass });
      toast.success('Password changed successfully');
      setSecurity({ current: '', newPass: '', confirm: '' });
    } catch (e) {
      toast.error(e.message || 'Could not change password');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Company profile, notifications and security preferences." />

      {/* Tabs */}
      <PageTabs tabs={TABS} value={tab} onChange={setTab} />

      {/* Company */}
      {tab === 'company' && (
        <Card className="max-w-xl space-y-4">
          <h3 className="text-sm font-bold" style={{ color: '#111111' }}>Company Profile</h3>
          <Alert type="info">
            These details appear on generated invoices and customer communications. Saving here updates
            these details appear on generated invoices and customer communications.
          </Alert>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Company name" className="sm:col-span-2">
              <Input value={company.name} onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))} />
            </FormField>
            <FormField label="Support email">
              <Input type="email" value={company.supportEmail} onChange={(e) => setCompany((c) => ({ ...c, supportEmail: e.target.value }))} />
            </FormField>
            <FormField label="Support phone">
              <Input value={company.phone} onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))} />
            </FormField>
            <FormField label="Address" className="sm:col-span-2">
              <Input value={company.address} onChange={(e) => setCompany((c) => ({ ...c, address: e.target.value }))} />
            </FormField>
            <FormField label="GSTIN" hint="15-digit GST number">
              <Input value={company.gstin} onChange={(e) => setCompany((c) => ({ ...c, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" />
            </FormField>
            <FormField label="PAN">
              <Input value={company.pan} onChange={(e) => setCompany((c) => ({ ...c, pan: e.target.value }))} placeholder="AAAAA1234A" />
            </FormField>
          </div>
          <Button icon={Save} loading={savingCompany} onClick={saveCompany}>Save company settings</Button>
        </Card>
      )}

      {/* Loyalty Tiers */}
      {tab === 'loyalty' && <LoyaltyTiersTab />}

      {/* Notifications */}
      {tab === 'notifications' && (
        <Card className="max-w-xl space-y-5">
          <h3 className="text-sm font-bold" style={{ color: '#111111' }}>Notification Preferences</h3>
          <Alert type="info">
            WhatsApp and SMS notifications require MSG91 credentials in the backend .env file. Saving
            these control which automated messages are sent when bookings and trips are updated.
          </Alert>
          <div className="space-y-4">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-widest mb-3" style={{ color: '#9A9A9A' }}>Email</p>
              <div className="space-y-3">
                <Toggle checked={notifs.emailOnNewBooking}    onChange={(v) => setNotifs((n) => ({ ...n, emailOnNewBooking: v }))}    label="Email admin on new booking" />
                <Toggle checked={notifs.emailOnCancellation}  onChange={(v) => setNotifs((n) => ({ ...n, emailOnCancellation: v }))}  label="Email admin on cancellation" />
              </div>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: '#E8E8E4' }}>
              <p className="text-[11.5px] font-bold uppercase tracking-widest mb-3" style={{ color: '#9A9A9A' }}>WhatsApp / SMS (via MSG91)</p>
              <div className="space-y-3">
                <Toggle checked={notifs.whatsappOnConfirm}   onChange={(v) => setNotifs((n) => ({ ...n, whatsappOnConfirm: v }))}    label="WhatsApp customer on booking confirmed" />
                <Toggle checked={notifs.smsOnDriverAssign}   onChange={(v) => setNotifs((n) => ({ ...n, smsOnDriverAssign: v }))}    label="WhatsApp customer on driver assigned" />
              </div>
            </div>
          </div>
          <Button icon={Save} loading={savingNotifs} onClick={saveNotifs}>Save preferences</Button>
        </Card>
      )}

      {/* Security */}
      {tab === 'security' && (
        <Card className="max-w-md space-y-4">
          <h3 className="text-sm font-bold" style={{ color: '#111111' }}>Change Password</h3>
          <FormField label="Current password">
            <Input type="password" value={security.current}
              onChange={(e) => setSecurity((s) => ({ ...s, current: e.target.value }))} />
          </FormField>
          <FormField label="New password">
            <Input type="password" value={security.newPass}
              onChange={(e) => setSecurity((s) => ({ ...s, newPass: e.target.value }))} />
          </FormField>
          <FormField label="Confirm new password">
            <Input type="password" value={security.confirm}
              onChange={(e) => setSecurity((s) => ({ ...s, confirm: e.target.value }))} />
          </FormField>
          <Alert type="warning">
            Forgot/reset password via email is not yet supported. Contact your system administrator.
          </Alert>
          <Button icon={Shield} loading={changingPass} onClick={changePass}>Change password</Button>
        </Card>
      )}

      {/* API Keys */}
      {tab === 'api' && (
        <div className="max-w-xl space-y-4">
          <Card className="space-y-4">
            <h3 className="text-sm font-bold" style={{ color: '#111111' }}>Backend Environment Keys</h3>
            <Alert type="info">
              These keys are set in the backend <code className="font-mono text-[11.5px] px-1 py-0.5 rounded" style={{ backgroundColor: '#F5F5F3' }}>.env</code> file,
              not in the ERP. Listed here for reference only.
            </Alert>
            {[
              { label: 'MSG91 Auth Key',      key: 'MSG91_AUTH_KEY',          status: 'missing',      hint: 'Required for WhatsApp/SMS notifications' },
              { label: 'MSG91 Sender ID',     key: 'MSG91_SENDER_ID',         status: 'missing',      hint: 'Your registered sender ID (e.g. ABHICB)' },
              { label: 'Razorpay Key ID',     key: 'RAZORPAY_KEY_ID',         status: 'check backend', hint: 'Required for online payments' },
              { label: 'Firebase Server Key', key: 'FIREBASE_SERVER_KEY',     status: 'optional',     hint: 'Required for push notifications to ERP' },
              { label: 'JWT Secret',          key: 'JWT_SECRET',              status: 'required',     hint: 'Must be a strong random string' },
              { label: 'Redis URL',           key: 'REDIS_URL',               status: 'required',     hint: 'Required for BullMQ job queues' },
            ].map((item) => (
              <div key={item.key} className="rounded-xl border p-3"
                style={{ borderColor: '#E8E8E4' }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: '#111111' }}>{item.label}</span>
                  <Badge tone={item.status === 'required' || item.status === 'missing' ? 'red' : item.status === 'optional' ? 'slate' : 'amber'}>
                    {item.status}
                  </Badge>
                </div>
                <code className="text-[11.5px] font-mono" style={{ color: '#7c3aed' }}>{item.key}</code>
                <p className="text-[11.5px] mt-1" style={{ color: '#9A9A9A' }}>{item.hint}</p>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Loyalty Tiers Tab ─────────────────────────────────────────────────
function LoyaltyTiersTab() {
  const toast = useToast();
  const [tiers, setTiers] = useState(() => getTiers());
  const [dirty, setDirty] = useState(false);

  const updateTier = (idx, key, value) => {
    setTiers((prev) => prev.map((t, i) => i === idx ? { ...t, [key]: key === 'minPoints' ? Number(value) || 0 : value } : t));
    setDirty(true);
  };

  const addTier = () => {
    const highest = tiers.length > 0 ? Math.max(...tiers.map((t) => t.minPoints)) : 0;
    setTiers((prev) => [...prev, { name: '', minPoints: highest + 10, color: '#6B7280' }]);
    setDirty(true);
  };

  const removeTier = (idx) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = () => {
    const valid = tiers.filter((t) => t.name.trim());
    if (valid.length === 0) {
      toast.error('Add at least one tier with a name.');
      return;
    }
    const dupes = new Set();
    for (const t of valid) {
      if (dupes.has(t.name.trim().toLowerCase())) {
        toast.error(`Duplicate tier name: "${t.name}"`);
        return;
      }
      dupes.add(t.name.trim().toLowerCase());
    }
    const saved = saveTiers(valid);
    setTiers(saved);
    setDirty(false);
    toast.success(`${saved.length} loyalty tier${saved.length === 1 ? '' : 's'} saved`);
  };

  const PRESET_COLORS = ['#CD7F32', '#9CA3AF', '#F59E0B', '#7c3aed', '#3B82F6', '#059669', '#DC2626', '#EC4899'];

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-5">
        <div>
          <h3 className="text-sm font-bold" style={{ color: '#111111' }}>Loyalty Tiers</h3>
          <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
            Each completed trip earns the customer 1 loyalty point. Configure the tiers below —
            customers are automatically assigned the highest tier they qualify for.
          </p>
        </div>

        <Alert type="info">
          A customer with 35 points and tiers set at Silver (15), Gold (30), Platinum (60)
          would be <strong>Gold</strong> — the highest tier they've reached.
        </Alert>

        {/* Tier rows */}
        <div className="space-y-3">
          {tiers.map((tier, idx) => (
            <div key={idx} className="flex items-end gap-3 rounded-xl p-3"
              style={{ backgroundColor: '#FAFAFA', border: '1px solid #F0F0EC' }}>
              {/* Color dot */}
              <div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#9A9A9A' }}>Color</p>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => updateTier(idx, 'color', c)}
                      style={{
                        width: 22, height: 22, borderRadius: 6, backgroundColor: c,
                        border: tier.color === c ? '2.5px solid #111' : '1.5px solid #E5E7EB',
                        cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Name */}
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#9A9A9A' }}>Tier name</p>
                <input
                  value={tier.name}
                  onChange={(e) => updateTier(idx, 'name', e.target.value)}
                  placeholder="e.g. Gold"
                  style={{
                    width: '100%', height: 36, padding: '0 10px', borderRadius: 8,
                    border: '1.5px solid #E5E7EB', fontSize: 13, fontWeight: 700,
                    color: '#111', outline: 'none',
                  }}
                />
              </div>

              {/* Min points */}
              <div style={{ flex: '0 0 100px' }}>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#9A9A9A' }}>Min points</p>
                <input
                  type="number"
                  min="0"
                  value={tier.minPoints}
                  onChange={(e) => updateTier(idx, 'minPoints', e.target.value)}
                  style={{
                    width: '100%', height: 36, padding: '0 10px', borderRadius: 8,
                    border: '1.5px solid #E5E7EB', fontSize: 13, fontWeight: 700,
                    color: '#111', outline: 'none',
                  }}
                />
              </div>

              {/* Preview */}
              <div style={{ flex: '0 0 auto' }}>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#9A9A9A' }}>Preview</p>
                <span style={{
                  display: 'inline-block', padding: '5px 12px', borderRadius: 8,
                  fontSize: 12, fontWeight: 800, color: '#fff',
                  backgroundColor: tier.color || '#6B7280',
                }}>
                  {tier.name || '—'}
                </span>
              </div>

              {/* Delete */}
              <button type="button" onClick={() => removeTier(idx)}
                style={{
                  flex: '0 0 auto', width: 36, height: 36, borderRadius: 8,
                  border: '1.5px solid #FECACA', backgroundColor: '#FEF2F2',
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
                title="Remove tier"
              >
                <Trash2 size={14} style={{ color: '#DC2626' }} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" icon={Plus} onClick={addTier}>Add tier</Button>
          <Button size="sm" icon={Save} onClick={save} disabled={!dirty}>
            {dirty ? 'Save tiers' : 'Saved'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
