import { useState } from 'react'
import { SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

function SignedInPanel() {
  const { getToken, userId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  async function validateBackendToken() {
    setLoading(true)
    setResult('')

    try {
      const token = await getToken()
      if (!token) {
        setResult('No Clerk token available yet. Try again in a moment.')
        return
      }

      const response = await fetch(`${API_BASE_URL}/auth/validate-token/`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const payload = await response.json()
      if (!response.ok) {
        const message = payload?.error || `Request failed with status ${response.status}`
        setResult(message)
        return
      }

      setResult(JSON.stringify(payload, null, 2))
    } catch (error) {
      setResult(error.message || 'Token validation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card">
      <div className="header-row">
        <h1>You are signed in</h1>
        <UserButton />
      </div>
      <p>Clerk user id: <code>{userId}</code></p>

      <button type="button" onClick={validateBackendToken} disabled={loading}>
        {loading ? 'Validating...' : 'Validate token with Django'}
      </button>

      {result ? <pre className="result">{result}</pre> : null}
    </section>
  )
}

function SignedOutPanel() {
  const [mode, setMode] = useState('sign-in')

  return (
    <section className="card">
      {/* <h1>Authentication</h1> */}
      
      {/* <div className="switch-row">
        <button
          type="button"
          className={mode === 'sign-in' ? 'active' : ''}
          onClick={() => setMode('sign-in')}
        >
          Sign In
        </button>
        <button
          type="button"
          className={mode === 'sign-up' ? 'active' : ''}
          onClick={() => setMode('sign-up')}
        >
          Sign Up
        </button>
      </div> */}

      {mode === 'sign-in' ? <SignIn routing="hash" /> : <SignUp routing="hash" />}
    </section>
  )
}

function App() {
  const { isSignedIn } = useAuth()

  return (
    <main className="layout">
      {isSignedIn ? <SignedInPanel /> : <SignedOutPanel />}
    </main>
  )
}

export default App