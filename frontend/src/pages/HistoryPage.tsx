import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import type { MeditationType, Session } from '../types'

const TYPE_LABELS: Record<MeditationType, string> = {
  mindfulness: 'Mindfulness',
  body_scan: 'Body scan',
  walking: 'Walking',
  loving_kindness: 'Loving-kindness',
  resonance_breathing: 'Resonance breathing',
  other: 'Other',
}

const formatDuration = (seconds: number) => `${Math.round(seconds / 60)} min`

// ISO timestamp -> "2026-06-09 07:30"
const formatWhen = (iso: string) => iso.slice(0, 16).replace('T', ' ')

const PAGE = 50

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    sessionService
      .list({ limit: PAGE, offset: 0 })
      .then((rows) => {
        setSessions(rows)
        setHasMore(rows.length === PAGE)
      })
      .catch(() => setError('Could not load your sessions.'))
  }, [])

  async function loadMore() {
    if (!sessions) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await sessionService.list({ limit: PAGE, offset: sessions.length })
      setSessions((prev) => {
        const seen = new Set((prev ?? []).map((s) => s.id))
        return [...(prev ?? []), ...rows.filter((r) => !seen.has(r.id))]
      })
      setHasMore(rows.length === PAGE)
    } catch {
      setError('Could not load more sessions.')
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await sessionService.remove(id)
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null)
    } catch {
      setError('Could not delete that session.')
    }
  }

  return (
    <main className="dashboard">
      <header>
        <h1>Your sessions</h1>
        <Link to="/sessions/new">+ Log a session</Link>
      </header>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {sessions === null && !error && <p>Loading…</p>}

      {sessions !== null && sessions.length === 0 && (
        <p>
          No sessions yet. <Link to="/sessions/new">Log your first one.</Link>
        </p>
      )}

      {sessions !== null && sessions.length > 0 && (
        <ul className="session-cards">
          {sessions.map((s) => (
            <li key={s.id} className="session-card">
              <div className="session-card-main">
                <div className="session-card-title">{TYPE_LABELS[s.type] ?? s.type}</div>
                <div className="session-card-meta">
                  {formatDuration(s.duration_seconds)}
                  {s.breaths_per_minute != null && (
                    <> · {s.breaths_per_minute} breaths per minute</>
                  )}{' '}
                  · {formatWhen(s.occurred_at)}
                </div>
                {s.notes && <div className="session-card-notes">{s.notes}</div>}
              </div>
              <button
                type="button"
                className="link-danger"
                onClick={() => handleDelete(s.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  )
}
