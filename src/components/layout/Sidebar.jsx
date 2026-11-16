import { NavLink, useLocation } from 'react-router-dom';
import MuiDrawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import MuiIconButton from '@mui/material/IconButton';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LocalOfferRoundedIcon from '@mui/icons-material/LocalOfferRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useAuth } from '../../hooks/useAuth';
import { useAdminRealtimeContext } from '../../context/AdminRealtimeContext';

// Nav icons from @mui/icons-material (Rounded set). constants/index.js still
// names them by their lucide names, so the mapping lives here; an unknown
// name falls back to a dot rather than breaking the menu.
const NAV_ICONS = {
  LayoutDashboard: DashboardRoundedIcon,
  Users: PeopleAltRoundedIcon,
  IdCard: BadgeRoundedIcon,
  Truck: LocalShippingRoundedIcon,
  CalendarCheck: EventAvailableRoundedIcon,
  Inbox: InboxRoundedIcon,
  Radio: SensorsRoundedIcon,
  Route: AltRouteRoundedIcon,
  MapPin: PlaceRoundedIcon,
  CreditCard: CreditCardRoundedIcon,
  FileText: DescriptionRoundedIcon,
  BarChart3: InsightsRoundedIcon,
  Database: PriceChangeRoundedIcon,
  Bell: NotificationsRoundedIcon,
  LifeBuoy: SupportAgentRoundedIcon,
  MessageCircle: WhatsAppIcon,
  Tag: LocalOfferRoundedIcon,
  ShieldCheck: AdminPanelSettingsRoundedIcon,
  Settings: SettingsRoundedIcon,
  User: PersonRoundedIcon,
};

/** One nav row: MUI ListItemButton rendered as a router NavLink.
 *  When `collapsed`, it shrinks to an icon-only rail and shows the label as a
 *  hover tooltip (so the menu is still usable without the text). */
function NavItem({ item, badge, collapsed, onCloseMobile }) {
  const location = useLocation();
  const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  const Icon = NAV_ICONS[item.icon] || FiberManualRecordRoundedIcon;

  const button = (
    <ListItemButton
      component={NavLink}
      to={item.to}
      onClick={onCloseMobile}
      selected={active}
      sx={{
        position: 'relative',
        py: 1,
        px: collapsed ? 0 : 1.5,
        gap: collapsed ? 0 : 1.25,
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: '#9A9A95',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', color: '#fff' },
        '&.Mui-selected': { bgcolor: '#FFC107', color: '#111', boxShadow: '0 4px 14px rgba(255,193,7,.25)' },
        '&.Mui-selected:hover': { bgcolor: '#FFCA2C' },
      }}
    >
      <Icon sx={{ fontSize: 19, flexShrink: 0 }} />
      {!collapsed && (
        <ListItemText primary={item.label} slotProps={{ primary: { noWrap: true, sx: { fontSize: 13.5, fontWeight: 650 } } }} />
      )}
      {!collapsed && badge > 0 && (
        <Chip size="small" label={badge > 99 ? '99+' : badge} aria-label={`${badge} new`} sx={{ bgcolor: '#EF4444', color: '#fff', height: 20, fontSize: 11 }} />
      )}
      {collapsed && badge > 0 && (
        <span aria-label={`${badge} new`} style={{ position: 'absolute', top: 6, right: 10, minWidth: 8, height: 8, borderRadius: 999, backgroundColor: '#EF4444', boxShadow: '0 0 0 2px #111111' }} />
      )}
    </ListItemButton>
  );

  // In the rail, the label lives in a tooltip instead of inline text.
  return collapsed
    ? <Tooltip title={item.label} placement="right">{button}</Tooltip>
    : button;
}

/** The shared sidebar body. `collapsed` only applies to the desktop rail;
 *  the mobile drawer always renders fully expanded. `onToggleCollapse` is
 *  passed only for the desktop rail, so the collapse control is desktop-only. */
function SidebarBody({ items, badges, collapsed, onToggleCollapse, onCloseMobile }) {
  return (
    <>
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0' : '0 20px', height: 64, flexShrink: 0,
        borderBottom: '1px solid rgba(255,193,7,0.15)',
      }}>
        <div style={{
          height: 36, width: 36, borderRadius: 10, display: 'grid',
          placeItems: 'center', flexShrink: 0,
          background: '#FFC107',
        }}>
          <img src="/brand/abhicabs-mark.svg" alt="ABHI CABS" style={{ height: 24, width: 24 }} />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            {/* Brand guide: "ABHI" is Montserrat Bold, "CABS" is SF Pro
                Display Medium. */}
            <p style={{ color: '#fff', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 700 }}>ABHI</span>{' '}
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>CABS</span>
            </p>
            <p style={{ fontSize: 11.5, marginTop: 3, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: '#FFC107', whiteSpace: 'nowrap' }}>
              Transport ERP
            </p>
          </div>
        )}
      </div>

      {/* Collapse / expand control — desktop rail only */}
      {onToggleCollapse && (
        <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', padding: '8px 12px', flexShrink: 0 }}>
          <Tooltip title={collapsed ? 'Expand' : 'Collapse'} placement="right">
            <MuiIconButton
              onClick={onToggleCollapse}
              size="small"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              sx={{ color: '#9A9A95', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              {collapsed ? <ChevronRightRoundedIcon sx={{ fontSize: 20 }} /> : <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />}
            </MuiIconButton>
          </Tooltip>
        </div>
      )}

      {/* Nav items */}
      <List component="nav" sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1, py: collapsed ? 0.5 : 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {items.map((item) => (
          <NavItem key={item.to} item={item} badge={badges[item.to] || 0} collapsed={collapsed} onCloseMobile={onCloseMobile} />
        ))}
      </List>

      {/* Footer — hidden in the collapsed rail (no room for the text) */}
      {!collapsed && (
        <div style={{ padding: '12px 20px', flexShrink: 0, borderTop: '1px solid rgba(255,193,7,0.1)' }}>
          <p style={{ fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, color: '#444' }}>
            © 2026 ABHI CABS
          </p>
          <p style={{ fontSize: 11.5, marginTop: 2, fontWeight: 700, color: '#FFC107' }}>
            Ride With Trust
          </p>
        </div>
      )}
    </>
  );
}

export default function Sidebar({ nav, mobileOpen, onCloseMobile, collapsed = false, onToggleCollapse }) {
  const { hasPermission } = useAuth();
  const { newRequestCount, handoffCount } = useAdminRealtimeContext();
  const items = nav.filter((item) => hasPermission(item.permission));
  // Live counts shown next to a nav item.
  const badges = { '/admin/booking-requests': newRequestCount, '/admin/whatsapp': handoffCount };

  return (
    <>
      {/* Desktop sidebar — fixed, collapsible icon rail.
          Width, show/hide (below the lg breakpoint) and the matching content
          margin are all driven by authored CSS (.terp-sidebar-desktop /
          .terp-content + the --terp-sidebar-w variable in index.css) rather
          than Tailwind utilities, so this layout-critical sizing never depends
          on JIT class generation. */}
      <aside
        className={`terp-sidebar-desktop${collapsed ? ' is-collapsed' : ''}`}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          zIndex: 20, backgroundColor: '#111111', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <SidebarBody
          items={items}
          badges={badges}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {/* Mobile: MUI temporary drawer — always full width / expanded */}
      <MuiDrawer
        open={!!mobileOpen}
        onClose={onCloseMobile}
        className="lg:hidden"
        slotProps={{ paper: { sx: { width: 'var(--terp-sidebar-w)', bgcolor: '#111111', display: 'flex', flexDirection: 'column', borderRight: 0 } } }}
      >
        <SidebarBody
          items={items}
          badges={badges}
          collapsed={false}
          onCloseMobile={onCloseMobile}
        />
      </MuiDrawer>
    </>
  );
}
