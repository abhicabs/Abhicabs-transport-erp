/**
 * Notifications page — uses the live Socket.IO feed from AdminRealtimeContext
 * as its data source, since the backend has no /admin/notifications REST
 * endpoint yet. Events arrive in real-time via the shared socket connection
 * established in AdminRealtimeProvider (wired in AdminLayout).
 *
 * Feed events:
 *   booking:created    — new booking made
 *   booking:attempted  — booking attempt
 *   admin:alert        — booking attempt failed — needs attention
 *   trip:status        — booking status changed
 *   booking:allocated  — vehicle/driver assigned
 *   payment:received   — payment captured
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, Car, CreditCard, AlertTriangle, Info, Radio, Settings, ChevronRight, Inbox } from 'lucide-react';
import PageHeader   from '../../components/ui/PageHeader';
import Card         from '../../components/ui/Card';
import Button       from '../../components/ui/Button';
import EmptyState   from '../../components/ui/EmptyState';
import Badge        from '../../components/ui/Badge';
import Checkbox     from '../../components/ui/Checkbox';
import Input        from '../../components/ui/Input';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { timeAgo }  from '../../utils/formatters';

// Map socket event kind → display config
const KIND_CONFIG = {
  'booking:created':   { label: 'New Booking',       tone: 'green', Icon: Car },
  'booking:attempted': { label: 'Booking Attempt',   tone: 'slate', Icon: Info },
  'admin:alert':       { label: 'Attempt Failed',    tone: 'red',   Icon: AlertTriangle },
  'trip:status':       { label: 'Status Changed',    tone: 'blue',  Icon: Car },
  'booking:allocated': { label: 'Vehicle Allocated', tone: 'purple',Icon: Car },
  'trip:vehicle_changed': { label: 'Vehicle Class Changed', tone: 'amber', Icon: Car },
  'payment:received':  { label: 'Payment Received',  tone: 'green', Icon: CreditCard },
  // NEW — polled, not pushed live. See AdminRealtimeContext.jsx for why.
  'booking:abandoned': { label: 'Abandoned Booking',  tone: 'amber', Icon: AlertTriangle },
  'booking_request:created': { label: 'Booking Request', tone: 'amber', Icon: Inbox },
};

function kindConfig(kind) {
  return KIND_CONFIG[kind] || { label: kind, tone: 'slate', Icon: Info };
}

/**
 * FIX: every booking a customer made showed up as its own fully separate
 * row — a customer who booked 3 times in one session produced 3 identical-
 * looking "New Booking" entries, cluttering the feed and making it look
 * like 3 different customers were active rather than one repeat customer.
 * Groups consecutive booking:created events by customerId into one row
 * with a "×N" count and the full list of booking numbers, instead of N
 * separate rows. Other event kinds (payments, trip status, alerts) are
 * left exactly as they were — only repeat NEW BOOKINGS get grouped, since
 * that's specifically what was asked for.
 */
function groupFeed(feed) {
  const grouped = [];
  const byCustomer = new Map(); // customerId -> the group object already pushed into `grouped`

  for (const item of feed) {
    if (item.kind !== 'booking:created' || !item.customerId) {
      grouped.push(item);
      continue;
    }
    const existing = byCustomer.get(item.customerId);
    if (existing) {
      existing.bookingNumbers.push(item.bookingNumber || item.bookingId);
      existing.count += 1;
      // Keep the most recent timestamp/status for display, but the group
      // stays in its ORIGINAL (first-seen) position in the feed order.
      existing.at = item.at;
      existing.status = item.status;
    } else {
      const group = {
        ...item,
        bookingNumbers: [item.bookingNumber || item.bookingId],
        count: 1,
      };
      byCustomer.set(item.customerId, group);
      grouped.push(group);
    }
  }
  return grouped;
}

function notificationLink(item) {
  // Resolve where a notification should take the admin when clicked.
  if (item.kind === 'payment:received' && item.bookingId) return `/admin/bookings/${item.bookingId}`;
  if (item.bookingId) return `/admin/bookings/${item.bookingId}`;
  if (item.kind === 'booking:abandoned') return '/admin/bookings';
  if (item.kind === 'booking_request:created') return '/admin/booking-requests';
  if (item.customerId) return `/admin/customers/${item.customerId}`;
  if (item.kind === 'trip:status' && item.tripId) return `/admin/trips`;
  return null;
}

function NotificationRow({ item, isNew, onClick }) {
  const { label, tone, Icon } = kindConfig(item.kind);
  const clickable = !!onClick;

  // Build a human-readable summary from the payload
  let summary = '';
  if (item.count > 1) {
    summary = `${item.count} bookings: ${item.bookingNumbers.join(', ')}`;
  } else if (item.kind === 'booking:abandoned') {
    summary = `${item.name} (${item.mobile})`;
  } else if (item.kind === 'booking_request:created') {
    const route = [item.pickupAddress, item.dropAddress].filter(Boolean).map((a) => String(a).split(',')[0]).join(' → ');
    summary = [item.requestNumber, item.contactName, route, item.vehicleClass].filter(Boolean).join(' · ') || label;
  } else {
    if (item.bookingNumber) summary += `Booking ${item.bookingNumber}`;
    if (item.vehicleClass)  summary += summary ? ` · ${item.vehicleClass}` : item.vehicleClass;
    if (item.status)        summary += summary ? ` · ${item.status}` : item.status;
    if (item.amount)        summary += summary ? ` · ₹${item.amount}` : `₹${item.amount}`;
    if (item.reason)        summary += summary ? ` · ${item.reason}` : item.reason;
    if (!summary)           summary = label;
  }

  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 px-5 py-4"
      style={{
        borderBottom: '1px solid #F7F8FC',
        backgroundColor: isNew ? '#fffbea' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.backgroundColor = '#F7F8FC'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isNew ? '#fffbea' : 'transparent'; }}
    >
      {/* Icon */}
      <div
        className="h-8 w-8 rounded-lg grid place-items-center shrink-0 mt-0.5"
        style={{ backgroundColor: '#F7F8FC' }}
      >
        <Icon size={16} style={{ color: tone === 'red' ? '#DC2626' : tone === 'green' ? '#16a34a' : '#3B65DB' }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge tone={tone}>{label}</Badge>
          {item.count > 1 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
            >
              ×{item.count}
            </span>
          )}
          {isNew && (
            <span
              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#FFC107', color: '#111' }}
            >
              NEW
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: '#1F2937' }}>{summary}</p>
      </div>

      {/* Time + chevron */}
      <div className="flex items-center gap-1.5 shrink-0 mt-1">
        <span className="text-xs" style={{ color: '#9CA3AF' }}>{timeAgo(item.at)}</span>
        {clickable && <ChevronRight size={15} style={{ color: '#C4C9D4' }} />}
      </div>
    </div>
  );
}

// Default document-renewal reminder settings (persisted to localStorage)
const DEFAULT_DOC_SETTINGS = {
  enabled: true,
  documents: {
    driverLicence:    { label: "Driver Licence",       days: 30, on: true },
    vehicleRC:        { label: "Vehicle RC",           days: 30, on: true },
    vehicleInsurance: { label: "Vehicle Insurance",    days: 30, on: true },
    vehiclePermit:    { label: "Vehicle Permit",       days: 15, on: true },
    vehicleFitness:   { label: "Fitness Certificate",  days: 15, on: true },
    pollutionCert:    { label: "Pollution (PUC)",      days: 7,  on: true },
  },

};

function loadDocSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("abhicabs_notif_settings") || "null");
    return s || DEFAULT_DOC_SETTINGS;
  } catch { return DEFAULT_DOC_SETTINGS; }
}

function NotificationSettings({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);

  const setDoc = (key, field, value) =>
    setDraft((d) => ({ ...d, documents: { ...d.documents, [key]: { ...d.documents[key], [field]: value } } }));

  return (
    <Card>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #F0F1F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Notification Settings</h3>
          <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>Configure document renewal reminders</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="px-5 py-5" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Master toggle */}
        <Checkbox
          label="Enable document renewal reminders"
          checked={draft.enabled}
          onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
        />

        {/* Per-document config */}
        <div style={{ opacity: draft.enabled ? 1 : 0.5, pointerEvents: draft.enabled ? 'auto' : 'none' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
            Remind me before expiry
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(draft.documents).map(([key, doc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#FAFAFA', borderRadius: 10, border: '1px solid #F0F1F5' }}>
                <Checkbox
                  checked={doc.on}
                  onChange={(e) => setDoc(key, 'on', e.target.checked)}
                />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: '#1F2937' }}>{doc.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Input type="number" min={1} max={90} value={doc.days}
                    onChange={(e) => setDoc(key, 'days', Math.max(1, Number(e.target.value) || 1))}
                    disabled={!doc.on}
                    style={{ width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12.5, color: '#888' }}>days before</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>Save Settings</Button>
        </div>
      </div>
    </Card>
  );
}

export default function Notifications() {
  const { connected, feed } = useAdminRealtimeContext();
  const navigate = useNavigate();
  const [localFeed, setLocalFeed] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [docSettings, setDocSettings] = useState(loadDocSettings);

  const rawFeed = localFeed ?? feed;
  const displayFeed = groupFeed(rawFeed);
  const handleClear = () => setLocalFeed([]);

  const saveSettings = (s) => {
    setDocSettings(s);
    try { localStorage.setItem("abhicabs_notif_settings", JSON.stringify(s)); } catch { /* ignore */ }
    setShowSettings(false);
  };

  // Mark first 5 as "new" (arrived in this session)
  const newIds = new Set(displayFeed.slice(0, 5).map((f) => f.id));

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={
          connected
            ? `${displayFeed.length} events this session · live updates connected`
            : 'Live updates not connected — go online to receive events'
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" icon={Settings} onClick={() => setShowSettings((s) => !s)}>
              Settings
            </Button>
            {displayFeed.length > 0 && (
              <Button variant="secondary" size="sm" icon={Trash2} onClick={handleClear}>
                Clear session
              </Button>
            )}
          </div>
        }
      />

      {/* Settings panel */}
      {showSettings && (
        <div className="mb-4">
          <NotificationSettings settings={docSettings} onSave={saveSettings} onClose={() => setShowSettings(false)} />
        </div>
      )}

      {/* Connection status banner */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 mb-4 text-xs font-semibold"
        style={{
          backgroundColor: connected ? '#f0fdf4' : '#fef2f2',
          color: connected ? '#166534' : '#991B1B',
          border: `1px solid ${connected ? '#bbf7d0' : '#fecaca'}`,
        }}
      >
        <Radio size={13} />
        {connected
          ? 'Socket.IO connected — receiving live booking, trip and payment events'
          : 'Socket.IO disconnected — log in and navigate to any page to reconnect'
        }
      </div>

      {/* Feed */}
      {displayFeed.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No events yet"
            description={
              connected
                ? 'Events will appear here as bookings, trips and payments happen in real time.'
                : 'Connect to the live socket to start receiving events.'
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div>
            {displayFeed.map((item) => {
              const link = notificationLink(item);
              return (
                <NotificationRow
                  key={item.id}
                  item={item}
                  isNew={newIds.has(item.id)}
                  onClick={link ? () => navigate(link) : undefined}
                />
              );
            })}
          </div>
        </Card>
      )}

      {/* Note about persistence */}
      <p className="text-xs mt-4 text-center" style={{ color: '#9CA3AF' }}>
        Events shown here are from the current session only and reset on page refresh.
        Persistent push notifications require Firebase configuration in <code>.env</code>.
      </p>
    </div>
  );
}