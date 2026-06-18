import { useState, useEffect } from 'react'
import { performanceService } from '../../services/performanceService'

const TYPES = [
  { id: 'load',       label: 'Load Test',       desc: 'Sustained traffic at target VUs' },
  { id: 'stress',     label: 'Stress Test',     desc: 'Push beyond capacity to find breaking point' },
  { id: 'rate_limit', label: 'Rate Limit Test', desc: 'Verify throttling behaviour' },
  { id: 'fuzz',       label: 'Fuzz Test',       desc: 'Mutate inputs to find edge cases' },
]

export default function PerformanceView({ getToken, projectId }) {
  const svc = performanceService(getToken)
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({ name: '', type: 'load', target_url: '', vus: 10, duration_seconds: 30 })
  const [selected, setSelected] = useState(null)
  const [runs, setRuns] = useState([])
  const [triggering, setTriggering] = useState(false)

  useEffect(() => { if (projectId) load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setConfigs(await svc.listConfigs(projectId)) } catch {} finally { setLoading(false) }
  }

  async function createConfig() {
    if (!draft.name.trim() || !draft.target_url.trim()) return
    const cfg = await svc.createConfig(projectId, {
      name: draft.name, type: draft.type,
      config: { vus: Number(draft.vus), duration_seconds: Number(draft.duration_seconds), target_url: draft.target_url, method: 'GET' },
    })
    setConfigs(p => [cfg, ...p])
    setDraft({ name: '', type: 'load', target_url: '', vus: 10, duration_seconds: 30 })
    setShowForm(false)
  }

  async function openConfig(cfg) {
    setSelected(cfg)
    try { setRuns(await svc.listRuns(projectId, cfg.id)) } catch { setRuns([]) }
  }

  async function deleteConfig(id) {
    if (!confirm('Delete this test configuration?')) return
    await svc.deleteConfig(projectId, id)
    setConfigs(p => p.filter(c => c.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function triggerRun() {
    if (!selected) return
    setTriggering(true)
    try {
      await svc.triggerRun(projectId, selected.id)
      setTimeout(async () => setRuns(await svc.listRuns(projectId, selected.id)), 500)
    } catch (e) { alert(e.message) }
    finally { setTriggering(false) }
  }

  if (!projectId) return <div className="empty-state" style={{ height: '100%' }}><ZapIcon size={32} /><p>Select a project first</p></div>
  if (loading) return <LoadingSkeleton />

  const latestCompleted = runs.find(r => r.status === 'completed' && r.summary)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <h2 style={{ flex: 1, fontSize: 12 }}>Test Configs</h2>
          <button className="btn btn-primary btn-xs" onClick={() => setShowForm(p => !p)}>+ New</button>
        </div>
        {showForm && (
          <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Test name" style={{ fontSize: 12 }} />
            <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} style={{ fontSize: 12 }}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input value={draft.target_url} onChange={e => setDraft(d => ({ ...d, target_url: e.target.value }))} placeholder="Target URL" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>VUs</label>
                <input type="number" value={draft.vus} onChange={e => setDraft(d => ({ ...d, vus: e.target.value }))} style={{ fontSize: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Duration (s)</label>
                <input type="number" value={draft.duration_seconds} onChange={e => setDraft(d => ({ ...d, duration_seconds: e.target.value }))} style={{ fontSize: 12 }} />
              </div>
            </div>
            <button className="btn btn-primary btn-xs" onClick={createConfig}>Save Config</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
          {configs.length === 0 && <div className="empty-state" style={{ padding: 'var(--s6)' }}><ZapIcon /><p>No test configs yet</p></div>}
          {configs.map(cfg => (
            <div key={cfg.id} className={`card card-hover ${selected?.id === cfg.id ? 'card-active' : ''}`}
              style={{ padding: 10, marginBottom: 6, cursor: 'pointer' }} onClick={() => openConfig(cfg)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-violet">{TYPES.find(t => t.id === cfg.type)?.label || cfg.type}</span>
                <button className="btn-icon" style={{ width: 18, height: 18, marginLeft: 'auto' }} onClick={e => { e.stopPropagation(); deleteConfig(cfg.id) }}>
                  <TrashIcon size={10} />
                </button>
              </div>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', marginTop: 6 }}>{cfg.name}</p>
              <p style={{ fontSize: 10, color: 'var(--tx-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.config?.target_url}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
        {selected ? (
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--s5)' }}>
              <div>
                <h1 style={{ fontSize: 18, marginBottom: 4 }}>{selected.name}</h1>
                <p style={{ fontSize: 12, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)' }}>
                  {selected.config?.vus} VUs · {selected.config?.duration_seconds}s · {selected.config?.target_url}
                </p>
              </div>
              <button className="btn btn-primary" onClick={triggerRun} disabled={triggering}>
                {triggering ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <PlayIcon size={13} />}
                Run Test
              </button>
            </div>

            {/* KPI tiles from latest completed run */}
            {latestCompleted && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
                <KpiTile label="P50 Latency" value={`${latestCompleted.summary.p50_latency_ms ?? '–'}ms`} />
                <KpiTile label="P95 Latency" value={`${latestCompleted.summary.p95_latency_ms ?? '–'}ms`} accent />
                <KpiTile label="Error Rate" value={`${(latestCompleted.summary.error_rate ?? 0).toFixed(2)}%`}
                  danger={latestCompleted.summary.error_rate > 1} />
                <KpiTile label="Throughput" value={`${(latestCompleted.summary.throughput_rps ?? 0).toFixed(1)} rps`} />
              </div>
            )}

            {/* Run history */}
            <div>
              <span className="section-label" style={{ padding: 0, marginBottom: 10 }}>Run History</span>
              {runs.length === 0 && <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No runs yet — click Run Test to start</p>}
              {runs.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusBadge status={r.status} />
                    <code style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{r.id.slice(0, 12)}</code>
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginLeft: 'auto' }}>
                      {r.created_at && new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  {r.summary && (
                    <div style={{ display: 'flex', gap: 'var(--s4)', marginTop: 8, fontSize: 11, color: 'var(--tx-secondary)', fontFamily: 'var(--font-mono)' }}>
                      <span>p95: {r.summary.p95_latency_ms}ms</span>
                      <span>err: {(r.summary.error_rate ?? 0).toFixed(2)}%</span>
                      <span>rps: {(r.summary.throughput_rps ?? 0).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}><ZapIcon size={28} /><p>Select a test config to view runs and metrics</p></div>
        )}
      </div>
    </div>
  )
}

function KpiTile({ label, value, accent, danger }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ color: danger ? 'var(--red)' : accent ? 'var(--accent-bright)' : 'var(--tx-primary)' }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = { completed: 'badge-green', failed: 'badge-red', running: 'badge-blue', queued: 'badge-yellow', cancelled: 'badge-muted' }
  return <span className={`badge ${map[status] || 'badge-muted'}`}>{status}</span>
}

function LoadingSkeleton() {
  return <div style={{ padding: 'var(--s5)' }}>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
}

function ZapIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function PlayIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
