import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../services/auth'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email) {
      setError('Please enter your email.')
      return
    }
    setSubmitting(true)
    try {
      await authService.requestPasswordReset(email)
      // The API never reveals whether the address exists — show the same
      // confirmation either way.
      setSent(true)
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <main id="main-content" className="auth-card">
        <AuthBrand />
        <h1>Check your email</h1>
        <p>
          If an account exists for <strong>{email}</strong>, a link to reset your password
          is on its way. The link expires in 30 minutes.
        </p>
        <p className="auth-aux">
          <Link to="/login">Back to log in</Link>
        </p>
      </main>
    )
  }

  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>Reset your password</h1>
      <p className="muted">Enter your email and we’ll send you a reset link.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-describedby={error ? 'forgot-error' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ErrorBanner message={error} id="forgot-error" />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="auth-aux">
        <Link to="/login">Back to log in</Link>
      </p>
    </main>
  )
}
