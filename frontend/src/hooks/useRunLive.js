/**
 * useRunLive.js — Subscribe to real-time run events via WebSocket.
 *
 * Usage:
 *   const { events, status, connected } = useRunLive(getToken, runId)
 *
 * Events are accumulated in the `events` array as they arrive.
 * `status` reflects the latest run status from the server.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
  .replace(/^http/, 'ws')

export function useRunLive(getToken, runId) {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  const connect = useCallback(async () => {
    if (!runId || !getToken) return

    const token = await getToken()
    if (!token) return

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close()
    }

    const url = `${WS_BASE}/ws/runs/${runId}/live/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        setEvents((prev) => [...prev, payload])
        if (payload.status) setStatus(payload.status)
        // Auto-disconnect on terminal states
        if (['passed', 'failed', 'partial', 'cancelled', 'completed'].includes(payload.status)) {
          ws.close()
        }
      } catch {
        // ignore non-JSON frames
      }
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
  }, [getToken, runId])

  useEffect(() => {
    if (runId) {
      setEvents([])
      setStatus(null)
      connect()
    }
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [runId, connect])

  return { events, status, connected }
}

/**
 * useProjectLive.js — Subscribe to project-wide live events.
 */
export function useProjectLive(getToken, projectId, onEvent) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!projectId || !getToken) return

    let cancelled = false

    const connect = async () => {
      const token = await getToken()
      if (!token || cancelled) return

      const url = `${WS_BASE}/ws/projects/${projectId}/live/?token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => !cancelled && setConnected(true)
      ws.onmessage = (e) => {
        if (cancelled) return
        try {
          const payload = JSON.parse(e.data)
          onEvent?.(payload)
        } catch {}
      }
      ws.onclose = () => !cancelled && setConnected(false)
    }

    connect()

    return () => {
      cancelled = true
      if (wsRef.current) wsRef.current.close()
    }
  }, [getToken, projectId])

  return { connected }
}
