import { useAuth } from '@clerk/react'
import SignedOutPanel from './components/auth/SignedOutPanel'
import SignedInPanel from './components/dashboard/SignedInPanel'
import './App.css'

function App() {
  const { isSignedIn } = useAuth()

  return (
    <main className={isSignedIn ? 'layout dashboard-layout' : 'layout'}>
      {isSignedIn ? <SignedInPanel /> : <SignedOutPanel />}
    </main>
  )
}

export default App