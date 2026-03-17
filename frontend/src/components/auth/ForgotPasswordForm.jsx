import { useState } from 'react'

function ForgotPasswordForm({ loading, onSubmit }) {
  const [email, setEmail] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({ email })
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <input
        name="email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button type="submit" disabled={loading}>{loading ? 'Sending code...' : 'Send Reset Code'}</button>
    </form>
  )
}

export default ForgotPasswordForm
