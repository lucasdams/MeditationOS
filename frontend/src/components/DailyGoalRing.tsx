import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useT } from '../i18n'

// A calm, Duolingo-style daily-goal ring. Presentational only — the dashboard feeds it
// today's practiced minutes and the user's goal (both already on the stats payload), so it
// never fetches. Fills as the user practices; when the goal is met it shifts to a soft
// "met" state (a gentle colour change + a small check), never loud confetti — in keeping
// with the app's low-pressure gamification.
type Props = {
  todayMinutes: number
  goalMinutes: number
}

const SIZE = 72
const STROKE = 6
const R = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

export default function DailyGoalRing({ todayMinutes, goalMinutes }: Props) {
  const { t } = useT()
  // Guard against a nonsensical (0 or negative) goal so the fraction stays finite.
  const goal = Math.max(1, goalMinutes)
  const done = Math.max(0, todayMinutes)
  const fraction = Math.min(1, done / goal)
  const met = done >= goal
  const dashoffset = CIRCUMFERENCE * (1 - fraction)

  const label = met
    ? t('home.goal.aria.met', { goal })
    : t('home.goal.aria.progress', { done, goal })

  return (
    <div className={met ? 'goal-ring-card met' : 'goal-ring-card'}>
      <div className="goal-ring" role="img" aria-label={label}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            className="goal-ring-track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress arc — starts at 12 o'clock (rotated −90°). */}
          <circle
            className="goal-ring-progress"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
        <span className="goal-ring-center" aria-hidden="true">
          {met ? (
            <Check className="goal-ring-check" size={24} strokeWidth={2.25} />
          ) : (
            <>
              <b>{done}</b>
              <small>/{goal}</small>
            </>
          )}
        </span>
      </div>
      <div className="goal-ring-meta">
        <span className="goal-ring-title">{t('home.goal.label')}</span>
        <span className="goal-ring-sub">
          {met ? t('home.goal.met') : t('home.goal.progress', { done, goal })}
        </span>
        {/* A tiny, optional affordance to change the goal — lives in Settings. */}
        <Link to="/settings" className="goal-ring-adjust">
          {t('home.goal.adjust')}
        </Link>
      </div>
    </div>
  )
}
