const TABS = [
  { key: 'signup', label: 'Sign Up' },
  { key: 'signin', label: 'Sign In' },
  { key: 'forgot', label: 'Forgot Password' },
  { key: 'reset', label: 'Reset Password' },
]

function AuthTabs({ activeTab, onChange }) {
  return (
    <div className="auth-tabs" role="tablist" aria-label="Authentication tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`auth-tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default AuthTabs
