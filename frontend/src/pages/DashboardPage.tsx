import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'
import type { DashboardStats } from '../types'

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

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dashboardService
      .getStats()
      .then(setStats)
      .catch(() => setError('Could not load your stats.'))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const maxSeconds = stats ? Math.max(1, ...stats.this_week.map((d) => d.seconds)) : 1

  return (
    <main className="dashboard">
      <header>
        <h1>MeditationOS</h1>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <nav className="dash-nav">
        <Link to="/sessions/new">+ Log a session</Link>
        <Link to="/sessions">View your sessions</Link>
      </nav>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!stats && !error && <p>Loading…</p>}

      {stats && stats.session_count === 0 && (
        <p className="muted">
          No practice yet. <Link to="/sessions/new">Log your first session</Link> to start your
          streak.
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
        </>
      )}
    </main>
  )
}
