import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'

const DISMISS_KEY = 'cookieNoticeDismissed'

// A lightweight, dismissible cookie notice. The app only sets one strictly-necessary
// cookie (the httpOnly auth session) and runs no third-party tracking, so this is
// informational rather than a consent gate — but a public site should still say so.
export default function CookieNotice() {
  const { t } = useT()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore — the notice just reappears next visit
    }
    setDismissed(true)
  }

  return (
    <div className="cookie-notice" role="region" aria-label={t('auth.cookieNotice.aria')}>
      <p className="cookie-notice-text">
        {t('auth.cookieNotice.text.pre')}
        <Link to="/privacy">{t('auth.cookieNotice.text.privacy')}</Link>
        {t('auth.cookieNotice.text.post')}
      </p>
      <button type="button" onClick={dismiss}>
        {t('auth.cookieNotice.cta')}
      </button>
    </div>
  )
}
