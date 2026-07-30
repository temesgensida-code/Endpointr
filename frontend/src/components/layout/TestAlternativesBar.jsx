const ALTERNATIVES = [
  {
    id: 'request-builder',
    label: 'Request Builder',
    sub: 'Send & inspect HTTP',
    icon: IconSend,
  },
  {
    id: 'collections',
    label: 'Collections',
    sub: 'Saved request sets',
    icon: IconStack,
  },
  {
    id: 'workflows',
    label: 'Workflows',
    sub: 'Multi-step sequences',
    icon: IconFlow,
  },
  {
    id: 'performance',
    label: 'Performance',
    sub: 'Load & stress tests',
    icon: IconZap,
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    sub: 'Uptime & incidents',
    icon: IconActivity,
  },
  {
    id: 'contracts',
    label: 'Contracts',
    sub: 'Schema & diffs',
    icon: IconShield,
  },
  {
    id: 'security',
    label: 'Security',
    sub: 'JWT & scan tools',
    icon: IconKey,
  },
]

export default function TestAlternativesBar({ activeView, onNavigate }) {
  return (
    <div style={{
      height: 'var(--altbar-h)',
      flexShrink: 0,
      background: 'var(--bg-raised)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--s5)',
      gap: 'var(--s2)',
      overflowX: 'auto',
    }}>
      {ALTERNATIVES.map(({ id, label, sub, icon: Icon }) => {
        const isActive = activeView === id
        return (
          <button
            key={id}
            id={`alt-${id}`}
            onClick={() => onNavigate(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              borderRadius: 'var(--r3)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              color: isActive ? 'var(--accent-bright)' : 'var(--tx-muted)',
              cursor: 'pointer',
              transition: 'all var(--t-fast)',
              flexShrink: 0,
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--bg-overlay)'
                e.currentTarget.style.color = 'var(--tx-secondary)'
                e.currentTarget.style.borderColor = 'var(--border-strong)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--tx-muted)'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}
          >
            <Icon size={14} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>{label}</div>
              <div style={{ fontSize: 10, color: isActive ? 'var(--accent)' : 'var(--tx-muted)', lineHeight: 1.2, marginTop: 1 }}>{sub}</div>
            </div>
            {isActive && (
              <div style={{
                position: 'absolute',
                bottom: -1,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 24,
                height: 2,
                borderRadius: 99,
                background: 'var(--accent)',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── Inline SVG icons ── */
function IconSend({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}
function IconStack({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
}
function IconFlow({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
}
function IconZap({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function IconActivity({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function IconShield({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function IconKey({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
}
