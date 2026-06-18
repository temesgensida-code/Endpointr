import { useState, useEffect } from 'react'
import { workflowsService } from '../../services/workflowsService'
import { useRunLive } from '../../hooks/useRunLive'

export default function WorkflowsView({ getToken, projectId }) {
  const svc = workflowsService(getToken)
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRunId, setActiveRunId] = useState(null)
  const [triggering, setTriggering] = useState(false)

  const { events, status: liveStatus, connected } = useRunLive(getToken, activeRunId)

  useEffect(() => { if (projectId) load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setWorkflows(await svc.list(projectId)) } catch {} finally { setLoading(false) }
  }

  async function createWorkflow() {
    if (!newName.trim()) return
    const wf = await svc.create(projectId, { name: newName.trim(), definition: { nodes: [], edges: [] } })
    setWorkflows(p => [wf, ...p])
    setNewName(''); setShowForm(false)
  }

  async function openWorkflow(wf) {
    setSelected(wf)
    setActiveRunId(null)
    try { setRuns(await svc.listRuns(projectId, wf.id)) } catch { setRuns([]) }
  }

  async function deleteWorkflow(id) {
    if (!confirm('Delete this workflow?')) return
    await svc.delete(projectId, id)
    setWorkflows(p => p.filter(w => w.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function triggerRun() {
    if (!selected) return
    setTriggering(true)
    try {
      const { run_id } = await svc.triggerRun(projectId, selected.id)
      setActiveRunId(run_id)
      setRuns(p => [{ id: run_id, status: 'queued', created_at: new Date().toISOString() }, ...p])
    } catch (e) { alert(e.message) }
    finally { setTriggering(false) }
  }

  const nodeCount = selected?.definition?.nodes?.length || 0
  const edgeCount = selected?.definition?.edges?.length || 0

  if (!projectId) return <div className="empty-state" style={{ height: '100%' }}><FlowIcon size={32} /><p>Select a project first</p></div>
  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <h2 style={{ flex: 1, fontSize: 12 }}>Workflows</h2>
          <button className="btn btn-primary btn-xs" onClick={() => setShowForm(p => !p)}>+ New</button>
        </div>
        {showForm && (
          <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', display: 'flex', gap: 6 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Workflow name" autoFocus style={{ fontSize: 12 }} />
            <button className="btn btn-ghost btn-xs" onClick={createWorkflow}>Add</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
          {workflows.length === 0 && <div className="empty-state" style={{ padding: 'var(--s6)' }}><FlowIcon /><p>No workflows yet</p></div>}
          {workflows.map(wf => (
            <div key={wf.id} className={`card card-hover ${selected?.id === wf.id ? 'card-active' : ''}`}
              style={{ padding: 10, marginBottom: 6, cursor: 'pointer' }} onClick={() => openWorkflow(wf)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FlowIcon size={13} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id) }}>
                  <TrashIcon size={11} />
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--tx-muted)', marginTop: 4 }}>
                {wf.definition?.nodes?.length || 0} step{wf.definition?.nodes?.length !== 1 ? 's' : ''}
              </p>
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
                <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{nodeCount} steps · {edgeCount} connections</p>
              </div>
              <button className="btn btn-primary" onClick={triggerRun} disabled={triggering}>
                {triggering ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <PlayIcon size={13} />}
                Run Workflow
              </button>
            </div>

            {/* DAG visual preview */}
            <div className="card glow-card" style={{ marginBottom: 'var(--s5)', minHeight: 140 }}>
              <span className="section-label" style={{ padding: 0, marginBottom: 12 }}>Pipeline</span>
              {nodeCount === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--s6) 0' }}>
                  <p>This workflow has no steps yet. Build it via the API or workflow editor.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: 'var(--s2) 0' }}>
                  {selected.definition.nodes.map((node, i) => (
                    <div key={node.id || i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--r3)', padding: '10px 14px', minWidth: 130,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className={`method method-${node.data?.method || 'GET'}`} style={{ fontSize: 9 }}>{node.data?.method || 'GET'}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--tx-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                          {node.data?.url || node.id}
                        </p>
                      </div>
                      {i < selected.definition.nodes.length - 1 && (
                        <svg width="28" height="14" style={{ flexShrink: 0, color: 'var(--tx-muted)' }}>
                          <line x1="0" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.5" />
                          <polygon points="22,3 28,7 22,11" fill="currentColor" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live run panel */}
            {activeRunId && (
              <div className="card" style={{ marginBottom: 'var(--s5)', borderColor: 'var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div className={`status-dot ${connected ? 'green pulse' : 'muted'}`} />
                  <span className="section-label" style={{ padding: 0 }}>Live Run · {activeRunId.slice(0, 8)}</span>
                  <span className="badge badge-violet" style={{ marginLeft: 'auto' }}>{liveStatus || 'queued'}</span>
                </div>
                <div style={{ maxHeight: 160, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {events.length === 0 && <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Waiting for events…</p>}
                  {events.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--tx-secondary)', padding: '4px 8px', background: 'var(--bg-overlay)', borderRadius: 4 }}>
                      {JSON.stringify(e)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run history */}
            <div>
              <span className="section-label" style={{ padding: 0, marginBottom: 10 }}>Run History</span>
              {runs.length === 0 && <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No runs yet</p>}
              {runs.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-overlay)', borderRadius: 6, marginBottom: 6, cursor: 'pointer' }}
                  onClick={() => setActiveRunId(r.id)}>
                  <StatusBadge status={r.status} />
                  <code style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{r.id.slice(0, 12)}</code>
                  <span style={{ fontSize: 11, color: 'var(--tx-muted)', marginLeft: 'auto' }}>{r.created_at && new Date(r.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}><FlowIcon size={28} /><p>Select a workflow to view its pipeline and runs</p></div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = { passed: 'badge-green', completed: 'badge-green', failed: 'badge-red', running: 'badge-blue', queued: 'badge-yellow', cancelled: 'badge-muted', partial: 'badge-yellow' }
  return <span className={`badge ${map[status] || 'badge-muted'}`}>{status}</span>
}

function LoadingSkeleton() {
  return <div style={{ padding: 'var(--s5)' }}>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
}

function FlowIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function PlayIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
