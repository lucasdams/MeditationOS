import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardService } from '../services/dashboard'
import LevelCard from '../components/LevelCard'
import MoodCheckin from '../components/MoodCheckin'
import WeeklyReview from '../components/WeeklyReview'
import SanctuaryScene from '../components/SanctuaryScene'
import ActivityHeatmap from '../components/ActivityHeatmap'
import Achievements from '../components/Achievements'
import { ACTIVITY_COLORS, type Activity } from '../lib/colors'
import { GREETINGS, LOADING, dailyOf, randomOf } from '../lib/zen'
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
  // Retrospective stats (totals, heatmap, achievements) start collapsed so the
  // landing view stays calm — the day's practice first, history on request.
  const [showMore, setShowMore] = useState(false)
  // A gentle daily greeting (stable through the day) and a mindful loading line.
  const [greeting] = useState(() => dailyOf(GREETINGS, new Date()))
  const [loadingLine] = useState(() => randomOf(LOADING))

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

  return (
    <main className="dashboard">
      <h1>Your practice</h1>
      <p className="zen-greeting muted">{greeting}</p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!stats && !error && <p>{loadingLine}</p>}

      {stats && <LevelCard stats={stats} />}

      <WeeklyReview />

      <MoodCheckin />

      <SanctuaryScene />

      {stats && (
        <section className="quests">
          <div className="quests-head">
            <h2>Today you could…</h2>
            <span className="quest-reset muted">new ideas in {formatReset(resetIn)}</span>
          </div>
          <ul className="quest-list">
            {stats.daily_quests.map((q) => {
              const to = QUEST_LINKS[q.key] ?? '/sessions/new'
              const accent = ACTIVITY_COLORS[q.key as Activity]
              return (
                <li
                  key={q.key}
                  className={q.done ? 'quest done' : 'quest'}
                  style={accent ? { ['--activity-accent' as string]: accent } : undefined}
                >
                  <span className="quest-check" aria-hidden="true">
                    {q.done ? '✓' : '○'}
                  </span>
                  <Link to={to} className="quest-label">
                    {q.label}
                  </Link>
                  {q.target > 1 && !q.done && (
                    <span className="quest-progress">
                      {q.progress}/{q.target}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {stats.current_streak_days > 0 && (
            <p className="quest-streak muted">
              🌱 {stats.current_streak_days}-day practice streak
              {stats.rest_day_used
                ? ' · 🛡️ a rest day is holding it — skipping one is fine'
                : ''}
            </p>
          )}
        </section>
      )}

      {stats && stats.session_count === 0 && (
        <p className="muted">
          Your tree is just a seedling. <Link to="/sessions/new">Log a session</Link> or{' '}
          <Link to="/breathe">breathe</Link> to help it grow.
        </p>
      )}

      {stats && stats.session_count > 0 && (
        <section className="dashboard-more">
          <button
            type="button"
            className="show-more-toggle"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
          >
            {showMore ? 'Hide progress' : 'Show progress'}
          </button>

          {showMore && (
            <>
              <section className="stat-cards">
                <div className="stat-card">
                  <div className="stat-value">{formatTotal(stats.total_seconds)}</div>
                  <div className="stat-label">Total practice</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.current_streak_days} 🌱</div>
                  <div className="stat-label">
                    Current streak (days)
                    {stats.rest_day_used && (
                      <span className="rest-day-badge" title="A rest day is protecting your streak — one skipped day is OK.">
                        {' '}🛡️ rest day
                      </span>
                    )}
                  </div>
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

              <ActivityHeatmap />

              <Achievements stats={stats} />
            </>
          )}
        </section>
      )}
    </main>
  )
}
