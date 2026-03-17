const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = { error: 'Invalid JSON response from server.' }
  }

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}

export function signup(body) {
  return request('/auth/signup/', { method: 'POST', body })
}

export function signin(body) {
  return request('/auth/signin/', { method: 'POST', body })
}

export function forgotPassword(body) {
  return request('/auth/forgot-password/', { method: 'POST', body })
}

export function resetPassword(body) {
  return request('/auth/reset-password/', { method: 'POST', body })
}

export function validateToken(token) {
  return request('/auth/validate-token/', { method: 'GET', token })
}
