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
import { EMAIL_RE } from '../lib/validation'
import { useT } from '../i18n'

export default function RegisterPage() {
  const { t } = useT()
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
      setError(t('auth.register.invalidEmail'))
      emailRef.current?.focus()
      return
    }
    if (password.length < 8) {
      setError(t('auth.register.passwordTooShort'))
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
        setError(t('auth.register.emailTaken'))
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
      <h1>{t('auth.register.title')}</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">{t('auth.register.emailLabel')}</label>
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

        <label htmlFor="password">{t('auth.register.passwordLabel')}</label>
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
        <small id="register-pw-hint">{t('auth.register.passwordHint')}</small>

        <ErrorBanner message={error} id="register-error" />

        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.register.submitting') : t('auth.register.cta')}
        </button>

        <p className="auth-legal muted">
          {t('auth.register.legal.pre')}<Link to="/terms">{t('auth.register.legal.terms')}</Link>{t('auth.register.legal.and')}
          <Link to="/privacy">{t('auth.register.legal.privacy')}</Link>{t('auth.register.legal.post')}
        </p>
      </form>

      <div className="auth-divider">
        <span>{t('auth.register.or')}</span>
      </div>
      <GoogleSignInButton onError={setError} />
      <GuestButton onError={setError} />

      <p>
        {t('auth.register.haveAccount.text')}<Link to="/login">{t('auth.register.haveAccount.link')}</Link>
      </p>
    </main>
  )
}
