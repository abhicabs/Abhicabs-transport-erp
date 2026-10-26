/**
 * src/pages/admin/WhatsApp.jsx
 *
 * WhatsApp Business inbox for ABHI CABS.
 *
 * UPDATED:
 * - Removed hardcoded MOCK badge and mock conversations
 * - Conversations list starts empty (no fake data)
 * - New booking events from the live socket auto-appear as outbound cards
 *   (previewing what will be sent once MSG91 is connected)
 * - Automation panel shows "Setup required" instead of MOCK
 * - Reply box sends messages locally (optimistic) — real delivery wires to
 *   POST /admin/whatsapp/send once MSG91_AUTH_KEY is set in backend .env
 * - Page is fully functional as a conversation viewer; send becomes real
 *   by adding one apiClient.post() call in handleSend below.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Search, Send, Phone, MoreVertical, CheckCheck, Check,
  Zap, Clock, CheckCircle, AlertTriangle,
  MessageCircle, ChevronDown, Settings,
} from 'lucide-react';
import Button  from '../../components/ui/Button';
import Alert   from '../../components/ui/Alert';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { useToast } from '../../hooks/useToast';
import { apiClient } from '../../services/apiClient';

// ── Brand colours ─────────────────────────────────────────────────────────
const WA = {
  green:     '#25D366',
  greenDark: '#128C7E',
  greenLight:'#DCF8C6',
  teal:      '#075E54',
  bg:        '#ECE5DD',
  panelBg:   '#F0F2F5',
  bubbleOut: '#DCF8C6',
  bubbleIn:  '#FFFFFF',
  text:      '#111B21',
  sub:       '#667781',
  border:    '#E9EDEF',
  header:    '#F0F2F5',
};

const TEMPLATES = [
  { key: 'booking_confirmed', label: 'Booking Confirmed', trigger: 'Admin confirms booking',  channel: 'whatsapp' },
  { key: 'driver_assigned',   label: 'Driver Assigned',   trigger: 'Vehicle allocated',       channel: 'whatsapp' },
  { key: 'booking_cancelled', label: 'Booking Cancelled', trigger: 'Booking cancelled',       channel: 'sms'      },
  { key: 'trip_completed',    label: 'Trip Completed',    trigger: 'Booking marked complete', channel: 'whatsapp' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function timeShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function dateLabel(iso) {
  const d   = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function Avatar({ initials, size = 40, online = false, src = null }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        backgroundColor: src ? '#FFC107' : WA.teal, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35, fontWeight: 700, overflow: 'hidden',
      }}>
        {src ? <img src={src} alt="" style={{ width: '62%', height: '62%' }} /> : initials}
      </div>
      {online && (
        <span style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 10, height: 10, borderRadius: '50%',
          backgroundColor: WA.green, border: '2px solid #fff',
        }} />
      )}
    </div>
  );
}

function TickIcon({ status }) {
  if (status === 'read')      return <CheckCheck size={14} style={{ color: '#53BDEB' }} />;
  if (status === 'delivered') return <CheckCheck size={14} style={{ color: WA.sub }} />;
  if (status === 'not_configured') return <AlertTriangle size={13} style={{ color: '#B45309' }} />;
  return <Check size={14} style={{ color: WA.sub }} />;
}

// ── Contact row ───────────────────────────────────────────────────────────
function ContactRow({ contact, selected, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        cursor: 'pointer', borderBottom: `1px solid ${WA.border}`,
        backgroundColor: selected ? '#F0F2F5' : '#fff',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#F5F6F6'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#fff'; }}
    >
      <Avatar initials={contact.avatar} online={contact.online} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: WA.text }}>{contact.name}</span>
          <span style={{ fontSize: 12.5, color: contact.unread > 0 ? WA.green : WA.sub, whiteSpace: 'nowrap' }}>
            {timeShort(contact.lastAt)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: WA.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {contact.lastMsg}
          </p>
          {contact.unread > 0 && (
            <span style={{
              backgroundColor: WA.green, color: '#fff', borderRadius: '50%',
              minWidth: 20, height: 20, fontSize: 12.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0,
            }}>
              {contact.unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isOut = msg.from === 'out';
  return (
    <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
      <div style={{
        maxWidth: '65%', minWidth: 80,
        backgroundColor: isOut ? WA.bubbleOut : WA.bubbleIn,
        borderRadius: isOut ? '8px 0 8px 8px' : '0 8px 8px 8px',
        padding: '6px 10px 4px',
        boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
      }}>
        {msg.template && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <Zap size={10} style={{ color: '#F59E0B' }} />
            <span style={{ fontSize: 11.5, color: '#92400e', fontWeight: 600, fontFamily: 'monospace' }}>
              {msg.template}
            </span>
          </div>
        )}
        <p style={{ fontSize: 14, color: WA.text, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          {msg.text}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
          <span style={{ fontSize: 11.5, color: WA.sub }}>{timeShort(msg.at)}</span>
          {isOut && <TickIcon status={msg.status} />}
        </div>
        {isOut && msg.status === 'not_configured' && (
          <p style={{ fontSize: 11, color: '#B45309', marginTop: 2, textAlign: 'right' }}>
            Not delivered — WhatsApp integration not configured
          </p>
        )}
      </div>
    </div>
  );
}

// ── Chat thread ───────────────────────────────────────────────────────────
function ChatThread({ contact, onSend }) {
  const [reply, setReply] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [contact.messages]);

  const handleSend = () => {
    if (!reply.trim()) return;
    onSend(contact.id, reply.trim());
    setReply('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  contact.messages.forEach((m) => {
    const dl = dateLabel(m.at);
    if (dl !== lastDate) { grouped.push({ type: 'date', label: dl }); lastDate = dl; }
    grouped.push({ type: 'msg', msg: m });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: WA.bg }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        backgroundColor: WA.header, borderBottom: `1px solid ${WA.border}`,
      }}>
        <Avatar initials={contact.avatar} size={42} online={contact.online} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: WA.text }}>{contact.name}</p>
          <p style={{ fontSize: 13.5, color: WA.sub }}>
            {contact.online ? 'online' : contact.phone}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Phone size={20} style={{ color: WA.sub, cursor: 'pointer' }} />
          <MoreVertical size={20} style={{ color: WA.sub, cursor: 'pointer' }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 10%' }}>
        {grouped.map((item, i) =>
          item.type === 'date' ? (
            <div key={`d-${i}`} style={{ textAlign: 'center', margin: '12px 0' }}>
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: WA.sub,
                backgroundColor: '#E1F2FB', borderRadius: 8, padding: '3px 10px',
              }}>
                {item.label}
              </span>
            </div>
          ) : (
            <Bubble key={item.msg.id} msg={item.msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 16px',
        backgroundColor: WA.header, borderTop: `1px solid ${WA.border}`,
      }}>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            borderRadius: 24, padding: '10px 16px',
            fontSize: 14, color: WA.text, backgroundColor: '#fff',
            maxHeight: 120, overflowY: 'auto',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim()}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none',
            cursor: reply.trim() ? 'pointer' : 'default',
            backgroundColor: reply.trim() ? WA.green : WA.sub,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.2s',
          }}
        >
          <Send size={18} style={{ color: '#fff' }} />
        </button>
      </div>
    </div>
  );
}

// ── Empty thread ──────────────────────────────────────────────────────────
function EmptyThread() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backgroundColor: WA.bg, gap: 12,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        backgroundColor: WA.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MessageCircle size={36} style={{ color: WA.green }} />
      </div>
      <p style={{ fontWeight: 700, fontSize: 18, color: WA.text }}>ABHI CABS WhatsApp</p>
      <p style={{ fontSize: 13, color: WA.sub, textAlign: 'center', maxWidth: 300 }}>
        Select a conversation to view messages, or send automated notifications from the Dispatch board.
      </p>
    </div>
  );
}

// ── Automation panel ──────────────────────────────────────────────────────
function AutomationPanel({ notifEvents }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: `1px solid ${WA.border}`, backgroundColor: '#fff' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
          color: WA.text,
        }}
      >
        <Zap size={15} style={{ color: '#F59E0B' }} />
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>Automation</span>
        {/* UPDATED: removed MOCK badge — shows pending setup icon instead */}
        <Settings size={13} style={{ color: WA.sub }} />
        <ChevronDown size={14} style={{ color: WA.sub, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{ padding: '0 16px 12px', borderTop: `1px solid ${WA.border}` }}>
          {/* Setup notice */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
            backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, marginTop: 10, marginBottom: 10,
          }}>
            <AlertTriangle size={13} style={{ color: '#92400E', marginTop: 1, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>MSG91 setup required</p>
              <p style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>
                Add MSG91_AUTH_KEY to backend .env to activate live WhatsApp delivery.
              </p>
            </div>
          </div>

          {/* Templates */}
          <p style={{ fontSize: 12.5, fontWeight: 700, color: WA.sub, margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Auto-fire templates
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEMPLATES.map((t) => (
              <div key={t.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 8, backgroundColor: WA.panelBg,
              }}>
                <CheckCircle size={12} style={{ color: WA.green, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: WA.text }}>{t.label}</p>
                  <p style={{ fontSize: 11.5, color: WA.sub }}>{t.trigger}</p>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  backgroundColor: t.channel === 'whatsapp' ? '#f0fdf4' : '#eff6ff',
                  color: t.channel === 'whatsapp' ? WA.greenDark : '#2563EB',
                }}>
                  {t.channel.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {/* Recent socket events */}
          {notifEvents.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: WA.sub, margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recent triggers
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {notifEvents.slice(0, 5).map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: WA.sub }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: WA.green, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.bookingNumber || e.bookingId || e.kind}
                    </span>
                    <span style={{ fontSize: 11.5, flexShrink: 0 }}>{timeShort(e.at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function WhatsApp() {
  const { feed } = useAdminRealtimeContext();
  const toast    = useToast();

  // UPDATED: start with empty contacts — no mock data
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState('');

  const notifEvents = feed
    .filter((f) => ['booking:created', 'booking:allocated', 'trip:status'].includes(f.kind))
    .slice(0, 10);

  // When a new booking event arrives on the socket, add it as a conversation card.
  // This shows what will be sent once MSG91 is connected.
  useEffect(() => {
    if (notifEvents.length === 0) return;
    const latest = notifEvents[0];
    if (!latest?.bookingNumber) return;
    setContacts((prev) => {
      if (prev.find((c) => c.id === `event-${latest.id}`)) return prev;
      const initials = (latest.customerName || 'C').slice(0, 2).toUpperCase();
      const newContact = {
        id:       `event-${latest.id}`,
        name:     latest.customerName || 'Customer',
        phone:    latest.phone || '—',
        avatar:   initials,
        lastMsg:  `[Not sent — WhatsApp not configured] ${latest.kind} — ${latest.bookingNumber}`,
        lastAt:   latest.at,
        unread:   0,
        online:   false,
        messages: [{
          id:       `em-${latest.id}`,
          from:     'out',
          text:     `📋 Notification for booking ${latest.bookingNumber} (${latest.kind}) has NOT been sent — WhatsApp integration is not configured.\n\nThis is a local preview only. Add MSG91_AUTH_KEY on the backend and wire POST /admin/whatsapp/send to deliver it for real.`,
          at:       latest.at,
          status:   'not_configured',
          template: latest.kind === 'booking:created'    ? 'booking_confirmed'
                  : latest.kind === 'booking:allocated'  ? 'driver_assigned'
                  : 'trip_completed',
        }],
      };
      return [newContact, ...prev];
    });
  }, [notifEvents.length]);

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const selectedContact = contacts.find((c) => c.id === selected);

  const handleSelect = (id) => {
    setSelected(id);
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, unread: 0 } : c));
  };

  const handleSend = async (contactId, text) => {
    const contact = contacts.find((c) => c.id === contactId);
    const newMsg = {
      id:     `msg-${Date.now()}`,
      from:   'out',
      text,
      at:     new Date().toISOString(),
      status: 'sending',
    };

    // Optimistic update — show the message immediately
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, messages: [...c.messages, newMsg], lastMsg: text, lastAt: newMsg.at }
          : c
      )
    );

    // Try the real backend endpoint
    try {
      const res = await apiClient.post('/admin/whatsapp/send', {
        phone: contact?.phone,
        message: text,
      });
      // Update status based on response
      const finalStatus = res?.sent ? 'sent' : 'queued';
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, messages: c.messages.map((m) => m.id === newMsg.id ? { ...m, status: finalStatus } : m) }
            : c
        )
      );
      if (res?.sent) toast.success('Message sent via WhatsApp');
      else toast.success('Message queued — will be sent when WhatsApp bot is online');
    } catch (e) {
      // Backend endpoint doesn't exist or WhatsApp not configured
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, messages: c.messages.map((m) => m.id === newMsg.id ? { ...m, status: 'not_configured' } : m) }
            : c
        )
      );
      if (e.status === 404 || e.code === 'ENDPOINT_NOT_IMPLEMENTED') {
        toast.error('WhatsApp send endpoint not deployed yet — message saved locally only.');
      } else {
        toast.error(e.message || 'Could not send — message saved locally.');
      }
    }
  };

  const totalUnread = contacts.reduce((s, c) => s + c.unread, 0);

  return (
    <div style={{ height: 'calc(100vh - 88px)', display: 'flex', borderRadius: 12, overflow: 'hidden', border: `1px solid ${WA.border}`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>

      {/* ── LEFT: Contact list ── */}
      <div style={{ width: 340, minWidth: 280, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRight: `1px solid ${WA.border}` }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 10px', backgroundColor: WA.header, borderBottom: `1px solid ${WA.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar src="/brand/abhicabs-mark.svg" size={38} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: WA.text }}>ABHI CABS</p>
                <p style={{ fontSize: 12.5, color: WA.sub }}>WhatsApp Business</p>
              </div>
            </div>
            {totalUnread > 0 && (
              <span style={{
                backgroundColor: WA.green, color: '#fff', borderRadius: 12,
                fontSize: 12.5, fontWeight: 700, padding: '2px 8px',
              }}>
                {totalUnread} new
              </span>
            )}
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: WA.sub }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start new chat"
              style={{
                width: '100%', padding: '7px 12px 7px 32px',
                border: 'none', borderRadius: 8, backgroundColor: '#fff',
                fontSize: 13, color: WA.text, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Contact list — empty until real bookings arrive via socket */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {contacts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: 24 }}>
              <MessageCircle size={32} style={{ color: WA.border }} />
              <p style={{ fontSize: 13, color: WA.sub, textAlign: 'center' }}>
                No conversations yet.
              </p>
              <p style={{ fontSize: 12.5, color: WA.sub, textAlign: 'center' }}>
                Conversations will appear here when booking events are received.
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 32, fontSize: 13, color: WA.sub }}>No conversations found</p>
          ) : (
            filteredContacts.map((c) => (
              <ContactRow key={c.id} contact={c} selected={selected === c.id} onClick={() => handleSelect(c.id)} />
            ))
          )}
        </div>

        {/* Automation panel */}
        <AutomationPanel notifEvents={notifEvents} />
      </div>

      {/* ── RIGHT: Chat thread ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selectedContact
          ? <ChatThread contact={selectedContact} onSend={handleSend} />
          : <EmptyThread />
        }
      </div>
    </div>
  );
}