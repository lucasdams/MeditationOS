import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { EMAIL_RE } from '../lib/validation'
import { useAuth } from '../context/AuthContext'
import GoogleSignInButton from '../components/GoogleSignInButton'
import GuestButton from '../components/GuestButton'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'

export default function LoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Set when an expired session bounced the user here (see AuthContext).
  useEffect(() => {
    if (sessionStorage.getItem('sessionExpired')) {
      sessionStorage.removeItem('sessionExpired')
      setNotice('Your session expired. Please log in again.')
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address.')
      emailRef.current?.focus()
      return
    }
    if (!password) {
      setError('Please enter your password.')
      passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await authService.login(email, password, remember)
      await refresh()
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid email or password.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.')
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
      <h1>Log in</h1>
      {notice && <p role="status" className="auth-notice">{notice}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input
          ref={emailRef}
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={error ? 'login-error' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          ref={passwordRef}
          id="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={error ? 'login-error' : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="auth-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Keep me signed in</span>
        </label>

        <ErrorBanner message={error} id="login-error" />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="auth-aux">
        <Link to="/forgot-password">Forgot password?</Link>
      </p>

      <div className="auth-divider">
        <span>or</span>
      </div>
      <GoogleSignInButton onError={setError} />
      <GuestButton onError={setError} />

      <p>
        No account? <Link to="/register">Register</Link>
      </p>
    </main>
  )
}
