import { useState } from 'react'
import { Link } from 'react-router-dom'

const DISMISS_KEY = 'cookieNoticeDismissed'

// A lightweight, dismissible cookie notice. The app only sets one strictly-necessary
// cookie (the httpOnly auth session) and runs no third-party tracking, so this is
// informational rather than a consent gate — but a public site should still say so.
export default function CookieNotice() {
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
    <div className="cookie-notice" role="region" aria-label="Cookie notice">
      <p className="cookie-notice-text">
        We use one essential cookie to keep you signed in — no third-party tracking. See
        our <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <button type="button" onClick={dismiss}>
        Got it
      </button>
    </div>
  )
}
