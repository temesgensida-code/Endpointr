/**
 * useProjects.js — React hook for project list management.
 *
 * Usage:
 *   const { projects, loading, error, createProject, deleteProject, refetch } = useProjects(getToken)
 */
import { useState, useEffect, useCallback } from 'react'
import { projectsService } from '../services/projectsService'

export function useProjects(getToken) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const svc = projectsService(getToken)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await svc.list()
      setProjects(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (getToken) refetch()
  }, [getToken, refetch])

  const createProject = useCallback(async ({ name, description = '' }) => {
    const project = await svc.create({ name, description })
    setProjects((prev) => [project, ...prev])
    return project
  }, [getToken])

  const updateProject = useCallback(async (projectId, data) => {
    const updated = await svc.update(projectId, data)
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)))
    return updated
  }, [getToken])

  const deleteProject = useCallback(async (projectId) => {
    await svc.delete(projectId)
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
  }, [getToken])

  return { projects, loading, error, refetch, createProject, updateProject, deleteProject }
}
