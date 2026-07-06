import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { scheduledSessionService } from '../services/scheduledSessions'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { TYPE_COLORS, TYPE_LABELS } from '../lib/colors'
import { toDatetimeLocal } from '../lib/format'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { fmtDate, useT } from '../i18n'
import type { MeditationType, ScheduledSession } from '../types'

// Order shown in the picker; labels come from the shared TYPE_LABELS map.
const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as MeditationType[]

const DURATIONS = [0, 5, 10, 20, 30, 45, 60]

// A local "YYYY-MM-DDTHH:mm" value for the datetime-local input (tomorrow, 8am).
function defaultWhen(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return toDatetimeLocal(d)
}

// Locale-aware via the i18n fmtDate wrapper (never the browser locale).
function formatWhen(iso: string): string {
  return fmtDate(new Date(iso), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SchedulePage() {
  const { t } = useT()
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
  // Earliest selectable instant for the picker — keeps the native UI from offering
  // past times (the list filters those out anyway).
  const minWhen = toDatetimeLocal(new Date())

  const handleDelete = useUndoableDelete<ScheduledSession>({
    list: items,
    setList: setItems,
    getId: (s) => s.id,
    remove: (id) => scheduledSessionService.remove(id),
    messages: {
      success: t('tracking.schedule.removed'),
      error: t('tracking.schedule.removeError'),
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
      .catch((err) => setLoadError(messageForError(err, t('tracking.schedule.loadError'))))
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
      setError(t('tracking.schedule.pickDate'))
      return
    }
    // The Upcoming list only shows future sessions, so a past pick would save but
    // silently never appear — reject it with a clear message instead.
    if (new Date(when).getTime() <= Date.now()) {
      setError(t('tracking.schedule.pickFuture'))
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
      showToast(t('tracking.schedule.created'))
    } catch {
      setError(t('tracking.schedule.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('tracking.schedule.title')}</h1>
        <p className="page-subtitle">
          {t('tracking.schedule.subtitle')}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="schedule-form">
        <label htmlFor="sched-type">{t('tracking.schedule.type')}</label>
        <select id="sched-type" value={type} onChange={(e) => setType(e.target.value as MeditationType)}>
          {TYPE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABELS[value]}
            </option>
          ))}
        </select>

        <label htmlFor="sched-when">{t('tracking.schedule.when')}</label>
        <input
          id="sched-when"
          type="datetime-local"
          min={minWhen}
          value={when}
          aria-describedby="sched-when-hint"
          onChange={(e) => setWhen(e.target.value)}
        />
        <p id="sched-when-hint" className="field-time-hint muted">
          {t('tracking.schedule.yourLocalTime')}
        </p>

        <label htmlFor="sched-duration">{t('tracking.schedule.length')}</label>
        <select
          id="sched-duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? t('tracking.schedule.unspecified') : t('common.min', { count: d })}
            </option>
          ))}
        </select>

        <label htmlFor="sched-note">{t('tracking.schedule.noteLabel')}</label>
        <input
          id="sched-note"
          type="text"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('tracking.schedule.notePlaceholder')}
        />

        <ErrorBanner message={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? t('tracking.schedule.scheduling') : t('tracking.schedule.schedule')}
        </button>
      </form>

      <h2 className="schedule-upcoming-title">{t('tracking.schedule.upcoming')}</h2>
      <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
      {!items && !loadError && <Loading />}
      {items && items.length === 0 && (
        <EmptyState>{t('tracking.schedule.empty')}</EmptyState>
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
                  · {TYPE_LABELS[s.type] ?? s.type}
                  {s.duration_minutes ? ` · ${t('common.min', { count: s.duration_minutes })}` : ''}
                </span>
                {s.note && <div className="muted schedule-note">{s.note}</div>}
              </div>
              <div className="schedule-actions">
                <a className="schedule-ics" href={scheduledSessionService.icsUrl(s.id)}>
                  {t('tracking.schedule.addToCalendar')}
                </a>
                <button type="button" onClick={() => handleDelete(s.id)}>
                  {t('tracking.schedule.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
