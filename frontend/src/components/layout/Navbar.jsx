import { UserButton } from '@clerk/react'

const VIEW_TITLES = {
  'request-builder': { title: 'Request Builder', sub: 'Send HTTP requests and inspect responses' },
  'projects':        { title: 'Projects',        sub: 'Manage workspaces and team members' },
  'collections':     { title: 'Collections',     sub: 'Organize and run saved API requests' },
  'workflows':       { title: 'Workflows',        sub: 'Automate multi-step API test sequences' },
  'performance':     { title: 'Performance',     sub: 'Load, stress, and fuzz testing' },
  'monitoring':      { title: 'Monitoring',      sub: 'Uptime monitors and incident tracking' },
  'contracts':       { title: 'Contracts',       sub: 'Schema diffs and API change intelligence' },
  'security':        { title: 'Security Tools',  sub: 'JWT analysis and security inspection' },
  'dashboard':       { title: 'Dashboard',       sub: 'Project KPIs and health overview' },
}

export default function Navbar({ activeView, projectName, onToggleAi, aiOpen }) {
  const meta = VIEW_TITLES[activeView] || VIEW_TITLES['request-builder']

  return (
    <header style={{
      height: 'var(--navbar-h)', flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 var(--s5)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-raised)',
      gap: 'var(--s4)',
    }}>
      {/* Breadcrumb */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {projectName && (
            <>
              <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>{projectName}</span>
              <span style={{ fontSize: 12, color: 'var(--tx-muted)' }}>/</span>
            </>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)' }}>
            {meta.title}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 1 }}>{meta.sub}</p>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', flexShrink: 0 }}>
        <button
          className={`btn ${aiOpen ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={onToggleAi}
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <SparklesIcon size={14} />
          AI Assistant
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {/* Docs link */}
        <a
          href="https://docs.endpointr.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ textDecoration: 'none', fontSize: 12 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          Docs
        </a>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: 28, height: 28 },
            },
          }}
        />
      </div>
    </header>
  )
}

function SparklesIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
