import { useState } from 'react'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Nothing to show once the email is confirmed (or before we know the user).
  if (!user || user.email_verified) return null

  async function resend() {
    setState('sending')
    try {
      await authService.resendVerification()
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="verify-banner" role="status">
      <span>
        Please verify your email ({user.email}) to secure your account.
      </span>
      {state === 'sent' ? (
        <span className="verify-banner-note">Sent — check your inbox.</span>
      ) : (
        <button type="button" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Resend link'}
        </button>
      )}
      {state === 'error' && (
        <span className="verify-banner-note">Couldn’t send — try again shortly.</span>
      )}
    </div>
  )
}
