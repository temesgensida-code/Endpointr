import { SignIn } from '@clerk/react'

export default function SignedOutPanel() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute', top: '20%', left: '15%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '15%',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(96,165,250,0.08) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40, zIndex: 1 }}>
        {/* Logo + tagline */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #8b5cf6, #60a5fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx-primary)', letterSpacing: '-0.5px' }}>
              endpointr
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--tx-secondary)', maxWidth: 280, lineHeight: 1.6 }}>
            Professional API testing, monitoring &amp; intelligence platform
          </p>
        </div>

        {/* Clerk sign-in card */}
        <div style={{
          background: 'var(--bg-raised)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 2, boxShadow: 'var(--shadow-lg)',
        }}>
          <SignIn routing="hash" appearance={{
            variables: {
              colorPrimary: '#8b5cf6',
              colorBackground: '#111318',
              colorText: '#f1f2f5',
              colorTextSecondary: '#8b8fa8',
              colorInputBackground: '#1e2028',
              colorInputText: '#f1f2f5',
              borderRadius: '8px',
            },
            elements: {
              card: { background: 'transparent', boxShadow: 'none', border: 'none' },
              rootBox: { width: 360 },
            },
          }} />
        </div>
      </div>
    </div>
  )
}
