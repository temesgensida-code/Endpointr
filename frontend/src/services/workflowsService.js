/**
 * workflowsService.js — Workflows and Workflow Runs.
 */
import { apiClient } from './api'

const base = (projectId) => `/projects/${projectId}/workflows`

export function workflowsService(getToken) {
  const api = apiClient(getToken)

  return {
    list: (projectId) => api.get(`${base(projectId)}/`),

    get: (projectId, workflowId) =>
      api.get(`${base(projectId)}/${workflowId}/`),

    create: (projectId, data) => api.post(`${base(projectId)}/`, data),

    update: (projectId, workflowId, data) =>
      api.patch(`${base(projectId)}/${workflowId}/`, data),

    delete: (projectId, workflowId) =>
      api.delete(`${base(projectId)}/${workflowId}/`),

    /** Dispatch a run — returns { run_id, status: "queued" } */
    triggerRun: (projectId, workflowId) =>
      api.post(`${base(projectId)}/${workflowId}/run/`, {}),

    listRuns: (projectId, workflowId) =>
      api.get(`${base(projectId)}/${workflowId}/runs/`),

    getRun: (projectId, workflowId, runId) =>
      api.get(`${base(projectId)}/${workflowId}/runs/${runId}/`),
  }
}
