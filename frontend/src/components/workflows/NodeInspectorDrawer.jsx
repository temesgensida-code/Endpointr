import { useState } from 'react'

export default function NodeInspectorDrawer({ node, onUpdateNode, onClose, onDeleteNode }) {
  const [activeTab, setActiveTab] = useState('request')

  if (!node) return null

  const data = node.data || {}
  const nodeType = node.type || 'request'

  const updateData = (updates) => {
    onUpdateNode(node.id, {
      ...node,
      data: { ...data, ...updates }
    })
  }

  // Request state
  const headers = data.headers || []
  const extractors = data.extractors || []
  const assertions = data.assertions || []

  // Header helpers
  const addHeader = () => updateData({ headers: [...headers, { key: '', value: '' }] })
  const updateHeader = (idx, key, val) => {
    const next = [...headers]
    next[idx] = { key, value: val }
    updateData({ headers: next })
  }
  const removeHeader = (idx) => updateData({ headers: headers.filter((_, i) => i !== idx) })

  // Extractor helpers
  const addExtractor = () => updateData({ extractors: [...extractors, { json_path: '', var_name: '' }] })
  const updateExtractor = (idx, json_path, var_name) => {
    const next = [...extractors]
    next[idx] = { json_path, var_name }
    updateData({ extractors: next })
  }
  const removeExtractor = (idx) => updateData({ extractors: extractors.filter((_, i) => i !== idx) })

  // Assertion helpers
  const addAssertion = () => updateData({ assertions: [...assertions, { type: 'max_latency', max_ms: 500 }] })
  const updateAssertion = (idx, updates) => {
    const next = [...assertions]
    next[idx] = { ...next[idx], ...updates }
    updateData({ assertions: next })
  }
  const removeAssertion = (idx) => updateData({ assertions: assertions.filter((_, i) => i !== idx) })

  return (
    <div
      style={{
        width: 360,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 20,
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: 'var(--s3) var(--s4)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`method method-${data.method || 'GET'}`} style={{ fontSize: 9 }}>
            {data.method || 'GET'}
          </span>
          <input
            value={data.label || node.id}
            onChange={(e) => updateData({ label: e.target.value })}
            style={{
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              color: 'var(--tx-primary)',
              width: 160,
            }}
            placeholder="Step Name"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn-icon"
            onClick={() => onDeleteNode(node.id)}
            title="Delete this step"
            style={{ color: 'var(--red)', width: 26, height: 26 }}
          >
            <TrashIcon size={14} />
          </button>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: 16, width: 26, height: 26 }}>×</button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-overlay)',
        }}
      >
        {['request', 'variables', 'assertions', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '8px 4px',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'capitalize',
              border: 'none',
              background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab ? 'var(--accent)' : 'var(--tx-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Body Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s4)' }}>
        {/* Request Tab */}
        {activeTab === 'request' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>HTTP Method</label>
              <select
                value={data.method || 'GET'}
                onChange={(e) => updateData({ method: e.target.value })}
                style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4, background: 'var(--bg-overlay)', color: 'var(--tx-primary)', border: '1px solid var(--border)' }}
              >
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>
                Target URL <span style={{ color: 'var(--accent)', fontSize: 10 }}>(use {'{{var}}'} interpolation)</span>
              </label>
              <input
                value={data.url || ''}
                onChange={(e) => updateData({ url: e.target.value })}
                placeholder="https://api.example.com/users/{{user_id}}"
                style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Expected Status Code</label>
              <input
                type="number"
                value={data.expected_status || 200}
                onChange={(e) => updateData({ expected_status: parseInt(e.target.value) || 200 })}
                style={{ width: '100%', fontSize: 12 }}
              />
            </div>

            {/* Headers Editor */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Headers ({headers.length})</label>
                <button className="btn btn-ghost btn-xs" onClick={addHeader}>+ Add Header</button>
              </div>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input
                    value={h.key}
                    onChange={(e) => updateHeader(i, e.target.value, h.value)}
                    placeholder="Header Key"
                    style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  />
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, h.key, e.target.value)}
                    placeholder="Header Value"
                    style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  />
                  <button className="btn-icon" onClick={() => removeHeader(i)}>×</button>
                </div>
              ))}
            </div>

            {/* Body Editor */}
            {['POST', 'PUT', 'PATCH'].includes(data.method || 'GET') && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>
                  JSON Request Body
                </label>
                <textarea
                  rows={5}
                  value={data.body || ''}
                  onChange={(e) => updateData({ body: e.target.value })}
                  placeholder='{\n  "name": "Jane",\n  "token": "{{auth_token}}"\n}'
                  style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 8, borderRadius: 4 }}
                />
              </div>
            )}
          </div>
        )}

        {/* Variables / Extractions Tab */}
        {activeTab === 'variables' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
              Extract fields from this response JSON to pass to downstream workflow steps using <code style={{ color: 'var(--accent)' }}>{'{{variable}}'}</code>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Response Extractors</label>
              <button className="btn btn-ghost btn-xs" onClick={addExtractor}>+ Add Extractor</button>
            </div>

            {extractors.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--tx-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: 12 }}>
                No variable extractors configured yet
              </p>
            )}

            {extractors.map((ex, i) => (
              <div key={i} className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx-secondary)' }}>Rule #{i + 1}</span>
                  <button className="btn-icon" onClick={() => removeExtractor(i)}>×</button>
                </div>
                <input
                  value={ex.json_path}
                  onChange={(e) => updateExtractor(i, e.target.value, ex.var_name)}
                  placeholder="JSON field path (e.g. token or data.id)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Save as:</span>
                  <input
                    value={ex.var_name}
                    onChange={(e) => updateExtractor(i, ex.json_path, e.target.value)}
                    placeholder="auth_token"
                    style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Assertions Tab */}
        {activeTab === 'assertions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
              Add test assertions to automatically validate response metrics and body fields.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Test Assertions</label>
              <button className="btn btn-ghost btn-xs" onClick={addAssertion}>+ Add Assertion</button>
            </div>

            {assertions.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--tx-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: 12 }}>
                No assertions configured yet
              </p>
            )}

            {assertions.map((a, i) => (
              <div key={i} className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <select
                    value={a.type}
                    onChange={(e) => updateAssertion(i, { type: e.target.value })}
                    style={{ fontSize: 11, padding: '2px 4px' }}
                  >
                    <option value="max_latency">Max Latency (ms)</option>
                    <option value="json_body">JSON Body Field</option>
                  </select>
                  <button className="btn-icon" onClick={() => removeAssertion(i)}>×</button>
                </div>

                {a.type === 'max_latency' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Latency {'<='}</span>
                    <input
                      type="number"
                      value={a.max_ms || 500}
                      onChange={(e) => updateAssertion(i, { max_ms: parseInt(e.target.value) || 500 })}
                      style={{ flex: 1, fontSize: 11 }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>ms</span>
                  </div>
                )}

                {a.type === 'json_body' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                      value={a.path || ''}
                      onChange={(e) => updateAssertion(i, { path: e.target.value })}
                      placeholder="Field path (e.g. status)"
                      style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    />
                    <input
                      value={a.expected || ''}
                      onChange={(e) => updateAssertion(i, { expected: e.target.value })}
                      placeholder="Expected value (e.g. success)"
                      style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Node Type</label>
              <select
                value={nodeType}
                onChange={(e) => onUpdateNode(node.id, { ...node, type: e.target.value })}
                style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
              >
                <option value="request">HTTP Request Node</option>
                <option value="delay">Delay / Wait Node</option>
                <option value="condition">Condition Branch Node</option>
              </select>
            </div>

            {nodeType === 'delay' && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Delay Duration (ms)</label>
                <input
                  type="number"
                  value={data.delay_ms || 1000}
                  onChange={(e) => updateData({ delay_ms: parseInt(e.target.value) || 1000 })}
                  style={{ width: '100%', fontSize: 12 }}
                />
              </div>
            )}

            {nodeType === 'condition' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Variable Condition Check</label>
                <input
                  value={data.var_name || ''}
                  onChange={(e) => updateData({ var_name: e.target.value })}
                  placeholder="Variable name (e.g. auth_token)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <input
                  value={data.expected_value || ''}
                  onChange={(e) => updateData({ expected_value: e.target.value })}
                  placeholder="Expected value (leave blank to check existence)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            )}

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', width: '100%', justifyContent: 'center' }}
                onClick={() => onDeleteNode(node.id)}
              >
                Delete This Step
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
