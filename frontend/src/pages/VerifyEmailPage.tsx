import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ErrorBanner } from '../components/StateViews'
import { useT } from '../i18n'

type Status = 'verifying' | 'ok' | 'error' | 'missing'
type ResendState = 'idle' | 'sending' | 'sent' | 'throttled' | 'error'

export default function VerifyEmailPage() {
  const { t } = useT()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing')
  const [resend, setResend] = useState<ResendState>('idle')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    authService
      .verifyEmail(token)
      .then(async () => {
        if (cancelled) return
        setStatus('ok')
        // If the user is logged in, refresh so the banner clears and any hard
        // "confirm your email" gate lifts (refresh sees email_verified is now true).
        // Non-critical UI sync: a failing refresh must not flip the confirmed status
        // back to 'error' via the outer catch.
        if (user) {
          try {
            await refresh()
          } catch {
            // best-effort — verification already succeeded
          }
        }
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
    // Run once for the token in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Resend is only possible while logged in (the endpoint requires auth).
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

  return (
    <main className="auth-card">
      <h1>{t('auth.verify.title')}</h1>

      {status === 'verifying' && <p>{t('auth.verify.verifying')}</p>}

      {status === 'ok' && <p>{t('auth.verify.ok')}</p>}

      {status === 'missing' && (
        <ErrorBanner message={t('auth.verify.missingToken')} />
      )}

      {status === 'error' && (
        <>
          <ErrorBanner message={t('auth.verify.invalidToken')} />
          {user ? (
            <>
              <p>{t('auth.verify.resendPrompt', { email: user.email })}</p>
              {resend === 'sent' ? (
                <p role="status" className="verify-banner-note">{t('auth.verify.resent')}</p>
              ) : (
                <button type="button" onClick={handleResend} disabled={resend === 'sending'}>
                  {resend === 'sending' ? t('auth.verify.resending') : t('auth.verify.resendCta')}
                </button>
              )}
              {resend === 'throttled' && (
                <p role="status" className="auth-notice">
                  {t('auth.verify.throttled')}
                </p>
              )}
              {resend === 'error' && (
                <ErrorBanner message={t('auth.verify.resendError')} />
              )}
            </>
          ) : (
            <p>{t('auth.verify.loginToResend')}</p>
          )}
        </>
      )}

      <p className="auth-aux">
        <Link to="/">{user ? t('auth.verify.goDashboard') : t('auth.verify.goLogin')}</Link>
      </p>
    </main>
  )
}
