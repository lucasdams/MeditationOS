import { useState } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

type ResendState = 'idle' | 'sending' | 'sent' | 'throttled' | 'error'

/**
 * Hard gate shown when the backend email-verification gate is enforcing: a data route
 * returned 403 and a fresh /auth/me confirmed this account's email isn't verified.
 * It explains a confirmation link was sent, lets the user resend it (handling the
 * rate-limit 429 gracefully), and lets them proceed once they've confirmed by
 * re-checking /auth/me. While the backend flag is off (the default) this never renders.
 */
export default function ConfirmEmailGate() {
  const { user, refresh, logout } = useAuth()
  const { t } = useT()
  const [resend, setResend] = useState<ResendState>('idle')
  const [rechecking, setRechecking] = useState(false)
  const [recheckFailed, setRecheckFailed] = useState(false)

  async function handleResend() {
    setResend('sending')
    try {
      await authService.resendVerification()
      setResend('sent')
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setResend('throttled')
      } else {
        setResend('error')
      }
    }
  }

  async function handleRecheck() {
    setRechecking(true)
    setRecheckFailed(false)
    try {
      // refresh() flips verificationRequired off if /auth/me now reports verified,
      // which unmounts this gate and restores the app.
      await refresh()
      // If we're still here, the email isn't confirmed yet.
      setRecheckFailed(true)
    } catch {
      setRecheckFailed(true)
    } finally {
      setRechecking(false)
    }
  }

  return (
    <main id="main-content" className="auth-card">
      <h1>{t('auth.confirmGate.title')}</h1>
      <p>
        {t('auth.confirmGate.body.pre')}
        <strong>{user?.email}</strong>
        {t('auth.confirmGate.body.post')}
      </p>

      <button type="button" onClick={handleRecheck} disabled={rechecking}>
        {rechecking ? t('auth.confirmGate.checking') : t('auth.confirmGate.confirmed')}
      </button>

      {recheckFailed && (
        <p role="alert" className="error">
          {t('auth.confirmGate.recheckFailed')}
        </p>
      )}

      <p className="auth-aux">
        {t('auth.confirmGate.didntGet')}
        {resend === 'sent' ? (
          <span className="verify-banner-note">{t('auth.verify.resent')}</span>
        ) : (
          <button
            type="button"
            className="link-button"
            onClick={handleResend}
            disabled={resend === 'sending'}
          >
            {resend === 'sending' ? t('auth.verify.resending') : t('auth.confirmGate.resendLink')}
          </button>
        )}
      </p>

      {resend === 'throttled' && (
        <p role="status" className="auth-notice">
          {t('auth.confirmGate.throttled')}
        </p>
      )}
      {resend === 'error' && (
        <p role="alert" className="error">
          {t('auth.verify.resendError')}
        </p>
      )}

      <p className="auth-aux">
        {t('auth.confirmGate.wrongAddress')}
        <button type="button" className="link-button" onClick={() => void logout()}>
          {t('user.logout')}
        </button>
      </p>
    </main>
  )
}
