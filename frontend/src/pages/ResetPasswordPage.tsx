import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useT } from '../i18n'

export default function ResetPasswordPage() {
  const { t } = useT()
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
      setError(t('auth.reset.passwordTooShort'))
      return
    }
    if (newPassword !== confirm) {
      setError(t('auth.reset.mismatch'))
      return
    }
    setSubmitting(true)
    try {
      await authService.resetPassword(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? t('auth.reset.invalidToken')
          : messageForError(err),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main id="main-content" className="auth-card">
        <h1>{t('auth.reset.doneTitle')}</h1>
        <p>{t('auth.reset.doneBody')}</p>
        <p className="auth-aux">
          <Link to="/login">{t('auth.reset.goLogin')}</Link>
        </p>
      </main>
    )
  }

  if (!token) {
    return (
      <main id="main-content" className="auth-card">
        <h1>{t('auth.reset.missingTokenTitle')}</h1>
        <ErrorBanner message={t('auth.reset.missingToken')} />
        <p className="auth-aux">
          <Link to="/forgot-password">{t('auth.reset.requestLink')}</Link>
        </p>
      </main>
    )
  }

  return (
    <main id="main-content" className="auth-card">
      <h1>{t('auth.reset.title')}</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="new-password">{t('auth.reset.newPasswordLabel')}</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-describedby={error ? 'reset-error' : undefined}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <label htmlFor="confirm-password">{t('auth.reset.confirmLabel')}</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={error ? 'reset-error' : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <ErrorBanner message={error} id="reset-error" />
        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.reset.submitting') : t('auth.reset.cta')}
        </button>
      </form>
      <p className="auth-aux">
        <Link to="/login">{t('auth.reset.backToLogin')}</Link>
      </p>
    </main>
  )
}
