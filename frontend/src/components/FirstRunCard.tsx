import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// A new account lands on a mostly-empty dashboard (quests, sanctuary, weekly review
// all bare on day one). This calm "start here" card points to a first action until
// the user has a few sessions logged, then retires itself naturally.
//
// The unmissable first step: a single hero CTA to a fixed, zero-config 2-minute
// guided breathing sit (`/breathe?guided=1&duration=120` — the same guided-first-sit
// flow onboarding uses). It leads above the home's gentle time-of-day recommendation
// (DashboardPage), which stays a quiet, ignorable suggestion — so a brand-new user
// has ONE clear path to their first completed session, not two competing CTAs.
const FIRST_SIT_TO = '/breathe?guided=1&duration=120'

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
        The clearest way in is a short, guided breathing sit — no setup, just follow
        along. Your dashboard fills in as you practice, and a few minutes a day is how
        the habit forms.
      </p>
      <div className="first-run-actions">
        <Link to={FIRST_SIT_TO} className="first-run-action first-run-action-hero">
          Start here · your first 2-minute sit
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
      <p className="first-run-alt muted">
        Rather log a sit you&rsquo;ve already done?{' '}
        <Link to="/sessions/new">Log a session</Link>.
      </p>
    </section>
  )
}
