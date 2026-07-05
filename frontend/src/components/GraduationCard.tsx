import { Link } from 'react-router-dom'
import { useT } from '../i18n'

// Phase 4 (beginner-first revision §11 — "graduation depth"). The app deliberately tucks the
// advanced surfaces away for beginners (HRV measurement, full analytics, the full cosmetic tree).
// Once someone has genuinely stuck around, this calm "you've grown" card resurfaces that depth —
// a reward for retention, never shown to a newcomer. Dismissible; never nags.

const DISMISS_KEY = 'dashboard.graduationDismissed'

// "Stuck around" threshold: ~3 weeks of near-daily practice. Below this the depth stays hidden so
// a beginner isn't overwhelmed; at/above it the card invites them deeper. Tunable in-code.
const GRADUATE_AT = 21

/** Has the user dismissed the graduation card? Storage may be unavailable (private mode). */
export function isGraduationDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
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
 * Whether to show the graduation card for a user with `sessionCount` logged sessions. Shows only
 * once they've practised enough to have "graduated" past the beginner front door, and haven't
 * dismissed it. (Mutually exclusive in practice with the first-run card, which hides after 3 sits.)
 */
export function shouldShowGraduation(sessionCount: number): boolean {
  return sessionCount >= GRADUATE_AT && !isGraduationDismissed()
}

type Props = {
  /** Called after the user dismisses, so the parent can re-hide without a reload. */
  onDismiss: () => void
}

export default function GraduationCard({ onDismiss }: Props) {
  const { t } = useT()

  function dismiss() {
    persistDismissed()
    onDismiss()
  }

  // Reuses the first-run-card layout classes (consistent look) + a `graduation-card` modifier for a
  // distinct, growth-tinted accent.
  return (
    <section className="first-run-card graduation-card" aria-label={t('home.graduation.aria')}>
      <button
        type="button"
        className="first-run-dismiss"
        onClick={dismiss}
        aria-label={t('home.graduation.dismiss')}
      >
        ✕
      </button>
      <h2 className="first-run-title">{t('home.graduation.title')}</h2>
      <p className="first-run-body muted">
        {t('home.graduation.body')}
      </p>
      <div className="first-run-actions">
        <Link to="/biometrics/new" className="first-run-action">
          {t('home.graduation.hrv')}
        </Link>
        <Link to="/analytics" className="first-run-action first-run-action-secondary">
          {t('home.graduation.analytics')}
        </Link>
        <Link to="/spirit" className="first-run-action first-run-action-secondary">
          {t('home.graduation.customize')}
        </Link>
        <button type="button" className="first-run-gotit" onClick={dismiss}>
          {t('home.graduation.gotIt')}
        </button>
      </div>
    </section>
  )
}
