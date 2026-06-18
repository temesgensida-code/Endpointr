const NAV_ITEMS = [
  {
    group: 'WORKSPACE',
    items: [
      { id: 'request-builder', label: 'Request Builder', icon: IconSend },
      { id: 'projects',        label: 'Projects',        icon: IconFolder },
      { id: 'collections',     label: 'Collections',     icon: IconStack },
    ],
  },
  {
    group: 'TESTING',
    items: [
      { id: 'workflows',   label: 'Workflows',   icon: IconFlow },
      { id: 'performance', label: 'Performance', icon: IconZap },
    ],
  },
  {
    group: 'OBSERVABILITY',
    items: [
      { id: 'monitoring', label: 'Monitoring', icon: IconActivity },
      { id: 'contracts',  label: 'Contracts',  icon: IconShield },
    ],
  },
  {
    group: 'TOOLS',
    items: [
      { id: 'security', label: 'Security', icon: IconKey },
    ],
  },
]

export default function Sidebar({ activeView, onNavigate, projectName, hasProject }) {
  return (
    <aside style={{
      width: 'var(--sidebar-w)', flexShrink: 0,
      background: 'var(--bg-raised)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        height: 'var(--navbar-h)', display: 'flex', alignItems: 'center',
        padding: '0 var(--s4)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg, #8b5cf6, #60a5fa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx-primary)', letterSpacing: '-0.3px' }}>
            endpointr
          </span>
        </div>
      </div>

      {/* Project context pill */}
      {hasProject && (
        <div style={{ padding: 'var(--s3) var(--s3) 0' }}>
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 'var(--r2)', padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div className="status-dot green pulse" />
            <span style={{ fontSize: 11, color: 'var(--accent-bright)', fontWeight: 500, truncate: true,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {projectName || 'Project'}
            </span>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav style={{ flex: 1, overflow: 'auto', padding: 'var(--s3)' }}>
        {NAV_ITEMS.map((group) => (
          <div key={group.group} style={{ marginBottom: 'var(--s3)' }}>
            <span className="section-label" style={{ paddingLeft: 6 }}>{group.group}</span>
            {group.items.map((item) => {
              const isActive = activeView === item.id
              const needsProject = ['collections', 'workflows', 'performance', 'monitoring', 'contracts', 'dashboard'].includes(item.id)
              const isDisabled = needsProject && !hasProject

              return (
                <button
                  key={item.id}
                  onClick={() => !isDisabled && onNavigate(item.id)}
                  title={isDisabled ? 'Select a project first' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '7px 10px', border: 'none',
                    borderRadius: 'var(--r2)', cursor: isDisabled ? 'not-allowed' : 'pointer',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    color: isActive ? 'var(--accent-bright)' : isDisabled ? 'var(--tx-muted)' : 'var(--tx-secondary)',
                    fontSize: 13, fontWeight: isActive ? 500 : 400,
                    textAlign: 'left', transition: 'all var(--t-fast)',
                    opacity: isDisabled ? 0.5 : 1,
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => { if (!isActive && !isDisabled) e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = isDisabled ? '' : 'var(--tx-primary)' }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isDisabled ? 'var(--tx-muted)' : 'var(--tx-secondary)' } }}
                >
                  <item.icon size={15} />
                  {item.label}
                  {isActive && (
                    <div style={{
                      marginLeft: 'auto', width: 3, height: 14, borderRadius: 99,
                      background: 'var(--accent)',
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: version */}
      <div style={{
        padding: 'var(--s3) var(--s4)', borderTop: '1px solid var(--border)',
        fontSize: 10, color: 'var(--tx-muted)', fontFamily: 'var(--font-mono)',
      }}>
        v3.0.0 · Phase 3
      </div>
    </aside>
  )
}

/* ── Inline SVG icon components ─── */
function IconSend({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function IconFolder({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
}
function IconStack({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
}
function IconFlow({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
}
function IconZap({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function IconActivity({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function IconShield({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function IconKey({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
}
