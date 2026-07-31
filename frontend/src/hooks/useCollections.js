/**
 * useCollections.js — Collections within a project.
 */
import { useState, useEffect, useCallback } from 'react'
import { collectionsService } from '../services/collectionsService'

export function useCollections(getToken, projectId) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const svc = collectionsService()

  const refetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await svc.list(projectId)
      setCollections(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) refetch()
  }, [projectId, refetch])

  const createCollection = useCallback(async (data) => {
    const col = await svc.create(projectId, data)
    setCollections((prev) => [col, ...prev])
    return col
  }, [projectId])

  const updateCollection = useCallback(async (collectionId, data) => {
    const updated = await svc.update(projectId, collectionId, data)
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? updated : c)))
    return updated
  }, [projectId])

  const deleteCollection = useCallback(async (collectionId) => {
    await svc.delete(projectId, collectionId)
    setCollections((prev) => prev.filter((c) => c.id !== collectionId))
  }, [projectId])

  const cloneCollection = useCallback(async (collectionId) => {
    const clone = await svc.clone(projectId, collectionId)
    setCollections((prev) => [clone, ...prev])
    return clone
  }, [projectId])

  return {
    collections, loading, error, refetch,
    createCollection, updateCollection, deleteCollection, cloneCollection,
  }
}

