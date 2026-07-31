/**
 * useJWTAnalyzer.js — JWT decode + security analysis hook.
 */
import { useState, useCallback } from 'react'
import { securityService } from '../services/domainServices'

export function useJWTAnalyzer(getToken) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const svc = securityService(getToken)

  const analyze = useCallback(async (token, useActiveSession = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await svc.analyzeJWT(token, useActiveSession)
      setResult(data)
      return data
    } catch (err) {
      setError(err.message || 'Failed to analyze token.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  const inspectActiveSession = useCallback(async () => {
    return analyze('', true)
  }, [analyze])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { analyze, inspectActiveSession, result, loading, error, clear }
}
