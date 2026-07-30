import { useState, useEffect } from 'react'
import { performanceService } from '../../services/performanceService'
import { projectsService } from '../../services/projectsService'
import LiveRunDrawer from '../execution/LiveRunDrawer'

const TEST_TYPES = [
  { id: 'load',       label: 'Load Test',       desc: 'Sustained traffic at target VUs & duration', color: 'var(--accent-bright)' },
  { id: 'stress',     label: 'Stress Test',     desc: 'Progressive ramp-up to find breaking point', color: 'var(--yellow)' },
  { id: 'rate_limit', label: 'Rate Limit Test', desc: 'Verify API throttling & 429 response limits', color: 'var(--blue)' },
  { id: 'fuzz',       label: 'Fuzz Test',       desc: 'Mutate payloads to discover edge-case errors', color: 'var(--green)' },
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function PerformanceView({ getToken, projectId, onNavigate }) {
  const perfSvc = performanceService(getToken)
  const projSvc = projectsService(getToken)

  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrentProjectId] = useState(projectId)
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedConfig, setSelectedConfig] = useState(null)
  const [runs, setRuns] = useState([])
  const [triggering, setTriggering] = useState(false)
  const [activeRunId, setActiveRunId] = useState(null)
  const [activeTab, setActiveTab] = useState('configs') // 'configs' | 'regression'

  // Form state for creating new test configuration
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    type: 'load',
    target_url: 'https://httpbin.org/get',
    method: 'GET',
    vus: 10,
    duration_seconds: 15,
    ramp_up_seconds: 3,
    start_vus: 5,
    max_vus: 50,
    step_vus: 10,
    step_duration_seconds: 5,
    max_error_rate_pct: 5,
    max_p95_latency_ms: 2000,
    target_rps: 50,
    headers: '{\n  "Accept": "application/json"\n}',
    body: '{\n  "key": "value"\n}'
  })

  // Regression state
  const [runA, setRunA] = useState('')
  const [runB, setRunB] = useState('')
  const [regressionReport, setRegressionReport] = useState(null)
  const [comparing, setComparing] = useState(false)

  // Auto-fetch project list if none provided
  useEffect(() => {
    async function initProjects() {
      try {
        const list = await projSvc.list()
        setProjects(list)
        if (!currentProjectId && list.length > 0) {
          setCurrentProjectId(list[0].id)
        }
      } catch (err) {
        console.error('Failed to list projects:', err)
      }
    }
    initProjects()
  }, [])

  useEffect(() => {
    if (projectId) {
      setCurrentProjectId(projectId)
    }
  }, [projectId])

  useEffect(() => {
    if (currentProjectId) {
      loadConfigs()
    } else {
      setLoading(false)
    }
  }, [currentProjectId])

  useEffect(() => {
    if (!currentProjectId || !selectedConfig) return
    const hasActive = runs.some(r => r.status === 'queued' || r.status === 'running')
    if (!hasActive) return

    const interval = setInterval(async () => {
      try {
        const updatedRuns = await perfSvc.listRuns(currentProjectId, selectedConfig.id)
        setRuns(updatedRuns)
      } catch (err) {
        console.error('Failed to poll runs:', err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [currentProjectId, selectedConfig, runs])

  async function cancelRun(runId) {
    if (!selectedConfig) return
    try {
      await perfSvc.cancelRun(currentProjectId, selectedConfig.id, runId)
      const updatedRuns = await perfSvc.listRuns(currentProjectId, selectedConfig.id)
      setRuns(updatedRuns)
    } catch (e) {
      alert('Failed to cancel run: ' + e.message)
    }
  }

  async function loadConfigs() {
    setLoading(true)
    try {
      const data = await perfSvc.listConfigs(currentProjectId)
      setConfigs(data)
      if (data.length > 0 && !selectedConfig) {
        openConfig(data[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function createConfig() {
    if (!draft.name.trim() || !draft.target_url.trim()) return
    let parsedHeaders = {}
    try {
      if (draft.headers.trim()) parsedHeaders = JSON.parse(draft.headers)
    } catch {
      alert('Invalid JSON in Headers')
      return
    }

    try {
      const payload = {
        name: draft.name,
        type: draft.type,
        config: {
          target_url: draft.target_url,
          method: draft.method,
          vus: Number(draft.vus),
          duration_seconds: Number(draft.duration_seconds),
          ramp_up_seconds: Number(draft.ramp_up_seconds),
          start_vus: Number(draft.start_vus),
          max_vus: Number(draft.max_vus),
          step_vus: Number(draft.step_vus),
          step_duration_seconds: Number(draft.step_duration_seconds),
          max_error_rate_pct: Number(draft.max_error_rate_pct),
          max_p95_latency_ms: Number(draft.max_p95_latency_ms),
          target_rps: Number(draft.target_rps),
          headers: parsedHeaders,
          body: ['POST', 'PUT', 'PATCH'].includes(draft.method) ? draft.body : undefined
        }
      }
      const newCfg = await perfSvc.createConfig(currentProjectId, payload)
      setConfigs(prev => [newCfg, ...prev])
      openConfig(newCfg)
      setShowForm(false)
    } catch (e) {
      alert('Failed to save config: ' + e.message)
    }
  }

  async function openConfig(cfg) {
    setSelectedConfig(cfg)
    try {
      const runList = await perfSvc.listRuns(currentProjectId, cfg.id)
      setRuns(runList)
    } catch {
      setRuns([])
    }
  }

  async function deleteConfig(id) {
    if (!confirm('Are you sure you want to delete this test config?')) return
    await perfSvc.deleteConfig(currentProjectId, id)
    setConfigs(prev => prev.filter(c => c.id !== id))
    if (selectedConfig?.id === id) {
      setSelectedConfig(null)
      setRuns([])
    }
  }

  async function triggerRun() {
    if (!selectedConfig) return
    setTriggering(true)
    try {
      const res = await perfSvc.triggerRun(currentProjectId, selectedConfig.id)
      if (res?.run_id) {
        setActiveRunId(res.run_id)
      }
      setTimeout(async () => {
        const updatedRuns = await perfSvc.listRuns(currentProjectId, selectedConfig.id)
        setRuns(updatedRuns)
      }, 600)
    } catch (e) {
      alert('Error launching test: ' + e.message)
    } finally {
      setTriggering(false)
    }
  }

  async function runRegression() {
    if (!runA || !runB) return
    setComparing(true)
    try {
      const report = await perfSvc.getRegressionReport(currentProjectId, runA, runB)
      setRegressionReport(report)
    } catch (e) {
      alert('Failed to calculate regression: ' + e.message)
    } finally {
      setComparing(false)
    }
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Top Header & Project Selector Bar */}
      <div style={{
        padding: 'var(--s3) var(--s5)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-raised)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ZapIcon size={20} color="var(--accent-bright)" />
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Performance Engine</h1>
          </div>

          <div className="tabs" style={{ background: 'var(--bg-subtle)', padding: 3, borderRadius: 'var(--r2)' }}>
            <button className={`tab ${activeTab === 'configs' ? 'active' : ''}`} onClick={() => setActiveTab('configs')}>
              Test Configurations
            </button>
            <button className={`tab ${activeTab === 'regression' ? 'active' : ''}`} onClick={() => setActiveTab('regression')}>
              Regression Analytics
            </button>
          </div>
        </div>

        {/* Project Dropdown Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active Project:</span>
          <select
            value={currentProjectId || ''}
            onChange={e => setCurrentProjectId(e.target.value)}
            style={{ width: 180, fontSize: 12, padding: '4px 8px' }}
          >
            {projects.length === 0 && <option value="">No projects found</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {onNavigate && (
            <button className="btn btn-ghost btn-xs" onClick={() => onNavigate('projects')}>
              + New Project
            </button>
          )}
        </div>
      </div>

      {/* Main View Area */}
      {!currentProjectId ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <ZapIcon size={36} />
          <h2>No Project Selected</h2>
          <p style={{ maxWidth: 320, marginBottom: 16 }}>Create or select a project to configure high-concurrency load and stress tests.</p>
          {onNavigate && (
            <button className="btn btn-primary" onClick={() => onNavigate('projects')}>
              Manage Projects
            </button>
          )}
        </div>
      ) : activeTab === 'regression' ? (
        /* Regression Comparison Tab */
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s6)', maxWidth: 880, margin: '0 auto', width: '100%' }}>
          <h2 style={{ marginBottom: 6 }}>Performance Regression Comparison</h2>
          <p style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 20 }}>
            Compare baseline run metrics against candidate runs to detect latency regressions and throughput changes.
          </p>

          <div className="card" style={{ padding: 'var(--s5)', marginBottom: 'var(--s6)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Baseline Run ID (Run A)</label>
                <input value={runA} onChange={e => setRunA(e.target.value)} placeholder="UUID of baseline run" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Candidate Run ID (Run B)</label>
                <input value={runB} onChange={e => setRunB(e.target.value)} placeholder="UUID of candidate run" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <button className="btn btn-primary" onClick={runRegression} disabled={comparing || !runA || !runB}>
                {comparing ? <div className="spinner" /> : 'Compare Runs'}
              </button>
            </div>
          </div>

          {regressionReport && (
            <div className="animate-fade">
              <h3 style={{ marginBottom: 12 }}>Comparison Results</h3>
              <div className="card" style={{ padding: 'var(--s5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {Object.entries(regressionReport.diff || {}).map(([metric, data]) => (
                    <div key={metric} className="kpi-tile">
                      <span className="kpi-label">{metric.replace(/_/g, ' ')}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                        <span className="kpi-value" style={{ fontSize: 20 }}>{data.run_b}</span>
                        {data.delta_pct !== null && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: data.delta_pct > 0 ? 'var(--red)' : 'var(--green)' }}>
                            {data.delta_pct > 0 ? `+${data.delta_pct}%` : `${data.delta_pct}%`}
                          </span>
                        )}
                      </div>
                      <span className="kpi-sub" style={{ fontSize: 10, color: 'var(--tx-muted)', marginTop: 4 }}>
                        Baseline: {data.run_a}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Test Configs Tab (Main Layout) */
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Sidebar: Config List & Creator */}
          <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 12 }}>Test Configurations ({configs.length})</h2>
              <button className="btn btn-primary btn-xs" onClick={() => setShowForm(p => !p)}>
                {showForm ? 'Cancel' : '+ New Config'}
              </button>
            </div>

            {/* Inline Config Creator Form */}
            {showForm && (
              <div style={{ padding: 'var(--s4)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', overflowY: 'auto', maxHeight: '60vh' }}>
                <h3 style={{ marginBottom: 8, fontSize: 11 }}>Create Performance Test</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Test Name (e.g. Auth Load Test)" />
                  <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
                    {TEST_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={draft.method} onChange={e => setDraft(d => ({ ...d, method: e.target.value }))} style={{ width: 80 }}>
                      {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input value={draft.target_url} onChange={e => setDraft(d => ({ ...d, target_url: e.target.value }))} placeholder="https://api.example.com/endpoint" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                  </div>

                  {draft.type === 'stress' ? (
                    <>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Start VUs</label>
                          <input type="number" value={draft.start_vus} onChange={e => setDraft(d => ({ ...d, start_vus: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Max VUs Target</label>
                          <input type="number" value={draft.max_vus} onChange={e => setDraft(d => ({ ...d, max_vus: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Step VUs</label>
                          <input type="number" value={draft.step_vus} onChange={e => setDraft(d => ({ ...d, step_vus: e.target.value }))} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>SLA Max Error %</label>
                          <input type="number" value={draft.max_error_rate_pct} onChange={e => setDraft(d => ({ ...d, max_error_rate_pct: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>SLA Max Latency (ms)</label>
                          <input type="number" value={draft.max_p95_latency_ms} onChange={e => setDraft(d => ({ ...d, max_p95_latency_ms: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>VUs (Concurrency)</label>
                        <input type="number" value={draft.vus} onChange={e => setDraft(d => ({ ...d, vus: e.target.value }))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Duration (sec)</label>
                        <input type="number" value={draft.duration_seconds} onChange={e => setDraft(d => ({ ...d, duration_seconds: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>JSON Headers</label>
                    <textarea value={draft.headers} onChange={e => setDraft(d => ({ ...d, headers: e.target.value }))} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, height: 50 }} />
                  </div>

                  {['POST', 'PUT', 'PATCH'].includes(draft.method) && (
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>JSON Body Payload</label>
                      <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, height: 60 }} />
                    </div>
                  )}

                  <button className="btn btn-primary btn-sm" onClick={createConfig} style={{ marginTop: 4 }}>
                    Save & Initialize
                  </button>
                </div>
              </div>
            )}

            {/* Config List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s2)' }}>
              {configs.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--s6)' }}>
                  <ZapIcon size={24} />
                  <p style={{ fontSize: 12 }}>No test configurations defined yet.</p>
                </div>
              ) : (
                configs.map(cfg => {
                  const typeObj = TEST_TYPES.find(t => t.id === cfg.type)
                  const isSelected = selectedConfig?.id === cfg.id
                  return (
                    <div
                      key={cfg.id}
                      className={`card card-hover ${isSelected ? 'card-active' : ''}`}
                      style={{ padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}
                      onClick={() => openConfig(cfg)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="badge" style={{ background: 'var(--bg-subtle)', color: typeObj?.color || 'var(--tx-primary)' }}>
                          {typeObj?.label || cfg.type}
                        </span>
                        <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); deleteConfig(cfg.id) }}>
                          <TrashIcon size={11} />
                        </button>
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-primary)', margin: '4px 0 2px' }}>{cfg.name}</p>
                      <p style={{ fontSize: 10, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cfg.config?.method || 'GET'} · {cfg.config?.target_url}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Main Pane: Selected Config Analytics & Execution Details */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>
            {selectedConfig ? (
              <div style={{ maxWidth: 800, margin: '0 auto' }}>
                {/* Detail Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--s5)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h1 style={{ fontSize: 18, margin: 0 }}>{selectedConfig.name}</h1>
                      <span className="badge badge-violet">{selectedConfig.type}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span className={`method method-${selectedConfig.config?.method || 'GET'}`} style={{ marginRight: 6 }}>
                        {selectedConfig.config?.method || 'GET'}
                      </span>
                      {selectedConfig.config?.target_url} · {selectedConfig.config?.vus || 10} VUs · {selectedConfig.config?.duration_seconds || 15}s duration
                    </p>
                  </div>

                  <button className="btn btn-primary" onClick={triggerRun} disabled={triggering}>
                    {triggering ? <div className="spinner" /> : <PlayIcon size={14} />}
                    Launch Test Run
                  </button>
                </div>

                {/* Latest KPI Tiles & Breaking Point Banner */}
                {runs.find(r => r.summary) && (
                  <div style={{ marginBottom: 'var(--s6)' }}>
                    {(() => {
                      const latestRun = runs.find(r => r.summary)
                      const bp = latestRun?.summary?.breaking_point
                      if (!bp?.detected) return null
                      return (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid var(--red)',
                          color: 'var(--red)',
                          marginBottom: 16
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
                            <span>⚠️ Breaking Point Detected at {bp.breaking_vus} VUs (Sec {bp.timestamp_sec})</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                            {bp.reason}
                          </div>
                        </div>
                      )
                    })()}

                    <span className="section-label" style={{ paddingLeft: 0, marginBottom: 10 }}>Latest Run Metrics</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      {(() => {
                        const s = runs.find(r => r.status === 'completed' && r.summary)?.summary || {}
                        return (
                          <>
                            <KpiTile label="P50 Latency" value={s.p50_latency_ms ? `${s.p50_latency_ms}ms` : '–'} />
                            <KpiTile label="P95 Latency" value={s.p95_latency_ms ? `${s.p95_latency_ms}ms` : '–'} accent />
                            <KpiTile label="Error Rate" value={s.error_rate !== undefined ? `${s.error_rate.toFixed(2)}%` : '–'} danger={s.error_rate > 1} />
                            <KpiTile label="Throughput" value={s.throughput_rps ? `${s.throughput_rps.toFixed(1)} rps` : '–'} />
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Run History List */}
                <div>
                  <span className="section-label" style={{ paddingLeft: 0, marginBottom: 10 }}>Execution History ({runs.length})</span>
                  {runs.length === 0 ? (
                    <div className="card" style={{ padding: 'var(--s5)', textOverflow: 'ellipsis', textAlign: 'center', color: 'var(--tx-muted)' }}>
                      No runs launched yet. Click "Launch Test Run" to start high-concurrency execution.
                    </div>
                  ) : (
                    runs.map(r => (
                      <div key={r.id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <StatusBadge status={r.status} />
                            <code style={{ fontSize: 11, color: 'var(--tx-secondary)' }}>Run #{r.id.slice(0, 12)}</code>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {['queued', 'running'].includes(r.status) && (
                              <button
                                className="btn btn-danger btn-xs"
                                onClick={() => cancelRun(r.id)}
                              >
                                Cancel
                              </button>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)' }}>
                              {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                        </div>

                        {r.summary && (
                          <div style={{ display: 'flex', gap: 20, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            <span><strong>P95:</strong> {r.summary.p95_latency_ms}ms</span>
                            <span><strong>Errors:</strong> {(r.summary.error_rate ?? 0).toFixed(2)}%</span>
                            <span><strong>Throughput:</strong> {(r.summary.throughput_rps ?? 0).toFixed(1)} rps</span>
                            <span><strong>Total Req:</strong> {r.summary.total_requests ?? '–'}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ height: '100%' }}>
                <ZapIcon size={32} />
                <p>Select a test configuration from the left panel to inspect metrics and run load tests.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Streaming Drawer */}
      {activeRunId && (
        <LiveRunDrawer
          getToken={getToken}
          runId={activeRunId}
          title={selectedConfig?.name}
          type="perf"
          onClose={() => setActiveRunId(null)}
          onCompleted={async () => {
            if (selectedConfig && currentProjectId) {
              const updated = await perfSvc.listRuns(currentProjectId, selectedConfig.id)
              setRuns(updated)
            }
          }}
        />
      )}
    </div>
  )
}

function KpiTile({ label, value, accent, danger }) {
  return (
    <div className="kpi-tile" style={{ padding: '12px 14px' }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ fontSize: 22, color: danger ? 'var(--red)' : accent ? 'var(--accent-bright)' : 'var(--tx-primary)' }}>
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = { completed: 'badge-green', failed: 'badge-red', running: 'badge-blue', queued: 'badge-yellow', cancelled: 'badge-muted' }
  return <span className={`badge ${map[status] || 'badge-muted'}`}>{status}</span>
}

function LoadingSkeleton() {
  return <div style={{ padding: 'var(--s5)' }}>{[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
}

function ZapIcon({ size = 20, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="1.8" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}

function TrashIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
}

function PlayIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
}
