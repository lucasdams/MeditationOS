import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardService } from '../services/dashboard'
import LevelCard from '../components/LevelCard'
import SanctuaryScene from '../components/SanctuaryScene'
import ActivityHeatmap from '../components/ActivityHeatmap'
import type { DashboardStats } from '../types'

// Where each daily-quest card deep-links — keyed by the backend quest key.
const QUEST_LINKS: Record<string, string> = {
  meditate: '/meditate',
  breathe: '/breathe',
  gratitude: '/gratitude',
  journal: '/journal',
}

const formatTotal = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

// Parse "YYYY-MM-DD" as a local date (avoids a UTC off-by-one) → weekday label.
const dayLabel = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, { weekday: 'short' })
}

// Quests reset at the user's local midnight (the backend keys them on the user's
// timezone, which we sync to the browser's).
const msUntilLocalMidnight = () => {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}
const formatReset = (ms: number) => {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetIn, setResetIn] = useState(msUntilLocalMidnight())

  useEffect(() => {
    dashboardService
      .getStats()
      .then(setStats)
      .catch(() => setError('Could not load your stats.'))
  }, [])

  // Live countdown to the daily quest reset.
  useEffect(() => {
    const id = setInterval(() => setResetIn(msUntilLocalMidnight()), 30_000)
    return () => clearInterval(id)
  }, [])

  const maxSeconds = stats ? Math.max(1, ...stats.this_week.map((d) => d.seconds)) : 1

  return (
    <main className="dashboard">
      <h1>Your practice</h1>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!stats && !error && <p>Loading…</p>}

      {stats && <LevelCard stats={stats} />}

      <SanctuaryScene />

      {stats && (
        <section className="quests">
          <div className="quests-head">
            <h2>Today's quests</h2>
            <span className="quest-reset muted">resets in {formatReset(resetIn)}</span>
          </div>
          <ul className="quest-list">
            {stats.daily_quests.map((q) => {
              const to = QUEST_LINKS[q.key] ?? '/sessions/new'
              return (
                <li key={q.key} className={q.done ? 'quest done' : 'quest'}>
                  <span className="quest-check" aria-hidden="true">
                    {q.done ? '✓' : '○'}
                  </span>
                  <Link to={to} className="quest-label">
                    {q.label}
                  </Link>
                  <span className="quest-xp">+{q.xp} XP</span>
                </li>
              )
            })}
          </ul>
          {stats.streak_bonus_xp > 0 && (
            <p className="quest-streak muted">
              🔥 Streak bonus: +{stats.streak_bonus_xp} XP from your{' '}
              {stats.current_streak_days}-day streak
            </p>
          )}
        </section>
      )}

      {stats && stats.session_count === 0 && (
        <p className="muted">
          Your tree is just a seedling. <Link to="/sessions/new">Log a session</Link> or{' '}
          <Link to="/breathe">breathe</Link> to earn XP and help it grow.
        </p>
      )}

      {stats && stats.session_count > 0 && (
        <>
          <section className="stat-cards">
            <div className="stat-card">
              <div className="stat-value">{formatTotal(stats.total_seconds)}</div>
              <div className="stat-label">Total practice</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.current_streak_days} 🔥</div>
              <div className="stat-label">Current streak (days)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.longest_streak_days}</div>
              <div className="stat-label">Longest streak (days)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.session_count}</div>
              <div className="stat-label">Sessions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.gratitude_count} 🙏</div>
              <div className="stat-label">Gratitude moments</div>
            </div>
          </section>

          <section className="week">
            <h2>This week</h2>
            <div className="week-bars">
              {stats.this_week.map((d) => (
                <div key={d.date} className="week-day">
                  <div className="week-track">
                    <div
                      className="week-bar"
                      style={{ height: `${Math.round((d.seconds / maxSeconds) * 100)}%` }}
                    />
                  </div>
                  <div className="week-label">{dayLabel(d.date)}</div>
                </div>
              ))}
            </div>
          </section>

          <ActivityHeatmap />
        </>
      )}
    </main>
  )
}
