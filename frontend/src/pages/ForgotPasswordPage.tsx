import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../services/auth'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useT } from '../i18n'

export default function ForgotPasswordPage() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email) {
      setError(t('auth.forgot.missingEmail'))
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
        <h1>{t('auth.forgot.sentTitle')}</h1>
        <p>
          {t('auth.forgot.sent.pre')}<strong>{email}</strong>{t('auth.forgot.sent.post')}
        </p>
        <p className="auth-aux">
          <Link to="/login">{t('auth.forgot.backToLogin')}</Link>
        </p>
      </main>
    )
  }

  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>{t('auth.forgot.title')}</h1>
      <p className="muted">{t('auth.forgot.intro')}</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">{t('auth.forgot.emailLabel')}</label>
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
          {submitting ? t('auth.forgot.submitting') : t('auth.forgot.cta')}
        </button>
      </form>
      <p className="auth-aux">
        <Link to="/login">{t('auth.forgot.backToLogin')}</Link>
      </p>
    </main>
  )
}
