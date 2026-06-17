import { Link } from 'react-router-dom'

// A new account lands on a mostly-empty dashboard (quests, sanctuary, weekly review
// all bare on day one). This calm "start here" card points to a first action until
// the user has a few sessions logged, then retires itself naturally.

const DISMISS_KEY = 'dashboard.firstRunDismissed'

// Outgrow threshold: once someone has logged this many sessions, the dashboard is no
// longer empty enough to need orientation, so the card hides on its own.
const OUTGROW_AT = 3

/** Has the user manually dismissed the first-run card? Storage may be unavailable. */
export function isFirstRunDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // localStorage unavailable (private mode, etc.) — treat as not dismissed.
    return false
  }
}

function persistDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // localStorage unavailable — the card simply reappears next visit. Acceptable.
  }
}

/**
 * Whether to show the first-run card for a user with `sessionCount` logged sessions.
 * Shows only for genuinely new users (few sessions) who haven't dismissed it.
 */
export function shouldShowFirstRun(sessionCount: number): boolean {
  return sessionCount < OUTGROW_AT && !isFirstRunDismissed()
}

type Props = {
  /** Called after the user dismisses, so the parent can re-hide without a reload. */
  onDismiss: () => void
}

export default function FirstRunCard({ onDismiss }: Props) {
  function dismiss() {
    persistDismissed()
    onDismiss()
  }

  return (
    <section className="first-run-card" aria-label="Getting started">
      <button
        type="button"
        className="first-run-dismiss"
        onClick={dismiss}
        aria-label="Dismiss getting started"
      >
        ✕
      </button>
      <h2 className="first-run-title">New here? Start with one small step.</h2>
      <p className="first-run-body muted">
        Begin with a short breathing session, or log a sit you&rsquo;ve already done.
        Your dashboard fills in as you practice.
      </p>
      <div className="first-run-actions">
        <Link to="/breathe" className="first-run-action">
          Breathe
        </Link>
        <Link to="/sessions/new" className="first-run-action first-run-action-secondary">
          Log a session
        </Link>
        <button type="button" className="first-run-gotit" onClick={dismiss}>
          Got it
        </button>
      </div>
    </section>
  )
}
