/**
 * monitoringService.js — Monitors and Incidents.
 */
import { apiClient } from './api'

export function monitoringService(getToken) {
  const api = apiClient(getToken)
  const base = (p) => `/projects/${p}/monitoring`

  return {
    listMonitors: (projectId, activeOnly) => {
      const qs = activeOnly !== undefined ? `?active=${activeOnly}` : ''
      return api.get(`${base(projectId)}/${qs}`)
    },
    getStatus: (projectId) => api.get(`${base(projectId)}/status/`),
    createMonitor: (projectId, data) => api.post(`${base(projectId)}/`, data),
    updateMonitor: (projectId, monitorId, data) =>
      api.patch(`${base(projectId)}/${monitorId}/`, data),
    deleteMonitor: (projectId, monitorId) =>
      api.delete(`${base(projectId)}/${monitorId}/`),
    probeNow: (projectId, monitorId) =>
      api.post(`${base(projectId)}/${monitorId}/probe/`, {}),
    listIncidents: (projectId, monitorId, status) => {
      const qs = status ? `?status=${status}` : ''
      return api.get(`${base(projectId)}/${monitorId}/incidents/${qs}`)
    },
    resolveIncident: (projectId, monitorId, incidentId) =>
      api.post(`${base(projectId)}/${monitorId}/incidents/${incidentId}/resolve/`, {}),
  }
}

/**
 * contractsService.js — Schema Snapshots and Diffs.
 */
export function contractsService(getToken) {
  const api = apiClient(getToken)
  const base = (p) => `/projects/${p}/contracts`

  return {
    listSnapshots: (projectId, endpoint) => {
      const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''
      return api.get(`${base(projectId)}/snapshots/${qs}`)
    },
    createSnapshot: (projectId, data) =>
      api.post(`${base(projectId)}/snapshots/`, data),
    listDiffs: (projectId, breakingOnly = false) => {
      const qs = breakingOnly ? '?breaking=true' : ''
      return api.get(`${base(projectId)}/diffs/${qs}`)
    },
    computeDiff: (projectId, oldSnapshotId, newSnapshotId) =>
      api.post(`${base(projectId)}/diffs/`, {
        old_snapshot_id: oldSnapshotId,
        new_snapshot_id: newSnapshotId,
      }),
    getDiff: (projectId, diffId) =>
      api.get(`${base(projectId)}/diffs/${diffId}/`),
  }
}

/**
 * reportsService.js — Dashboard KPIs, Perf summary, SLA.
 */
export function reportsService(getToken) {
  const api = apiClient(getToken)
  const base = (p) => `/projects/${p}/reports`

  return {
    getDashboard: (projectId) => api.get(`${base(projectId)}/dashboard/`),
    getPerfSummary: (projectId, { type, days } = {}) => {
      const params = new URLSearchParams()
      if (type) params.set('type', type)
      if (days) params.set('days', days)
      const qs = params.toString() ? `?${params}` : ''
      return api.get(`${base(projectId)}/performance/${qs}`)
    },
    getSLA: (projectId, days = 30) =>
      api.get(`${base(projectId)}/sla/?days=${days}`),
  }
}

/**
 * auditService.js — Audit log.
 */
export function auditService(getToken) {
  const api = apiClient(getToken)

  return {
    list: (projectId, { entityType, entityId, action, limit = 50, offset = 0 } = {}) => {
      const params = new URLSearchParams({ limit, offset })
      if (entityType) params.set('entity_type', entityType)
      if (entityId) params.set('entity_id', entityId)
      if (action) params.set('action', action)
      return api.get(`/projects/${projectId}/audit/?${params}`)
    },
  }
}

/**
 * securityService.js — JWT analysis and other security tools.
 */
export function securityService(getToken) {
  const api = apiClient(getToken)

  return {
    analyzeJWT: (token) => api.post('/security/jwt/analyze/', { token }),
  }
}

/**
 * documentationService.js — OpenAPI spec versions.
 */
export function documentationService(getToken) {
  const api = apiClient(getToken)
  const base = (p) => `/projects/${p}/documentation`

  return {
    listSpecs: (projectId) => api.get(`${base(projectId)}/`),
    getSpec: (projectId, specId) => api.get(`${base(projectId)}/${specId}/`),
    createSpec: (projectId, data) => api.post(`${base(projectId)}/`, data),
    deleteSpec: (projectId, specId) => api.delete(`${base(projectId)}/${specId}/`),
  }
}
