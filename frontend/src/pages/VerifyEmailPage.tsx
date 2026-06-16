import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'

type Status = 'verifying' | 'ok' | 'error' | 'missing'
type ResendState = 'idle' | 'sending' | 'sent' | 'throttled' | 'error'

export default function VerifyEmailPage() {
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
        if (user) await refresh()
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
      <h1>Email verification</h1>

      {status === 'verifying' && <p>Verifying your email…</p>}

      {status === 'ok' && <p>Email confirmed — you’re all set.</p>}

      {status === 'missing' && (
        <p role="alert" className="error">
          This verification link is missing its token.
        </p>
      )}

      {status === 'error' && (
        <>
          <p role="alert" className="error">
            This link is invalid or has expired.
          </p>
          {user ? (
            <>
              <p>We can send a fresh confirmation link to {user.email}.</p>
              {resend === 'sent' ? (
                <p className="verify-banner-note">Sent — check your inbox.</p>
              ) : (
                <button type="button" onClick={handleResend} disabled={resend === 'sending'}>
                  {resend === 'sending' ? 'Sending…' : 'Send a new link'}
                </button>
              )}
              {resend === 'throttled' && (
                <p role="status" className="auth-notice">
                  You’ve requested a few links recently. Please wait a moment, then try again.
                </p>
              )}
              {resend === 'error' && (
                <p role="alert" className="error">
                  Couldn’t send the link. Please try again shortly.
                </p>
              )}
            </>
          ) : (
            <p>Log in to request a new confirmation link.</p>
          )}
        </>
      )}

      <p className="auth-aux">
        <Link to="/">{user ? 'Go to dashboard' : 'Go to log in'}</Link>
      </p>
    </main>
  )
}
