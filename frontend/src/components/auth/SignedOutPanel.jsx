import { SignIn } from '@clerk/react'

export default function SignedOutPanel() {
  return (
    <section className="card">
      <SignIn routing="hash" />
    </section>
  )
}
