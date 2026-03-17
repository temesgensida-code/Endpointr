import { useMemo, useState } from 'react'
import {
	forgotPassword,
	resetPassword,
	signin,
	signup,
	validateToken,
} from './api/authApi'
import AuthTabs from './components/auth/AuthTabs'
import AuthFeedback from './components/auth/AuthFeedback'
import ForgotPasswordForm from './components/auth/ForgotPasswordForm'
import ResetPasswordForm from './components/auth/ResetPasswordForm'
import SigninForm from './components/auth/SigninForm'
import SignupForm from './components/auth/SignupForm'
import './auth.css'

function Auth() {
	const [activeTab, setActiveTab] = useState('signup')
	const [token, setToken] = useState('')
	const [signInId, setSignInId] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [result, setResult] = useState(null)

	async function runAction(action) {
		setLoading(true)
		setError('')
		try {
			const data = await action()
			setResult(data)
			return data
		} catch (err) {
			setError(err.message || 'Request failed.')
			setResult(null)
			return null
		} finally {
			setLoading(false)
		}
	}

	function onSignup(payload) {
		runAction(() => signup(payload))
	}

	function onSignin(payload) {
		runAction(() => signin(payload))
	}

	async function onForgotPassword(payload) {
		const data = await runAction(() => forgotPassword(payload))
		const possibleId = data?.clerk?.id
		if (possibleId) {
			setSignInId(possibleId)
			setActiveTab('reset')
		}
	}

	function onResetPassword(payload) {
		runAction(() => resetPassword(payload))
	}

	function onValidateToken() {
		runAction(() => validateToken(token))
	}

	const activeForm = useMemo(() => {
		if (activeTab === 'signup') return <SignupForm loading={loading} onSubmit={onSignup} />
		if (activeTab === 'signin') return <SigninForm loading={loading} onSubmit={onSignin} />
		if (activeTab === 'forgot') return <ForgotPasswordForm loading={loading} onSubmit={onForgotPassword} />
		return <ResetPasswordForm loading={loading} initialSignInId={signInId} onSubmit={onResetPassword} />
	}, [activeTab, loading, signInId])

	return (
		<main className="auth-page">
			<section className="auth-card">
				<h1>Authentication</h1>
				<p className="auth-subtitle">Connected to your Django Clerk endpoints</p>

				<AuthTabs activeTab={activeTab} onChange={setActiveTab} />

				{activeForm}

				<div className="token-section">
					<h2>Validate Clerk JWT</h2>
					<input
						className="token-input"
						type="text"
						placeholder="Paste Bearer token (without 'Bearer')"
						value={token}
						onChange={(event) => setToken(event.target.value)}
					/>
					<button type="button" onClick={onValidateToken} disabled={loading || !token.trim()}>
						{loading ? 'Validating...' : 'Validate Token'}
					</button>
				</div>

				<AuthFeedback error={error} data={result} />
			</section>
		</main>
	)
}

export default Auth
