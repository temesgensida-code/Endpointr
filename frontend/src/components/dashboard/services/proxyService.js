const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function sendProxyRequestApi({
  getToken,
  userId,
  requestMethod,
  requestUrl,
  requestJsonBody,
}) {
  const trimmedUrl = requestUrl.trim()
  if (!trimmedUrl) {
    throw new Error('Please enter a URL.')
  }

  let parsedBody = undefined
  const methodAllowsBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod)

  if (methodAllowsBody && requestJsonBody.trim()) {
    try {
      parsedBody = JSON.parse(requestJsonBody)
    } catch {
      throw new Error('JSON body is invalid. Please fix it before sending.')
    }
  }

  const token = await getToken()
  if (!token) {
    throw new Error('No Clerk token available yet. Try again in a moment.')
  }

  const response = await fetch(`${API_BASE_URL}/api-request/proxy/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      method: requestMethod,
      url: trimmedUrl,
      client_user_id: userId,
      ...(methodAllowsBody && parsedBody !== undefined ? { json: parsedBody } : {}),
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `Proxy call failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}
