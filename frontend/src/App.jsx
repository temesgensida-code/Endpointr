import { useRef, useState } from 'react'
import { SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const MIN_PANEL_PERCENT = 15

function SignedInPanel() {
  const { getToken, userId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [panelWidths, setPanelWidths] = useState([34, 33, 33])
  const rowRef = useRef(null)

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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function startResize(splitIndex, event) {
    const rowEl = rowRef.current
    if (!rowEl) {
      return
    }

    const startX = event.clientX
    const startWidths = [...panelWidths]
    const rowWidth = rowEl.getBoundingClientRect().width
    const leftIndex = splitIndex
    const rightIndex = splitIndex + 1

    function onPointerMove(moveEvent) {
      if (!rowWidth) {
        return
      }

      const deltaPercent = ((moveEvent.clientX - startX) / rowWidth) * 100
      const pairTotal = startWidths[leftIndex] + startWidths[rightIndex]

      const nextLeft = clamp(
        startWidths[leftIndex] + deltaPercent,
        MIN_PANEL_PERCENT,
        pairTotal - MIN_PANEL_PERCENT,
      )
      const nextRight = pairTotal - nextLeft

      setPanelWidths((prev) => {
        const updated = [...prev]
        updated[leftIndex] = nextLeft
        updated[rightIndex] = nextRight
        return updated
      })
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <section className="dashboard">
      <div className="box navbar-box">
        <div className="navbar-title">Navbar</div>
        <UserButton />
      </div>

      <div
        ref={rowRef}
        className="content-row"
        style={{
          gridTemplateColumns: `${panelWidths[0]}% var(--resizer-width) ${panelWidths[1]}% var(--resizer-width) ${panelWidths[2]}%`,
        }}
      >
        <div className="box content-box">
          <h2>Box 1</h2>
          <p>Clerk user id: <code>{userId}</code></p>
        </div>

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 1 and box 2"
          onPointerDown={(event) => startResize(0, event)}
        />

        <div className="box content-box">
          <h2>Box 2</h2>
          <button type="button" onClick={validateBackendToken} disabled={loading}>
            {loading ? 'Validating...' : 'Validate token with Django'}
          </button>
        </div>

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 2 and box 3"
          onPointerDown={(event) => startResize(1, event)}
        />

        <div className="box content-box">
          <h2>Box 3</h2>
          {result ? <pre className="result">{result}</pre> : <p>Validation result will appear here.</p>}
        </div>
      </div>
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
    <main className={isSignedIn ? 'layout dashboard-layout' : 'layout'}>
      {isSignedIn ? <SignedInPanel /> : <SignedOutPanel />}
    </main>
  )
}

export default App