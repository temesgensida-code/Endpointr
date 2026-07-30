import { useRef, useState } from 'react'
import { sendProxyRequestApi } from './proxyService'
import { fetchRequestHistory, deleteRequestHistoryItemApi } from './historyService'
import AiChatWidget from '../../ai/AiChatWidget'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
const MIN_PCT = 15

/* ── Method badge colour ── */
function MethodBadge({ method }) {
  const cls = `method method-${method}` 
  return <span className={cls}>{method}</span>
}

/* ── Status badge ── */
function StatusBadge({ status }) {
  if (!status) return null
  const cls = status < 300 ? 'badge badge-green' : status < 400 ? 'badge badge-yellow' : 'badge badge-red'
  return <span className={cls}>{status}</span>
}

export default function RequestBuilder({ getToken, userId }) {
  /* ── State ── */
  const [method, setMethod]         = useState('GET')
  const [url, setUrl]               = useState('')
  const [body, setBody]             = useState('{\n  \n}')
  const [headers, setHeaders]       = useState([{ key: '', value: '' }])
  const [activeTab, setActiveTab]   = useState('body')
  const [responseTab, setResponseTab] = useState('pretty')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState('')

  /* history */
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState({})

  /* prompt to send to AI from Ask AI button */
  const [askAiPrompt, setAskAiPrompt] = useState('')

  /* panel widths */
  const [widths, setWidths] = useState([22, 50, 28])
  const rowRef = useRef(null)

  /* ── Send request ── */
  async function sendRequest() {
    if (!url.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const requestHeaders = {}
      headers.forEach(h => {
        if (h.key && h.key.trim()) {
          requestHeaders[h.key.trim()] = h.value || ''
        }
      })

      const payload = await sendProxyRequestApi({
        getToken,
        userId,
        requestMethod: method,
        requestUrl: url,
        requestJsonBody: body,
        requestHeaders,
      })
      setResult(payload)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      if (historyOpen) loadHistory()
    }
  }

  /* ── History ── */
  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const h = await fetchRequestHistory({ getToken, userId })
      setHistoryItems(h)
    } catch {}
    finally { setHistoryLoading(false) }
  }

  function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next) loadHistory()
  }

  async function deleteHistory(id) {
    try {
      await deleteRequestHistoryItemApi({ getToken, userId, historyId: id })
      setHistoryItems(p => p.filter(i => i.id !== id))
    } catch {}
  }

  function loadHistoryItem(item) {
    setMethod(item.method || 'GET')
    setUrl(item.requested_url || item.url || '')
    try { setBody(JSON.stringify(JSON.parse(item.request_body || '{}'), null, 2)) } catch { setBody('') }
  }

  /* ── Resize ── */
  function startResize(idx, e) {
    const row = rowRef.current; if (!row) return
    const startX = e.clientX; const startW = [...widths]
    const totalW = row.getBoundingClientRect().width

    function onMove(me) {
      const delta = ((me.clientX - startX) / totalW) * 100
      const pair = startW[idx] + startW[idx + 1]
      const left = Math.min(Math.max(startW[idx] + delta, MIN_PCT), pair - MIN_PCT)
      setWidths(p => { const u = [...p]; u[idx] = left; u[idx + 1] = pair - left; return u })
    }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  const responseBody = result?.response_body !== undefined ? result.response_body : result?.upstream?.body
  let prettyResponse = ''
  try {
    prettyResponse = typeof responseBody === 'object' && responseBody !== null
      ? JSON.stringify(responseBody, null, 2)
      : JSON.stringify(JSON.parse(responseBody), null, 2)
  } catch {
    prettyResponse = String(responseBody !== undefined && responseBody !== null ? responseBody : '')
  }

  return (
    <div ref={rowRef} style={{
      display: 'grid', height: '100%', overflow: 'hidden',
      gridTemplateColumns: `${widths[0]}% 3px ${widths[1]}% 3px ${widths[2]}%`,
    }}>
      {/* ══ PANEL 1 — History ══ */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-raised)', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: 12 }}>Request History</h2>
          <button className="btn btn-ghost btn-xs" onClick={toggleHistory} style={{ fontSize: 11 }}>
            {historyOpen ? 'Hide' : 'Load'}
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
          {!historyOpen && (
            <div className="empty-state" style={{ padding: 'var(--s8) var(--s4)' }}>
              <HistoryIcon />
              <p>Click Load to see your recent requests</p>
            </div>
          )}
          {historyOpen && historyLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s6)' }}>
              <div className="spinner" />
            </div>
          )}
          {historyOpen && !historyLoading && historyItems.length === 0 && (
            <div className="empty-state" style={{ padding: 'var(--s8) var(--s4)' }}>
              <HistoryIcon />
              <p>No request history yet</p>
            </div>
          )}
          {historyOpen && historyItems.map((item) => {
            const isExpanded = expandedIds[item.id]
            return (
              <div key={item.id} style={{
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                borderRadius: 'var(--r2)', marginBottom: 'var(--s2)', overflow: 'hidden',
              }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: '8px 10px', cursor: 'pointer' }}
                  onClick={() => setExpandedIds(p => ({ ...p, [item.id]: !p[item.id] }))}
                >
                  <MethodBadge method={item.method || 'GET'} />
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--tx-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.requested_url || item.url}
                  </span>
                  <StatusBadge status={item.response_status_code} />
                  <button className="btn-icon" style={{ width: 22, height: 22, flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); deleteHistory(item.id) }}>
                    <TrashIcon size={11} />
                  </button>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginBottom: 6 }}>
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                    <button className="btn btn-ghost btn-xs" style={{ marginBottom: 6 }} onClick={() => loadHistoryItem(item)}>
                      Load into builder
                    </button>
                    {(item.response_body || item.response) && (
                      <pre className="code-block" style={{ fontSize: 10, maxHeight: 120, overflow: 'auto' }}>
                        {(() => {
                          const bodyStr = item.response_body || (typeof item.response === 'string' ? item.response : JSON.stringify(item.response));
                          try { return JSON.stringify(JSON.parse(bodyStr), null, 2) } catch { return bodyStr }
                        })()}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="resizer" onPointerDown={e => startResize(0, e)} />

      {/* ══ PANEL 2 — Request Builder ══ */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* URL bar */}
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{
                width: 90, flexShrink: 0, fontFamily: 'var(--font-mono)',
                fontSize: 12, fontWeight: 600,
                color: method === 'GET' ? 'var(--method-get)' : method === 'POST' ? 'var(--method-post)' :
                  method === 'DELETE' ? 'var(--method-delete)' : method === 'PUT' ? 'var(--method-put)' : 'var(--method-patch)',
              }}
            >
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendRequest()}
              placeholder="https://api.example.com/endpoint"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={sendRequest}
              disabled={loading || !url.trim()}
              style={{ flexShrink: 0, minWidth: 64 }}
            >
              {loading ? <div className="spinner" style={{ width: 12, height: 12 }} /> : 'Send'}
            </button>
          </div>
        </div>

        {/* Tabs: Body / Headers */}
        <div style={{ padding: 'var(--s2) var(--s4)', borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)', flexShrink: 0 }}>
          <div className="tabs" style={{ maxWidth: 220 }}>
            <button className={`tab ${activeTab === 'body' ? 'active' : ''}`} onClick={() => setActiveTab('body')}>Body</button>
            <button className={`tab ${activeTab === 'headers' ? 'active' : ''}`} onClick={() => setActiveTab('headers')}>Headers</button>
            <button className={`tab ${activeTab === 'auth' ? 'active' : ''}`} onClick={() => setActiveTab('auth')}>Auth</button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: '0 0 40%', overflow: 'auto', padding: 'var(--s3) var(--s4)' }}>
          {activeTab === 'body' && (
            hasBody ? (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, height: '100%', minHeight: 140, resize: 'none' }}
                placeholder={'{\n  "key": "value"\n}'}
                spellCheck={false}
              />
            ) : (
              <div className="empty-state" style={{ padding: 'var(--s6)' }}>
                <p style={{ fontSize: 12 }}>This method does not support a request body</p>
              </div>
            )
          )}
          {activeTab === 'headers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--s2)' }}>
                  <input value={h.key} onChange={e => setHeaders(p => p.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                    placeholder="Header name" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                  <input value={h.value} onChange={e => setHeaders(p => p.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                    placeholder="Value" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                  <button className="btn-icon" onClick={() => setHeaders(p => p.filter((_, j) => j !== i))} style={{ flexShrink: 0 }}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }}
                onClick={() => setHeaders(p => [...p, { key: '', value: '' }])}>
                + Add header
              </button>
            </div>
          )}
          {activeTab === 'auth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>Add Authorization header manually in the Headers tab, or use Bearer token below for convenience.</p>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Bearer Token</label>
                <input placeholder="eyJhbGciOiJSUzI1NiJ9..." style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  onChange={e => {
                    const token = e.target.value.trim()
                    setHeaders(p => {
                      const without = p.filter(h => h.key.toLowerCase() !== 'authorization')
                      return token ? [...without, { key: 'Authorization', value: `Bearer ${token}` }] : without
                    })
                  }} />
              </div>
            </div>
          )}
        </div>

        {/* Response */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
          <div style={{
            padding: '8px var(--s4)', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 'var(--s3)', flexShrink: 0,
            background: 'var(--bg-raised)',
          }}>
            <h2 style={{ fontSize: 11, flex: 1 }}>Response</h2>
            {result && (
              <>
                <StatusBadge status={result.response_status_code || result.upstream?.status_code} />
                {(result.response_time_ms || result.upstream?.elapsed_ms) && (
                  <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)' }}>
                    {result.response_time_ms || result.upstream?.elapsed_ms}ms
                  </span>
                )}
              </>
            )}
            <div className="tabs" style={{ maxWidth: 160 }}>
              {['pretty', 'raw', 'headers'].map(t => (
                <button key={t} className={`tab ${responseTab === t ? 'active' : ''}`}
                  onClick={() => setResponseTab(t)} style={{ fontSize: 11, textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            {result && (
              <button
                className="btn btn-ghost btn-xs"
                style={{ fontSize: 11 }}
                onClick={() => setAskAiPrompt(`Analyse this API response and check for security issues:\n\`\`\`\nURL: ${url}\nMethod: ${method}\nStatus: ${result.response_status_code || result.upstream?.status_code}\nBody: ${prettyResponse}\n\`\`\``)}
              >
                Ask AI
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s3) var(--s4)' }}>
            {error && (
              <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--r2)', padding: 'var(--s3)', color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {error}
              </div>
            )}
            {!result && !error && !loading && (
              <div className="empty-state">
                <ResponseIcon />
                <p>Send a request to see the response</p>
              </div>
            )}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--s4)', color: 'var(--tx-muted)', fontSize: 12 }}>
                <div className="spinner" />
                Sending request…
              </div>
            )}
            {result && responseTab === 'pretty' && (
              <pre className="code-block" style={{ fontSize: 11, minHeight: '100%' }}>{prettyResponse}</pre>
            )}
            {result && responseTab === 'raw' && (
              <pre className="code-block" style={{ fontSize: 11, minHeight: '100%' }}>{JSON.stringify(result, null, 2)}</pre>
            )}
            {result && responseTab === 'headers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(result.response_headers || result.upstream?.headers || {}).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 'var(--s3)', fontSize: 11, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-bright)', minWidth: 180, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--tx-secondary)', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
                {!Object.keys(result.response_headers || result.upstream?.headers || {}).length && (
                  <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No response headers available</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="resizer" onPointerDown={e => startResize(1, e)} />

      {/* ══ PANEL 3 — AI Chat ══ */}
      <div style={{ overflow: 'hidden', borderLeft: '1px solid var(--border)' }}>
        <AiChatWidget getToken={getToken} userId={userId} initialPrompt={askAiPrompt} />
      </div>
    </div>
  )
}

/* ── Icons ── */
function HistoryIcon({ size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 16 14"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function ResponseIcon({ size = 32 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
