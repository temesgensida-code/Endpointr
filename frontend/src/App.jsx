import { useAuth } from '@clerk/react'
import SignedOutPanel from './components/auth/SignedOutPanel'
import AppShell from './components/layout/AppShell'
import './index.css'

export default function App() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  return isSignedIn ? <AppShell /> : <SignedOutPanel />
}
