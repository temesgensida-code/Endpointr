import { useEffect, useState } from 'react'

function ResetPasswordForm({ loading, initialSignInId, onSubmit }) {
  const [formData, setFormData] = useState({
    sign_in_id: initialSignInId || '',
    code: '',
    new_password: '',
  })

  useEffect(() => {
    if (initialSignInId) {
      setFormData((prev) => ({ ...prev, sign_in_id: initialSignInId }))
    }
  }, [initialSignInId])

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
        name="sign_in_id"
        placeholder="Sign In ID"
        value={formData.sign_in_id}
        onChange={handleChange}
        required
      />
      <input name="code" placeholder="Reset code" value={formData.code} onChange={handleChange} required />
      <input
        name="new_password"
        type="password"
        placeholder="New password"
        value={formData.new_password}
        onChange={handleChange}
        required
      />
      <button type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
    </form>
  )
}

export default ResetPasswordForm
