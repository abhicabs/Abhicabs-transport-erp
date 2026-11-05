/**
 * src/pages/admin/WhatsApp.jsx
 *
 * WhatsApp Business inbox — fetches REAL data from the backend:
 *   - Active conversations from WhatsappSession table
 *   - Bot stats (active/total conversations, bookings, handoffs)
 *   - Human handoff queue
 *   - Support tickets from WhatsApp
 *   - Abandoned booking recovery
 *
 * Bot-admin endpoints use x-admin-key auth. The ERP apiClient is extended
 * to call these via a proxy or directly with the admin key.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Send, Phone, MoreVertical, CheckCheck, Check,
  Zap, Clock, CheckCircle, AlertTriangle, RefreshCw,
  MessageCircle, ChevronDown, Settings, Users, Bot,
  PhoneCall, XCircle, ArrowRight, ExternalLink,
} from 'lucide-react';
import Button     from '../../components/ui/Button';
import Alert      from '../../components/ui/Alert';
import Badge      from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import PageTabs   from '../../components/ui/PageTabs';
import DataTable  from '../../components/ui/DataTable';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { useToast } from '../../hooks/useToast';
import { apiClient, API_BASE_URL } from '../../services/apiClient';
import { getToken } from '../../services/authStorage';

/**
 * Bot-admin endpoints use x-admin-key auth (not JWT).
 * ADMIN_API_KEY is set in the backend .env and must be configured here too.
 * Falls back to using JWT auth in case the backend also accepts it.
 */
const BOT_ADMIN_KEY = import.meta.env.VITE_BOT_ADMIN_KEY || '';

async function botAdminFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };

  // Try x-admin-key first, fall back to JWT
  if (BOT_ADMIN_KEY) {
    headers['x-admin-key'] = BOT_ADMIN_KEY;
  } else {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const err = new Error(json.error || json.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
import { formatDateTime, titleCase } from '../../utils/formatters';

const WA = {
  green: '#25D366', greenDark: '#128C7E', greenLight: '#DCF8C6',
  teal: '#075E54', bg: '#ECE5DD', panelBg: '#F0F2F5',
  bubbleOut: '#DCF8C6', bubbleIn: '#FFFFFF',
  text: '#111B21', sub: '#667781', border: '#E9EDEF', header: '#F0F2F5',
};

function timeShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function Avatar({ initials, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: WA.teal, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = '#1F2937', bg = '#F9FAFB' }) {
  return (
    <div style={{ backgroundColor: bg, borderRadius: 12, padding: '16px 20px', border: '1px solid #E5E7EB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={18} style={{ color }} />
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value ?? '—'}</div>
    </div>
  );
}

// ── Bot Stats Overview ──────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await botAdminFetch('/bot-admin/stats');
      setStats(res);
    } catch (e) {
      setError(e?.message || 'Could not load stats');
      if (e?.status === 503) setError('Bot admin not configured — set ADMIN_API_KEY in backend .env');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12" style={{ color: '#6B7280' }}>Loading bot stats…</div>;
  if (error) return <Alert type="warning">{error} <Button size="sm" variant="secondary" className="ml-3" onClick={load}>Retry</Button></Alert>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={MessageCircle} label="Active Conversations" value={stats?.activeConversations} color="#10B981" bg="#F0FDF4" />
        <StatCard icon={Users} label="Total Conversations" value={stats?.totalConversations} color="#3B82F6" bg="#EFF6FF" />
        <StatCard icon={CheckCircle} label="Bot Bookings" value={stats?.totalBookings} color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={PhoneCall} label="Human Handoffs" value={stats?.humanHandoffs} color="#8B5CF6" bg="#F5F3FF" />
        <StatCard icon={CheckCheck} label="Successful Payments" value={stats?.successfulPayments} color="#10B981" bg="#F0FDF4" />
        <StatCard icon={XCircle} label="Failed Payments" value={stats?.failedPayments} color="#EF4444" bg="#FEF2F2" />
        <StatCard icon={AlertTriangle} label="Abandoned Bookings" value={stats?.abandonedBookings} color="#F97316" bg="#FFF7ED" />
      </div>
      <div className="text-right">
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh Stats</Button>
      </div>
    </div>
  );
}

// ── Active Conversations ────────────────────────────────────────────────────
function ConversationsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Fetch active WhatsApp sessions — these are the real conversations
      const res = await botAdminFetch('/bot-admin/handoffs');
      setSessions(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e?.message || 'Could not load conversations');
      if (e?.status === 503) setError('Bot admin not configured — set ADMIN_API_KEY in backend .env');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolveHandoff = async (sessionId) => {
    try {
      await botAdminFetch(`/bot-admin/handoffs/${sessionId}/resolve`, { method: 'POST' });
      toast.success('Handoff resolved — bot returned to main menu');
      load();
    } catch (e) {
      toast.error(e?.message || 'Could not resolve handoff');
    }
  };

  const columns = [
    { key: 'phone', header: 'WhatsApp Number', render: (r) => (
      <div className="flex items-center gap-2">
        <Avatar initials={r.customer?.name?.[0] || '?'} size={32} />
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: '#1F2937' }}>{r.customer?.name || 'Unknown'}</p>
          <p style={{ fontSize: 12, color: '#6B7280' }}>{r.whatsappNumber}</p>
        </div>
      </div>
    )},
    { key: 'state', header: 'Bot State', render: (r) => <Badge tone={r.state === 'MAIN_MENU' ? 'green' : 'blue'}>{titleCase(r.state?.replace(/_/g, ' ') || '—')}</Badge> },
    { key: 'handoff', header: 'Handoff', render: (r) => r.humanHandoff ? <Badge tone="red">Waiting for human</Badge> : <Badge tone="slate">Bot handling</Badge> },
    { key: 'reason', header: 'Handoff Reason', render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{r.handoffReason || '—'}</span> },
    { key: 'lastMessage', header: 'Last Activity', render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{formatDateTime(r.lastMessageAt)}</span> },
    { key: 'actions', header: '', className: 'text-right', render: (r) => r.humanHandoff ? (
      <Button size="sm" variant="primary" icon={CheckCircle} onClick={() => resolveHandoff(r.id)}>Resolve</Button>
    ) : null },
  ];

  if (loading) return <div className="text-center py-12" style={{ color: '#6B7280' }}>Loading conversations…</div>;
  if (error) return <Alert type="warning">{error} <Button size="sm" variant="secondary" className="ml-3" onClick={load}>Retry</Button></Alert>;

  return (
    <div>
      {sessions.filter(s => s.humanHandoff).length > 0 && (
        <Alert type="warning" className="mb-4">
          {sessions.filter(s => s.humanHandoff).length} conversation{sessions.filter(s => s.humanHandoff).length > 1 ? 's' : ''} waiting for human response.
        </Alert>
      )}
      <DataTable
        columns={columns} rows={sessions}
        emptyTitle="No active handoffs"
        emptyDescription="Conversations needing human help will appear here. The bot is handling everything right now."
      />
      <div className="text-right mt-4">
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
      </div>
    </div>
  );
}

// ── Support Tickets from WhatsApp ───────────────────────────────────────────
function SupportTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('NEW');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await botAdminFetch(`/bot-admin/support-tickets?status=${filter}`);
      setTickets(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e?.message || 'Could not load tickets');
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'name', header: 'Customer', render: (r) => (
      <div>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#1F2937' }}>{r.name || 'Unknown'}</p>
        <p style={{ fontSize: 12, color: '#6B7280' }}>{r.phone || r.email || '—'}</p>
      </div>
    )},
    { key: 'topic', header: 'Topic', render: (r) => <Badge tone="blue">{r.topic || '—'}</Badge> },
    { key: 'message', header: 'Message', render: (r) => <p style={{ fontSize: 13, color: '#374151', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message || '—'}</p> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'NEW' ? 'yellow' : r.status === 'RESOLVED' ? 'green' : 'slate'}>{r.status}</Badge> },
    { key: 'createdAt', header: 'Received', render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{formatDateTime(r.createdAt)}</span> },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {['NEW', 'IN_PROGRESS', 'RESOLVED'].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
            {titleCase(s.replace(/_/g, ' '))}
          </Button>
        ))}
      </div>
      {loading ? <div className="text-center py-12" style={{ color: '#6B7280' }}>Loading tickets…</div>
        : error ? <Alert type="warning">{error}</Alert>
        : <DataTable columns={columns} rows={tickets} emptyTitle="No tickets" emptyDescription={`No ${filter.toLowerCase().replace('_', ' ')} support tickets from WhatsApp.`} />}
    </div>
  );
}

// ── Live Feed (from socket) ─────────────────────────────────────────────────
function LiveFeedTab() {
  const { feed } = useAdminRealtimeContext();

  const waEvents = feed
    .filter((f) => ['booking:created', 'booking:allocated', 'trip:status', 'booking:cancelled'].includes(f.kind))
    .slice(0, 30);

  const iconFor = (kind) => {
    if (kind === 'booking:created') return <CheckCircle size={16} style={{ color: '#10B981' }} />;
    if (kind === 'booking:allocated') return <Users size={16} style={{ color: '#3B82F6' }} />;
    if (kind === 'booking:cancelled') return <XCircle size={16} style={{ color: '#EF4444' }} />;
    return <ArrowRight size={16} style={{ color: '#F59E0B' }} />;
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Live booking events that trigger WhatsApp notifications. Messages are sent automatically when MSG91 is configured.
      </p>
      {waEvents.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9CA3AF' }}>
          <Bot size={40} style={{ margin: '0 auto 12px', color: '#D1D5DB' }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>Waiting for events…</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Booking events will appear here in real-time.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {waEvents.map((ev, i) => (
            <div key={ev.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 10, border: '1px solid #E5E7EB', backgroundColor: '#fff',
            }}>
              {iconFor(ev.kind)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>
                  {ev.bookingNumber || 'Event'} — {titleCase(ev.kind?.replace(':', ' ') || '—')}
                </p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>
                  {ev.customerName || 'Customer'} · {ev.phone || '—'} · {timeShort(ev.at)}
                </p>
              </div>
              <Badge tone={ev.kind.includes('cancel') ? 'red' : ev.kind.includes('allocat') ? 'blue' : 'green'}>
                {titleCase(ev.kind?.split(':')?.[1] || '—')}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function WhatsApp() {
  const [tab, setTab] = useState('stats');

  const tabs = [
    { key: 'stats',         label: 'Overview' },
    { key: 'conversations', label: 'Conversations' },
    { key: 'support',       label: 'Support Tickets' },
    { key: 'live',          label: 'Live Feed' },
  ];

  return (
    <div>
      <PageHeader
        title="WhatsApp Business"
        description="Monitor bot conversations, handle handoffs, and track WhatsApp support tickets."
      />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {tab === 'stats'         && <StatsTab />}
        {tab === 'conversations' && <ConversationsTab />}
        {tab === 'support'       && <SupportTab />}
        {tab === 'live'          && <LiveFeedTab />}
      </div>
    </div>
  );
}
