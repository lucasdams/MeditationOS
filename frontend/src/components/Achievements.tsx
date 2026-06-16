import type { DashboardStats } from '../types'

// Milestone badges, derived purely from existing stats (no stored state) — the same
// "compute on read" approach as streaks/XP (ADR-0009). Earned badges show bright;
// locked ones are dimmed with the target as a tooltip.
type Badge = { emoji: string; label: string; earned: boolean; hint: string }

function badgesFor(stats: DashboardStats): Badge[] {
  const hours = stats.total_seconds / 3600
  const sessions = stats.session_count
  const streak = stats.longest_streak_days
  return [
    { emoji: '🌱', label: 'First sit', earned: sessions >= 1, hint: 'Log 1 session' },
    { emoji: '🔟', label: '10 sessions', earned: sessions >= 10, hint: 'Log 10 sessions' },
    { emoji: '🏅', label: '50 sessions', earned: sessions >= 50, hint: 'Log 50 sessions' },
    { emoji: '💯', label: '100 sessions', earned: sessions >= 100, hint: 'Log 100 sessions' },
    { emoji: '⏳', label: '1 hour', earned: hours >= 1, hint: 'Practice 1 hour total' },
    { emoji: '🕙', label: '10 hours', earned: hours >= 10, hint: 'Practice 10 hours total' },
    { emoji: '🧘', label: '50 hours', earned: hours >= 50, hint: 'Practice 50 hours total' },
    { emoji: '🔥', label: '3-day streak', earned: streak >= 3, hint: 'Reach a 3-day streak' },
    { emoji: '⚡', label: '7-day streak', earned: streak >= 7, hint: 'Reach a 7-day streak' },
    { emoji: '🌟', label: '30-day streak', earned: streak >= 30, hint: 'Reach a 30-day streak' },
  ]
}

export default function Achievements({ stats }: { stats: DashboardStats }) {
  const badges = badgesFor(stats)
  const earned = badges.filter((b) => b.earned).length
  return (
    <section className="achievements">
      <div className="achievements-head">
        <h2>Achievements</h2>
        <span className="muted">
          {earned} / {badges.length}
        </span>
      </div>
      <ul className="badge-grid">
        {badges.map((b) => (
          <li
            key={b.label}
            className={b.earned ? 'badge earned' : 'badge'}
            title={b.earned ? b.label : `Locked — ${b.hint}`}
            aria-label={b.earned ? `${b.label} (earned)` : `${b.label} — locked. ${b.hint}`}
          >
            <span className="badge-emoji" aria-hidden="true">
              {b.emoji}
            </span>
            <span className="badge-label" aria-hidden="true">{b.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
