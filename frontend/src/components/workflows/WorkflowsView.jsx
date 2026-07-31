import { useState, useEffect } from 'react'
import { workflowsService } from '../../services/workflowsService'
import { useRunLive } from '../../hooks/useRunLive'
import LiveRunDrawer from '../execution/LiveRunDrawer'
import WorkflowCanvas from './WorkflowCanvas'
import NodeInspectorDrawer from './NodeInspectorDrawer'
import WorkflowTemplatesModal from './WorkflowTemplatesModal'
import NodeExecutionModal from './NodeExecutionModal'

export default function WorkflowsView({ getToken, projectId, onNavigate }) {
  const svc = workflowsService(getToken)
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState(null)
  const [definition, setDefinition] = useState({ nodes: [], edges: [] })
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [runs, setRuns] = useState([])
  const [activeRunId, setActiveRunId] = useState(null)
  const [triggering, setTriggering] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [inspectResult, setInspectResult] = useState(null)

  const { events, status: liveStatus, connected } = useRunLive(getToken, activeRunId)
  const [liveMetrics, setLiveMetrics] = useState({})
  const [lastCompletedRun, setLastCompletedRun] = useState(null)

  // Track live metrics over WS
  useEffect(() => {
    if (!events || events.length === 0) return
    const lastEvent = events[events.length - 1]
    if (lastEvent.type === 'metric' && lastEvent.node_id) {
      setLiveMetrics(prev => ({
        ...prev,
        [lastEvent.node_id]: {
          status: lastEvent.status,
          duration_ms: lastEvent.duration_ms,
        }
      }))
    } else if (lastEvent.type === 'completed') {
      setLastCompletedRun(lastEvent)
    }
  }, [events])

  useEffect(() => { if (projectId) load() }, [projectId])

  async function load() {
    setLoading(true)
    try {
      const list = await svc.list(projectId)
      setWorkflows(list)
      if (list.length > 0 && !selected) {
        openWorkflow(list[0])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  async function createWorkflow() {
    if (!newName.trim()) return
    const wf = await svc.create(projectId, { name: newName.trim(), definition: { nodes: [], edges: [] } })
    setWorkflows(p => [wf, ...p])
    setNewName(''); setShowForm(false)
    openWorkflow(wf)
  }

  async function openWorkflow(wf) {
    setSelected(wf)
    setDefinition(wf.definition || { nodes: [], edges: [] })
    setSelectedNodeId(null)
    setActiveRunId(null)
    setLiveMetrics({})
    setLastCompletedRun(null)
    try { setRuns(await svc.listRuns(projectId, wf.id)) } catch { setRuns([]) }
  }

  async function saveWorkflowDefinition(defToSave = definition) {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await svc.update(projectId, selected.id, {
        name: selected.name,
        definition: defToSave,
      })
      setSelected(updated)
      setWorkflows(p => p.map(w => w.id === updated.id ? updated : w))
    } catch (e) {
      alert('Failed to save workflow: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkflow(id) {
    if (!confirm('Delete this workflow?')) return
    await svc.delete(projectId, id)
    const filtered = workflows.filter(w => w.id !== id)
    setWorkflows(filtered)
    if (selected?.id === id) {
      if (filtered.length > 0) openWorkflow(filtered[0])
      else setSelected(null)
    }
  }

  async function triggerRun() {
    if (!selected) return
    // Save definition before running
    await saveWorkflowDefinition(definition)
    setTriggering(true)
    setLiveMetrics({})
    setLastCompletedRun(null)
    try {
      const { run_id } = await svc.triggerRun(projectId, selected.id)
      setActiveRunId(run_id)
      setRuns(p => [{ id: run_id, status: 'queued', created_at: new Date().toISOString() }, ...p])
    } catch (e) {
      alert(e.message)
    } finally {
      setTriggering(false)
    }
  }

  // Node controls
  const handleAddNode = (type) => {
    const id = `step_${Date.now().toString().slice(-4)}`
    const count = (definition.nodes || []).length
    const newNode = {
      id,
      type,
      position: { x: 40 + (count % 3) * 240, y: 80 + Math.floor(count / 3) * 160 },
      data: {
        label: type === 'delay' ? 'Wait Delay' : type === 'condition' ? 'Condition Check' : `Step ${count + 1}`,
        method: type === 'delay' ? 'WAIT' : type === 'condition' ? 'IF' : 'GET',
        url: type === 'request' ? 'https://httpbin.org/get' : '',
        expected_status: 200,
        headers: [],
        extractors: [],
        assertions: [],
      }
    }
    const updated = {
      nodes: [...(definition.nodes || []), newNode],
      edges: definition.edges || []
    }
    setDefinition(updated)
    setSelectedNodeId(id)
  }

  const handleUpdateNode = (nodeId, updatedNode) => {
    const nextNodes = definition.nodes.map(n => n.id === nodeId ? updatedNode : n)
    setDefinition({ ...definition, nodes: nextNodes })
  }

  const handleDeleteNode = (nodeId) => {
    const nextNodes = definition.nodes.filter(n => n.id !== nodeId)
    const nextEdges = definition.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    setDefinition({ nodes: nextNodes, edges: nextEdges })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const handleSelectTemplate = (template) => {
    const updatedDef = {
      nodes: template.nodes,
      edges: template.edges,
    }
    setDefinition(updatedDef)
    saveWorkflowDefinition(updatedDef)
  }

  const selectedNode = definition?.nodes?.find(n => n.id === selectedNodeId)

  if (!projectId) return (
    <div className="empty-state" style={{ height: '100%' }}>
      <FlowIcon size={32} />
      <p style={{ marginBottom: 12 }}>Select a project first to build and execute workflows</p>
      {onNavigate && (
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('projects')}>
          Go to Projects
        </button>
      )}
    </div>
  )

  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Workflows Left Sidebar */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600 }}>Workflows</h2>
          <button className="btn btn-primary btn-xs" onClick={() => setShowForm(p => !p)}>+ New</button>
        </div>

        {showForm && (
          <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', display: 'flex', gap: 6 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Workflow name" autoFocus style={{ fontSize: 11 }} />
            <button className="btn btn-ghost btn-xs" onClick={createWorkflow}>Add</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s2)' }}>
          {workflows.length === 0 && (
            <div className="empty-state" style={{ padding: 'var(--s6)' }}>
              <FlowIcon />
              <p style={{ fontSize: 11 }}>No workflows created yet</p>
            </div>
          )}
          {workflows.map(wf => (
            <div
              key={wf.id}
              className={`card card-hover ${selected?.id === wf.id ? 'card-active' : ''}`}
              style={{ padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}
              onClick={() => openWorkflow(wf)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FlowIcon size={13} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wf.name}
                </span>
                <button
                  className="btn-icon"
                  style={{ width: 20, height: 20 }}
                  onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                >
                  <TrashIcon size={11} />
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--tx-muted)', marginTop: 4 }}>
                {wf.definition?.nodes?.length || 0} steps · {wf.definition?.edges?.length || 0} connections
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Canvas & Toolbar Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            {/* Toolbar */}
            <div
              style={{
                height: 48,
                padding: '0 var(--s4)',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</h1>
                <span className="badge badge-muted" style={{ fontSize: 10 }}>
                  {definition.nodes?.length || 0} steps
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Add Node Dropdown Controls */}
                <button className="btn btn-ghost btn-xs" onClick={() => handleAddNode('request')}>
                  + HTTP Step
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => handleAddNode('delay')}>
                  + Delay
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => handleAddNode('condition')}>
                  + Condition
                </button>

                <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

                <button className="btn btn-ghost btn-xs" onClick={() => setShowTemplatesModal(true)}>
                  Templates
                </button>

                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => saveWorkflowDefinition()}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Pipeline'}
                </button>

                <button className="btn btn-primary btn-sm" onClick={triggerRun} disabled={triggering}>
                  {triggering ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <PlayIcon size={12} />}
                  Run Workflow
                </button>
              </div>
            </div>

            {/* Main Interactive Canvas & Inspector Container */}
            <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
              <div style={{ flex: 1, height: '100%', position: 'relative', padding: 'var(--s3)' }}>
                <WorkflowCanvas
                  definition={definition}
                  onChange={(newDef) => setDefinition(newDef)}
                  onSelectNode={(id) => setSelectedNodeId(id)}
                  selectedNodeId={selectedNodeId}
                  liveMetrics={liveMetrics}
                  nodeResults={lastCompletedRun?.node_results || []}
                  onInspectResult={(res) => setInspectResult(res)}
                />
              </div>

              {/* Node Inspector Drawer */}
              {selectedNode && (
                <NodeInspectorDrawer
                  node={selectedNode}
                  onUpdateNode={handleUpdateNode}
                  onClose={() => setSelectedNodeId(null)}
                  onDeleteNode={handleDeleteNode}
                />
              )}
            </div>

            {/* Bottom Execution History Bar */}
            <div
              style={{
                height: 120,
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-card)',
                padding: 'var(--s3) var(--s4)',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-label" style={{ padding: 0 }}>Execution History</span>
                {activeRunId && (
                  <span className="badge badge-violet" style={{ fontSize: 9 }}>
                    Active Run: {activeRunId.slice(0, 8)} ({liveStatus || 'running'})
                  </span>
                )}
              </div>

              {runs.length === 0 && <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>No execution runs recorded yet</p>}

              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {runs.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setActiveRunId(r.id)}
                    className="card card-hover"
                    style={{
                      padding: '6px 12px',
                      minWidth: 160,
                      cursor: 'pointer',
                      borderColor: activeRunId === r.id ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <StatusBadge status={r.status} />
                      <code style={{ fontSize: 10, color: 'var(--tx-muted)' }}>{r.id.slice(0, 6)}</code>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>
                      {r.created_at && new Date(r.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            <FlowIcon size={28} />
            <p>Select a workflow from the left sidebar or create a new one to open the pipeline builder</p>
          </div>
        )}
      </div>

      {/* Templates Modal */}
      {showTemplatesModal && (
        <WorkflowTemplatesModal
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplatesModal(false)}
        />
      )}

      {/* Node Execution Result Modal */}
      {inspectResult && (
        <NodeExecutionModal
          result={inspectResult}
          onClose={() => setInspectResult(null)}
        />
      )}

      {/* Live Run Logs Drawer */}
      {activeRunId && (
        <LiveRunDrawer
          getToken={getToken}
          runId={activeRunId}
          title={selected?.name}
          type="workflow"
          onClose={() => setActiveRunId(null)}
          onCompleted={async () => {
            if (selected) {
              setRuns(await svc.listRuns(projectId, selected.id))
            }
          }}
        />
      )}
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
