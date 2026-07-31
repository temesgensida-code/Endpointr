import { useState, useEffect } from 'react'
import { useJWTAnalyzer } from '../../hooks/useJWTAnalyzer'

// Preset JWT Attack Vector / Compliance Samples for Developer Testing
const PRESET_TOKENS = {
  clerk_valid: {
    label: 'Valid RS256 Token',
    desc: 'Standard production Clerk asymmetric token',
    token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Imluc18yYWEzYjRjOTgxMSIsInR5cCI6IkpXVCJ9.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjUxNzMiLCJleHAiOjE3ODU1NTIwMDAsImlhdCI6MTc4NTUxODQwMCwiaXNzIjoiaHR0cHM6Ly9jbGVyay5lbmRwb2ludHIuZGV2Iiwic3ViIjoidXNlcl8ycU5zUjhLQ0gxcjNWOUptS2JpVDV3SDEybzIiLCJqdGkiOiJqdGlfOWFiYzk4NzYiLCJhdWQiOiJhdWJfZW5kcG9pbnRyX2FwaSJ9.SignatureVerifiedByJwksPublicKeyPlaceholderString987654321',
  },
  alg_none: {
    label: 'alg: none Vulnerability',
    desc: 'Critical vulnerability — missing cryptographic signature',
    token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyX2FkbWluIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tIiwiZXhwIjoxNzg1NTUyMDAwLCJyb2xlIjoiYWRtaW4ifQ.',
  },
  expired: {
    label: 'Expired Token',
    desc: 'Token with timestamp in the past',
    token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImtpZF8xMjMiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiJ1c2VyXzEyMyIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSIsImV4cCI6MTU3NzgzNjgwMCwiaWF0IjoxNTc3ODMzMjAwfQ.ExpiredSignaturePlaceholderString1234567890',
  },
  long_ttl: {
    label: '90-Day Lifetime Risk',
    desc: 'Excessive duration token exposing replay risk',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyX2xvbmdfbGl2ZWQiLCJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJleHAiOjE4NjUyODAwMDAsImlhdCI6MTc4NTUxODQwMH0.LongTtlSignaturePlaceholderString9876543210',
  },
  missing_claims: {
    label: 'Missing RFC Claims',
    desc: 'Lacks iss, aud, jti, and iat standard claims',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQ1NiIsImV4cCI6MTc4NTU1MjAwMH0.MinimalSignaturePlaceholderString1234567890',
  },
}

const SEVERITY_CONFIG = {
  critical: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171', label: 'CRITICAL' },
  high: { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', text: '#fb923c', label: 'HIGH' },
  warning: { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)', text: '#facc15', label: 'WARNING' },
  info: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa', label: 'INFO' },
}

export default function SecurityView({ getToken }) {
  const [tokenInput, setTokenInput] = useState('')
  const { analyze, inspectActiveSession, result, loading, error, clear } = useJWTAnalyzer(getToken)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'claims' | 'raw'
  const [copiedSection, setCopiedSection] = useState(null)

  // Auto-inspect active session token on mount
  useEffect(() => {
    handleInspectSession()
  }, [])

  const handleInspectSession = async () => {
    const res = await inspectActiveSession()
    if (res && res.signature) {
      setTokenInput(res.raw_token || '')
    }
  }

  const handleRunAnalyze = (jwtToAnalyze) => {
    const target = jwtToAnalyze || tokenInput
    if (target.trim()) {
      analyze(target.trim())
    }
  }

  const handleLoadPreset = (key) => {
    const preset = PRESET_TOKENS[key]
    if (preset) {
      setTokenInput(preset.token)
      analyze(preset.token)
    }
  }

  const copyToClipboard = (text, sectionName) => {
    navigator.clipboard.writeText(typeof text === 'object' ? JSON.stringify(text, null, 2) : text)
    setCopiedSection(sectionName)
    setTimeout(() => setCopiedSection(null), 2000)
  }

  // Token segment colorizer (Header.Payload.Signature)
  const tokenParts = (tokenInput || '').split('.')
  const headerPart = tokenParts[0] || ''
  const payloadPart = tokenParts[1] || ''
  const sigPart = tokenParts[2] || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Header Bar */}
      <div style={{
        padding: 'var(--s4) var(--s6)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--r2)',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldIcon size={20} color="var(--indigo-400, #818cf8)" />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--tx-primary)' }}>
              JWT Security & Auth Control Center
            </h1>
            <p style={{ fontSize: 12, color: 'var(--tx-muted)', margin: 0 }}>
              Audit cryptographic signatures, verify RFC 7519 claim compliance, and analyze identity posture
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleInspectSession} disabled={loading}>
            <UserCheckIcon size={14} />
            Inspect My Session Token
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setTokenInput(''); clear() }}>
            Clear
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s6)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>

          {/* Preset Attack Vectors / Vulnerability Samples */}
          <div className="card" style={{ padding: 'var(--s3) var(--s4)', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Test Vulnerability & Compliance Presets
              </span>
              <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Click to load sample token</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
              {Object.entries(PRESET_TOKENS).map(([key, item]) => (
                <button
                  key={key}
                  className="btn btn-ghost btn-xs"
                  style={{
                    fontSize: 11,
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r2)'
                  }}
                  title={item.desc}
                  onClick={() => handleLoadPreset(key)}
                >
                  <ZapIcon size={12} color="var(--yellow)" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* JWT Input Box */}
          <div className="card glow-card" style={{ padding: 'var(--s4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s2)' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-secondary)' }}>
                JSON Web Token String (Header.Payload.Signature)
              </label>
              {tokenInput && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => copyToClipboard(tokenInput, 'raw_token')}
                  style={{ fontSize: 11, color: 'var(--tx-muted)' }}
                >
                  {copiedSection === 'raw_token' ? '✓ Copied' : 'Copy Token'}
                </button>
              )}
            </div>

            <textarea
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Paste any JWT token here — eyJhbGciOiJSUzI1NiIs..."
              rows={3}
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: 'var(--s3)',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r2)',
                color: 'var(--tx-primary)',
                resize: 'vertical',
                lineHeight: 1.5
              }}
              spellCheck={false}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--s3)' }}>
              <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--tx-muted)' }}>
                {headerPart && <span style={{ color: '#a855f7', fontFamily: 'var(--font-mono)' }}>Header ({headerPart.length} chars)</span>}
                {payloadPart && <span style={{ color: '#3b82f6', fontFamily: 'var(--font-mono)' }}>• Payload ({payloadPart.length} chars)</span>}
                {sigPart && <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>• Signature ({sigPart.length} chars)</span>}
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleRunAnalyze()}
                disabled={loading || !tokenInput.trim()}
              >
                {loading ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <LockIcon size={14} />}
                Run Security Audit
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--r2)',
              padding: 'var(--s3) var(--s4)',
              color: '#f87171',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s2)'
            }}>
              <AlertTriangleIcon size={16} />
              {error}
            </div>
          )}

          {/* Results Analysis */}
          {result && !result.error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>

              {/* Security Health Scorecard & Key Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--s4)' }}>
                {/* Score Dial */}
                <div className="card" style={{
                  padding: 'var(--s4)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(20, 20, 25, 0.8) 100%)'
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Security Health Score
                  </span>

                  <div style={{ position: 'relative', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="90" height="90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={getScoreColor(result.security_score)}
                        strokeWidth="8"
                        strokeDasharray={264}
                        strokeDashoffset={264 - (264 * (result.security_score || 0)) / 100}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: getScoreColor(result.security_score) }}>
                        {result.security_score ?? 0}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--tx-muted)' }}>/ 100</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <span className={`badge ${getRiskBadge(result.risk_level)}`} style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>
                      Risk Level: {result.risk_level}
                    </span>
                  </div>
                </div>

                {/* Key Telemetry Tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s3)' }}>
                  <div className="card" style={{ padding: 'var(--s3) var(--s4)' }}>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Signing Algorithm</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-primary)' }}>
                        {result.header?.alg || 'NONE'}
                      </code>
                      <span className={`badge ${result.header?.alg?.startsWith('RS') ? 'badge-green' : result.header?.alg === 'none' ? 'badge-red' : 'badge-yellow'}`}>
                        {result.header?.alg?.startsWith('RS') ? 'Asymmetric' : result.header?.alg === 'none' ? 'Unsigned' : 'Symmetric'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 6, display: 'block' }}>
                      Key ID: <code style={{ fontSize: 10 }}>{result.header?.kid || 'None'}</code>
                    </span>
                  </div>

                  <div className="card" style={{ padding: 'var(--s3) var(--s4)' }}>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Token Expiration & Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`badge ${result.is_expired ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 12 }}>
                        {result.is_expired ? 'EXPIRED' : 'ACTIVE / VALID'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--tx-secondary)', marginTop: 6, display: 'block', fontFamily: 'var(--font-mono)' }}>
                      TTL: {result.ttl_formatted || 'N/A'}
                    </span>
                  </div>

                  <div className="card" style={{ padding: 'var(--s3) var(--s4)' }}>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Signature Entropy</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-primary)', fontFamily: 'var(--font-mono)' }}>
                      {result.signature_entropy ?? 0} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--tx-muted)' }}>bits/char</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 6, display: 'block' }}>
                      Sig Length: {result.signature?.length || 0} chars
                    </span>
                  </div>

                  <div className="card" style={{ gridColumn: 'span 3', padding: 'var(--s3) var(--s4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                      <KeyIcon size={18} color="var(--indigo-400, #818cf8)" />
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-primary)', display: 'block' }}>Subject & Identity</span>
                        <code style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>{result.decoded?.subject || 'No subject (sub) claim'}</code>
                      </div>
                    </div>
                    {result.decoded?.issuer && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, color: 'var(--tx-muted)', display: 'block' }}>Issuer (iss)</span>
                        <span style={{ fontSize: 11, color: 'var(--tx-secondary)' }}>{result.decoded.issuer}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 'var(--s4)' }}>
                <button
                  className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                  style={{
                    padding: 'var(--s2) var(--s3)',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'overview' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: activeTab === 'overview' ? 'var(--tx-primary)' : 'var(--tx-muted)',
                    fontWeight: activeTab === 'overview' ? 600 : 400,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Security Findings ({result.security_insights?.length || 0})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
                  onClick={() => setActiveTab('claims')}
                  style={{
                    padding: 'var(--s2) var(--s3)',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'claims' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: activeTab === 'claims' ? 'var(--tx-primary)' : 'var(--tx-muted)',
                    fontWeight: activeTab === 'claims' ? 600 : 400,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  RFC 7519 Claims Matrix
                </button>
                <button
                  className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
                  onClick={() => setActiveTab('raw')}
                  style={{
                    padding: 'var(--s2) var(--s3)',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'raw' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: activeTab === 'raw' ? 'var(--tx-primary)' : 'var(--tx-muted)',
                    fontWeight: activeTab === 'raw' ? 600 : 400,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Decoded Header & Payload JSON
                </button>
              </div>

              {/* Tab 1: Security Insights */}
              {activeTab === 'overview' && (
                <div className="card" style={{ padding: 'var(--s4)' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-primary)', marginBottom: 'var(--s3)' }}>
                    Security Audit & Vulnerability Matrix
                  </h3>

                  {(result.security_insights || []).length === 0 ? (
                    <div style={{ padding: 'var(--s4)', textAlign: 'center', color: 'var(--tx-muted)', fontSize: 13 }}>
                      ✓ No security vulnerabilities or warnings detected for this token.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
                      {result.security_insights.map((item, idx) => {
                        const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info
                        return (
                          <div
                            key={idx}
                            style={{
                              background: cfg.bg,
                              border: `1px solid ${cfg.border}`,
                              borderRadius: 'var(--r2)',
                              padding: 'var(--s3) var(--s4)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: cfg.border,
                                  color: '#fff',
                                  letterSpacing: '0.05em'
                                }}>
                                  {cfg.label}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: cfg.text }}>
                                  {item.title || item.category || 'Security Alert'}
                                </span>
                              </div>
                              {item.category && (
                                <span style={{ fontSize: 10, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>
                                  {item.category}
                                </span>
                              )}
                            </div>

                            <p style={{ fontSize: 12, color: 'var(--tx-primary)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                              {item.message}
                            </p>

                            {item.remediation && (
                              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--tx-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircleIcon size={12} color="var(--green)" />
                                <strong>Remediation:</strong> {item.remediation}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Claims Matrix */}
              {activeTab === 'claims' && (
                <div className="card" style={{ padding: 'var(--s4)' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-primary)', marginBottom: 'var(--s3)' }}>
                    Standard RFC 7519 Token Claims
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <ClaimRow claim="sub" label="Subject" value={result.decoded?.subject} doc="Unique user/principal identifier" />
                    <ClaimRow claim="iss" label="Issuer" value={result.decoded?.issuer} doc="Authority issuing the token" />
                    <ClaimRow claim="aud" label="Audience" value={result.decoded?.audience} doc="Target services intended for token" />
                    <ClaimRow claim="exp" label="Expires At" value={result.decoded?.expires_at} doc="Expiration epoch timestamp" />
                    <ClaimRow claim="nbf" label="Not Before" value={result.decoded?.not_before} doc="Earliest valid timestamp" />
                    <ClaimRow claim="iat" label="Issued At" value={result.decoded?.issued_at} doc="Token creation timestamp" />
                    <ClaimRow claim="jti" label="JWT ID" value={result.decoded?.jwt_id} doc="Unique identifier for replay defense" />
                    <ClaimRow claim="azp" label="Authorized Party" value={result.decoded?.authorized_party} doc="OAuth client ID or frontend origin" />
                  </div>
                </div>
              )}

              {/* Tab 3: Raw JSON */}
              {activeTab === 'raw' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>
                  <div className="card" style={{ padding: 'var(--s4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#a855f7' }}>Header JSON</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => copyToClipboard(result.header, 'header')}>
                        {copiedSection === 'header' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="code-block" style={{ fontSize: 11, margin: 0, overflow: 'auto', maxHeight: 300 }}>
                      {JSON.stringify(result.header, null, 2)}
                    </pre>
                  </div>

                  <div className="card" style={{ padding: 'var(--s4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>Payload JSON</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => copyToClipboard(result.payload, 'payload')}>
                        {copiedSection === 'payload' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="code-block" style={{ fontSize: 11, margin: 0, overflow: 'auto', maxHeight: 300 }}>
                      {JSON.stringify(result.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function ClaimRow({ claim, label, value, doc }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 140px 1fr 200px',
      alignItems: 'center',
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      fontSize: 12
    }}>
      <code style={{ color: 'var(--indigo-400, #818cf8)', fontWeight: 700 }}>{claim}</code>
      <span style={{ color: 'var(--tx-primary)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: value ? 'var(--tx-primary)' : 'var(--tx-muted)' }}>
        {value ? String(value) : '—'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--tx-muted)', textAlign: 'right' }}>{doc}</span>
    </div>
  )
}

function getScoreColor(score) {
  if (score >= 80) return '#10b981' // Green
  if (score >= 50) return '#facc15' // Yellow
  if (score >= 30) return '#fb923c' // Orange
  return '#f87171' // Red
}

function getRiskBadge(level) {
  switch ((level || '').toLowerCase()) {
    case 'critical': return 'badge-red'
    case 'high': return 'badge-red'
    case 'warning': return 'badge-yellow'
    case 'moderate': return 'badge-yellow'
    default: return 'badge-green'
  }
}

// Icons
function ShieldIcon({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function LockIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
function ZapIcon({ size = 12, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function KeyIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3"/></svg>
}
function UserCheckIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
}
function AlertTriangleIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function CheckCircleIcon({ size = 12, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}

