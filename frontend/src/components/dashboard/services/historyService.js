const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function fetchRequestHistory({ userId = 'single_user' } = {}) {
  const params = new URLSearchParams()
  if (userId) {
    params.set('client_user_id', userId)
  }

  const response = await fetch(`${API_BASE_URL}/api-request/history/?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
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


export async function deleteRequestHistoryItemApi({ userId = 'single_user', historyId }) {
  const response = await fetch(`${API_BASE_URL}/api-request/history/delete/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_user_id: userId,
      history_id: historyId,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `Delete history failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}
