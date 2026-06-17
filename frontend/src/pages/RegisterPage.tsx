import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import GoogleSignInButton from '../components/GoogleSignInButton'
import AuthBrand from '../components/AuthBrand'
import GuestButton from '../components/GuestButton'
import { ErrorBanner } from '../components/StateViews'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address.')
      emailRef.current?.focus()
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await authService.register(email, password)
      // Auto-login after successful registration.
      await authService.login(email, password)
      await refresh()
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('That email is already registered.')
      } else {
        setError(messageForError(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input
          ref={emailRef}
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={error ? 'register-error' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          ref={passwordRef}
          id="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={`register-pw-hint${error ? ' register-error' : ''}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <small id="register-pw-hint">At least 8 characters.</small>

        <ErrorBanner message={error} id="register-error" />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>

        <p className="auth-legal muted">
          By creating an account you agree to our <Link to="/terms">Terms</Link> and{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>
      <GoogleSignInButton onError={setError} />
      <GuestButton onError={setError} />

      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  )
}
