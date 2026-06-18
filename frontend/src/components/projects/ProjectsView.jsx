import { useState, useEffect } from 'react'
import { projectsService } from '../../services/projectsService'

export default function ProjectsView({ getToken, onSelectProject, activeProjectId }) {
  const svc = projectsService(getToken)
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [creating, setCreating]   = useState(false)
  const [newName, setNewName]     = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [selected, setSelected]   = useState(null)  // detailed view
  const [members, setMembers]     = useState([])
  const [apiKeys, setApiKeys]     = useState([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyVisible, setNewKeyVisible] = useState(null) // raw key after creation

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setProjects(await svc.list()) } catch {} finally { setLoading(false) }
  }

  async function create() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const p = await svc.create({ name: newName.trim(), description: newDesc.trim() })
      setProjects(prev => [p, ...prev])
      setNewName(''); setNewDesc(''); setShowForm(false)
    } catch (e) { alert(e.message) }
    finally { setCreating(false) }
  }

  async function openProject(p) {
    setSelected(p)
    onSelectProject(p.id, p.name)
    const [m, k] = await Promise.all([svc.listMembers(p.id).catch(() => []), svc.listApiKeys(p.id).catch(() => [])])
    setMembers(m); setApiKeys(k)
  }

  async function createApiKey() {
    if (!newKeyName.trim() || !selected) return
    try {
      const k = await svc.createApiKey(selected.id, { name: newKeyName.trim(), scopes: [] })
      setNewKeyVisible(k.raw_key)
      setApiKeys(prev => [...prev, k])
      setNewKeyName('')
    } catch (e) { alert(e.message) }
  }

  async function deleteKey(keyId) {
    if (!confirm('Delete this API key? This cannot be undone.')) return
    await svc.deleteApiKey(selected.id, keyId)
    setApiKeys(prev => prev.filter(k => k.id !== keyId))
  }

  async function deleteProject(id) {
    if (!confirm('Delete project and all its data?')) return
    await svc.delete(id)
    setProjects(prev => prev.filter(p => p.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const ROLE_COLOUR = { owner: 'badge-violet', admin: 'badge-blue', editor: 'badge-yellow', viewer: 'badge-muted' }

  if (loading) return <LoadingState />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Project list ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--s4)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexShrink: 0 }}>
          <h2 style={{ flex: 1, fontSize: 13 }}>Projects</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(p => !p)}>
            {showForm ? 'Cancel' : '+ New'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div style={{ padding: 'var(--s4)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Project name" autoFocus />
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)" style={{ minHeight: 60 }} />
              <button className="btn btn-primary btn-sm" onClick={create} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s3)' }}>
          {projects.length === 0 && (
            <div className="empty-state"><ProjectIcon /><p>No projects yet. Create one to get started.</p></div>
          )}
          {projects.map(p => (
            <div
              key={p.id}
              className={`card card-hover ${selected?.id === p.id ? 'card-active' : ''}`}
              style={{ marginBottom: 'var(--s2)', cursor: 'pointer' }}
              onClick={() => openProject(p)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-primary)', marginBottom: 2 }}>{p.name}</div>
                  {p.description && <p style={{ fontSize: 11, color: 'var(--tx-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginTop: 6 }}>
                    <span className={`badge ${ROLE_COLOUR[p.current_user_role] || 'badge-muted'}`}>{p.current_user_role}</span>
                    <span style={{ fontSize: 10, color: 'var(--tx-muted)' }}>{p.member_count} member{p.member_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={e => { e.stopPropagation(); deleteProject(p.id) }}>
                  <TrashIcon size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Project detail ── */}
      {selected ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>
          <div style={{ maxWidth: 680 }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--s6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 4 }}>
                <h1 style={{ fontSize: 20 }}>{selected.name}</h1>
                <span className={`badge ${ROLE_COLOUR[selected.current_user_role] || 'badge-muted'}`}>{selected.current_user_role}</span>
              </div>
              {selected.description && <p style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>{selected.description}</p>}
              <p style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                ID: {selected.id}
              </p>
            </div>

            {/* Members section */}
            <Section title="Team Members" count={members.length}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: '10px var(--s4)', background: 'var(--bg-overlay)', borderRadius: 'var(--r2)', marginBottom: 'var(--s2)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-bright)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {(m.clerk_user_id || 'U').slice(-2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--tx-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.clerk_user_id}</div>
                    <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>Joined {new Date(m.joined_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`badge ${ROLE_COLOUR[m.role] || 'badge-muted'}`}>{m.role}</span>
                </div>
              ))}
            </Section>

            {/* API Keys */}
            <Section title="API Keys" count={apiKeys.length} style={{ marginTop: 'var(--s6)' }}>
              {newKeyVisible && (
                <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--r2)', padding: 'var(--s3) var(--s4)', marginBottom: 'var(--s3)' }}>
                  <p style={{ fontSize: 11, color: 'var(--green)', marginBottom: 6, fontWeight: 500 }}>⚠ Copy this key now — it won't be shown again</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                    <code style={{ flex: 1, fontSize: 11, background: 'var(--bg-base)', padding: '6px 10px', borderRadius: 'var(--r1)', color: 'var(--tx-primary)', wordBreak: 'break-all' }}>{newKeyVisible}</code>
                    <button className="btn btn-ghost btn-xs" onClick={() => { navigator.clipboard.writeText(newKeyVisible); setNewKeyVisible(null) }}>Copy & Close</button>
                  </div>
                </div>
              )}
              {apiKeys.map(k => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: '10px var(--s4)', background: 'var(--bg-overlay)', borderRadius: 'var(--r2)', marginBottom: 'var(--s2)' }}>
                  <KeyIcon size={14} color="var(--accent-bright)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--tx-primary)', fontWeight: 500 }}>{k.name}</div>
                    <code style={{ fontSize: 10, color: 'var(--tx-muted)' }}>{k.prefix}••••••••</code>
                  </div>
                  <span className={`badge ${k.active ? 'badge-green' : 'badge-muted'}`}>{k.active ? 'active' : 'inactive'}</span>
                  <button className="btn-icon" onClick={() => deleteKey(k.id)}><TrashIcon size={12} /></button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CI/CD)" style={{ fontSize: 12 }} />
                <button className="btn btn-ghost btn-sm" onClick={createApiKey} disabled={!newKeyName.trim()} style={{ flexShrink: 0 }}>Generate Key</button>
              </div>
            </Section>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ flex: 1 }}>
          <ProjectIcon size={36} />
          <p>Select a project to view details and manage settings</p>
        </div>
      )}
    </div>
  )
}

function Section({ title, count, children, style }) {
  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
        <h2 style={{ fontSize: 13 }}>{title}</h2>
        {count > 0 && <span className="badge badge-muted">{count}</span>}
      </div>
      {children}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ padding: 'var(--s5)' }}>
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 8, marginBottom: 8 }} />)}
    </div>
  )
}

function ProjectIcon({ size = 28 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> }
function TrashIcon({ size = 14 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> }
function KeyIcon({ size = 14, color }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> }
