import { useState } from 'react'

function SigninForm({ loading, onSubmit }) {
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(formData)
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <input
        name="identifier"
        type="email"
        placeholder="Email"
        value={formData.identifier}
        onChange={handleChange}
        required
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        value={formData.password}
        onChange={handleChange}
        required
      />
      <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
    </form>
  )
}

export default SigninForm
