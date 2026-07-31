import { useState, useEffect, useRef } from 'react'
import { projectsService } from '../../services/projectsService'


export default function Navbar({
  getToken,
  activeProjectId,
  activeProjectName,
  onSelectProject,
  onToggleAi,
  aiOpen,
}) {
  const svc = projectsService(getToken)
  const [projects, setProjects] = useState([])
  const [dropOpen, setDropOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const dropRef = useRef(null)

  /* Load projects when dropdown opens */
  useEffect(() => {
    if (dropOpen) loadProjects()
  }, [dropOpen])

  /* Close on outside click */
  useEffect(() => {
    function onClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false)
        setShowCreate(false)
        setNewName(''); setNewDesc('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function loadProjects() {
    try { setProjects(await svc.list()) } catch {}
  }

  async function createProject() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const p = await svc.create({ name: newName.trim(), description: newDesc.trim() })
      setProjects(prev => [p, ...prev])
      onSelectProject(p.id, p.name)
      setDropOpen(false); setShowCreate(false); setNewName(''); setNewDesc('')
    } catch (e) { alert(e.message) }
    finally { setCreating(false) }
  }

  function selectProject(p) {
    onSelectProject(p.id, p.name)
    setDropOpen(false)
  }

  return (
    <header style={{
      height: 'var(--navbar-h)',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--s5)',
      background: 'var(--bg-raised)',
      borderBottom: '1px solid var(--border)',
      gap: 'var(--s4)',
      position: 'relative',
      zIndex: 50,
    }}>

      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <img
          src="/favicon.svg"
          alt="Endpointr Logo"
          style={{ width: 70, height: 42, objectFit: 'contain' }}
        />
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx-primary)', letterSpacing: '-0.4px' }}>
          endpointr
        </span>
      </div>

      {/* ── Separator ── */}
      <div style={{ width: 1, height: 20, background: 'var(--border-strong)', flexShrink: 0 }} />

      {/* ── Project selector ── */}
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          id="btn-project-selector"
          onClick={() => setDropOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            background: dropOpen ? 'var(--bg-overlay)' : 'var(--bg-subtle)',
            border: `1px solid ${dropOpen ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--r3)',
            cursor: 'pointer',
            transition: 'all var(--t-fast)',
            minWidth: 160,
          }}
        >
          {activeProjectId ? (
            <>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: 'var(--accent-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: 'var(--accent-bright)',
                fontFamily: 'var(--font-mono)', flexShrink: 0,
              }}>
                {activeProjectName.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-primary)', flex: 1 }}>
                {activeProjectName}
              </span>
            </>
          ) : (
            <>
              <FolderIcon size={14} color="var(--tx-muted)" />
              <span style={{ fontSize: 12, color: 'var(--tx-muted)', flex: 1 }}>
                Select Project
              </span>
            </>
          )}
          <ChevronIcon size={12} open={dropOpen} />
        </button>

        {/* Dropdown */}
        {dropOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r4)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            animation: 'fadeIn 150ms ease both',
            zIndex: 100,
          }}>
            {/* Project list */}
            <div style={{ maxHeight: 240, overflowY: 'auto', padding: 'var(--s2)' }}>
              {projects.length === 0 && (
                <div style={{ padding: 'var(--s4)', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--tx-muted)' }}>No projects yet</p>
                </div>
              )}
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProject(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px',
                    background: activeProjectId === p.id ? 'var(--accent-dim)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--r2)',
                    cursor: 'pointer',
                    transition: 'background var(--t-fast)',
                    textAlign: 'left',
                    color: activeProjectId === p.id ? 'var(--accent-bright)' : 'var(--tx-secondary)',
                  }}
                  onMouseEnter={e => { if (activeProjectId !== p.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (activeProjectId !== p.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 5,
                    background: activeProjectId === p.id ? 'var(--accent-dim)' : 'var(--bg-hover)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: activeProjectId === p.id ? 'var(--accent-bright)' : 'var(--tx-muted)',
                    flexShrink: 0,
                  }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 10, color: 'var(--tx-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description}
                      </div>
                    )}
                  </div>
                  {activeProjectId === p.id && <CheckIcon size={12} />}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '0 var(--s2)' }} />

            {/* Create new */}
            {!showCreate ? (
              <button
                id="btn-dropdown-create"
                onClick={() => setShowCreate(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 12px',
                  background: 'transparent', border: 'none',
                  color: 'var(--accent-bright)',
                  fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', transition: 'background var(--t-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <PlusIcon size={14} /> New Project
              </button>
            ) : (
              <div style={{ padding: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                <input
                  id="input-nav-project-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  style={{ fontSize: 12 }}
                />
                <input
                  id="input-nav-project-desc"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{ fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 'var(--s2)' }}>
                  <button
                    id="btn-nav-confirm-create"
                    className="btn btn-primary btn-xs"
                    onClick={createProject}
                    disabled={creating || !newName.trim()}
                    style={{ flex: 1 }}
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Right actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexShrink: 0 }}>
        <button
          id="btn-ai-toggle"
          className={`btn ${aiOpen ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={onToggleAi}
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <SparklesIcon size={13} />
          AI Assistant
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} />

        <a
          href="https://docs.endpointr.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ textDecoration: 'none', fontSize: 12 }}
        >
          <DocsIcon size={13} /> Docs
        </a>

        <div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} />

        <div
          title="Single User Mode"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 12,
            background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)',
            fontSize: 11, fontWeight: 600, color: 'var(--tx-secondary)',
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--accent-dim)', color: 'var(--accent-bright)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
          }}>
            U
          </div>
          Single User
        </div>
      </div>
    </header>

  )
}

/* ── Inline icons ── */
function FolderIcon({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
}
function ChevronIcon({ size = 12, open = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transition: 'transform var(--t-fast)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--tx-muted)' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
function CheckIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent-bright)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function PlusIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}
function SparklesIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
}
function DocsIcon({ size = 13 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}
