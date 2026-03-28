import { useRef, useState } from 'react'

export default function RequestBuilderPanel({
  requestMethod,
  onRequestMethodChange,
  requestUrl,
  onRequestUrlChange,
  requestJsonBody,
  onRequestJsonBodyChange,
  onSendProxyRequest,
  proxyLoading,
  proxyError,
  proxyResult,
  methods,
}) {
  const containerRef = useRef(null)
  const [topHeightPercent, setTopHeightPercent] = useState(40)

  function startResize(event) {
    const container = containerRef.current
    if (!container) return

    const startY = event.clientY
    const startPercent = topHeightPercent
    const containerHeight = container.getBoundingClientRect().height

    function onPointerMove(moveEvent) {
      if (!containerHeight) return
      const deltaPercent = ((moveEvent.clientY - startY) / containerHeight) * 100
      let newPercent = startPercent + deltaPercent
      setTopHeightPercent(Math.min(Math.max(newPercent, 10), 90))
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div className="box content-box" id="box2" style={{ display: 'flex', flexDirection: 'column' }}>
      <h2>Request Builder</h2>

      <div className="request-row">
        <select
          id="http-method"
          className="request-control method-select"
          value={requestMethod}
          onChange={(event) => onRequestMethodChange(event.target.value)}
          aria-label="HTTP Method"
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <input
          id="request-url"
          className="request-control url-input"
          type="url"
          placeholder="https://api.example.com/resource"
          value={requestUrl}
          onChange={(event) => onRequestUrlChange(event.target.value)}
          aria-label="URL"
        />

        <button type="button" className="send-request-btn" onClick={onSendProxyRequest} disabled={proxyLoading}>
          {proxyLoading ? 'Sending...' : 'Send Request'}
        </button>
      </div>

      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '8px', overflow: 'hidden' }}>
        <div style={{ height: `${topHeightPercent}%`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <label htmlFor="request-json" style={{ marginBottom: '4px' }}>JSON Body</label>
          <textarea
            id="request-json"
            className="request-control request-json"
            style={{ flex: 1, resize: 'none', minHeight: 0 }}
            value={requestJsonBody}
            onChange={(event) => onRequestJsonBodyChange(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div
          className="horizontal-resizer"
          onPointerDown={startResize}
          role="separator"
          aria-orientation="horizontal"
          style={{ height: '4px', cursor: 'row-resize', background: 'var(--border)', margin: '8px 0', flexShrink: 0 }}
        />

        <div style={{ height: `calc(${100 - topHeightPercent}% - 20px)`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="response" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {proxyError ? <p className="request-error" style={{ marginBottom: '8px' }}>{proxyError}</p> : null}
            {proxyResult ? (
              <pre className="result" style={{ flex: 1, minHeight: 0, margin: 0, overflow: 'auto' }}>{proxyResult}</pre>
            ) : (
              <p>Response from proxy will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
