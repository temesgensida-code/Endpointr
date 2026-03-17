import { useState } from 'react'

function SignupForm({ loading, onSubmit }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
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
      <input name="first_name" placeholder="First name" value={formData.first_name} onChange={handleChange} />
      <input name="last_name" placeholder="Last name" value={formData.last_name} onChange={handleChange} />
      <input name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} required />
      <input
        name="password"
        type="password"
        placeholder="Password"
        value={formData.password}
        onChange={handleChange}
        required
      />
      <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
    </form>
  )
}

export default SignupForm
