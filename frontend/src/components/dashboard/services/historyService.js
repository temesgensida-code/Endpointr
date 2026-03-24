const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function fetchRequestHistory({ getToken, userId }) {
  const token = await getToken()
  const params = new URLSearchParams()
  if (userId) {
    params.set('client_user_id', userId)
  }

  const response = await fetch(`${API_BASE_URL}/api-request/history/?${params.toString()}`, {
    method: 'GET',
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `History request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload?.history || []
}
