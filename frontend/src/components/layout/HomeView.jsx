import { useState, useEffect, useRef, useCallback } from 'react'
import { projectsService } from '../../services/projectsService'

/**
 * HomeView — shown when no project is active.
 * Features:
 *  - Hero welcome heading
 *  - Recent projects list with click-to-activate
 *  - Inline create-project form
 *  - Feature overview cards
 */
export default function HomeView({ getToken, onSelectProject }) {
  const svc = projectsService(getToken)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try { setProjects(await svc.list()) } catch {} finally { setLoading(false) }
  }

  async function createProject() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const p = await svc.create({ name: newName.trim(), description: newDesc.trim() })
      setProjects(prev => [p, ...prev])
      setNewName(''); setNewDesc(''); setShowForm(false)
      onSelectProject(p.id, p.name)
    } catch (e) { alert(e.message) }
    finally { setCreating(false) }
  }

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 'var(--s10) var(--s5)',
    }}>
      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', maxWidth: 560, marginBottom: 'var(--s10)' }}>
        <img
          src="/favicon.svg"
          alt="Endpointr Logo"
          style={{
            width: 56, height: 56,
            objectFit: 'contain',
            margin: '0 auto var(--s5)',
            filter: 'drop-shadow(0 0 12px rgba(var(--accent-rgb), 0.3))',
          }}
        />
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--tx-primary)', marginBottom: 10 }}>
          Your API Testing Workspace
        </h1>
        <p style={{ fontSize: 14, color: 'var(--tx-muted)', lineHeight: 1.65, maxWidth: 440, margin: '0 auto' }}>
          Create a project to start testing, monitoring, and observing your APIs — all from one place.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
        {/* ── Create / Recent row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>

          {/* Create Project card */}
          <div style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r4)',
            padding: 'var(--s5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--r2)',
                background: 'var(--accent-dim)', border: '1px solid var(--border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <PlusIcon size={16} color="var(--accent-bright)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)' }}>New Project</div>
                <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Set up a workspace</div>
              </div>
            </div>

            {!showForm ? (
              <button
                id="btn-create-project"
                className="btn btn-primary btn-sm"
                onClick={() => setShowForm(true)}
                style={{ alignSelf: 'flex-start' }}
              >
                + Create Project
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                <input
                  id="input-project-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  style={{ fontSize: 13 }}
                />
                <textarea
                  id="input-project-desc"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{ minHeight: 60, fontSize: 12, resize: 'none' }}
                />
                <div style={{ display: 'flex', gap: 'var(--s2)' }}>
                  <button
                    id="btn-confirm-create"
                    className="btn btn-primary btn-sm"
                    onClick={createProject}
                    disabled={creating || !newName.trim()}
                    style={{ flex: 1 }}
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowForm(false); setNewName(''); setNewDesc('') }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Recent Projects card */}
          <div style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r4)',
            padding: 'var(--s5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s2)',
            minHeight: 160,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)', marginBottom: 4 }}>Recent Projects</div>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 'var(--r2)' }} />)}
              </div>
            )}
            {!loading && projects.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--tx-muted)', textAlign: 'center' }}>No projects yet.<br />Create one to get started.</p>
              </div>
            )}
            {!loading && projects.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id, p.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r2)',
                  cursor: 'pointer',
                  transition: 'all var(--t-fast)',
                  textAlign: 'left', width: '100%',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.background = 'var(--accent-dim)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg-overlay)'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--r1)',
                  background: 'var(--bg-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--accent-bright)',
                  flexShrink: 0, fontFamily: 'var(--font-mono)',
                }}>
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>
                    {p.member_count} member{p.member_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <ChevronIcon size={12} />
              </button>
            ))}
          </div>
        </div>

        {/* ── Feature overview ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--s3)' }}>
            What you can do
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s3)' }}>
            {FEATURES.map(({ label, icon: Icon, desc }) => (
              <div key={label} style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r3)',
                padding: 'var(--s4)',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 'var(--r2)',
                  background: 'var(--bg-overlay)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10,
                }}>
                  <Icon size={14} color="var(--accent)" />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-primary)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--tx-muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { label: 'Request Builder', icon: IconSend, desc: 'Send any HTTP request and inspect responses in real time.' },
  { label: 'Workflows', icon: IconFlow, desc: 'Chain API calls into automated multi-step test sequences.' },
  { label: 'Performance', icon: IconZap, desc: 'Run load, stress, and fuzz tests against your endpoints.' },
  { label: 'Monitoring', icon: IconActivity, desc: 'Track uptime, latency, and receive incident alerts.' },
]

/* ── Icons ── */
function LogoIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent-bright)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
}
function PlusIcon({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}
function ChevronIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--tx-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
}
function IconSend({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function IconFlow({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
}
function IconZap({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function IconActivity({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
