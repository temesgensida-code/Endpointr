/**
 * LiveRunDrawer.jsx — Real-time execution visualizer for Go execution engine streams.
 * Connects directly to Django Channels NATS bridge via WebSocket.
 */
import { useEffect, useRef } from 'react'
import { useRunLive } from '../../hooks/useRunLive'

export default function LiveRunDrawer({ getToken, runId, title, type = 'perf', perfType = 'load', onClose, onCompleted }) {
  const { events, status, connected } = useRunLive(getToken, runId)
  const terminalEndRef = useRef(null)

  const isCompleted = ['completed', 'passed', 'failed', 'partial', 'cancelled'].includes(status)

  useEffect(() => {
    if (isCompleted && onCompleted) {
      onCompleted()
    }
  }, [status])

  // Auto-scroll terminal stream
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  // Extract latest metrics for performance runs
  const latestMetricEvent = [...events].reverse().find(e => e.p95_latency_ms !== undefined || e.summary?.p95_latency_ms !== undefined || e.active_rps !== undefined || e.metrics)
  const summary = events.find(e => e.summary)?.summary || latestMetricEvent?.summary || latestMetricEvent || {}

  // Extract node results for workflow runs
  const nodeEvents = events.filter(e => e.node_id)

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '540px',
      maxWidth: '90vw',
      background: 'var(--bg-raised)',
      borderLeft: '1px solid var(--border-strong)',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideIn 200ms ease both'
    }}>
      {/* Drawer Header */}
      <div style={{
        padding: 'var(--s4)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-overlay)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
          <div className={`status-dot ${isCompleted ? 'muted' : 'green pulse'}`} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
              <h2 style={{ fontSize: 14, fontWeight: 600 }}>{title || 'Execution Stream'}</h2>
              <span className={`badge ${status === 'running' ? 'badge-blue' : isCompleted ? 'badge-green' : 'badge-yellow'}`}>
                {status || 'initializing'}
              </span>
            </div>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--tx-muted)', marginTop: 2 }}>
              Run ID: {runId?.slice(0, 16)}...
            </p>
          </div>
        </div>

        <button className="btn-icon" onClick={onClose} title="Close drawer">
          <CloseIcon />
        </button>
      </div>

      {/* Connection bar */}
      <div style={{
        padding: '6px var(--s4)',
        background: connected ? 'rgba(52,211,153,0.06)' : 'rgba(251,191,36,0.06)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        fontFamily: 'var(--font-mono)'
      }}>
        <span style={{ color: connected ? 'var(--green)' : 'var(--yellow)' }}>
          {connected ? '● Connected to Go Execution Engine' : '○ Connecting to engine...'}
        </span>
        <span style={{ color: 'var(--tx-muted)' }}>{events.length} frames received</span>
      </div>

      {/* Drawer Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s4)' }}>
        {type === 'perf' ? (
          perfType === 'rate_limit' ? (
            /* Rate Limit Speedometer View */
            <RateLimitView events={events} summary={summary} isCompleted={isCompleted} />
          ) : (
            /* Standard Performance Test View */
            <div>
              {/* Live KPI Tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
                <LiveKpi label="P50 Latency" value={summary.p50_latency_ms ? `${summary.p50_latency_ms}ms` : 'Calculating...'} />
                <LiveKpi label="P95 Latency" value={summary.p95_latency_ms ? `${summary.p95_latency_ms}ms` : 'Calculating...'} accent />
                <LiveKpi label="Error Rate" value={summary.error_rate !== undefined ? `${summary.error_rate.toFixed(2)}%` : '0.00%'}
                         danger={summary.error_rate > 1} />
                <LiveKpi label="Throughput" value={summary.throughput_rps ? `${summary.throughput_rps.toFixed(1)} rps` : 'Streaming...'} />
              </div>
  
              {/* Live Terminal Frame Output */}
              <div style={{ marginBottom: 'var(--s3)' }}>
                <span className="section-label" style={{ paddingLeft: 0 }}>Engine Metric Output</span>
                <div className="code-block" style={{ height: '320px', background: 'var(--bg-base)', fontSize: 11, lineHeight: 1.6 }}>
                  {events.length === 0 ? (
                    <div style={{ color: 'var(--tx-muted)' }}>Awaiting telemetry frames from Go worker...</div>
                  ) : (
                    events.map((ev, idx) => (
                      <div key={idx} style={{ marginBottom: 4, display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--tx-muted)' }}>[{new Date().toLocaleTimeString()}]</span>
                        <span style={{ color: ev.status === 'failed' ? 'var(--red)' : 'var(--accent-bright)' }}>
                          {JSON.stringify(ev)}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          )
        ) : (
          /* Workflow DAG Execution View */
          <div>
            {/* KPI summary tiles */}
            {(() => {
              const completedEv = events.find(e => e.type === 'completed' || e.node_results)
              const nodeResults = completedEv?.node_results || nodeEvents
              const totalPassed = nodeResults.filter(r => r.status === 'passed').length
              const totalFailed = nodeResults.filter(r => r.status === 'failed').length
              const totalSkipped = nodeResults.filter(r => r.status === 'skipped').length
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
                  <LiveKpi label="Passed Steps" value={totalPassed} accent />
                  <LiveKpi label="Failed Steps" value={totalFailed} danger={totalFailed > 0} />
                  <LiveKpi label="Skipped Steps" value={totalSkipped} />
                </div>
              )
            })()}

            <div style={{ marginBottom: 'var(--s4)' }}>
              <span className="section-label" style={{ paddingLeft: 0 }}>DAG Node Execution Breakdown</span>
              {(() => {
                const completedEv = events.find(e => e.type === 'completed' || e.node_results)
                const listToRender = completedEv?.node_results || nodeEvents

                if (listToRender.length === 0) {
                  return (
                    <div className="empty-state" style={{ padding: 'var(--s6)' }}>
                      <div className="spinner" />
                      <p style={{ fontSize: 12, marginTop: 8 }}>Executing DAG nodes in Go execution service...</p>
                    </div>
                  )
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {listToRender.map((ne, idx) => (
                      <div key={idx} className="card" style={{ padding: '12px 14px', background: 'var(--bg-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${
                              ne.status === 'passed' ? 'badge-green' :
                              ne.status === 'failed' ? 'badge-red' :
                              ne.status === 'skipped' ? 'badge-yellow' : 'badge-blue'
                            }`}>
                              {ne.status}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--tx-primary)' }}>
                              {ne.node_id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {ne.status_code && (
                              <span className={`badge ${ne.status_code < 400 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                HTTP {ne.status_code}
                              </span>
                            )}
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--tx-muted)' }}>
                              {ne.duration_ms || 0}ms
                            </span>
                          </div>
                        </div>

                        {/* Error message */}
                        {ne.error && (
                          <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 8px', borderRadius: 4, marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                            Error: {ne.error}
                          </div>
                        )}

                        {/* Extracted Variables */}
                        {ne.extracted_vars && Object.keys(ne.extracted_vars).length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11 }}>
                            <div style={{ color: 'var(--tx-muted)', fontSize: 10, marginBottom: 2 }}>Extracted Variables:</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {Object.entries(ne.extracted_vars).map(([k, v]) => (
                                <span key={k} className="badge badge-violet" style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                                  ⚡ {k} = "{v}"
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Assertions */}
                        {ne.assertions && ne.assertions.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11 }}>
                            <div style={{ color: 'var(--tx-muted)', fontSize: 10, marginBottom: 2 }}>Assertions:</div>
                            {ne.assertions.map((a, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                                <span style={{ color: a.passed ? 'var(--green)' : 'var(--red)' }}>
                                  {a.passed ? '✓' : '✗'}
                                </span>
                                <span style={{ color: 'var(--tx-secondary)' }}>{a.type}</span>
                                <span style={{ color: 'var(--tx-muted)', fontSize: 10 }}>({a.detail})</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Response Preview */}
                        {ne.response_preview && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ color: 'var(--tx-muted)', fontSize: 10, marginBottom: 2 }}>Response Preview:</div>
                            <pre style={{
                              margin: 0,
                              padding: '6px 8px',
                              background: 'var(--bg-base)',
                              borderRadius: 4,
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--tx-secondary)',
                              maxHeight: 100,
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}>
                              {ne.response_preview}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Live Terminal Output */}
            <div style={{ marginTop: 'var(--s4)' }}>
              <span className="section-label" style={{ paddingLeft: 0 }}>Raw WebSocket Stream Frames ({events.length})</span>
              <div className="code-block" style={{ height: 180, background: 'var(--bg-base)', fontSize: 10, lineHeight: 1.5 }}>
                {events.length === 0 ? (
                  <div style={{ color: 'var(--tx-muted)' }}>Awaiting telemetry frames...</div>
                ) : (
                  events.map((ev, idx) => (
                    <div key={idx} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                      <span style={{ color: 'var(--tx-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
                      <span style={{ color: ev.status === 'failed' ? 'var(--red)' : ev.type === 'completed' ? 'var(--green)' : 'var(--accent)' }}>
                        {JSON.stringify(ev)}
                      </span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LiveKpi({ label, value, accent, danger }) {
  return (
    <div className="kpi-tile" style={{ padding: 'var(--s3)' }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ fontSize: 20, color: danger ? 'var(--red)' : accent ? 'var(--accent-bright)' : 'var(--tx-primary)' }}>
        {value}
      </span>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function RateLimitView({ events, summary, isCompleted }) {
  const latest = [...events].reverse().find(e => e.active_rps !== undefined) || summary
  const activeRPS = latest?.active_rps || 0
  const rateLimitedCount = latest?.rate_limited || 0
  const detected = latest?.breaking_point || latest?.rate_limit_detected

  // Speedometer math (half circle)
  // min RPS = 0 (180 deg), max RPS = let's scale to 200 (0 deg)
  const MAX_GAUGE = 200
  const fillPct = Math.min(100, (activeRPS / MAX_GAUGE) * 100)
  const rotateDeg = 180 + (fillPct * 1.8) // 1.8 degrees per percent for a 180-deg arc

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
      {/* 429 Banner */}
      {detected && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--red)',
          color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ fontSize: 16 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>HTTP 429 Rate Limit Detected</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Breaking point identified at {latest?.breaking_rps || activeRPS} RPS. Test automatically halted.</div>
          </div>
        </div>
      )}

      {/* Speedometer */}
      <div className="card" style={{ padding: 'var(--s6)', display: 'flex', flexDirection: 'column', alignItems: 'center', background: detected ? 'rgba(239,68,68,0.02)' : 'var(--bg-base)' }}>
        <h3 style={{ fontSize: 14, marginBottom: 'var(--s4)', color: 'var(--tx-secondary)' }}>Live Request Rate</h3>
        
        <div style={{ position: 'relative', width: 240, height: 120, overflow: 'hidden' }}>
          {/* Background Arc */}
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 240, height: 240,
            borderRadius: '50%', border: '12px solid var(--border)',
            borderBottomColor: 'transparent', borderRightColor: 'transparent',
            transform: 'rotate(45deg)'
          }} />
          
          {/* Fill Arc */}
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 240, height: 240,
            borderRadius: '50%', border: `12px solid ${detected ? 'var(--red)' : 'var(--accent-bright)'}`,
            borderBottomColor: 'transparent', borderRightColor: 'transparent',
            transform: `rotate(${rotateDeg - 135}deg)`,
            transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)'
          }} />

          {/* Needle Center */}
          <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--tx-primary)' }} />
          
          {/* Readout */}
          <div style={{ position: 'absolute', bottom: 10, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)', color: detected ? 'var(--red)' : 'var(--tx-primary)' }}>
              {activeRPS}
            </div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--tx-muted)', letterSpacing: 1 }}>req / sec</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--s5)', marginTop: 'var(--s5)', width: '100%', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Successful (HTTP 200)</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{latest?.rps || 0} /s</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Throttled (HTTP 429)</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{rateLimitedCount} /s</div>
          </div>
        </div>
      </div>
    </div>
  )
}
