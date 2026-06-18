import { useState } from 'react'
import { useJWTAnalyzer } from '../../hooks/useJWTAnalyzer'

export default function SecurityView({ getToken }) {
  const [token, setToken] = useState('')
  const { analyze, result, loading, error, clear } = useJWTAnalyzer(getToken)

  const SEVERITY_BADGE = { critical: 'badge-red', high: 'badge-red', warning: 'badge-yellow', info: 'badge-blue' }
  const RISK_COLOR = { critical: 'var(--red)', high: 'var(--red)', warning: 'var(--yellow)', low: 'var(--green)' }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ marginBottom: 'var(--s5)' }}>
            <h1 style={{ fontSize: 18, marginBottom: 4 }}>JWT Analyzer</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>
              Decode and inspect JSON Web Tokens for security issues — no signing key required.
            </p>
          </div>

          {/* Input */}
          <div className="card" style={{ marginBottom: 'var(--s4)' }}>
            <textarea
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste a JWT here — eyJhbGciOiJIUzI1NiIs..."
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 90 }}
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => analyze(token)} disabled={loading || !token.trim()}>
                {loading ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <LockIcon size={13} />}
                Analyze
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setToken(''); clear() }}>Clear</button>
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--r2)', padding: 'var(--s3)', color: 'var(--red)', fontSize: 12, marginBottom: 'var(--s4)' }}>
              {error}
            </div>
          )}

          {result && !result.error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
              {/* Risk summary */}
              <div className="card glow-card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  background: `${RISK_COLOR[result.risk_level] || 'var(--tx-muted)'}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${RISK_COLOR[result.risk_level] || 'var(--tx-muted)'}`,
                }}>
                  <ShieldIcon size={24} color={RISK_COLOR[result.risk_level] || 'var(--tx-muted)'} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Risk Level</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: RISK_COLOR[result.risk_level] || 'var(--tx-primary)', textTransform: 'capitalize' }}>
                    {result.risk_level}
                  </p>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--s4)' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Algorithm</p>
                    <code style={{ fontSize: 13, color: 'var(--tx-primary)' }}>{result.header?.alg}</code>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Status</p>
                    <span className={`badge ${result.is_expired ? 'badge-red' : 'badge-green'}`}>
                      {result.is_expired ? 'Expired' : 'Valid'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="card">
                <span className="section-label" style={{ padding: 0, marginBottom: 10 }}>Security Insights</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(result.security_insights || []).map((insight, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--bg-overlay)', borderRadius: 'var(--r2)' }}>
                      <span className={`badge ${SEVERITY_BADGE[insight.severity] || 'badge-muted'}`} style={{ flexShrink: 0, marginTop: 1 }}>
                        {insight.severity}
                      </span>
                      <p style={{ fontSize: 12, color: 'var(--tx-secondary)', lineHeight: 1.5 }}>{insight.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decoded claims */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' }}>
                <div className="card">
                  <span className="section-label" style={{ padding: 0, marginBottom: 8 }}>Header</span>
                  <pre className="code-block" style={{ fontSize: 11 }}>{JSON.stringify(result.header, null, 2)}</pre>
                </div>
                <div className="card">
                  <span className="section-label" style={{ padding: 0, marginBottom: 8 }}>Payload</span>
                  <pre className="code-block" style={{ fontSize: 11 }}>{JSON.stringify(result.payload, null, 2)}</pre>
                </div>
              </div>

              {/* Decoded summary table */}
              <div className="card">
                <span className="section-label" style={{ padding: 0, marginBottom: 8 }}>Decoded Summary</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(result.decoded || {}).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', fontSize: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                      <span style={{ width: 140, color: 'var(--tx-muted)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                      <span style={{ color: 'var(--tx-primary)', fontFamily: 'var(--font-mono)' }}>{v ?? '–'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result?.error && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--r2)', padding: 'var(--s3)', color: 'var(--red)', fontSize: 12 }}>
              {result.error}
            </div>
          )}

          {!result && !error && !loading && (
            <div className="empty-state">
              <LockIcon size={28} />
              <p>Paste a JWT above to decode its header, payload, and run security checks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LockIcon({ size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> }
function ShieldIcon({ size = 24, color }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
