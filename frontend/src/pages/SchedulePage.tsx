import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { scheduledSessionService } from '../services/scheduledSessions'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { TYPE_COLORS } from '../lib/colors'
import { localYMD } from '../lib/format'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { MeditationType, ScheduledSession } from '../types'

const TYPES: { value: MeditationType; label: string }[] = [
  { value: 'mindfulness', label: 'Mindfulness' },
  { value: 'body_scan', label: 'Body scan' },
  { value: 'walking', label: 'Walking' },
  { value: 'loving_kindness', label: 'Loving-kindness' },
  { value: 'resonance_breathing', label: 'Resonance breathing' },
  { value: 'other', label: 'Other' },
]
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))

const DURATIONS = [0, 5, 10, 20, 30, 45, 60]

// A local "YYYY-MM-DDTHH:mm" value for the datetime-local input (tomorrow, 8am).
function defaultWhen(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${localYMD(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SchedulePage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<ScheduledSession[] | null>(null)
  const [error, setError] = useState<string | null>(null) // create/remove action errors
  const [loadError, setLoadError] = useState<string | null>(null) // the schedule list failing
  const [retrying, setRetrying] = useState(false)
  const [type, setType] = useState<MeditationType>('mindfulness')
  const [when, setWhen] = useState(defaultWhen)
  const [duration, setDuration] = useState(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = useUndoableDelete<ScheduledSession>({
    list: items,
    setList: setItems,
    getId: (s) => s.id,
    remove: (id) => scheduledSessionService.remove(id),
    messages: {
      success: 'Removed from your schedule.',
      error: 'Could not remove that session.',
    },
    onStart: () => setError(null),
  })

  function load() {
    scheduledSessionService
      .list()
      .then((rows) => {
        setItems(rows)
        setLoadError(null)
      })
      .catch((err) => setLoadError(messageForError(err, 'Could not load your schedule.')))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retryLoad() {
    setRetrying(true)
    load()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!when) {
      setError('Pick a date and time.')
      return
    }
    setSubmitting(true)
    try {
      await scheduledSessionService.create({
        type,
        scheduled_at: new Date(when).toISOString(), // local pick → UTC instant
        duration_minutes: duration > 0 ? duration : null,
        note: note.trim() || null,
      })
      const rows = await scheduledSessionService.list()
      setItems(rows)
      setNote('')
      showToast('Session scheduled.')
    } catch {
      setError('Could not schedule that session.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Plan your practice</h1>
        <p className="page-subtitle">
          Schedule a sit ahead of time, and add it to your own calendar.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="schedule-form">
        <label htmlFor="sched-type">Type</label>
        <select id="sched-type" value={type} onChange={(e) => setType(e.target.value as MeditationType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="sched-when">When</label>
        <input
          id="sched-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />

        <label htmlFor="sched-duration">Length</label>
        <select
          id="sched-duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? 'Unspecified' : `${d} min`}
            </option>
          ))}
        </select>

        <label htmlFor="sched-note">Note (optional)</label>
        <input
          id="sched-note"
          type="text"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. morning sit before work"
        />

        <ErrorBanner message={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Scheduling…' : 'Schedule it'}
        </button>
      </form>

      <h2 className="schedule-upcoming-title">Upcoming</h2>
      <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
      {!items && !loadError && <Loading />}
      {items && items.length === 0 && (
        <EmptyState>Nothing planned yet — schedule your first session above. 🗓️</EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="schedule-list">
          {items.map((s) => (
            <li
              key={s.id}
              className="schedule-item"
              style={{ borderLeftColor: TYPE_COLORS[s.type] ?? '#9ca3af' }}
            >
              <div>
                <strong>{formatWhen(s.scheduled_at)}</strong>
                <span className="muted">
                  {' '}
                  · {TYPE_LABEL[s.type] ?? s.type}
                  {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                </span>
                {s.note && <div className="muted schedule-note">{s.note}</div>}
              </div>
              <div className="schedule-actions">
                <a className="schedule-ics" href={scheduledSessionService.icsUrl(s.id)}>
                  Add to calendar
                </a>
                <button type="button" onClick={() => handleDelete(s.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
