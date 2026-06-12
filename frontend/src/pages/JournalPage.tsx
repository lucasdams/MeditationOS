import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { journalService } from '../services/journals'
import { sessionService } from '../services/sessions'
import type { Journal, MeditationType, Mood, Session } from '../types'

const MOODS: Mood[] = [
  'calm',
  'content',
  'focused',
  'energized',
  'grateful',
  'neutral',
  'restless',
  'anxious',
  'tired',
  'low',
]

const TYPE_LABELS: Record<MeditationType, string> = {
  mindfulness: 'Mindfulness',
  body_scan: 'Body scan',
  walking: 'Walking',
  loving_kindness: 'Loving-kindness',
  resonance_breathing: 'Resonance breathing',
  other: 'Other',
}

// ISO timestamp -> "2026-06-09 07:30"
const formatWhen = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function JournalPage() {
  const [entries, setEntries] = useState<Journal[] | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState<string | null>(null)

  const [body, setBody] = useState('')
  const [mood, setMood] = useState<Mood | ''>('')
  const [sessionId, setSessionId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    journalService
      .list()
      .then(setEntries)
      .catch(() => setError('Could not load your journal.'))
    // The user's sessions — used both to pick one to reflect on and to show the
    // linked session on each entry. Non-critical — fail quietly.
    sessionService
      .list()
      .then(setSessions)
      .catch(() => {})
  }, [])

  // A non-null session_id always resolves: deleting a session sets it to NULL.
  const sessionById = new Map(sessions.map((s) => [s.id, s]))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const created = await journalService.create({
        body: body.trim(),
        mood: mood || null,
        session_id: sessionId || null,
      })
      setEntries((prev) => [created, ...(prev ?? [])])
      setBody('')
      setMood('')
      setSessionId('')
    } catch {
      setError('Could not save your reflection.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await journalService.remove(id)
      setEntries((prev) => prev?.filter((j) => j.id !== id) ?? null)
    } catch {
      setError('Could not delete that reflection.')
    }
  }

  const sessionLabel = (s: Session) => `${TYPE_LABELS[s.type]} · ${formatWhen(s.occurred_at)}`

  return (
    <main className="dashboard">
      <header>
        <h1>Journal</h1>
      </header>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>

      <section className="journal-compose">
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="body">Reflection</label>
          <textarea
            id="body"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What came up in your practice today?"
          />

          <label htmlFor="mood">Mood (optional)</label>
          <select id="mood" value={mood} onChange={(e) => setMood(e.target.value as Mood | '')}>
            <option value="">No mood</option>
            {MOODS.map((m) => (
              <option key={m} value={m}>
                {cap(m)}
              </option>
            ))}
          </select>

          {sessions.length > 0 && (
            <>
              <label htmlFor="session">Reflecting on a session (optional)</label>
              <select
                id="session"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                <option value="">Not linked</option>
                {sessions.slice(0, 20).map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(s)}
                  </option>
                ))}
              </select>
            </>
          )}

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting || !body.trim()}>
            {submitting ? 'Saving…' : 'Save reflection'}
          </button>
        </form>
      </section>

      <section className="journal-list">
        {entries === null && !error && <p>Loading…</p>}
        {entries && entries.length === 0 && (
          <p className="muted">No reflections yet. Write your first one above.</p>
        )}
        {entries?.map((j) => {
          const linked = j.session_id ? sessionById.get(j.session_id) : undefined
          return (
            <article key={j.id} className="journal-entry">
              <div className="journal-entry-head">
                <span className="muted">{formatWhen(j.created_at)}</span>
                {j.mood && <span className="journal-mood">{cap(j.mood)}</span>}
                <button type="button" className="link-danger" onClick={() => handleDelete(j.id)}>
                  Delete
                </button>
              </div>
              <p className="journal-body">{j.body}</p>
              {linked && (
                <p className="journal-session">🧘 On {sessionLabel(linked)}</p>
              )}
            </article>
          )
        })}
      </section>
    </main>
  )
}
