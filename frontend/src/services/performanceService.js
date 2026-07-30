/**
 * performanceService.js — Perf test configs and runs.
 */
import { apiClient } from './api'

const base = (projectId) => `/projects/${projectId}/performance`

export function performanceService(getToken) {
  const api = apiClient(getToken)
  return {
    listConfigs: (projectId, type) => {
      const qs = type ? `?type=${type}` : ''
      return api.get(`${base(projectId)}/${qs}`)
    },
    getConfig: (projectId, configId) => api.get(`${base(projectId)}/${configId}/`),
    createConfig: (projectId, data) => api.post(`${base(projectId)}/`, data),
    updateConfig: (projectId, configId, data) =>
      api.patch(`${base(projectId)}/${configId}/`, data),
    deleteConfig: (projectId, configId) =>
      api.delete(`${base(projectId)}/${configId}/`),
    triggerRun: (projectId, configId) =>
      api.post(`${base(projectId)}/${configId}/run/`, {}),
    listRuns: (projectId, configId) =>
      api.get(`${base(projectId)}/${configId}/runs/`),
    // Improvement #8: cancel a queued or running test
    cancelRun: (projectId, configId, runId) =>
      api.post(`${base(projectId)}/${configId}/runs/${runId}/cancel/`, {}),
    getRegressionReport: (projectId, runAId, runBId) =>
      api.get(`${base(projectId)}/regression/?run_a=${runAId}&run_b=${runBId}`),
  }
}

