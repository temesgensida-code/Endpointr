/**
 * useCollections.js — Collections within a project.
 */
import { useState, useEffect, useCallback } from 'react'
import { collectionsService } from '../services/collectionsService'

export function useCollections(getToken, projectId) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const svc = collectionsService(getToken)

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
  }, [getToken, projectId])

  useEffect(() => {
    if (getToken && projectId) refetch()
  }, [getToken, projectId, refetch])

  const createCollection = useCallback(async (data) => {
    const col = await svc.create(projectId, data)
    setCollections((prev) => [col, ...prev])
    return col
  }, [getToken, projectId])

  const updateCollection = useCallback(async (collectionId, data) => {
    const updated = await svc.update(projectId, collectionId, data)
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? updated : c)))
    return updated
  }, [getToken, projectId])

  const deleteCollection = useCallback(async (collectionId) => {
    await svc.delete(projectId, collectionId)
    setCollections((prev) => prev.filter((c) => c.id !== collectionId))
  }, [getToken, projectId])

  const cloneCollection = useCallback(async (collectionId) => {
    const clone = await svc.clone(projectId, collectionId)
    setCollections((prev) => [clone, ...prev])
    return clone
  }, [getToken, projectId])

  return {
    collections, loading, error, refetch,
    createCollection, updateCollection, deleteCollection, cloneCollection,
  }
}
