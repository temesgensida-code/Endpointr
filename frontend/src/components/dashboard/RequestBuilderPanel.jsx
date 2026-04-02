import { useRef, useState } from 'react'
import { SlOptions } from "react-icons/sl";
import { LuBrain } from "react-icons/lu";

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
  onAskAiAboutPentest,
}) {
  const containerRef = useRef(null)
  const [topHeightPercent, setTopHeightPercent] = useState(40)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pentestMode, setPentestMode] = useState(null) // 'passive' or null (normal mode)

  function handlePassivePentestClick() {
    setPentestMode('passive')
    setDropdownOpen(false)
    onRequestMethodChange('GET')
  }

  function handleNormalModeClick() {
    setPentestMode(null)
    setDropdownOpen(false)
  }

  function checkPassivePentest() {
    if (!proxyResult) return null

    try {
      const parsed = JSON.parse(proxyResult)
      
      // The proxy response headers might be under 'upstream.headers', 'response.headers', or just 'headers'
      const headers = (parsed && parsed.upstream && parsed.upstream.headers) 
                   || (parsed && parsed.response && parsed.response.headers) 
                   || (parsed && parsed.headers) 
                   || {}
                   
      if (Object.keys(headers).length > 0) {
        // Find header keys and values regardless of casing
        const headerMap = Object.keys(headers).reduce((acc, k) => {
          acc[k.toLowerCase()] = headers[k]
          return acc
        }, {})
        
        const cto = headerMap['x-content-type-options'] || ''
        const csp = headerMap['content-security-policy'] || ''
        const sts = headerMap['strict-transport-security'] || ''

        const hasContentTypeOptions = cto.toLowerCase().includes('nosniff') && !cto.includes('wrong-value')
        const hasCsp = csp.length > 0 && !csp.includes('wrong-value')
        const hasSts = sts.toLowerCase().includes('max-age=') && !sts.includes('wrong-value')

        const missing = []
        if (!hasContentTypeOptions) missing.push('X-Content-Type-Options (missing or invalid)')
        if (!hasCsp) missing.push('Content-Security-Policy (missing or invalid)')
        if (!hasSts) missing.push('Strict-Transport-Security (missing or invalid)')

        return {
          isGood: missing.length === 0,
          missing,
        }
      }
    } catch (e) {
      return null
    }

    return null
  }

  const pentestResult = pentestMode === 'passive' ? checkPassivePentest() : null

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Request Builder {pentestMode === 'passive' && <span style={{fontSize: '14px', color: 'var(--accent)'}}>(Passive Pentest)</span>}</h2>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)} 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-h)' }}
            aria-label="Pentest Options"
          >
            <SlOptions size={20} />
          </button>
          
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              boxShadow: 'var(--shadow)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              minWidth: '160px',
              padding: '4px 0'
            }}>
               <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', background: 'var(--code-bg)', borderBottom: '1px solid var(--border)' }}>Pentest <span style={{fontWeight:'normal', cursor:'pointer', float: 'right'}} onClick={handleNormalModeClick}>Exit</span></div>
               <button type="button" disabled style={{ padding: '8px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'not-allowed', color: 'var(--text)', opacity: 0.5 }}>Active Pentest (Coming Soon)</button>
               <button type="button" onClick={handlePassivePentestClick} style={{ padding: '8px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--text-h)' }}>Passive Pentest</button>
            </div>
          )}
        </div>
      </div>

      <div className="request-row">
        <select
          id="http-method"
          className="request-control method-select"
          value={requestMethod}
          onChange={(event) => onRequestMethodChange(event.target.value)}
          aria-label="HTTP Method"
          disabled={pentestMode === 'passive'}
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
        {pentestMode !== 'passive' && (
        <>
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
        </>
        )}

        <div style={{ height: pentestMode === 'passive' ? '100%' : `calc(${100 - topHeightPercent}% - 20px)`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="response" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {proxyError ? <p className="request-error" style={{ marginBottom: '8px' }}>{proxyError}</p> : null}
            {pentestResult && (
              <div style={{ 
                padding: '12px', 
                marginBottom: '12px', 
                borderRadius: '4px', 
                background: pentestResult.isGood ? 'rgba(0, 200, 0, 0.1)' : 'rgba(255, 100, 0, 0.1)',
                border: `1px solid ${pentestResult.isGood ? 'green' : 'orange'}` 
              }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Passive Pentest Results</h4>
                {pentestResult.isGood ? (
                  <p style={{ color: 'green', margin: 0 }}>All security headers present. It is good!</p>
                ) : (
                  <div>
                    <p style={{ color: 'orange', margin: '0 0 8px 0' }}>
                      Missing Security Headers: {pentestResult.missing.join(', ')}
                    </p>
                    <button 
                      onClick={() => onAskAiAboutPentest(`I ran a passive pentest on ${requestUrl}. The response is missing these security headers: ${pentestResult.missing.join(', ')}. Could you provide a recommendation on how to resolve these problems and update my code to fix this?`)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: 'var(--text-h)'
                      }}
                    >
                      Ask AI <LuBrain size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
            
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
