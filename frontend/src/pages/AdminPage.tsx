import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { adminService } from '../services/admin'
import type {
  AdminMetrics,
  AdminUserDetail,
  AdminUserSummary,
  AuditEntry,
} from '../types'

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

// ── Metrics tab (aggregate business metrics — unchanged content) ────────────

function MetricsView() {
  const [data, setData] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    adminService
      .metrics()
      .then((d) => { if (!ignore) setData(d) })
      .catch(() => { if (!ignore) setError('Could not load admin metrics.') })
    return () => { ignore = true }
  }, [])

  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    )
  if (!data) return <p>Loading…</p>

  return (
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
        <p className="muted">
          Distinct users adopting each surface, of {data.users.total} total.
        </p>
      </section>
    </>
  )
}

// ── Users tab: search → list → detail with support actions ──────────────────

function UserBadges({ user }: { user: AdminUserSummary }) {
  return (
    <span className="admin-user-badges">
      {user.is_admin && <span className="chip chip-soft">admin</span>}
      {user.is_guest && <span className="chip chip-soft">guest</span>}
      {user.is_disabled && <span className="chip chip-soft admin-chip-warn">disabled</span>}
      {!user.email_verified && !user.is_guest && (
        <span className="chip chip-soft">unverified</span>
      )}
    </span>
  )
}

function UserDetailView({
  user,
  selfId,
  onChanged,
  onDeleted,
  onBack,
}: {
  user: AdminUserDetail
  selfId: string | undefined
  onChanged: (u: AdminUserDetail) => void
  onDeleted: () => void
  onBack: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isSelf = user.id === selfId

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    setError(null)
    try {
      await fn()
    } catch {
      setError('That action failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const resend = () =>
    run(async () => {
      await adminService.resendVerification(user.id)
      setMsg('Verification email re-sent.')
    })

  const toggleDisabled = () =>
    run(async () => {
      const updated = user.is_disabled
        ? await adminService.enableUser(user.id)
        : await adminService.disableUser(user.id)
      onChanged(updated)
      setMsg(updated.is_disabled ? 'Account disabled.' : 'Account re-enabled.')
    })

  const remove = () =>
    run(async () => {
      if (
        !window.confirm(
          `Permanently delete ${user.email} and all their data? This cannot be undone.`,
        )
      )
        return
      await adminService.deleteUser(user.id)
      onDeleted()
    })

  return (
    <section className="analytics-section admin-user-detail">
      <button type="button" className="link-button" onClick={onBack}>
        ← Back to results
      </button>
      <h2>{user.username || user.email}</h2>
      <p className="muted admin-user-email">{user.email}</p>
      <UserBadges user={user} />

      <div className="analytics-stats admin-user-counts">
        <Stat value={user.counts.sessions} label="sessions" />
        <Stat value={user.counts.journals} label="journals" />
        <Stat value={user.counts.gratitude} label="gratitude" />
        <Stat value={user.counts.mood_logs} label="mood logs" />
        <Stat value={user.counts.goals} label="goals" />
      </div>

      <dl className="admin-user-meta">
        <div>
          <dt>Joined</dt>
          <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>
            {user.last_active_at
              ? new Date(user.last_active_at).toLocaleDateString()
              : 'never'}
          </dd>
        </div>
        <div>
          <dt>Email verified</dt>
          <dd>{user.email_verified ? 'yes' : 'no'}</dd>
        </div>
      </dl>

      {msg && <p className="muted admin-action-msg">{msg}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="admin-actions">
        <button type="button" onClick={resend} disabled={busy || user.email_verified}>
          Resend verification
        </button>
        <button type="button" onClick={toggleDisabled} disabled={busy || isSelf}>
          {user.is_disabled ? 'Re-enable account' : 'Disable account'}
        </button>
        <button
          type="button"
          className="admin-btn-danger"
          onClick={remove}
          disabled={busy || isSelf}
        >
          Delete account
        </button>
      </div>
      {isSelf && (
        <p className="muted">
          You can't disable or delete your own account from admin tools.
        </p>
      )}
    </section>
  )
}

function UsersView({ selfId }: { selfId: string | undefined }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUserSummary[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminUserDetail | null>(null)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const data = await adminService.listUsers({ q: query.trim() || undefined, limit: 50 })
      setResults(data.users)
      setTotal(data.total)
    } catch {
      setError('Could not load users.')
    } finally {
      setLoading(false)
    }
  }

  const open = async (id: string) => {
    setError(null)
    try {
      setSelected(await adminService.getUser(id))
    } catch {
      setError('Could not load that user.')
    }
  }

  if (selected)
    return (
      <UserDetailView
        user={selected}
        selfId={selfId}
        onChanged={(u) => {
          setSelected(u)
          setResults((r) =>
            r ? r.map((x) => (x.id === u.id ? { ...x, ...u } : x)) : r,
          )
        }}
        onDeleted={() => {
          setResults((r) => (r ? r.filter((x) => x.id !== selected.id) : r))
          setTotal((t) => Math.max(0, t - 1))
          setSelected(null)
        }}
        onBack={() => setSelected(null)}
      />
    )

  return (
    <section className="analytics-section">
      <h2>Find a user</h2>
      <form className="admin-search" onSubmit={search}>
        <label className="field-label" htmlFor="admin-user-search">
          Search by email or username
        </label>
        <div className="admin-search-row">
          <input
            id="admin-user-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. jane@example.com"
          />
          <button type="submit" disabled={loading}>
            Search
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && <p>Loading…</p>}

      {results && !loading && (
        <>
          {results.length === 0 ? (
            <p className="muted">No users match that search.</p>
          ) : (
            <>
              <p className="muted">
                {total} {total === 1 ? 'match' : 'matches'}
                {total > results.length && ` (showing first ${results.length})`}
              </p>
              <ul className="admin-user-list">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="admin-user-row"
                      aria-label={`View details for ${u.username || u.email}`}
                      onClick={() => open(u.id)}
                    >
                      <span className="admin-user-row-main">
                        <span className="admin-user-row-name">
                          {u.username || u.email}
                        </span>
                        <span className="muted admin-user-row-sub">{u.email}</span>
                      </span>
                      <UserBadges user={u} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

// ── Audit tab: recent privileged actions (who did what to whom, when) ───────

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'user.resend_verification': 'resent verification',
    'user.disable': 'disabled account',
    'user.enable': 're-enabled account',
    'user.delete': 'deleted account',
  }
  return map[action] ?? action
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '—'
}

function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    adminService
      .audit({ limit: 100 })
      .then((d) => { if (!ignore) setEntries(d.entries) })
      .catch(() => { if (!ignore) setError('Could not load the audit log.') })
    return () => { ignore = true }
  }, [])

  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    )
  if (!entries) return <p>Loading…</p>

  return (
    <section className="analytics-section">
      <h2>Audit log</h2>
      <p className="muted">Recent privileged admin actions, newest first.</p>
      {entries.length === 0 ? (
        <p className="muted">No admin actions recorded yet.</p>
      ) : (
        <ul className="admin-audit-list">
          {entries.map((e) => {
            const deletedId =
              e.action === 'user.delete' && e.detail
                ? (e.detail.deleted_user_id as string | undefined)
                : undefined
            const targetLabel = shortId(e.target_user_id ?? deletedId ?? null)
            return (
              <li key={e.id} className="admin-audit-row">
                <span className="admin-audit-when muted">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <span className="admin-audit-what">
                  <code>{shortId(e.actor_user_id)}</code> {actionLabel(e.action)}{' '}
                  {e.target_user_id || deletedId ? (
                    <>
                      → <code>{targetLabel}</code>
                    </>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Page shell with tabs ────────────────────────────────────────────────────

type Tab = 'metrics' | 'users' | 'audit'

export default function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('metrics')

  // Client-side gate: only admins render this page. The backend independently enforces
  // admin access on every /admin/* endpoint, so this is convenience, not the guard.
  const isAdmin = user?.is_admin === true

  if (user && !isAdmin) return <Navigate to="/" replace />

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Admin</h1>
        <p className="page-subtitle">
          Business metrics, user support, and the audit trail. Account metadata only — no
          individual user content.
        </p>
      </header>

      <div role="tablist" className="admin-tabs" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'metrics'}
          aria-controls="admin-panel-metrics"
          id="admin-tab-metrics"
          className={tab === 'metrics' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setTab('metrics')}
        >
          Metrics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'users'}
          aria-controls="admin-panel-users"
          id="admin-tab-users"
          className={tab === 'users' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audit'}
          aria-controls="admin-panel-audit"
          id="admin-tab-audit"
          className={tab === 'audit' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setTab('audit')}
        >
          Audit log
        </button>
      </div>

      {tab === 'metrics' && (
        <div role="tabpanel" id="admin-panel-metrics" aria-labelledby="admin-tab-metrics">
          <MetricsView />
        </div>
      )}
      {tab === 'users' && (
        <div role="tabpanel" id="admin-panel-users" aria-labelledby="admin-tab-users">
          <UsersView selfId={user?.id} />
        </div>
      )}
      {tab === 'audit' && (
        <div role="tabpanel" id="admin-panel-audit" aria-labelledby="admin-tab-audit">
          <AuditView />
        </div>
      )}
    </main>
  )
}
