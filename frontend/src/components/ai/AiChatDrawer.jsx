import AiChatWidget from './AiChatWidget'

export default function AiChatDrawer({ isOpen, onClose, getToken, userId }) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        maxWidth: '100vw',
        zIndex: 9999,
        background: 'var(--bg-raised)',
        boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border)',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-overlay)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SparklesIcon size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>AI Assistant</span>
        </div>
        <button className="btn-icon" onClick={onClose} style={{ width: 26, height: 26 }}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AiChatWidget getToken={getToken} userId={userId} compact={true} />
      </div>
    </div>
  )
}

function SparklesIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-bright)"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

function CloseIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
