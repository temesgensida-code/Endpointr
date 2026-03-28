const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function sendChatMessageApi({ getToken, userId, question }) {
  const token = await getToken()
  const response = await fetch(`${API_BASE_URL}/ai/chat/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: question,
      client_user_id: userId,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `Chat request failed with status ${response.status}`
    throw new Error(message)
  }

  return {
    answer: payload?.answer || 'I could not generate a response.',
    contextIds: Array.isArray(payload?.context_request_ids) ? payload.context_request_ids : [],
  }
}

export async function fetchAiChatHistoryApi({ getToken, userId }) {
  const token = await getToken()
  const response = await fetch(`${API_BASE_URL}/ai/history/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      client_user_id: userId,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `History request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload.history || []
}
