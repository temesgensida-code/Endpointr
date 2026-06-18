import { useState, useEffect } from 'react'
import { monitoringService } from '../../services/domainServices'

export default function MonitoringView({ getToken, projectId }) {
  const svc = monitoringService(getToken)
  const [status, setStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({ name: '', url: '', interval_seconds: 60, sla_target: 99.9 })
  const [selected, setSelected] = useState(null)
  const [incidents, setIncidents] = useState([])

  useEffect(() => { if (projectId) load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setStatus(await svc.getStatus(projectId)) } catch {} finally { setLoading(false) }
  }

  async function createMonitor() {
    if (!draft.name.trim() || !draft.url.trim()) return
    await svc.createMonitor(projectId, {
      name: draft.name, url: draft.url, method: 'GET',
      interval_seconds: Number(draft.interval_seconds), sla_target: Number(draft.sla_target),
    })
    setDraft({ name: '', url: '', interval_seconds: 60, sla_target: 99.9 })
    setShowForm(false)
    load()
  }

  async function openMonitor(mon) {
    setSelected(mon)
    try { setIncidents(await svc.listIncidents(projectId, mon.id)) } catch { setIncidents([]) }
  }

  async function deleteMonitor(id) {
    if (!confirm('Delete this monitor?')) return
    await svc.deleteMonitor(projectId, id)
    setStatus(p => p.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function resolveIncident(incId) {
    await svc.resolveIncident(projectId, selected.id, incId)
    setIncidents(p => p.map(i => i.id === incId ? { ...i, status: 'resolved' } : i))
  }

  if (!projectId) return <div className="empty-state" style={{ height: '100%' }}><ActivityIcon size={32} /><p>Select a project first</p></div>
  if (loading) return <LoadingSkeleton />

  const operationalCount = status.filter(m => m.operational).length
  const downCount = status.length - operationalCount

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
        {/* Summary bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="status-dot green pulse" />
            <span style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>{operationalCount} operational</span>
          </div>
          {downCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="status-dot red" />
              <span style={{ fontSize: 13, color: 'var(--red)' }}>{downCount} with incidents</span>
            </div>
          )}
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowForm(p => !p)}>
            + Add Monitor
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 'var(--s4)', background: 'var(--bg-overlay)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Monitor name" style={{ fontSize: 12 }} />
              <input value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))} placeholder="https://api.example.com/health" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Check interval (s)</label>
                  <input type="number" value={draft.interval_seconds} onChange={e => setDraft(d => ({ ...d, interval_seconds: e.target.value }))} style={{ fontSize: 12 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--tx-muted)' }}>SLA target (%)</label>
                  <input type="number" step="0.1" value={draft.sla_target} onChange={e => setDraft(d => ({ ...d, sla_target: e.target.value }))} style={{ fontSize: 12 }} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={createMonitor}>Create Monitor</button>
            </div>
          </div>
        )}

        {/* Monitor grid */}
        {status.length === 0 ? (
          <div className="empty-state"><ActivityIcon size={28} /><p>No monitors configured yet</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--s3)' }}>
            {status.map(mon => (
              <div key={mon.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => openMonitor(mon)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className={`status-dot ${mon.operational ? 'green pulse' : 'red'}`} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mon.name}</span>
                  <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); deleteMonitor(mon.id) }}>
                    <TrashIcon size={11} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
                  {mon.url}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="badge badge-muted">SLA {mon.sla_target}%</span>
                  {mon.open_incidents?.length > 0 && (
                    <span className="badge badge-red">{mon.open_incidents.length} incident{mon.open_incidents.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incidents sidebar */}
      {selected && (
        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 'var(--s4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--s4)' }}>
            <h2 style={{ fontSize: 13, flex: 1 }}>{selected.name}</h2>
            <button className="btn-icon" onClick={() => setSelected(null)}><CloseIcon size={14} /></button>
          </div>
          <span className="section-label" style={{ padding: 0, marginBottom: 10 }}>Incidents</span>
          {incidents.length === 0 && <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No incidents recorded</p>}
          {incidents.map(inc => (
            <div key={inc.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`badge ${inc.status === 'open' ? 'badge-red' : 'badge-green'}`}>{inc.status}</span>
                <span style={{ fontSize: 10, color: 'var(--tx-muted)', marginLeft: 'auto' }}>{new Date(inc.started_at).toLocaleString()}</span>
              </div>
              {inc.cause && <p style={{ fontSize: 12, color: 'var(--tx-secondary)', marginBottom: 6 }}>{inc.cause}</p>}
              {inc.status === 'open' && (
                <button className="btn btn-ghost btn-xs" onClick={() => resolveIncident(inc.id)}>Mark resolved</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 'var(--s5)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 10 }} />)}
    </div>
  )
}

function ActivityIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function CloseIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
