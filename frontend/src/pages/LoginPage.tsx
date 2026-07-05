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
import { useT } from '../i18n'

export default function LoginPage() {
  const { t } = useT()
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
      setNotice(t('auth.login.sessionExpired'))
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_RE.test(email)) {
      setError(t('auth.login.invalidEmail'))
      emailRef.current?.focus()
      return
    }
    if (!password) {
      setError(t('auth.login.missingPassword'))
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
        setError(t('auth.login.invalidCredentials'))
      } else if (err instanceof ApiError && err.status === 429) {
        setError(t('auth.login.tooManyAttempts'))
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
      <h1>{t('auth.login.title')}</h1>
      {notice && <p role="status" className="auth-notice">{notice}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">{t('auth.login.emailLabel')}</label>
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

        <label htmlFor="password">{t('auth.login.passwordLabel')}</label>
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
          <span>{t('auth.login.rememberMe')}</span>
        </label>

        <ErrorBanner message={error} id="login-error" />

        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.login.submitting') : t('auth.login.cta')}
        </button>
      </form>

      <p className="auth-aux">
        <Link to="/forgot-password">{t('auth.login.forgotPassword')}</Link>
      </p>

      <div className="auth-divider">
        <span>{t('auth.login.or')}</span>
      </div>
      <GoogleSignInButton onError={setError} />
      <GuestButton onError={setError} />

      <p>
        {t('auth.login.noAccount.text')}<Link to="/register">{t('auth.login.noAccount.link')}</Link>
      </p>
    </main>
  )
}
