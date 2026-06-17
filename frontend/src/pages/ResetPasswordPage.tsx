import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('The passwords don’t match.')
      return
    }
    setSubmitting(true)
    try {
      await authService.resetPassword(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? 'This reset link is invalid or has expired. Request a new one.'
          : messageForError(err),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main className="auth-card">
        <h1>Password reset</h1>
        <p>Your password has been changed. You can now log in with it.</p>
        <p className="auth-aux">
          <Link to="/login">Go to log in</Link>
        </p>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="auth-card">
        <h1>Reset your password</h1>
        <ErrorBanner message="This reset link is missing its token. Request a new one." />
        <p className="auth-aux">
          <Link to="/forgot-password">Request a reset link</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="auth-card">
      <h1>Choose a new password</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <ErrorBanner message={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Reset password'}
        </button>
      </form>
      <p className="auth-aux">
        <Link to="/login">Back to log in</Link>
      </p>
    </main>
  )
}
