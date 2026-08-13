import { useState } from 'react'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const { t } = useT()
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
        {t('auth.verifyBanner.please', { email: user.email })}
      </span>
      {state === 'sent' ? (
        <span className="verify-banner-note">{t('auth.verify.resent')}</span>
      ) : (
        <button type="button" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? t('auth.verify.resending') : t('auth.verifyBanner.resend')}
        </button>
      )}
      {state === 'error' && (
        <span className="verify-banner-note">{t('auth.verifyBanner.error')}</span>
      )}
    </div>
  )
}
