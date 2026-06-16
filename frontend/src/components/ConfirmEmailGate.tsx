import { useState } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'

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
    <main className="auth-card">
      <h1>Confirm your email</h1>
      <p>
        To keep your account secure, please confirm your email address before
        continuing. We sent a confirmation link to{' '}
        <strong>{user?.email}</strong> — open it to finish, then come back here.
      </p>

      <button type="button" onClick={handleRecheck} disabled={rechecking}>
        {rechecking ? 'Checking…' : 'I’ve confirmed — continue'}
      </button>

      {recheckFailed && (
        <p role="alert" className="error">
          We still don’t see a confirmation. Open the link in your email, then try again.
        </p>
      )}

      <p className="auth-aux">
        Didn’t get it?{' '}
        {resend === 'sent' ? (
          <span className="verify-banner-note">Sent — check your inbox.</span>
        ) : (
          <button
            type="button"
            className="link-button"
            onClick={handleResend}
            disabled={resend === 'sending'}
          >
            {resend === 'sending' ? 'Sending…' : 'Resend the link'}
          </button>
        )}
      </p>

      {resend === 'throttled' && (
        <p role="status" className="auth-notice">
          You’ve requested a few links recently. Please wait a moment before trying again.
        </p>
      )}
      {resend === 'error' && (
        <p role="alert" className="error">
          Couldn’t send the link. Please try again shortly.
        </p>
      )}

      <p className="auth-aux">
        Wrong address?{' '}
        <button type="button" className="link-button" onClick={() => void logout()}>
          Log out
        </button>
      </p>
    </main>
  )
}
