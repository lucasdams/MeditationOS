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

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sessionService
      .list()
      .then(setSessions)
      .catch(() => setError('Could not load your sessions.'))
  }, [])

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
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{TYPE_LABELS[s.type] ?? s.type}</strong> · {formatDuration(s.duration_seconds)}
                {s.breaths_per_minute != null && <> · {s.breaths_per_minute} bpm</>}
                <div className="muted">
                  {formatWhen(s.occurred_at)}
                  {s.notes ? ` — ${s.notes}` : ''}
                </div>
              </div>
              <button type="button" className="link-danger" onClick={() => handleDelete(s.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
