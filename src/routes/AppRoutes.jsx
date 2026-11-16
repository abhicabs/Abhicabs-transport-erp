import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout    from '../components/layout/AdminLayout';
import LoadingState   from '../components/ui/LoadingState';
import { PERMISSIONS } from '../constants';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import lazyRetry      from '../utils/lazyRetry';

// ── Auth ──────────────────────────────────────────────────────────────────
const AdminLogin     = lazyRetry(() => import('../pages/auth/AdminLogin'));
const ForgotPassword = lazyRetry(() => import('../pages/auth/ForgotPassword'));
const ResetPassword  = lazyRetry(() => import('../pages/auth/ResetPassword'));

// ── Admin pages ───────────────────────────────────────────────────────────
const Dashboard      = lazyRetry(() => import('../pages/admin/Dashboard'));
const Clients        = lazyRetry(() => import('../pages/admin/Clients'));
const Customers      = lazyRetry(() => import('../pages/admin/Customers'));
const CustomerDetail = lazyRetry(() => import('../pages/admin/CustomerDetail'));
const Drivers        = lazyRetry(() => import('../pages/admin/Drivers'));
const DriverDetail   = lazyRetry(() => import('../pages/admin/DriverDetail'));
const Vehicles       = lazyRetry(() => import('../pages/admin/Vehicles'));
const VehicleDetail  = lazyRetry(() => import('../pages/admin/VehicleDetail'));
const Bookings       = lazyRetry(() => import('../pages/admin/Bookings'));
const BookingDetail  = lazyRetry(() => import('../pages/admin/BookingDetail'));
const Dispatch       = lazyRetry(() => import('../pages/admin/Dispatch'));
const Trips          = lazyRetry(() => import('../pages/admin/Trips'));
const LiveTracking   = lazyRetry(() => import('../pages/admin/LiveTracking'));
const Payments       = lazyRetry(() => import('../pages/admin/Payments'));
const Invoices       = lazyRetry(() => import('../pages/admin/Invoices'));
const Reports        = lazyRetry(() => import('../pages/admin/Reports'));
const Masters        = lazyRetry(() => import('../pages/admin/Masters'));
const Notifications  = lazyRetry(() => import('../pages/admin/Notifications'));
const Support        = lazyRetry(() => import('../pages/admin/Support'));
const BookingRequests = lazyRetry(() => import('../pages/admin/BookingRequests'));
const WhatsApp       = lazyRetry(() => import('../pages/admin/WhatsApp'));
const Discounts      = lazyRetry(() => import('../pages/admin/Discounts'));
const UsersRoles     = lazyRetry(() => import('../pages/admin/UsersRoles'));
const Settings       = lazyRetry(() => import('../pages/admin/Settings'));

// ── Customer-facing (public, no auth) ─────────────────────────────────
const BookingRequestPage = lazyRetry(() => import('../pages/customer/BookingRequestPage'));

const NotFound       = lazyRetry(() => import('../pages/NotFound'));
const Unauthorized   = lazyRetry(() => import('../pages/Unauthorized'));

const P = ({ permission, children }) => (
  <ProtectedRoute permission={permission}>{children}</ProtectedRoute>
);

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <Routes>

        {/* ── Auth ── */}
        <Route path="/admin/login"  element={<AdminLogin />} />
        <Route path="/admin/forgot" element={<ForgotPassword />} />
        <Route path="/admin/reset"  element={<ResetPassword />} />

        {/* ── Admin — any authenticated staff role (ADMIN/OPS/FINANCE/FLEET/SUPPORT) ── */}
        <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard"    element={<Dashboard />} />
          <Route path="clients"      element={<P permission={PERMISSIONS.CLIENTS_VIEW}><Clients /></P>} />
          <Route path="customers"    element={<P permission={PERMISSIONS.CLIENTS_VIEW}><Customers /></P>} />
          <Route path="customers/:id" element={<P permission={PERMISSIONS.CLIENTS_VIEW}><CustomerDetail /></P>} />
          <Route path="drivers"      element={<P permission={PERMISSIONS.DRIVERS_VIEW}><Drivers /></P>} />
          <Route path="drivers/:id"  element={<P permission={PERMISSIONS.DRIVERS_VIEW}><DriverDetail /></P>} />
          <Route path="vehicles"     element={<P permission={PERMISSIONS.VEHICLES_VIEW}><Vehicles /></P>} />
          <Route path="vehicles/:id" element={<P permission={PERMISSIONS.VEHICLES_VIEW}><VehicleDetail /></P>} />
          <Route path="bookings"     element={<P permission={PERMISSIONS.BOOKINGS_VIEW}><Bookings /></P>} />
          <Route path="bookings/:id" element={<P permission={PERMISSIONS.BOOKINGS_VIEW}><BookingDetail /></P>} />
          <Route path="booking-requests" element={<P permission={PERMISSIONS.BOOKINGS_VIEW}><BookingRequests /></P>} />
          <Route path="dispatch"     element={<P permission={PERMISSIONS.DISPATCH_MANAGE}><Dispatch /></P>} />
          <Route path="trips"        element={<P permission={PERMISSIONS.TRIPS_VIEW}><Trips /></P>} />
          <Route path="tracking"     element={<P permission={PERMISSIONS.TRIPS_VIEW}><LiveTracking /></P>} />
          <Route path="payments"     element={<P permission={PERMISSIONS.PAYMENTS_VIEW}><Payments /></P>} />
          <Route path="invoices"     element={<P permission={PERMISSIONS.INVOICES_VIEW}><Invoices /></P>} />
          <Route path="reports"      element={<P permission={PERMISSIONS.REPORTS_VIEW}><Reports /></P>} />
          <Route path="masters"      element={<P permission={PERMISSIONS.MASTERS_MANAGE}><Masters /></P>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="support"      element={<P permission={PERMISSIONS.SUPPORT_MANAGE}><Support /></P>} />
          <Route path="whatsapp"     element={<P permission={PERMISSIONS.SETTINGS_MANAGE}><WhatsApp /></P>} />
          <Route path="discounts"    element={<P permission={PERMISSIONS.FARE_EDIT}><Discounts /></P>} />
          <Route path="users"        element={<P permission={PERMISSIONS.USERS_MANAGE}><UsersRoles /></P>} />
          <Route path="settings"    element={<P permission={PERMISSIONS.SETTINGS_MANAGE}><Settings /></P>} />
        </Route>

        {/* ── Customer-facing (public) ── */}
        <Route path="/booking-request" element={<BookingRequestPage />} />

        {/* ── Utility ── */}
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<NotFound />} />

      </Routes>
    </Suspense>
  );
}