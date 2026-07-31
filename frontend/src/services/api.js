/**
 * api.js — Base API client for Endpointr control-plane (Single User).
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

async function request(method, path, body = undefined) {
  const headers = {
    'Content-Type': 'application/json',
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
 * Returns the single-user API client.
 */
export function apiClient(_getToken = null) {
  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
  }
}

export { ApiError }

