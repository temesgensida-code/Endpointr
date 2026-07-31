/**
 * useDashboard.js — Loads all KPI data for the project dashboard.
 *
 * Combines:
 *   - GET /projects/<id>/reports/dashboard/
 *   - GET /projects/<id>/monitoring/status/
 *
 * Usage:
 *   const { kpis, monitorStatus, loading, error, refetch } = useDashboard(getToken, projectId)
 */
import { useState, useEffect, useCallback } from 'react'
import { reportsService, monitoringService } from '../services/domainServices'

export function useDashboard(getToken, projectId) {
  const [kpis, setKpis] = useState(null)
  const [monitorStatus, setMonitorStatus] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const reportsSvc = reportsService()
  const monitorSvc = monitoringService()

  const refetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const [dashboard, status] = await Promise.all([
        reportsSvc.getDashboard(projectId),
        monitorSvc.getStatus(projectId).catch(() => []),
      ])
      setKpis(dashboard)
      setMonitorStatus(Array.isArray(status) ? status : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) refetch()
  }, [projectId, refetch])

  return { kpis, monitorStatus, loading, error, refetch }
}

