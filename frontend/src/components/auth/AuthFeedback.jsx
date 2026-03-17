function AuthFeedback({ error, data }) {
  if (!error && !data) {
    return null
  }

  return (
    <div className="auth-feedback">
      {error ? <p className="auth-error">{error}</p> : null}
      {data ? (
        <pre className="auth-json">{JSON.stringify(data, null, 2)}</pre>
      ) : null}
    </div>
  )
}

export default AuthFeedback
