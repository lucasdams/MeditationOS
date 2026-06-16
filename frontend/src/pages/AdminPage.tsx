import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { adminService } from '../services/admin'
import type { AdminMetrics } from '../types'

// A single labelled metric card (reuses the analytics .stat card style — dark-aware).
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

// A labelled horizontal bar (reuses the analytics .bar-row style — dark-aware tokens).
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-value">{value.toLocaleString()}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const [data, setData] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Client-side gate: only admins render this page. The backend independently enforces
  // admin access on every /admin/* endpoint, so this is convenience, not the guard.
  const isAdmin = user?.is_admin === true

  useEffect(() => {
    if (!isAdmin) return
    adminService
      .metrics()
      .then(setData)
      .catch(() => setError('Could not load admin metrics.'))
  }, [isAdmin])

  if (user && !isAdmin) return <Navigate to="/" replace />

  return (
    <main className="dashboard">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Admin</h1>
        <p className="page-subtitle">
          Aggregate business metrics across the whole user base. Counts and sums only — no
          individual user content.
        </p>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading…</p>}

      {data && (
        <>
          <section className="analytics-section">
            <h2>Users</h2>
            <div className="analytics-stats">
              <Stat value={data.users.total} label="total users" />
              <Stat value={data.users.registered} label="registered" />
              <Stat value={data.users.guests} label="guests" />
              <Stat value={data.users.email_verified} label="email verified" />
              <Stat value={data.users.email_unverified} label="unverified" />
              <Stat value={data.users.with_active_streak} label="active streak" />
            </div>
          </section>

          <section className="analytics-section">
            <h2>New signups · last 30 days</h2>
            {data.users.signups_last_30_days.every((d) => d.count === 0) ? (
              <p className="muted">No signups in the last 30 days.</p>
            ) : (
              <>
                <div className="weeks">
                  {(() => {
                    const max = Math.max(
                      1,
                      ...data.users.signups_last_30_days.map((d) => d.count),
                    )
                    return data.users.signups_last_30_days.map((d) => (
                      <div
                        key={d.day}
                        className="week-col"
                        title={`${d.day}: ${d.count} ${d.count === 1 ? 'signup' : 'signups'}`}
                      >
                        <div
                          className="week-bar"
                          style={{ height: `${Math.round((d.count / max) * 100)}%` }}
                        />
                      </div>
                    ))
                  })()}
                </div>
                <div className="muted analytics-axis">
                  <span>{data.users.signups_last_30_days[0]?.day}</span>
                  <span>today</span>
                </div>
              </>
            )}
          </section>

          <section className="analytics-section">
            <h2>Active users</h2>
            <div className="analytics-stats">
              <Stat value={data.active_users.dau} label="DAU (1d)" />
              <Stat value={data.active_users.wau} label="WAU (7d)" />
              <Stat value={data.active_users.mau} label="MAU (30d)" />
            </div>
          </section>

          <section className="analytics-section">
            <h2>Practice</h2>
            <div className="analytics-stats">
              <Stat value={data.practice.total_sessions} label="sessions" />
              <Stat
                value={Math.round(data.practice.total_minutes / 60)}
                label="hours practiced"
              />
              <Stat value={data.practice.total_minutes} label="total minutes" />
            </div>
          </section>

          <section className="analytics-section">
            <h2>Content created</h2>
            <div className="bars">
              {(() => {
                const items = [
                  { label: 'Gratitude', value: data.content.gratitude_entries },
                  { label: 'Journal', value: data.content.journal_entries },
                  { label: 'Mood logs', value: data.content.mood_logs },
                ]
                const max = Math.max(1, ...items.map((i) => i.value))
                return items.map((i) => (
                  <Bar key={i.label} label={i.label} value={i.value} max={max} />
                ))
              })()}
            </div>
          </section>

          <section className="analytics-section">
            <h2>Adoption</h2>
            <div className="bars">
              {(() => {
                const items = [
                  { label: 'Sanctuary', value: data.adoption.sanctuary_users },
                  { label: 'Goals', value: data.adoption.goal_users },
                  { label: 'Reminders', value: data.adoption.reminder_users },
                  { label: 'Push', value: data.adoption.push_users },
                ]
                const max = Math.max(1, data.users.total, ...items.map((i) => i.value))
                return items.map((i) => (
                  <Bar key={i.label} label={`${i.label} users`} value={i.value} max={max} />
                ))
              })()}
            </div>
            <p className="muted">Distinct users adopting each surface, of {data.users.total} total.</p>
          </section>
        </>
      )}
    </main>
  )
}
