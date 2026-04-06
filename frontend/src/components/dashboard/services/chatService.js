const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

export async function streamChatMessageWs({ getToken, userId, question, conversationId, onChunk }) {
  const token = await getToken()
  const params = new URLSearchParams({
    conversation_id: conversationId,
    ...(userId ? { client_user_id: userId } : {}),
    ...(token ? { token } : {}),
  })

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_BASE_URL}/ws/ai/chat/?${params.toString()}`)
    let completed = false
    let collectedAnswer = ''

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          message: question,
          conversation_id: conversationId,
          ...(userId ? { client_user_id: userId } : {}),
        })
      )
    }

    socket.onmessage = (event) => {
      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        reject(new Error('Invalid stream message from server.'))
        socket.close()
        return
      }

      if (payload?.type === 'assistant_chunk') {
        const delta = typeof payload?.delta === 'string' ? payload.delta : ''
        if (delta) {
          collectedAnswer += delta
          if (typeof onChunk === 'function') {
            onChunk(delta)
          }
        }
        return
      }

      if (payload?.type === 'assistant_complete') {
        completed = true
        resolve({
          answer: payload?.answer || collectedAnswer || 'I could not generate a response.',
          contextIds: Array.isArray(payload?.context_request_ids) ? payload.context_request_ids : [],
        })
        socket.close()
        return
      }

      if (payload?.type === 'assistant_error') {
        const details = payload?.details ? ` (${payload.details})` : ''
        reject(new Error(payload?.error ? `${payload.error}${details}` : 'Chat stream failed.'))
        socket.close()
      }
    }

    socket.onerror = () => {
      if (!completed) {
        reject(new Error('WebSocket connection failed.'))
      }
    }

    socket.onclose = () => {
      if (!completed) {
        reject(new Error('Chat stream closed before completion.'))
      }
    }
  })
}

export async function sendChatMessageApi({ getToken, userId, question, conversationId }) {
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
      conversation_id: conversationId,
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

export async function fetchAiChatHistoryApi({ getToken, userId, action = "list_conversations", conversationId = "" }) {
  const token = await getToken()
  const response = await fetch(`${API_BASE_URL}/ai/history/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      client_user_id: userId,
      action: action,
      conversation_id: conversationId,
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


export async function deleteAiChatHistoryApi({ getToken, userId, conversationId }) {
  const token = await getToken()
  const response = await fetch(`${API_BASE_URL}/ai/history/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      client_user_id: userId,
      action: 'delete_conversation',
      conversation_id: conversationId,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const details = payload?.details ? ` (${payload.details})` : ''
    const message = payload?.error
      ? `${payload.error}${details}`
      : `Delete chat history failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}
