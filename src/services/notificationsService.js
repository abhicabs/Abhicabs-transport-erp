/**
 * Admin notifications — /api/v1/admin/notifications
 *
 * Wired to the real backend notification endpoints. Falls back to mock data
 * when the backend is unreachable or the endpoint is not yet deployed, so the
 * Notifications page and Navbar bell badge always render.
 */
import { apiClient, withMockFallback } from './apiClient';
import * as db from './mockDb';
import { mockResolve } from './mockUtils';

function mockList(params = {}) {
  const { page = 1, limit = 20 } = params;
  const all    = [...db.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const start  = (page - 1) * limit;
  const items  = all.slice(start, start + limit);
  const unread = all.filter(n => !n.read).length;
  return {
    data:        items,
    unreadCount: unread,
    meta: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
  };
}

export const notificationsService = {
  async list(params = {}) {
    return withMockFallback(
      async () => {
        const res = await apiClient.get('/admin/notifications', { params });
        const items = res?.data ?? res?.items ?? (Array.isArray(res) ? res : []);
        const meta = res?.meta ?? res?.pagination ?? {};
        // Fetch unread count in parallel
        let unreadCount = 0;
        try {
          const uc = await apiClient.get('/admin/notifications/unread-count');
          unreadCount = uc?.unreadCount ?? uc?.data?.unreadCount ?? 0;
        } catch { /* best-effort */ }
        return { data: items, unreadCount, meta };
      },
      () => mockResolve(mockList(params)),
    );
  },

  async unreadCount() {
    return withMockFallback(
      async () => {
        const res = await apiClient.get('/admin/notifications/unread-count');
        return res?.unreadCount ?? res?.data?.unreadCount ?? 0;
      },
      () => mockResolve(db.notifications.filter(n => !n.read).length),
    );
  },

  async markRead(id) {
    return withMockFallback(
      () => apiClient.patch(`/admin/notifications/${id}/read`),
      () => {
        const n = db.notifications.find(n => n.id === id);
        if (n) n.read = true;
        return mockResolve(n || { id });
      },
    );
  },

  async markAllRead() {
    return withMockFallback(
      () => apiClient.post('/admin/notifications/read-all'),
      () => {
        db.notifications.forEach(n => { n.read = true; });
        return mockResolve({ success: true });
      },
    );
  },

  async registerPushToken(_token, _platform = 'WEB') {
    // Token registration — will be wired when push notification backend is ready
    return mockResolve({ success: true });
  },
};
