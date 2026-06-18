import { useState, useEffect } from 'react'
import { collectionsService } from '../../services/collectionsService'

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function CollectionsView({ getToken, projectId }) {
  const svc = collectionsService(getToken)
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState(null)
  const [requests, setRequests] = useState([])
  const [activeRequest, setActiveRequest] = useState(null)
  const [showReqForm, setShowReqForm] = useState(false)
  const [reqDraft, setReqDraft] = useState({ name: '', method: 'GET', url: '' })

  useEffect(() => { if (projectId) load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setCollections(await svc.list(projectId)) } catch {} finally { setLoading(false) }
  }

  async function createCollection() {
    if (!newName.trim()) return
    const c = await svc.create(projectId, { name: newName.trim() })
    setCollections(p => [c, ...p])
    setNewName(''); setShowForm(false)
  }

  async function openCollection(c) {
    setSelected(c)
    setActiveRequest(null)
    try { setRequests(await svc.listRequests(projectId, c.id)) } catch { setRequests([]) }
  }

  async function deleteCollection(id) {
    if (!confirm('Delete this collection and all its requests?')) return
    await svc.delete(projectId, id)
    setCollections(p => p.filter(c => c.id !== id))
    if (selected?.id === id) { setSelected(null); setRequests([]) }
  }

  async function cloneCollection(id) {
    const clone = await svc.clone(projectId, id)
    setCollections(p => [clone, ...p])
  }

  async function createRequest() {
    if (!reqDraft.name.trim() || !reqDraft.url.trim() || !selected) return
    const r = await svc.createRequest(projectId, selected.id, {
      name: reqDraft.name, method: reqDraft.method, url: reqDraft.url, headers: {}, body: null,
    })
    setRequests(p => [...p, r])
    setReqDraft({ name: '', method: 'GET', url: '' })
    setShowReqForm(false)
  }

  async function deleteRequest(id) {
    await svc.deleteRequest(projectId, selected.id, id)
    setRequests(p => p.filter(r => r.id !== id))
    if (activeRequest?.id === id) setActiveRequest(null)
  }

  if (!projectId) {
    return <div className="empty-state" style={{ height: '100%' }}><FolderIcon size={32} /><p>Select a project from the Projects tab first</p></div>
  }
  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Collections list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <h2 style={{ flex: 1, fontSize: 12 }}>Collections</h2>
          <button className="btn btn-primary btn-xs" onClick={() => setShowForm(p => !p)}>+ New</button>
        </div>
        {showForm && (
          <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)' }}>
            <div style={{ display: 'flex', gap: 'var(--s2)' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Collection name" autoFocus style={{ fontSize: 12 }} />
              <button className="btn btn-ghost btn-xs" onClick={createCollection}>Add</button>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
          {collections.length === 0 && <div className="empty-state" style={{ padding: 'var(--s6)' }}><FolderIcon /><p>No collections yet</p></div>}
          {collections.map(c => (
            <div key={c.id} className={`card card-hover ${selected?.id === c.id ? 'card-active' : ''}`}
              style={{ padding: 10, marginBottom: 6, cursor: 'pointer' }} onClick={() => openCollection(c)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderIcon size={13} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>{c.request_count} request{c.request_count !== 1 ? 's' : ''}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); cloneCollection(c.id) }} data-tip="Clone">
                    <CopyIcon size={11} />
                  </button>
                  <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); deleteCollection(c.id) }}>
                    <TrashIcon size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Requests list */}
      {selected ? (
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <h2 style={{ flex: 1, fontSize: 12 }}>{selected.name}</h2>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowReqForm(p => !p)}>+ Add</button>
          </div>
          {showReqForm && (
            <div style={{ padding: 'var(--s3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={reqDraft.name} onChange={e => setReqDraft(d => ({ ...d, name: e.target.value }))} placeholder="Request name" style={{ fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={reqDraft.method} onChange={e => setReqDraft(d => ({ ...d, method: e.target.value }))} style={{ width: 90, fontSize: 11 }}>
                  {METHOD_OPTIONS.map(m => <option key={m}>{m}</option>)}
                </select>
                <input value={reqDraft.url} onChange={e => setReqDraft(d => ({ ...d, url: e.target.value }))} placeholder="URL" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
              </div>
              <button className="btn btn-primary btn-xs" onClick={createRequest}>Save Request</button>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s2)' }}>
            {requests.length === 0 && <div className="empty-state" style={{ padding: 'var(--s6)' }}><p>No requests in this collection</p></div>}
            {requests.map(r => (
              <div key={r.id} className={`card-hover ${activeRequest?.id === r.id ? 'card-active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, marginBottom: 4, cursor: 'pointer', border: '1px solid transparent' }}
                onClick={() => setActiveRequest(r)}>
                <span className={`method method-${r.method}`}>{r.method}</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--tx-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <button className="btn-icon" style={{ width: 20, height: 20 }} onClick={e => { e.stopPropagation(); deleteRequest(r.id) }}>
                  <TrashIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Request detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
        {activeRequest ? (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--s4)' }}>
              <span className={`method method-${activeRequest.method}`} style={{ fontSize: 13, padding: '4px 10px' }}>{activeRequest.method}</span>
              <h1 style={{ fontSize: 16 }}>{activeRequest.name}</h1>
            </div>
            <div className="card" style={{ marginBottom: 'var(--s4)' }}>
              <span className="section-label" style={{ padding: 0, marginBottom: 6 }}>URL</span>
              <code style={{ fontSize: 12, color: 'var(--tx-primary)', wordBreak: 'break-all' }}>{activeRequest.url}</code>
            </div>
            <div className="card" style={{ marginBottom: 'var(--s4)' }}>
              <span className="section-label" style={{ padding: 0, marginBottom: 6 }}>Headers</span>
              <pre className="code-block" style={{ fontSize: 11 }}>{JSON.stringify(activeRequest.headers || {}, null, 2)}</pre>
            </div>
            {activeRequest.body && (
              <div className="card" style={{ marginBottom: 'var(--s4)' }}>
                <span className="section-label" style={{ padding: 0, marginBottom: 6 }}>Body</span>
                <pre className="code-block" style={{ fontSize: 11 }}>{JSON.stringify(activeRequest.body, null, 2)}</pre>
              </div>
            )}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="section-label" style={{ padding: 0 }}>Assertions</span>
                <span className="badge badge-muted">{activeRequest.assertions?.length || 0}</span>
              </div>
              {(activeRequest.assertions || []).length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No assertions configured. Add status code or JSON path checks via the API.</p>
              )}
              {(activeRequest.assertions || []).map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <span className="badge badge-blue">{a.type}</span>
                  <code style={{ fontSize: 11, color: 'var(--tx-secondary)' }}>{JSON.stringify(a.config)}</code>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            <RequestIcon size={28} />
            <p>{selected ? 'Select a request to view details' : 'Select a collection to browse its requests'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return <div style={{ padding: 'var(--s5)' }}>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
}

function FolderIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function CopyIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function RequestIcon({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
