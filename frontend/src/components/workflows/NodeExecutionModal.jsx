export default function NodeExecutionModal({ result, onClose }) {
  if (!result) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 580,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r3)',
          padding: 'var(--s5)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${
              result.status === 'passed' ? 'badge-green' :
              result.status === 'failed' ? 'badge-red' : 'badge-muted'
            }`}>
              {result.status}
            </span>
            <h3 style={{ fontSize: 14 }}>Step Execution Details ({result.node_id})</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Summary Banner */}
          <div style={{ display: 'flex', gap: 16, background: 'var(--bg-overlay)', padding: 10, borderRadius: 6 }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--tx-muted)', display: 'block' }}>HTTP Status</span>
              <strong style={{ fontSize: 13, color: result.status_code < 400 ? 'var(--green)' : 'var(--red)' }}>
                {result.status_code || 'N/A'}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--tx-muted)', display: 'block' }}>Latency</span>
              <strong style={{ fontSize: 13, color: 'var(--tx-primary)' }}>{result.duration_ms} ms</strong>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--tx-muted)', display: 'block' }}>Assertions</span>
              <strong style={{ fontSize: 13, color: 'var(--tx-primary)' }}>
                {result.assertions?.filter(a => a.passed).length || 0} / {result.assertions?.length || 0} Passed
              </strong>
            </div>
          </div>

          {/* Errors */}
          {result.error && (
            <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Error:</span>
              <p style={{ fontSize: 11, color: 'var(--tx-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{result.error}</p>
            </div>
          )}

          {/* Assertions Breakdown */}
          {result.assertions?.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Assertions Results</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.assertions.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--bg-overlay)', borderRadius: 4, fontSize: 11 }}>
                    <span style={{ color: a.passed ? 'var(--green)' : 'var(--red)' }}>{a.passed ? '✓' : '✕'}</span>
                    <span style={{ fontWeight: 500 }}>{a.type}:</span>
                    <span style={{ color: 'var(--tx-secondary)', fontFamily: 'var(--font-mono)' }}>{a.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Variables */}
          {result.extracted_vars && Object.keys(result.extracted_vars).length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Extracted Variables</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(result.extracted_vars).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 6, fontSize: 11, background: 'var(--bg-overlay)', padding: '4px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--accent)' }}>{k}:</span>
                    <span style={{ color: 'var(--tx-primary)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response Payload Preview */}
          {result.response_preview && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Response Body Preview</label>
              <pre style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--bg-overlay)', padding: 10, borderRadius: 6, overflowX: 'auto', maxH: 160, color: 'var(--tx-secondary)' }}>
                {result.response_preview}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
