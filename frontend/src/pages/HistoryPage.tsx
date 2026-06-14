import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { useToast } from '../context/ToastContext'
import { usePendingDelete } from '../hooks/usePendingDelete'
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

// Quote a CSV field if it contains a comma, quote, or newline (RFC 4180).
const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function toCsv(rows: Session[]): string {
  const header = [
    'type',
    'duration_minutes',
    'occurred_at',
    'focus',
    'calm',
    'breaths_per_minute',
    'notes',
  ]
  const lines = rows.map((s) =>
    [
      s.type,
      String(Math.round(s.duration_seconds / 60)),
      s.occurred_at,
      s.focus != null ? String(s.focus) : '',
      s.calm != null ? String(s.calm) : '',
      s.breaths_per_minute != null ? String(s.breaths_per_minute) : '',
      s.notes ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

// ISO timestamp -> "2026-06-09" (compact, for the collapsed summary)
const formatDate = (iso: string) => iso.slice(0, 10)

// ISO timestamp -> "2026-06-09 07:30" (full, for the expanded view)
const formatWhen = (iso: string) => iso.slice(0, 16).replace('T', ' ')

const PAGE = 50

export default function HistoryPage() {
  const { showToast } = useToast()
  const { schedule, cancel } = usePendingDelete()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Inline editing of a session (type, duration, when, notes).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState<MeditationType>('mindfulness')
  const [editMin, setEditMin] = useState(10)
  const [editWhen, setEditWhen] = useState('') // datetime-local value
  const [editNotes, setEditNotes] = useState('')
  const [editFocus, setEditFocus] = useState('') // '' = not rated
  const [editCalm, setEditCalm] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setError(null)
    setExporting(true)
    try {
      // Pull every session (not just the loaded pages) so the export is complete.
      const all: Session[] = []
      for (let offset = 0; ; offset += 200) {
        const rows = await sessionService.list({ limit: 200, offset })
        all.push(...rows)
        if (rows.length < 200) break
      }
      const blob = new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'meditation-sessions.csv'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Sessions exported.')
    } catch {
      setError('Could not export your sessions.')
    } finally {
      setExporting(false)
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEdit(s: Session) {
    setEditingId(s.id)
    setEditType(s.type)
    setEditMin(Math.max(1, Math.round(s.duration_seconds / 60)))
    setEditWhen(s.occurred_at.slice(0, 16)) // "YYYY-MM-DDTHH:mm" for datetime-local
    setEditNotes(s.notes ?? '')
    setEditFocus(s.focus != null ? String(s.focus) : '')
    setEditCalm(s.calm != null ? String(s.calm) : '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    setError(null)
    try {
      const updated = await sessionService.update(id, {
        type: editType,
        duration_seconds: editMin * 60,
        occurred_at: editWhen,
        notes: editNotes.trim() || null,
        focus: editFocus ? Number(editFocus) : null,
        calm: editCalm ? Number(editCalm) : null,
      })
      setSessions((prev) => prev?.map((s) => (s.id === id ? updated : s)) ?? null)
      setEditingId(null)
      showToast('Session updated.')
    } catch {
      setError('Could not update that session.')
    } finally {
      setSavingEdit(false)
    }
  }

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

  function handleDelete(id: string) {
    if (!sessions) return
    const index = sessions.findIndex((s) => s.id === id)
    if (index === -1) return
    const item = sessions[index]
    setError(null)
    // Optimistically remove now; the real delete fires only after the undo window.
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null)

    const restore = () =>
      setSessions((cur) => {
        if (!cur || cur.some((s) => s.id === id)) return cur
        const next = [...cur]
        next.splice(Math.min(index, next.length), 0, item)
        return next
      })

    schedule(id, () => {
      sessionService.remove(id).catch(() => {
        restore()
        showToast('Could not delete that session.', 'error')
      })
    })
    showToast('Session deleted.', 'success', {
      label: 'Undo',
      onClick: () => {
        if (cancel(id)) restore()
      },
    })
  }

  return (
    <main className="dashboard">
      <header>
        <h1>Your sessions</h1>
        <Link to="/sessions/new">+ Log a session</Link>
      </header>
      {sessions !== null && sessions.length > 0 && (
        <p>
          <button type="button" className="link-neutral" onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting…' : '⤓ Export CSV'}
          </button>
        </p>
      )}
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
          {sessions.map((s) => {
            const isOpen = expanded.has(s.id)
            return (
              <li key={s.id} className={`session-card session-card--${s.type}`}>
                <button
                  type="button"
                  className="session-card-header"
                  aria-expanded={isOpen}
                  onClick={() => toggleExpanded(s.id)}
                >
                  <span className="session-card-title">
                    <span className="session-card-dot" aria-hidden="true" />
                    {TYPE_LABELS[s.type] ?? s.type}
                  </span>
                  <span className="session-card-summary">
                    {formatDuration(s.duration_seconds)} · {formatDate(s.occurred_at)}
                  </span>
                  <span className="session-card-chevron" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                </button>
                {isOpen && editingId === s.id && (
                  <div className="session-card-details session-edit">
                    <label>
                      Type
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as MeditationType)}
                      >
                        {Object.entries(TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Duration (min)
                      <input
                        type="number"
                        min="1"
                        value={editMin}
                        onChange={(e) => setEditMin(Math.max(1, Number(e.target.value)))}
                      />
                    </label>
                    <label>
                      When
                      <input
                        type="datetime-local"
                        value={editWhen}
                        onChange={(e) => setEditWhen(e.target.value)}
                      />
                    </label>
                    <label>
                      Focus
                      <select value={editFocus} onChange={(e) => setEditFocus(e.target.value)}>
                        <option value="">Not rated</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} / 5
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Calm
                      <select value={editCalm} onChange={(e) => setEditCalm(e.target.value)}>
                        <option value="">Not rated</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} / 5
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                    </label>
                    <div className="session-edit-actions">
                      <button type="button" onClick={() => saveEdit(s.id)} disabled={savingEdit}>
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="link-neutral" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {isOpen && editingId !== s.id && (
                  <div className="session-card-details">
                    <div className="session-card-meta">
                      {formatWhen(s.occurred_at)}
                      {s.breaths_per_minute != null && (
                        <> · {s.breaths_per_minute} breaths per minute</>
                      )}
                      {s.focus != null && <> · focus {s.focus}/5</>}
                      {s.calm != null && <> · calm {s.calm}/5</>}
                    </div>
                    {s.notes && <div className="session-card-notes">{s.notes}</div>}
                    <div className="session-card-actions">
                      <button type="button" className="link-neutral" onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-danger"
                        onClick={() => handleDelete(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
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
