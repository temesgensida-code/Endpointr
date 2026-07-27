import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  streamChatMessageWs,
  fetchAiChatHistoryApi,
  fetchAiConversationTurnsApi,
  deleteAiChatHistoryApi,
} from '../dashboard/services/chatService'

const SUGGESTIONS = [
  'Analyze my last API response for security issues',
  'Explain 401 Unauthorized vs 403 Forbidden',
  'How to fix CORS error in React with Django backend?',
  'FastAPI 422 Unprocessable Entity debugging checklist',
]

export default function AiChatWidget({ getToken, userId, initialPrompt = '', compact = false }) {
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID())
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hello! I am your Endpointr API debugging assistant. Ask me anything about your endpoints, status codes, request history, or security guidance.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const chatEndRef = useRef(null)

  useEffect(() => {
    if (initialPrompt) {
      sendChat(initialPrompt)
    }
  }, [initialPrompt])

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  async function loadHistoryList() {
    setHistoryLoading(true)
    try {
      const items = await fetchAiChatHistoryApi({ getToken, userId })
      setHistoryItems(items)
    } catch {
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next) loadHistoryList()
  }

  function startNewChat() {
    setConversationId(crypto.randomUUID())
    setChatMessages([
      {
        role: 'assistant',
        content: 'New chat started. Ask me any question about your API calls or context.',
      },
    ])
    setHistoryOpen(false)
  }

  async function selectConversation(convId) {
    setHistoryOpen(false)
    setChatLoading(true)
    try {
      const history = await fetchAiConversationTurnsApi({ getToken, userId, conversationId: convId })
      if (history && history.length > 0) {
        setConversationId(convId)
        setChatMessages(history.map(h => ({ role: h.role, content: h.content })))
        scrollToBottom()
      }
    } catch (e) {
      console.error('Failed to load conversation:', e)
    } finally {
      setChatLoading(false)
    }
  }

  async function deleteConversation(convId) {
    try {
      await deleteAiChatHistoryApi({ getToken, userId, conversationId: convId })
      setHistoryItems(p => p.filter(i => i.conversation_id !== convId))
      if (convId === conversationId) {
        startNewChat()
      }
    } catch (e) {
      console.error('Failed to delete conversation:', e)
    }
  }

  async function sendChat(messageToSend) {
    const q = (messageToSend || chatInput).trim()
    if (!q) return

    const streamId = crypto.randomUUID()
    setChatMessages(p => [
      ...p,
      { role: 'user', content: q },
      { role: 'assistant', content: '', streamId },
    ])
    if (!messageToSend) setChatInput('')
    setChatLoading(true)
    scrollToBottom()

    try {
      const payload = await streamChatMessageWs({
        getToken,
        userId,
        question: q,
        conversationId,
        onChunk: delta => {
          setChatMessages(p =>
            p.map(m => (m.streamId === streamId ? { ...m, content: m.content + delta } : m))
          )
          scrollToBottom()
        },
      })

      setChatMessages(p =>
        p.map(m =>
          m.streamId === streamId ? { role: 'assistant', content: payload.answer || m.content } : m
        )
      )
    } catch (e) {
      setChatMessages(p =>
        p.map(m =>
          m.streamId === streamId ? { role: 'assistant', content: `**Error:** ${e.message}` } : m
        )
      )
    } finally {
      setChatLoading(false)
      scrollToBottom()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-raised)',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: compact ? '10px 12px' : 'var(--s3) var(--s4)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 6px var(--green)',
          }}
        />
        <h2 style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>AI Debug Assistant</h2>

        <button
          className="btn btn-ghost btn-xs"
          onClick={startNewChat}
          title="New conversation"
          style={{ fontSize: 11 }}
        >
          + New Chat
        </button>

        <button
          className={`btn-icon ${historyOpen ? 'active' : ''}`}
          onClick={toggleHistory}
          title="History"
          style={{ width: 28, height: 28 }}
        >
          <HistoryIcon size={14} />
        </button>
      </div>

      {/* History dropdown */}
      {historyOpen && (
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-overlay)',
            maxHeight: 200,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 500 }}>
              Past Conversations
            </span>
          </div>
          {historyLoading && (
            <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: 14, height: 14 }} />
            </div>
          )}
          {!historyLoading && historyItems.length === 0 && (
            <p style={{ padding: 12, fontSize: 11, color: 'var(--tx-muted)', margin: 0 }}>
              No history found
            </p>
          )}
          {!historyLoading &&
            historyItems.map(item => (
              <div
                key={item.conversation_id}
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s2)',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background:
                    item.conversation_id === conversationId ? 'var(--accent-dim)' : 'transparent',
                }}
                onClick={() => selectConversation(item.conversation_id)}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: 'var(--tx-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.content || item.conversation_id.slice(0, 18)}
                </span>
                <button
                  className="btn-icon"
                  style={{ width: 20, height: 20 }}
                  onClick={e => {
                    e.stopPropagation()
                    deleteConversation(item.conversation_id)
                  }}
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Messages area */}
      <div style={{ flex: 1, overflow: 'auto', padding: compact ? 10 : 'var(--s4)' }}>
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 'var(--s3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '92%',
                background: msg.role === 'user' ? 'var(--accent-dim)' : 'var(--bg-overlay)',
                border: `1px solid ${
                  msg.role === 'user' ? 'rgba(139,92,246,0.3)' : 'var(--border)'
                }`,
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '10px 14px',
              }}
            >
              {msg.role === 'user' ? (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--tx-primary)',
                    margin: 0,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </p>
              ) : (
                <div className="prose" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {msg.content ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--tx-muted)',
                      }}
                    >
                      <div className="spinner" style={{ width: 12, height: 12 }} />
                      <span style={{ fontSize: 11 }}>Thinking…</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Suggestion Chips */}
        {chatMessages.length <= 2 && !chatLoading && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Suggested prompts:</span>
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                className="btn btn-ghost btn-xs"
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  justifyContent: 'flex-start',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => sendChat(s)}
              >
                💡 {s}
              </button>
            ))}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <div
        style={{
          padding: compact ? 10 : 'var(--s3)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--bg-base)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'flex-end' }}>
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendChat()
              }
            }}
            placeholder="Ask AI about endpoint bugs, status codes... (Enter to send)"
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 50,
              maxHeight: 120,
              fontSize: 12,
              lineHeight: 1.4,
              padding: '8px 10px',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendChat()}
            disabled={chatLoading || !chatInput.trim()}
            style={{
              flexShrink: 0,
              alignSelf: 'flex-end',
              padding: '10px 14px',
            }}
          >
            {chatLoading ? (
              <div className="spinner" style={{ width: 13, height: 13 }} />
            ) : (
              <SendIcon size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  )
}

function TrashIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

function SendIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
