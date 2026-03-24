import { useRef, useState } from 'react'
import { SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const MIN_PANEL_PERCENT = 15
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

function SignedInPanel() {
  const { getToken, userId } = useAuth()
  const [proxyLoading, setProxyLoading] = useState(false)
  const [proxyResult, setProxyResult] = useState('')
  const [proxyError, setProxyError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [storyOpen, setStoryOpen] = useState(false)
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({})
  const [requestMethod, setRequestMethod] = useState('GET')
  const [requestUrl, setRequestUrl] = useState('')
  const [requestJsonBody, setRequestJsonBody] = useState('{\n  \n}')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'I can help debug your API calls using your recent request/response history and general FastAPI, Django REST API, and React API-client guidance.',
    },
  ])
  //if you wanna modify the boxes default width you can change the values in this array, just make sure they add up to 100
  const [panelWidths, setPanelWidths] = useState([25, 50, 25])
  const rowRef = useRef(null)

  async function loadRequestHistory() {
    setHistoryLoading(true)
    setHistoryError('')

    try {
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
        setHistoryError(message)
        setHistoryItems([])
        return
      }

      setHistoryItems(payload?.history || [])
    } catch (error) {
      setHistoryError(error.message || 'Could not load story history.')
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function toggleStoryPanel() {
    const nextOpen = !storyOpen
    setStoryOpen(nextOpen)
    if (nextOpen) {
      loadRequestHistory()
    }
  }

  function toggleHistoryItem(itemId) {
    setExpandedHistoryIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  async function sendProxyRequest() {
    setProxyLoading(true)
    setProxyError('')
    setProxyResult('')

    const trimmedUrl = requestUrl.trim()
    if (!trimmedUrl) {
      setProxyError('Please enter a URL.')
      setProxyLoading(false)
      return
    }

    let parsedBody = undefined
    const methodAllowsBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod)

    if (methodAllowsBody && requestJsonBody.trim()) {
      try {
        parsedBody = JSON.parse(requestJsonBody)
      } catch {
        setProxyError('JSON body is invalid. Please fix it before sending.')
        setProxyLoading(false)
        return
      }
    }

    try {
      const token = await getToken()
      if (!token) {
        setProxyError('No Clerk token available yet. Try again in a moment.')
        return
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
        setProxyError(message)
        return
      }

      setProxyResult(JSON.stringify(payload, null, 2))
    } catch (error) {
      setProxyError(error.message || 'Request failed.')
    } finally {
      setProxyLoading(false)
      if (storyOpen) {
        loadRequestHistory()
      }
    }
  }

  async function sendChatMessage() {
    const question = chatInput.trim()
    if (!question) {
      return
    }

    const userMessage = { role: 'user', content: question }
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput('')
    setChatLoading(true)

    try {
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
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `I could not answer right now: ${message}` },
        ])
        return
      }

      const answer = payload?.answer || 'I could not generate a response.'
      const contextIds = Array.isArray(payload?.context_request_ids) ? payload.context_request_ids : []
      setChatMessages((prev) => [...prev, { role: 'assistant', content: answer, contextIds }])
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `I could not answer right now: ${error.message || 'Unknown error.'}` },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function startResize(splitIndex, event) {
    const rowEl = rowRef.current
    if (!rowEl) {
      return
    }

    const startX = event.clientX
    const startWidths = [...panelWidths]
    const rowWidth = rowEl.getBoundingClientRect().width
    const leftIndex = splitIndex
    const rightIndex = splitIndex + 1

    function onPointerMove(moveEvent) {
      if (!rowWidth) {
        return
      }

      const deltaPercent = ((moveEvent.clientX - startX) / rowWidth) * 100
      const pairTotal = startWidths[leftIndex] + startWidths[rightIndex]

      const nextLeft = clamp(
        startWidths[leftIndex] + deltaPercent,
        MIN_PANEL_PERCENT,
        pairTotal - MIN_PANEL_PERCENT,
      )
      const nextRight = pairTotal - nextLeft

      setPanelWidths((prev) => {
        const updated = [...prev]
        updated[leftIndex] = nextLeft
        updated[rightIndex] = nextRight
        return updated
      })
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <section className="dashboard">
      <div className="box navbar-box">
        <div className="navbar-title">Navbar</div>
        <UserButton />
      </div>

      <div
        ref={rowRef}
        className="content-row"
        style={{
          gridTemplateColumns: `${panelWidths[0]}% var(--resizer-width) ${panelWidths[1]}% var(--resizer-width) ${panelWidths[2]}%`,
        }}
      >
        <div className="box content-box" id='box1'>
          <h2>Story</h2>
          <button type="button" className="story-toggle" onClick={toggleStoryPanel}>
            {storyOpen ? 'Hide Story' : 'Show Story'}
          </button>

          {storyOpen ? (
            <div className="history-panel">
              {historyLoading ? <p>Loading recent requests...</p> : null}
              {historyError ? <p className="request-error">{historyError}</p> : null}

              {!historyLoading && !historyError && historyItems.length === 0 ? (
                <p>No request story yet.</p>
              ) : null}

              {!historyLoading && !historyError ? (
                <div className="history-list">
                  {historyItems.map((item) => {
                    const expanded = !!expandedHistoryIds[item.id]
                    return (
                      <div key={item.id} className="history-item">
                        <div className="history-item-header">
                          <div className="history-item-main">
                            <p className="history-item-id">ID: {item.id}</p>
                            <p className="history-item-url">{item.requested_url}</p>
                          </div>
                          <button
                            type="button"
                            className="history-expand-btn"
                            onClick={() => toggleHistoryItem(item.id)}
                            aria-expanded={expanded}
                            aria-label={`Read more for request ${item.id}`}
                          >
                            {expanded ? 'v' : '>'}
                          </button>
                        </div>

                        {expanded ? (
                          <div className="history-item-body">
                            <p>Method: {item.method}</p>
                            <p>Status: {item.response_status_code ?? 'N/A'}</p>
                            <pre className="result">{JSON.stringify(item.response, null, 2)}</pre>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

        </div>

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 1 and box 2"
          onPointerDown={(event) => startResize(0, event)}
        />

        <div className="box content-box" id='box2'>
          <h2>Request Builder</h2>

          <label htmlFor="http-method">Method</label>
          <select
            id="http-method"
            className="request-control"
            value={requestMethod}
            onChange={(event) => setRequestMethod(event.target.value)}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>

          <label htmlFor="request-url">URL</label>
          <input
            id="request-url"
            className="request-control"
            type="url"
            placeholder="https://api.example.com/resource"
            value={requestUrl}
            onChange={(event) => setRequestUrl(event.target.value)}
          />

          <label htmlFor="request-json">JSON Body</label>
          <textarea
            id="request-json"
            className="request-control request-json"
            value={requestJsonBody}
            onChange={(event) => setRequestJsonBody(event.target.value)}
            spellCheck={false}
          />

          <button type="button" onClick={sendProxyRequest} disabled={proxyLoading}>
            {proxyLoading ? 'Sending...' : 'Send Request'}
          </button>

          {proxyError ? <p className="request-error">{proxyError}</p> : null}
          <div className="response">
            {proxyResult ? <pre className="result">{proxyResult}</pre> : <p>Response from proxy will appear here.</p>}
          </div>
        </div>

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 2 and box 3"
          onPointerDown={(event) => startResize(1, event)}
        />

        <div className="box content-box" id='box3'>
          <h2>AI Chatbot</h2>

          <div className="chat-window">
            {chatMessages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`chat-message ${msg.role === 'user' ? 'chat-user' : 'chat-assistant'}`}>
                <p className="chat-role">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
                <p className="chat-content">{msg.content}</p>
                {msg.role === 'assistant' && Array.isArray(msg.contextIds) && msg.contextIds.length > 0 ? (
                  <div className="chat-citations">
                    <p className="chat-citations-label">Sources:</p>
                    <div className="chat-citation-list">
                      {msg.contextIds.map((id) => (
                        <span key={`${idx}-src-${id}`} className="chat-citation-chip">Request #{id}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <textarea
            className="request-control chat-input"
            placeholder="Ask about your API responses, endpoint errors, or debugging strategies..."
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            spellCheck={false}
          />

          <button type="button" onClick={sendChatMessage} disabled={chatLoading}>
            {chatLoading ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>
      </div>
    </section>
  )
}

function SignedOutPanel() {
  const [mode, setMode] = useState('sign-in')

  return (
    <section className="card">
      {/* <h1>Authentication</h1> */}
      
      {/* <div className="switch-row">
        <button
          type="button"
          className={mode === 'sign-in' ? 'active' : ''}
          onClick={() => setMode('sign-in')}
        >
          Sign In
        </button>
        <button
          type="button"
          className={mode === 'sign-up' ? 'active' : ''}
          onClick={() => setMode('sign-up')}
        >
          Sign Up
        </button>
      </div> */}

      {mode === 'sign-in' ? <SignIn routing="hash" /> : <SignUp routing="hash" />}
    </section>
  )
}

function App() {
  const { isSignedIn } = useAuth()

  return (
    <main className={isSignedIn ? 'layout dashboard-layout' : 'layout'}>
      {isSignedIn ? <SignedInPanel /> : <SignedOutPanel />}
    </main>
  )
}

export default App