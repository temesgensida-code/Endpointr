/**
 * api.js — Base API client for Endpointr control-plane.
 *
 * All requests include the Clerk Bearer token.
 * Usage: import { apiClient } from '@/services/api'
 *        const client = apiClient(getToken)
 *        const projects = await client.get('/projects/')
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request(getToken, method, path, body = undefined) {
  const token = await getToken()
  if (!token) throw new ApiError('Not authenticated', 401, null)

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const options = { method, headers }
  if (body !== undefined) options.body = JSON.stringify(body)

  const res = await fetch(`${API_BASE}${path}`, options)

  let data
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  if (!res.ok) {
    const msg =
      (typeof data === 'object' && (data?.detail || data?.error || data?.message)) ||
      `Request failed: ${res.status} ${res.statusText}`
    throw new ApiError(msg, res.status, data)
  }

  return data
}

/**
 * Creates a bound API client for a given Clerk getToken function.
 * @param {function} getToken — Clerk's useAuth().getToken
 */
export function apiClient(getToken) {
  return {
    get: (path) => request(getToken, 'GET', path),
    post: (path, body) => request(getToken, 'POST', path, body),
    patch: (path, body) => request(getToken, 'PATCH', path, body),
    put: (path, body) => request(getToken, 'PUT', path, body),
    delete: (path) => request(getToken, 'DELETE', path),
  }
}

export { ApiError }
