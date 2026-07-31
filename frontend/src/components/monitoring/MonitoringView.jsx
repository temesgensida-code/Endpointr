import { useState, useEffect } from 'react'
import { monitoringService } from '../../services/domainServices'

export default function MonitoringView({ getToken, projectId }) {
  const svc = monitoringService(getToken)
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [probingId, setProbingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    protocol: 'http',
    url: '',
    method: 'GET',
    interval_seconds: 60,
    sla_target: 99.9,
  })
  const [selectedMonitor, setSelectedMonitor] = useState(null)
  const [incidents, setIncidents] = useState([])

  useEffect(() => {
    if (projectId) load()
  }, [projectId])

  async function load() {
    setLoading(true)
    try {
      const data = await svc.getStatus(projectId)
      setMonitors(data)
    } catch (e) {
      console.error('Failed to load monitors:', e)
    } finally {
      setLoading(false)
    }
  }

  async function createMonitor() {
    if (!draft.name.trim() || !draft.url.trim()) return
    try {
      await svc.createMonitor(projectId, {
        name: draft.name,
        protocol: draft.protocol,
        url: draft.url,
        method: draft.method,
        interval_seconds: Number(draft.interval_seconds),
        sla_target: Number(draft.sla_target),
      })
      setDraft({
        name: '',
        protocol: 'http',
        url: '',
        method: 'GET',
        interval_seconds: 60,
        sla_target: 99.9,
      })
      setShowForm(false)
      load()
    } catch (err) {
      alert('Failed to create monitor')
    }
  }

  async function triggerProbe(monId) {
    setProbingId(monId)
    try {
      await svc.probeNow(projectId, monId)
      await load()
    } catch (e) {
      alert('Probe failed')
    } finally {
      setProbingId(null)
    }
  }

  async function openMonitor(mon) {
    setSelectedMonitor(mon)
    try {
      const incs = await svc.listIncidents(projectId, mon.id)
      setIncidents(incs)
    } catch {
      setIncidents([])
    }
  }

  async function deleteMonitor(id) {
    if (!confirm('Are you sure you want to delete this monitor?')) return
    await svc.deleteMonitor(projectId, id)
    setMonitors(prev => prev.filter(m => m.id !== id))
    if (selectedMonitor?.id === id) setSelectedMonitor(null)
  }

  async function resolveIncident(incId) {
    if (!selectedMonitor) return
    await svc.resolveIncident(projectId, selectedMonitor.id, incId)
    setIncidents(prev => prev.map(i => i.id === incId ? { ...i, status: 'resolved' } : i))
    load()
  }

  if (!projectId) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <ActivityIcon size={32} />
        <p>Select a project to view API monitors</p>
      </div>
    )
  }

  if (loading) return <LoadingSkeleton />

  const totalMonitors = monitors.length
  const operationalCount = monitors.filter(m => m.operational).length
  const downCount = totalMonitors - operationalCount
  const overallUptime = totalMonitors > 0
    ? (monitors.reduce((acc, m) => acc + (m.uptime_30d || 100), 0) / totalMonitors).toFixed(2)
    : '100.00'

  const avgLatency = totalMonitors > 0
    ? Math.round(monitors.reduce((acc, m) => acc + (m.avg_latency_ms || 0), 0) / totalMonitors)
    : 0

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s5)' }}>

        {/* Global SLA KPI Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--s4)',
          marginBottom: 'var(--s6)'
        }}>
          <KpiCard label="Monitored Services" value={totalMonitors} icon={<ActivityIcon size={18} />} />
          <KpiCard
            label="Overall System SLA"
            value={`${overallUptime}%`}
            color={Number(overallUptime) >= 99.0 ? 'var(--green)' : 'var(--yellow)'}
            icon={<ShieldIcon size={18} />}
          />
          <KpiCard
            label="Active Incidents"
            value={downCount}
            color={downCount > 0 ? 'var(--red)' : 'var(--green)'}
            icon={<AlertIcon size={18} />}
          />
          <KpiCard label="Global Avg Latency" value={`${avgLatency}ms`} icon={<ZapIcon size={18} />} />
        </div>

        {/* Action Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx-primary)' }}>Uptime & Health Monitors</h2>
            <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>Real-time 24/7 endpoint availability & SLA tracking</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(p => !p)}>
            + Create Monitor
          </button>
        </div>

        {/* Create Monitor Form Modal/Card */}
        {showForm && (
          <div className="card" style={{ marginBottom: 'var(--s5)', padding: 'var(--s5)', background: 'var(--bg-raised)', border: '1px solid var(--border-strong)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--s4)' }}>Add New API Health Monitor</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)', marginBottom: 'var(--s4)' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Monitor Name</label>
                <input
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Authentication Service Health"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Protocol</label>
                <select
                  value={draft.protocol}
                  onChange={e => setDraft(d => ({ ...d, protocol: e.target.value }))}
                  style={{ width: '100%', height: 36, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--tx-primary)' }}
                >
                  <option value="http">HTTP / REST</option>
                  <option value="graphql">GraphQL</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Target Endpoint URL</label>
                <input
                  value={draft.url}
                  onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  placeholder="https://api.example.com/health"
                  style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>HTTP Method</label>
                <select
                  value={draft.method}
                  onChange={e => setDraft(d => ({ ...d, method: e.target.value }))}
                  style={{ width: '100%', height: 36, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--tx-primary)' }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block', marginBottom: 4 }}>Check Interval (Seconds)</label>
                <input
                  type="number"
                  value={draft.interval_seconds}
                  onChange={e => setDraft(d => ({ ...d, interval_seconds: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s3)' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createMonitor}>Save & Start Monitoring</button>
            </div>
          </div>
        )}

        {/* Monitor Cards Grid */}
        {monitors.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--s8)' }}>
            <ActivityIcon size={36} />
            <p style={{ marginTop: 'var(--s3)', fontWeight: 500 }}>No monitors configured</p>
            <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>Set up a health check to begin tracking uptime and response times.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            {monitors.map(mon => (
              <div
                key={mon.id}
                className="card"
                style={{
                  padding: 'var(--s4)',
                  background: 'var(--bg-raised)',
                  border: selectedMonitor?.id === mon.id ? '1px solid var(--accent-bright)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
                onClick={() => openMonitor(mon)}
              >
                {/* Top Row: Name, Status, Badges, Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                    <div className={`status-dot ${mon.operational ? 'green pulse' : 'red'}`} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx-primary)' }}>{mon.name}</span>
                        <span className="badge badge-muted" style={{ textTransform: 'uppercase', fontSize: 10 }}>{mon.method}</span>
                        <span className="badge badge-muted" style={{ textTransform: 'uppercase', fontSize: 10 }}>{mon.protocol}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {mon.url}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); triggerProbe(mon.id) }}
                      disabled={probingId === mon.id}
                      title="Run an on-demand probe check now"
                    >
                      {probingId === mon.id ? 'Probing...' : '⚡ Probe Now'}
                    </button>
                    <button
                      className="btn-icon"
                      onClick={e => { e.stopPropagation(); deleteMonitor(mon.id) }}
                      title="Delete Monitor"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: 30-Day Uptime Heatmap & Metrics */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 'var(--s3)',
                  borderTop: '1px solid var(--border)',
                  gap: 'var(--s4)'
                }}>
                  {/* Heatmap Pills */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx-muted)', marginBottom: 4 }}>
                      <span>Probe History (Recent)</span>
                      <span>30d Uptime: <strong style={{ color: 'var(--tx-primary)' }}>{mon.uptime_30d}%</strong></span>
                    </div>
                    <UptimeHeatmap logs={mon.recent_logs || []} />
                  </div>

                  {/* Latency badge */}
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)', display: 'block' }}>Avg Latency</span>
                    <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--tx-primary)' }}>
                      {mon.avg_latency_ms ? `${mon.avg_latency_ms}ms` : '–'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incidents Inspector Drawer */}
      {selectedMonitor && (
        <div style={{
          width: 360,
          flexShrink: 0,
          background: 'var(--bg-raised)',
          borderLeft: '1px solid var(--border-strong)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: 'var(--s4)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-overlay)'
          }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>{selectedMonitor.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Incident & Outage Timeline</p>
            </div>
            <button className="btn-icon" onClick={() => setSelectedMonitor(null)}>
              <CloseIcon size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s4)' }}>
            {incidents.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 'var(--s6)' }}>
                <ShieldIcon size={28} />
                <p style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 8 }}>No incidents recorded for this monitor</p>
              </div>
            ) : (
              incidents.map(inc => (
                <div key={inc.id} className="card" style={{ marginBottom: 'var(--s3)', padding: 'var(--s3)', borderLeft: inc.status === 'open' ? '3px solid var(--red)' : '3px solid var(--green)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className={`badge ${inc.status === 'open' ? 'badge-red' : 'badge-green'}`}>
                      {inc.status}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>
                      {new Date(inc.started_at).toLocaleString()}
                    </span>
                  </div>

                  {inc.cause && (
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-secondary)', marginBottom: 6 }}>
                      {inc.cause}
                    </p>
                  )}

                  {inc.details && (
                    <div style={{ background: 'var(--bg-base)', padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--tx-muted)', marginBottom: 8 }}>
                      <div>Status Code: {inc.details.status_code || 'N/A'}</div>
                      <div>Latency: {inc.details.latency_ms ? `${inc.details.latency_ms}ms` : 'N/A'}</div>
                    </div>
                  )}

                  {inc.status === 'open' && (
                    <button className="btn btn-ghost btn-xs" style={{ width: '100%', marginTop: 4 }} onClick={() => resolveIncident(inc.id)}>
                      Mark Incident as Resolved
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function UptimeHeatmap({ logs }) {
  // Pad logs to 30 slots
  const totalSlots = 30
  const slots = Array.from({ length: totalSlots }).map((_, idx) => {
    const log = logs[idx]
    if (!log) return { status: 'empty' }
    return { status: log.success ? 'success' : 'error', time: log.created_at, latency: log.latency_ms }
  })

  return (
    <div style={{ display: 'flex', gap: 3, height: 16, alignItems: 'center' }}>
      {slots.map((slot, i) => (
        <div
          key={i}
          title={slot.status === 'empty' ? 'No data' : `${slot.status === 'success' ? 'Operational' : 'Failing'} (${slot.latency}ms)`}
          style={{
            flex: 1,
            height: '100%',
            borderRadius: 2,
            background: slot.status === 'success'
              ? 'var(--green)'
              : slot.status === 'error'
              ? 'var(--red)'
              : 'var(--border)',
            opacity: slot.status === 'empty' ? 0.4 : 1,
            transition: 'transform 100ms ease'
          }}
        />
      ))}
    </div>
  )
}

function KpiCard({ label, value, color, icon }) {
  return (
    <div className="card" style={{ padding: 'var(--s4)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: 'var(--bg-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: color || 'var(--accent-bright)'
      }}>
        {icon}
      </div>
      <div>
        <span style={{ fontSize: 11, color: 'var(--tx-muted)', display: 'block' }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--tx-primary)' }}>{value}</span>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 8 }} />)}
      </div>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 8 }} />)}
    </div>
  )
}

function ActivityIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function ShieldIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function AlertIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
function ZapIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function CloseIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
