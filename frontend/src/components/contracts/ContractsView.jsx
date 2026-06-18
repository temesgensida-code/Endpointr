import { useState, useEffect } from 'react'
import { contractsService } from '../../services/domainServices'

export default function ContractsView({ getToken, projectId }) {
  const svc = contractsService(getToken)
  const [diffs, setDiffs] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showCompute, setShowCompute] = useState(false)
  const [oldId, setOldId] = useState('')
  const [newId, setNewId] = useState('')
  const [computing, setComputing] = useState(false)
  const [filterBreaking, setFilterBreaking] = useState(false)

  useEffect(() => { if (projectId) load() }, [projectId, filterBreaking])

  async function load() {
    setLoading(true)
    try {
      const [d, s] = await Promise.all([svc.listDiffs(projectId, filterBreaking), svc.listSnapshots(projectId)])
      setDiffs(d); setSnapshots(s)
    } catch {} finally { setLoading(false) }
  }

  async function computeDiff() {
    if (!oldId || !newId) return
    setComputing(true)
    try {
      const d = await svc.computeDiff(projectId, oldId, newId)
      setDiffs(p => [d, ...p])
      setShowCompute(false); setOldId(''); setNewId('')
    } catch (e) { alert(e.message) }
    finally { setComputing(false) }
  }

  if (!projectId) return <div className="empty-state" style={{ height: '100%' }}><ShieldIcon size={32} /><p>Select a project first</p></div>
  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <h2 style={{ flex: 1, fontSize: 12 }}>Schema Diffs</h2>
          <button className="btn btn-primary btn-xs" onClick={() => setShowCompute(p => !p)}>+ Compute</button>
        </div>

        <div style={{ padding: '8px var(--s4)', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterBreaking} onChange={e => setFilterBreaking(e.target.checked)} style={{ width: 'auto' }} />
            Breaking changes only
          </label>
        </div>

        {showCompute && (
          <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select value={oldId} onChange={e => setOldId(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">Old snapshot…</option>
              {snapshots.map(s => <option key={s.id} value={s.id}>{s.method} {s.endpoint_path} ({new Date(s.captured_at).toLocaleDateString()})</option>)}
            </select>
            <select value={newId} onChange={e => setNewId(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">New snapshot…</option>
              {snapshots.map(s => <option key={s.id} value={s.id}>{s.method} {s.endpoint_path} ({new Date(s.captured_at).toLocaleDateString()})</option>)}
            </select>
            <button className="btn btn-primary btn-xs" onClick={computeDiff} disabled={computing || !oldId || !newId}>
              {computing ? 'Computing…' : 'Compute Diff'}
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
          {diffs.length === 0 && <div className="empty-state" style={{ padding: 'var(--s6)' }}><ShieldIcon /><p>No schema diffs yet</p></div>}
          {diffs.map(d => (
            <div key={d.id} className={`card card-hover ${selected?.id === d.id ? 'card-active' : ''}`}
              style={{ padding: 10, marginBottom: 6, cursor: 'pointer' }} onClick={() => setSelected(d)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${d.breaking ? 'badge-red' : 'badge-green'}`}>{d.breaking ? 'Breaking' : 'Safe'}</span>
                <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                  score {d.compatibility_score}
                </span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--tx-muted)', marginTop: 6 }}>
                {new Date(d.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
        {selected ? (
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--s5)' }}>
              <span className={`badge ${selected.breaking ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                {selected.breaking ? 'Breaking Change' : 'Compatible'}
              </span>
              <h1 style={{ fontSize: 18 }}>Compatibility {selected.compatibility_score}%</h1>
            </div>

            {/* Score gauge */}
            <div className="card" style={{ marginBottom: 'var(--s5)' }}>
              <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${selected.compatibility_score}%`,
                  background: selected.compatibility_score > 80 ? 'var(--green)' : selected.compatibility_score > 50 ? 'var(--yellow)' : 'var(--red)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Diff breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
              <DiffCard title="Added Fields" items={selected.diff_json?.added_fields} color="var(--green)" />
              <DiffCard title="Removed Fields" items={selected.diff_json?.removed_fields} color="var(--red)" />
              <DiffCard title="Type Changes" items={(selected.diff_json?.type_changes || []).map(t => `${t.field}: ${t.old_type} → ${t.new_type}`)} color="var(--yellow)" />
              <DiffCard title="New Required" items={selected.diff_json?.new_required_fields} color="var(--blue)" />
            </div>

            {/* Impact */}
            {selected.impact_json && (
              <div className="card glow-card">
                <span className="section-label" style={{ padding: 0, marginBottom: 10 }}>API Change Intelligence — Impact</span>
                <div style={{ display: 'flex', gap: 'var(--s4)', marginBottom: 10 }}>
                  <div>
                    <span className="kpi-value" style={{ fontSize: 22 }}>{selected.impact_json.risk_score}</span>
                    <p style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Risk Score</p>
                  </div>
                  <div>
                    <span className="kpi-value" style={{ fontSize: 22 }}>{selected.impact_json.affected_collections?.length || 0}</span>
                    <p style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Affected Collections</p>
                  </div>
                  <div>
                    <span className="kpi-value" style={{ fontSize: 22 }}>{selected.impact_json.affected_tests?.length || 0}</span>
                    <p style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Affected Tests</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}><ShieldIcon size={28} /><p>Select a diff to inspect the breaking change analysis</p></div>
        )}
      </div>
    </div>
  )
}

function DiffCard({ title, items, color }) {
  return (
    <div className="card">
      <span className="section-label" style={{ padding: 0, marginBottom: 8 }}>{title}</span>
      {(!items || items.length === 0) ? (
        <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>None</p>
      ) : (
        items.map((it, i) => (
          <div key={i} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color, marginBottom: 3 }}>{it}</div>
        ))
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return <div style={{ padding: 'var(--s5)' }}>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
}

function ShieldIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
