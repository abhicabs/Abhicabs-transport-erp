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
 * Uses the normal staff login (see WA_API below) — no admin key in the browser.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, CheckCheck, CheckCircle, AlertTriangle, RefreshCw,
  MessageCircle, Users, Bot, PhoneCall, XCircle, ArrowRight, ExternalLink,
} from 'lucide-react';
import Button     from '../../components/ui/Button';
import Alert      from '../../components/ui/Alert';
import Badge      from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import PageTabs   from '../../components/ui/PageTabs';
import DataTable  from '../../components/ui/DataTable';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { useToast } from '../../hooks/useToast';
import { apiClient } from '../../services/apiClient';

/**
 * All calls go to /api/v1/admin/whatsapp/* with the normal staff login.
 *
 * FIX: this page used to call `${API_BASE_URL}/bot-admin/...` (= /api/v1/bot-admin,
 * which does not exist — the bot mounts /bot-admin at the server root) and sent
 * the staff JWT, which /bot-admin refuses (it only takes x-admin-key). Every tab
 * failed. The backend now serves the same data behind staff auth, so no secret
 * key has to be shipped in the browser bundle.
 */
const WA_API = '/admin/whatsapp';
const waGet   = (path, params) => apiClient.get(`${WA_API}${path}`, params ? { params } : undefined);
const waPost  = (path, body = {}) => apiClient.post(`${WA_API}${path}`, body);
const waPatch = (path, body = {}) => apiClient.patch(`${WA_API}${path}`, body);
const asList  = (res) => (Array.isArray(res) ? res : res?.data ?? res?.items ?? []);

/** wa.me link so staff can open the chat in WhatsApp Web / the phone app. */
const waLink = (number) => {
  let digits = String(number || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`; // a bare Indian mobile from the contact form
  return digits.length >= 11 ? `https://wa.me/${digits}` : null;
};

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
  
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setStats(await waGet('/stats'));
    } catch (e) {
      setError(e?.status === 503 ? 'The WhatsApp bot is not running on the server.' : (e?.message || 'Could not load stats'));
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
        <StatCard icon={MessageCircle} label="Open Support Tickets" value={stats?.openSupportTickets} color="#0EA5E9" bg="#F0F9FF" />
      </div>
      {stats?.provider && (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 12 }}>
          Provider: <strong>{String(stats.provider).toUpperCase()}</strong>. Messages sent more than 24 hours after the customer last wrote
          need an approved WhatsApp template (set in the backend env) — otherwise WhatsApp drops them.
        </p>
      )}
      <div className="text-right">
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh Stats</Button>
      </div>
    </div>
  );
}

// ── Conversations ───────────────────────────────────────────────────────────
// FIX: this tab only ever loaded the handoff queue, so it was empty whenever no
// one had asked for a human. It now lists real recent chats, with a filter.
function ConversationsTab({ initialFilter = 'all' }) {
  const { refreshHandoffs } = useAdminRealtimeContext();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(null);
  const toast = useToast();

  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setSessions(asList(await waGet('/conversations', { filter, limit: 100, ...(query ? { search: query } : {}) })));
    } catch (e) {
      setError(e?.status === 503 ? 'The WhatsApp bot is not running on the server.' : (e?.message || 'Could not load conversations'));
    } finally { setLoading(false); }
  }, [filter, query]);

  useEffect(() => { load(); }, [load]);

  const resolveHandoff = async (sessionId) => {
    setResolving(sessionId);
    try {
      await waPost(`/handoffs/${sessionId}/resolve`);
      toast.success('Handoff resolved — bot returned to main menu');
      load();
      refreshHandoffs?.();
    } catch (e) {
      toast.error(e?.message || 'Could not resolve handoff');
    } finally { setResolving(null); }
  };

  const waiting = sessions.filter((s) => s.humanHandoff).length;

  const columns = [
    { key: 'phone', header: 'Customer', render: (r) => (
      <div className="flex items-center gap-2">
        <Avatar initials={(r.customer?.name || '?')[0].toUpperCase()} size={32} />
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: '#1F2937' }}>{r.customer?.name || 'Unknown'}</p>
          <p style={{ fontSize: 12, color: '#6B7280' }}>+{r.whatsappNumber}</p>
        </div>
      </div>
    )},
    { key: 'state', header: 'Bot Step', render: (r) => <Badge tone={r.state === 'MAIN_MENU' ? 'green' : 'blue'}>{titleCase(r.state?.replace(/_/g, ' ').toLowerCase() || '—')}</Badge> },
    { key: 'handoff', header: 'Handled by', render: (r) => r.humanHandoff ? <Badge tone="red">Waiting for human</Badge> : <Badge tone="slate">Bot</Badge> },
    { key: 'reason', header: 'Handoff Reason', wrap: true, render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{r.handoffReason || '—'}</span> },
    { key: 'lastMessage', header: 'Last Message', render: (r) => (
      <div>
        <p style={{ fontSize: 13, color: '#374151' }}>{formatDateTime(r.lastMessageAt)}</p>
        {r.canMessage === false && (
          <p style={{ fontSize: 11.5, color: '#B45309' }} title="WhatsApp only allows free text within 24 hours of the customer's last message">
            Outside 24h window — template only
          </p>
        )}
      </div>
    )},
    { key: 'actions', header: '', className: 'text-right', render: (r) => (
      <div className="flex gap-2 justify-end">
        {waLink(r.whatsappNumber) && (
          <a href={waLink(r.whatsappNumber)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" icon={ExternalLink}>Open chat</Button>
          </a>
        )}
        {r.humanHandoff && (
          <Button size="sm" variant="primary" icon={CheckCircle} loading={resolving === r.id} onClick={() => resolveHandoff(r.id)}>Resolve</Button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      {waiting > 0 && (
        <Alert type="warning" className="mb-4">
          {waiting} conversation{waiting > 1 ? 's' : ''} waiting for a human. Open the chat, help the customer, then press Resolve to hand it back to the bot.
        </Alert>
      )}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {[['all', 'All chats'], ['active', 'Active (30 min)'], ['handoff', 'Waiting for human']].map(([k, label]) => (
          <Button key={k} size="sm" variant={filter === k ? 'primary' : 'secondary'} onClick={() => setFilter(k)}>{label}</Button>
        ))}
        <div className="flex items-center gap-2 ml-auto" style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '6px 10px', backgroundColor: '#fff' }}>
          <Search size={14} style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or number…"
            style={{ border: 'none', outline: 'none', fontSize: 13, width: 180, background: 'transparent' }} />
        </div>
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
      </div>
      {error
        ? <Alert type="warning">{error} <Button size="sm" variant="secondary" className="ml-3" onClick={load}>Retry</Button></Alert>
        : (
          <DataTable
            columns={columns} rows={sessions} status={loading ? 'loading' : 'success'}
            emptyTitle={filter === 'handoff' ? 'No one is waiting' : 'No conversations'}
            emptyDescription={filter === 'handoff' ? 'Conversations needing human help will appear here.' : 'WhatsApp chats with the bot will appear here.'}
          />
        )}
    </div>
  );
}

// ── Support Tickets from WhatsApp ───────────────────────────────────────────
// FIX: the filters were NEW / IN_PROGRESS / RESOLVED, but the database only
// allows NEW / READ / RESPONDED / ARCHIVED — the other two made the server
// error. The phone column read `phone`; the table stores `mobile`. Tickets can
// now also be moved between statuses.
const TICKET_STATUSES = ['NEW', 'READ', 'RESPONDED', 'ARCHIVED'];
const TICKET_TONE = { NEW: 'yellow', READ: 'blue', RESPONDED: 'green', ARCHIVED: 'slate' };

function SupportTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('NEW');
  const [updating, setUpdating] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setTickets(asList(await waGet('/support-tickets', { status: filter })));
    } catch (e) {
      setError(e?.message || 'Could not load tickets');
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (ticket, status) => {
    setUpdating(ticket.id);
    try {
      await waPatch(`/support-tickets/${ticket.id}`, { status });
      toast.success(`Ticket marked ${titleCase(status.toLowerCase())}`);
      load();
    } catch (e) {
      toast.error(e?.message || 'Could not update ticket');
    } finally { setUpdating(null); }
  };

  const columns = [
    { key: 'name', header: 'Customer', render: (r) => (
      <div>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#1F2937' }}>{r.name || 'Unknown'}</p>
        <p style={{ fontSize: 12, color: '#6B7280' }}>{r.mobile || r.phone || r.email || '—'}</p>
      </div>
    )},
    { key: 'topic', header: 'Topic', render: (r) => <Badge tone="blue">{r.topic || '—'}</Badge> },
    { key: 'message', header: 'Message', render: (r) => <p title={r.message} style={{ fontSize: 13, color: '#374151', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message || '—'}</p> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={TICKET_TONE[r.status] || 'slate'}>{r.status}</Badge> },
    { key: 'createdAt', header: 'Received', render: (r) => <span style={{ fontSize: 13, color: '#6B7280' }}>{formatDateTime(r.createdAt)}</span> },
    { key: 'actions', header: '', className: 'text-right', render: (r) => (
      <div className="flex gap-2 justify-end">
        {waLink(r.mobile || r.phone) && (
          <a href={waLink(r.mobile || r.phone)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" icon={ExternalLink}>Open chat</Button>
          </a>
        )}
        {r.status !== 'RESPONDED' && (
          <Button size="sm" variant="primary" loading={updating === r.id} onClick={() => setStatus(r, 'RESPONDED')}>Mark responded</Button>
        )}
        {r.status !== 'ARCHIVED' && (
          <Button size="sm" variant="secondary" disabled={updating === r.id} onClick={() => setStatus(r, 'ARCHIVED')}>Archive</Button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[...TICKET_STATUSES, 'ALL'].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
            {titleCase(s.toLowerCase())}
          </Button>
        ))}
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load} className="ml-auto">Refresh</Button>
      </div>
      {error
        ? <Alert type="warning">{error} <Button size="sm" variant="secondary" className="ml-3" onClick={load}>Retry</Button></Alert>
        : <DataTable columns={columns} rows={tickets} status={loading ? 'loading' : 'success'} emptyTitle="No tickets"
            emptyDescription={filter === 'ALL' ? 'No support requests from WhatsApp yet.' : `No ${filter.toLowerCase()} support tickets from WhatsApp.`} />}
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
  // ?tab=conversations&filter=handoff — where a handoff alert links to.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'stats');
  const convFilter = params.get('filter') || 'all';
  const { handoffCount } = useAdminRealtimeContext();
  useEffect(() => { if (params.get('tab')) setTab(params.get('tab')); }, [params]);

  const tabs = [
    { key: 'stats',         label: 'Overview' },
    { key: 'conversations', label: 'Conversations', badge: handoffCount },
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
        {tab === 'conversations' && <ConversationsTab key={convFilter} initialFilter={convFilter} />}
        {tab === 'support'       && <SupportTab />}
        {tab === 'live'          && <LiveFeedTab />}
      </div>
    </div>
  );
}
