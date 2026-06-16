import { useState, type FormEvent } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export default function ChooseUsername() {
  const { refresh } = useAuth()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!USERNAME_RE.test(username)) {
      setError('3–20 characters: letters, numbers, and underscores only.')
      return
    }
    setSubmitting(true)
    try {
      await authService.setUsername(username)
      await refresh() // updates user.username → unlocks the app
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'That username is taken.'
          : 'Something went wrong. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-card">
      <AuthBrand />
      <h1>Choose a username</h1>
      <p className="muted">Your public name — shown instead of your email.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <ErrorBanner message={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </main>
  )
}
