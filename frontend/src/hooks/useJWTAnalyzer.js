/**
 * useJWTAnalyzer.js — JWT decode + security analysis hook.
 *
 * Usage:
 *   const { analyze, result, loading, error, clear } = useJWTAnalyzer(getToken)
 */
import { useState, useCallback } from 'react'
import { securityService } from '../services/domainServices'

export function useJWTAnalyzer(getToken) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const svc = securityService(getToken)

  const analyze = useCallback(async (token) => {
    setLoading(true)
    setError(null)
    try {
      const data = await svc.analyzeJWT(token)
      setResult(data)
      return data
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { analyze, result, loading, error, clear }
}
