import { useState, useEffect } from 'react';
import { Bell, Calendar, AlertTriangle, Truck, CreditCard, MessageSquareWarning, Car, Inbox } from 'lucide-react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MuiIconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import MuiBadge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PhoneInTalkRoundedIcon from '@mui/icons-material/PhoneInTalkRounded';
import { useAuth }    from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast }   from '../../hooks/useToast';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';
import { onForegroundMessage }     from '../../lib/firebase';
import { timeAgo } from '../../utils/formatters';

/** Top bar — MUI AppBar with notification popover and user menu. */
export default function Navbar({ onMenuClick, title, liveConnected, followUpsDue = 0 }) {
  const { user, logout, isDriver } = useAuth();
  const [open, setOpen]           = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userAnchor, setUserAnchor]   = useState(null);
  const [notifAnchor, setNotifAnchor] = useState(null);
  const navigate = useNavigate();
  const toast    = useToast();

  // Use live feed length as unread count — no REST endpoint exists
  const { feed, lastEventId } = useAdminRealtimeContext();

  // Every new socket event increments unread count, not just new bookings.
  // Reset to 0 when user opens notifications page
  useEffect(() => {
    if (lastEventId) setUnreadCount((c) => c + 1);
  }, [lastEventId]);

  // Firebase foreground push
  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      const { title: t, body } = payload.notification || {};
      toast.info(`${t || 'New notification'}${body ? ' — ' + body : ''}`);
      setUnreadCount((c) => c + 1);
    });
    return unsubscribe;
  }, []);

  // Close dropdowns on outside click

  // FIX: the bell previously did nothing but navigate straight to
  // /admin/notifications (a mock page, disconnected from the real feed —
  // see notificationsService.js) — there was no way to see or click an
  // individual real event at all. This opens an actual dropdown of the real
  // feed instead, and each item routes somewhere real when it has enough
  // information to: a bookingId takes you to that booking, a contactId
  // takes you to Support. An attempt with no bookingId yet (it may have
  // failed before a booking ever existed) is shown but not clickable —
  // sending it somewhere fake would be worse than not linking it at all.
  const handleBellClick = (e) => {
    setNotifAnchor(e.currentTarget);
    setNotifOpen(true);
    setUnreadCount(0);
  };
  const closeNotif = () => { setNotifOpen(false); setNotifAnchor(null); };

  const goToNotification = (item) => {
    closeNotif();
    if (item.kind === 'whatsapp:handoff') {
      navigate('/admin/whatsapp?tab=conversations&filter=handoff');
    } else if (item.kind === 'dispatch:unassigned') {
      navigate('/admin/dispatch');
    } else if (item.kind === 'booking_request:created') {
      navigate('/admin/booking-requests');
    } else if (item.bookingId) {
      navigate(`/admin/bookings`);
    } else if (item.contactId) {
      navigate('/admin/support');
    } else if (item.kind === 'booking:attempted' || item.kind === 'admin:alert' || item.kind === 'booking:abandoned') {
      navigate('/admin/bookings');
    } else {
      navigate('/admin/notifications');
    }
  };

  const name  = user?.name  || 'Admin';
  const role  = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Admin';
  const email = user?.email || '';

  return (
    <AppBar position="sticky" elevation={0} color="inherit"
      sx={{ top: 0, zIndex: 30, bgcolor: 'rgba(255,255,255,0.86)', backdropFilter: 'saturate(180%) blur(12px)', borderBottom: '1px solid #ECECE8' }}>
      <Toolbar sx={{ minHeight: '64px !important', gap: 1.5, px: { xs: 2, sm: 3 } }}>
        {/* Mobile menu toggle */}
        <MuiIconButton onClick={onMenuClick} aria-label="Open menu" className="lg:hidden" sx={{ bgcolor: '#F7F8FC' }}>
          <MenuRoundedIcon fontSize="small" />
        </MuiIconButton>

        {/* Page title + live status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 800, fontSize: 15, color: '#111' }}>{title}</Typography>
          {typeof liveConnected === 'boolean' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: liveConnected ? '#22A65A' : '#9CA3AF', boxShadow: liveConnected ? '0 0 0 3px rgba(34,166,90,.18)' : 'none' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: liveConnected ? '#22A65A' : '#9CA3AF' }}>
                {liveConnected ? 'Live updates on' : 'Live updates offline'}
              </span>
            </div>
          )}
        </div>

        {/* Follow-up due chip */}
        {followUpsDue > 0 && (
          <Tooltip title={`${followUpsDue} follow-up${followUpsDue > 1 ? 's' : ''} overdue — click to view bookings`}>
            <Chip
              icon={<PhoneInTalkRoundedIcon sx={{ fontSize: 16 }} />}
              label={`${followUpsDue} due`}
              onClick={() => navigate('/admin/bookings')}
              sx={{ bgcolor: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FECACA', '& .MuiChip-icon': { color: '#DC2626' }, animation: 'followup-pulse 2s ease-in-out infinite',
                '@keyframes followup-pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.7 } } }}
            />
          </Tooltip>
        )}

        {/* Bell + notifications */}
        <Tooltip title="Notifications">
          <MuiIconButton onClick={handleBellClick} aria-label="Notifications" sx={{ bgcolor: '#F7F8FC' }}>
            <MuiBadge badgeContent={unreadCount} max={9} color="error">
              <NotificationsRoundedIcon fontSize="small" sx={{ color: '#5A5A5A' }} />
            </MuiBadge>
          </MuiIconButton>
        </Tooltip>
        <Popover
          open={notifOpen && !!notifAnchor}
          anchorEl={notifAnchor}
          onClose={closeNotif}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 340, maxWidth: '92vw', mt: 1, borderRadius: 4, border: '1px solid #ECECE8', boxShadow: '0 16px 40px rgba(17,17,17,.14)' } } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F2F2EE' }}>
            <Typography sx={{ fontWeight: 800, fontSize: 13.5 }}>Notifications</Typography>
            <MuiButton size="small" onClick={() => { closeNotif(); navigate('/admin/notifications'); }} sx={{ height: 28, fontSize: 12.5, color: '#2563EB' }}>View all</MuiButton>
          </div>
          <List dense disablePadding sx={{ maxHeight: 384, overflowY: 'auto' }}>
            {feed.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12.5, padding: '32px 16px', color: '#9CA3AF' }}>Nothing yet — new bookings, payments and trip updates will show up here live.</p>
            ) : (
              feed.slice(0, 20).map((item) => <NotificationItem key={item.id} item={item} onClick={() => goToNotification(item)} />)
            )}
          </List>
        </Popover>

        {/* User menu */}
        <MuiButton
          onClick={(e) => { setUserAnchor(e.currentTarget); setOpen(true); }}
          color="inherit"
          endIcon={<KeyboardArrowDownRoundedIcon sx={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', color: '#6B7280' }} />}
          sx={{ height: 44, px: 1, borderRadius: 3, '&:hover': { bgcolor: '#F7F8FC', transform: 'none' } }}
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: '#111', color: '#FFC107', fontSize: 14, fontWeight: 800, mr: { xs: 0, sm: 1 } }}>
            {name.slice(0, 1).toUpperCase()}
          </Avatar>
          <span className="hidden sm:block" style={{ textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, lineHeight: 1.1, color: '#111' }}>{name}</span>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: '#6B7280', marginTop: 2 }}>{role}</span>
          </span>
        </MuiButton>
        <Menu
          open={open && !!userAnchor}
          anchorEl={userAnchor}
          onClose={() => { setOpen(false); setUserAnchor(null); }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 220 } } }}
        >
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid #F2F2EE', marginBottom: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{name}</p>
            <p style={{ fontSize: 11.5, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</p>
          </div>
          <MenuItem onClick={() => { setOpen(false); setUserAnchor(null); logout(); navigate('/admin/login'); }} sx={{ color: '#DC2626' }}>
            <ListItemIcon sx={{ color: '#DC2626', minWidth: 30 }}><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
            Log out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

const NOTIF_META = {
  'booking:created':   { icon: Calendar,  label: (i) => `New booking ${i.bookingNumber || ''}`.trim(), clickable: true },
  'booking:attempted': {
    icon: Car,
    label: (i) => {
      const pickup = i.pickupAddress ? String(i.pickupAddress).split(',')[0].trim() : '';
      const drop = i.dropAddress ? String(i.dropAddress).split(',')[0].trim() : '';
      const route = pickup && drop ? `${pickup} → ${drop}` : pickup || 'Unknown route';
      const type = i.tripType ? ` · ${i.tripType.replace(/_/g, ' ')}` : '';
      return `Booking attempt — ${route}${type}`;
    },
    clickable: true,
  },
  'admin:alert':       {
    icon: AlertTriangle,
    label: (i) => {
      const pickup = i.pickupAddress ? String(i.pickupAddress).split(',')[0].trim() : '';
      return `⚠ Attempt failed${pickup ? ` — ${pickup}` : ''} — ${i.reason || i.failureReason || 'unknown'}`;
    },
    clickable: true,
  },
  'trip:status':       { icon: Truck,     label: (i) => `${i.bookingNumber || 'Booking'} → ${(i.status || '').replace(/_/g, ' ')}`, clickable: true },
  'booking:allocated': { icon: Truck,     label: (i) => `Vehicle assigned${i.bookingNumber ? ` to ${i.bookingNumber}` : ''}`, clickable: true },
  'payment:received':  { icon: CreditCard, label: (i) => `Payment received${i.amount ? ` — ₹${Number(i.amount).toLocaleString('en-IN')}` : ''}`, clickable: true },
  'booking_request:created': { icon: Inbox, label: (i) => `Booking request ${i.requestNumber || ''}${i.contactName ? ` — ${i.contactName}` : ''}`.trim(), clickable: true },
  'whatsapp:handoff': { icon: AlertTriangle, label: (i) => `💬 ${i.text || `${i.customerName || 'WhatsApp customer'} needs a person`}`, clickable: true },
  'dispatch:unassigned': { icon: AlertTriangle, label: (i) => `⏰ ${i.text || `${i.bookingNumber} needs a vehicle / driver`}`, clickable: true },
  'booking:abandoned': { icon: MessageSquareWarning, label: (i) => `Abandoned — ${i.name || i.pickupAddress?.split(',')[0] || 'unknown customer'}`, clickable: true },
};

function NotificationItem({ item, onClick }) {
  const meta = NOTIF_META[item.kind] || { icon: Bell, label: () => item.kind, clickable: true };
  const Icon = meta.icon;
  return (
    <ListItemButton onClick={onClick} sx={{ alignItems: 'flex-start', gap: 1.25, px: 2, py: 1.25, borderRadius: 0, borderBottom: '1px solid #F7F8FC' }}>
      <Avatar variant="rounded" sx={{ width: 30, height: 30, bgcolor: '#FFF8E1', color: '#B45309', mt: 0.25 }}>
        <Icon size={14} />
      </Avatar>
      <ListItemText
        primary={meta.label(item)}
        secondary={timeAgo(item.at)}
        slotProps={{ primary: { sx: { fontSize: 12.5, fontWeight: 600, color: '#1F2937', lineHeight: 1.35 } }, secondary: { sx: { fontSize: 11, color: '#9CA3AF', mt: 0.25 } } }}
      />
    </ListItemButton>
  );
}
