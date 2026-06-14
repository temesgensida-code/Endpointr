/**
 * collectionsService.js — Collections, Folders, Requests, Assertions, Environments.
 */
import { apiClient } from './api'

const base = (projectId) => `/projects/${projectId}/collections`

export function collectionsService(getToken) {
  const api = apiClient(getToken)

  return {
    // ── Collections ───────────────────────────────────────────────────────
    list: (projectId) => api.get(`${base(projectId)}/`),

    get: (projectId, collectionId) =>
      api.get(`${base(projectId)}/${collectionId}/`),

    create: (projectId, data) => api.post(`${base(projectId)}/`, data),

    update: (projectId, collectionId, data) =>
      api.patch(`${base(projectId)}/${collectionId}/`, data),

    delete: (projectId, collectionId) =>
      api.delete(`${base(projectId)}/${collectionId}/`),

    clone: (projectId, collectionId) =>
      api.post(`${base(projectId)}/${collectionId}/clone/`, {}),

    // ── Requests ──────────────────────────────────────────────────────────
    listRequests: (projectId, collectionId) =>
      api.get(`${base(projectId)}/${collectionId}/requests/`),

    createRequest: (projectId, collectionId, data) =>
      api.post(`${base(projectId)}/${collectionId}/requests/`, data),

    getRequest: (projectId, collectionId, requestId) =>
      api.get(`${base(projectId)}/${collectionId}/requests/${requestId}/`),

    updateRequest: (projectId, collectionId, requestId, data) =>
      api.patch(`${base(projectId)}/${collectionId}/requests/${requestId}/`, data),

    deleteRequest: (projectId, collectionId, requestId) =>
      api.delete(`${base(projectId)}/${collectionId}/requests/${requestId}/`),

    // ── Folders ───────────────────────────────────────────────────────────
    listFolders: (projectId, collectionId) =>
      api.get(`${base(projectId)}/${collectionId}/folders/`),

    createFolder: (projectId, collectionId, data) =>
      api.post(`${base(projectId)}/${collectionId}/folders/`, data),

    deleteFolder: (projectId, collectionId, folderId) =>
      api.delete(`${base(projectId)}/${collectionId}/folders/${folderId}/`),

    // ── Assertions ────────────────────────────────────────────────────────
    listAssertions: (projectId, collectionId, requestId) =>
      api.get(`${base(projectId)}/${collectionId}/requests/${requestId}/assertions/`),

    createAssertion: (projectId, collectionId, requestId, data) =>
      api.post(
        `${base(projectId)}/${collectionId}/requests/${requestId}/assertions/`,
        data,
      ),

    // ── Environments ──────────────────────────────────────────────────────
    listEnvironments: (projectId) =>
      api.get(`${base(projectId)}/environments/`),

    createEnvironment: (projectId, data) =>
      api.post(`${base(projectId)}/environments/`, data),

    updateEnvironment: (projectId, envId, data) =>
      api.patch(`${base(projectId)}/environments/${envId}/`, data),

    deleteEnvironment: (projectId, envId) =>
      api.delete(`${base(projectId)}/environments/${envId}/`),
  }
}
