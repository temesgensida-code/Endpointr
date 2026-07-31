/**
 * useWorkflows.js — Workflow CRUD + run dispatch.
 */
import { useState, useEffect, useCallback } from 'react'
import { workflowsService } from '../services/workflowsService'

export function useWorkflows(getToken, projectId) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const svc = workflowsService()

  const refetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await svc.list(projectId)
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) refetch()
  }, [projectId, refetch])

  const createWorkflow = useCallback(async (data) => {
    const wf = await svc.create(projectId, data)
    setWorkflows((prev) => [wf, ...prev])
    return wf
  }, [projectId])

  const updateWorkflow = useCallback(async (workflowId, data) => {
    const updated = await svc.update(projectId, workflowId, data)
    setWorkflows((prev) => prev.map((w) => (w.id === workflowId ? updated : w)))
    return updated
  }, [projectId])

  const deleteWorkflow = useCallback(async (workflowId) => {
    await svc.delete(projectId, workflowId)
    setWorkflows((prev) => prev.filter((w) => w.id !== workflowId))
  }, [projectId])

  /**
   * Trigger a workflow run. Returns { run_id, status }.
   * The caller can then open the WS for live updates:
   *   ws://.../ws/runs/<run_id>/live/
   */
  const triggerRun = useCallback(async (workflowId) => {
    return svc.triggerRun(projectId, workflowId)
  }, [projectId])

  const listRuns = useCallback(async (workflowId) => {
    return svc.listRuns(projectId, workflowId)
  }, [projectId])

  return {
    workflows, loading, error, refetch,
    createWorkflow, updateWorkflow, deleteWorkflow, triggerRun, listRuns,
  }
}

