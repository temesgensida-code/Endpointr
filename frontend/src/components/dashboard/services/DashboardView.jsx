import { useDashboard } from '../../../hooks/useDashboard'

export default function DashboardView({ getToken, projectId }) {
  const { kpis, monitorStatus, loading, error, refetch } = useDashboard(getToken, projectId)

  if (!projectId) return <div className="empty-state" style={{ height: '100%' }}><GridIcon size={32} /><p>Select a project first</p></div>
  if (loading) return <LoadingSkeleton />
  if (error) return <div className="empty-state" style={{ height: '100%' }}><p style={{ color: 'var(--red)' }}>{error}</p></div>

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: 'var(--s5)' }}>
      <div style={{ maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--s5)' }}>
          <h1 style={{ fontSize: 18, flex: 1 }}>Project Overview</h1>
          <button className="btn btn-ghost btn-sm" onClick={refetch}>
            <RefreshIcon size={13} /> Refresh
          </button>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
          <KpiTile label="Collections" value={kpis?.collections_count ?? '–'} />
          <KpiTile label="Active Monitors" value={kpis?.monitors?.active ?? '–'} sub={`${kpis?.monitors?.open_incidents ?? 0} open incidents`} danger={kpis?.monitors?.open_incidents > 0} />
          <KpiTile label="Workflow Runs (30d)" value={kpis?.workflow_runs?.total ?? '–'} sub={`${kpis?.workflow_runs?.passed ?? 0} passed`} />
          <KpiTile label="Perf Runs (30d)" value={kpis?.perf_runs?.total ?? '–'} sub={`${kpis?.perf_runs?.completed ?? 0} completed`} />
        </div>

        {/* P95 latency trend */}
        <div className="card" style={{ marginBottom: 'var(--s5)' }}>
          <span className="section-label" style={{ padding: 0, marginBottom: 16 }}>P95 Latency Trend (last 5 perf runs)</span>
          {(!kpis?.p95_latency_trend || kpis.p95_latency_trend.length === 0) ? (
            <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No performance runs yet</p>
          ) : (
            <MiniBarChart data={kpis.p95_latency_trend} />
          )}
        </div>

        {/* Monitor status grid */}
        <div>
          <span className="section-label" style={{ padding: 0, marginBottom: 12 }}>Monitor Status</span>
          {monitorStatus.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No monitors configured</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--s3)' }}>
              {monitorStatus.map(m => (
                <div key={m.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`status-dot ${m.operational ? 'green pulse' : 'red'}`} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, danger }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub" style={{ color: danger ? 'var(--red)' : undefined }}>{sub}</span>}
    </div>
  )
}

function MiniBarChart({ data }) {
  const max = Math.max(...data.map(d => d.p95_latency_ms || 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
      {data.slice().reverse().map((d, i) => {
        const h = Math.max(((d.p95_latency_ms || 0) / max) * 100, 4)
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)' }}>{d.p95_latency_ms}ms</span>
            <div style={{
              width: '70%', height: `${h}%`, borderRadius: '4px 4px 0 0',
              background: 'linear-gradient(180deg, var(--accent-bright), var(--accent))',
            }} />
          </div>
        )
      })}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 'var(--s5)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 10 }} />)}
      </div>
      <div className="skeleton" style={{ height: 160, borderRadius: 10 }} />
    </div>
  )
}

function GridIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
function RefreshIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> }
