/**
 * projectsService.js — CRUD for Projects, Members, and API Keys.
 */
import { apiClient } from './api'

export function projectsService(getToken) {
  const api = apiClient(getToken)

  return {
    // ── Projects ──────────────────────────────────────────────────────────
    list: () => api.get('/projects/'),

    get: (projectId) => api.get(`/projects/${projectId}/`),

    create: (data) => api.post('/projects/', data),

    update: (projectId, data) => api.patch(`/projects/${projectId}/`, data),

    delete: (projectId) => api.delete(`/projects/${projectId}/`),

    // ── Members ───────────────────────────────────────────────────────────
    listMembers: (projectId) =>
      api.get(`/projects/${projectId}/members/`),

    addMember: (projectId, clerkUserId, role = 'viewer') =>
      api.post(`/projects/${projectId}/members/`, {
        clerk_user_id: clerkUserId,
        role,
      }),

    updateMemberRole: (projectId, memberId, role) =>
      api.patch(`/projects/${projectId}/members/${memberId}/`, { role }),

    removeMember: (projectId, memberId) =>
      api.delete(`/projects/${projectId}/members/${memberId}/`),

    // ── API Keys ──────────────────────────────────────────────────────────
    listApiKeys: (projectId) => api.get(`/projects/${projectId}/api-keys/`),

    createApiKey: (projectId, data) =>
      api.post(`/projects/${projectId}/api-keys/`, data),

    deleteApiKey: (projectId, keyId) =>
      api.delete(`/projects/${projectId}/api-keys/${keyId}/`),
  }
}
