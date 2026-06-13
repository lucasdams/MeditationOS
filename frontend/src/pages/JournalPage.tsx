import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { journalService } from '../services/journals'
import { sessionService } from '../services/sessions'
import { MOOD_COLORS, tint } from '../lib/colors'
import { useToast } from '../context/ToastContext'
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

const PAGE = 50

export default function JournalPage() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState<Journal[] | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [body, setBody] = useState('')
  const [mood, setMood] = useState<Mood | ''>('')
  const [sessionId, setSessionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [query, setQuery] = useState('') // text search over reflections

  // Inline editing of an existing entry (body + mood).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editMood, setEditMood] = useState<Mood | ''>('')
  const [savingEdit, setSavingEdit] = useState(false)

  // The user's sessions — used both to pick one to reflect on and to show the
  // linked session on each entry. Fetch a generous page so older links resolve.
  // Non-critical — fail quietly.
  useEffect(() => {
    sessionService
      .list({ limit: 200 })
      .then(setSessions)
      .catch(() => {})
  }, [])

  // Entries — refetched (debounced) whenever the text search changes. Drop any
  // in-progress edit, since the edited entry may fall out of the new results.
  useEffect(() => {
    setEditingId(null)
    const t = setTimeout(
      () => {
        journalService
          .list({ q: query || undefined, limit: PAGE, offset: 0 })
          .then((rows) => {
            setEntries(rows)
            setHasMore(rows.length === PAGE)
          })
          .catch(() => setError('Could not load your journal.'))
      },
      query ? 300 : 0, // debounce typing; load immediately on mount/clear
    )
    return () => clearTimeout(t)
  }, [query])

  async function loadMore() {
    if (!entries) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await journalService.list({
        q: query || undefined,
        limit: PAGE,
        offset: entries.length,
      })
      setEntries((prev) => {
        const seen = new Set((prev ?? []).map((j) => j.id))
        return [...(prev ?? []), ...rows.filter((r) => !seen.has(r.id))]
      })
      setHasMore(rows.length === PAGE)
    } catch {
      setError('Could not load more reflections.')
    } finally {
      setLoadingMore(false)
    }
  }

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
      showToast('Reflection saved.')
    } catch {
      setError('Could not save your reflection.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(j: Journal) {
    setEditingId(j.id)
    setEditBody(j.body)
    setEditMood((j.mood as Mood | null) ?? '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody('')
    setEditMood('')
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return
    setSavingEdit(true)
    setError(null)
    try {
      const updated = await journalService.update(id, {
        body: editBody.trim(),
        mood: editMood || null,
      })
      setEntries((prev) => prev?.map((j) => (j.id === id ? updated : j)) ?? null)
      cancelEdit()
      showToast('Reflection updated.')
    } catch {
      setError('Could not update that reflection.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await journalService.remove(id)
      setEntries((prev) => prev?.filter((j) => j.id !== id) ?? null)
      showToast('Reflection deleted.')
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
        <input
          type="search"
          className="journal-search"
          value={query}
          placeholder="Search your reflections…"
          aria-label="Search reflections"
          onChange={(e) => setQuery(e.target.value)}
        />
        {entries === null && !error && <p>Loading…</p>}
        {entries && entries.length === 0 && (
          <p className="muted">
            {query ? `No reflections match “${query}”.` : 'No reflections yet. Write your first one above.'}
          </p>
        )}
        {entries?.map((j) => {
          const linked = j.session_id ? sessionById.get(j.session_id) : undefined
          const editing = editingId === j.id
          return (
            <article key={j.id} className="journal-entry">
              <div className="journal-entry-head">
                <span className="muted">{formatWhen(j.created_at)}</span>
                {!editing && j.mood && (
                  <span
                    className="journal-mood"
                    style={{ background: tint(MOOD_COLORS[j.mood]), color: MOOD_COLORS[j.mood] }}
                  >
                    {cap(j.mood)}
                  </span>
                )}
                {!editing && (
                  <span className="journal-entry-actions">
                    <button type="button" className="link-neutral" onClick={() => startEdit(j)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => handleDelete(j.id)}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
              {editing ? (
                <div className="journal-edit">
                  <textarea
                    rows={4}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    aria-label="Edit reflection"
                  />
                  <select
                    value={editMood}
                    onChange={(e) => setEditMood(e.target.value as Mood | '')}
                    aria-label="Edit mood"
                  >
                    <option value="">No mood</option>
                    {MOODS.map((m) => (
                      <option key={m} value={m}>
                        {cap(m)}
                      </option>
                    ))}
                  </select>
                  <div className="journal-edit-actions">
                    <button
                      type="button"
                      onClick={() => saveEdit(j.id)}
                      disabled={savingEdit || !editBody.trim()}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="link-neutral" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="journal-body">{j.body}</p>
              )}
              {linked && !editing && (
                <p className="journal-session">🧘 On {sessionLabel(linked)}</p>
              )}
            </article>
          )
        })}
        {hasMore && (
          <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </main>
  )
}
