/**
 * Surge pricing service — /api/v1/admin/surge/*
 */
import { apiClient } from './apiClient';

function unwrap(res) {
  return res?.data ?? res;
}

export const surgeService = {
  // Rules
  async listRules() { return unwrap(await apiClient.get('/admin/surge/rules')); },
  async updateRule(tier, body) { return unwrap(await apiClient.patch(`/admin/surge/rules/${tier}`, body)); },

  // Areas
  async listAreas() { return unwrap(await apiClient.get('/admin/surge/areas')); },
  async createArea(body) { return unwrap(await apiClient.post('/admin/surge/areas', body)); },
  async updateArea(id, body) { return unwrap(await apiClient.patch(`/admin/surge/areas/${id}`, body)); },
  async deactivateArea(id) { return unwrap(await apiClient.delete(`/admin/surge/areas/${id}`)); },

  // Classify
  async classify(lat, lng) { return unwrap(await apiClient.get('/admin/surge/areas/classify', { params: { lat, lng } })); },

  // Area suggestion — auto-suggest centre + radius for a named place
  async suggestArea(name, state) { return unwrap(await apiClient.get('/admin/surge/areas/suggest', { params: { name, ...(state ? { state } : {}) } })); },

  // ── Route-based surge (corridor premiums) ───────────────────────────────
  async listRoutes(params = {}) { return unwrap(await apiClient.get('/admin/surge/routes', { params })); },

  async createRoute(body) { return unwrap(await apiClient.post('/admin/surge/routes', body)); },

  async updateRoute(id, body) { return unwrap(await apiClient.patch(`/admin/surge/routes/${id}`, body)); },

  async deactivateRoute(id) { return unwrap(await apiClient.delete(`/admin/surge/routes/${id}`)); },

  /**
   * Preview: test a real trip against configured corridors WITHOUT quoting it.
   * Returns which route rules match and what percentage would apply.
   */
  async previewRoute({ pickupLat, pickupLng, dropLat, dropLng, pickupAt }) {
    return unwrap(await apiClient.get('/admin/surge/routes/preview', {
      params: { pickupLat, pickupLng, dropLat, dropLng, ...(pickupAt ? { pickupAt } : {}) },
    }));
  },
};
