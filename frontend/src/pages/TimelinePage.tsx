import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { journalService } from '../services/journals'
import { gratitudeService } from '../services/gratitude'
import { sessionService } from '../services/sessions'
import { moodLogService } from '../services/moodLogs'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { ACTIVITY_META, MOOD_COLORS, MOOD_META, TYPE_LABELS, gratitudeColor } from '../lib/colors'
import { csvEscape } from '../lib/csvEscape'
import { toDatetimeLocal } from '../lib/format'
import RatingChips from '../components/RatingChips'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { t as translate, useT } from '../i18n'
import type { MeditationType, Mood, Session } from '../types'

// One unified, chronological feed of everything you log — reflections (journal),
// gratitude, and practice (meditation / breathing). Sessions are editable inline here
// (this replaced the separate History page); journal/gratitude rows are read-only and
// managed on their own pages. We merge the most recent slice of each source.
const PER_SOURCE = 50

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// The API serializes timestamps as UTC ISO (with `Z`); render them in the user's
// local time, matching SchedulePage.
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
const minutes = (seconds: number) => translate('common.min', { count: Math.round(seconds / 60) })

// CSV export (sessions only) — quote per RFC 4180; injection-safe via csvEscape.
function toCsv(rows: Session[]): string {
  const header = ['type', 'duration_minutes', 'occurred_at', 'intention', 'focus', 'calm', 'breaths_per_minute', 'notes']
  const lines = rows.map((s) =>
    [
      s.type,
      String(Math.round(s.duration_seconds / 60)),
      s.occurred_at,
      s.intention ?? '',
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

type TimelineItem =
  | { kind: 'journal'; id: string; when: string; text: string; mood: Mood | null }
  | { kind: 'gratitude'; id: string; when: string; text: string; category: string }
  | { kind: 'mood'; id: string; when: string; mood: Mood }
  | { kind: 'session'; id: string; when: string; session: Session }

const sortByWhenDesc = (a: TimelineItem, b: TimelineItem) => (a.when < b.when ? 1 : -1)

export default function TimelinePage() {
  const { t } = useT()
  const { showToast } = useToast()
  const [items, setItems] = useState<TimelineItem[] | null>(null)
  const [error, setError] = useState<string | null>(null) // inline action errors (edit/export)
  const [loadError, setLoadError] = useState<string | null>(null) // the timeline read failing
  const [retrying, setRetrying] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null) // session whose actions are revealed
  const [exporting, setExporting] = useState(false)

  // Inline session edit.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState<MeditationType>('mindfulness')
  const [editMin, setEditMin] = useState(10)
  const [editWhen, setEditWhen] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editIntention, setEditIntention] = useState('')
  const [editFocus, setEditFocus] = useState('')
  const [editCalm, setEditCalm] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  function load(ignored?: () => boolean) {
    // Each source is non-critical on its own; fail quietly per-source and merge whatever
    // loaded, so one failing endpoint never blanks the whole timeline.
    return Promise.all([
      journalService.list({ limit: PER_SOURCE }).catch(() => []),
      gratitudeService.list({ limit: PER_SOURCE }).catch(() => []),
      sessionService.list({ limit: PER_SOURCE }).catch(() => []),
      moodLogService.list({ limit: PER_SOURCE }).catch(() => []),
    ])
      .then(([journals, gratitudes, sessions, moods]) => {
        if (ignored?.()) return
        const merged: TimelineItem[] = [
          ...journals.map((j) => ({
            kind: 'journal' as const,
            id: j.id,
            when: j.created_at,
            text: j.body,
            mood: j.mood,
          })),
          ...gratitudes.map((g) => ({
            kind: 'gratitude' as const,
            id: g.id,
            when: g.created_at,
            text: g.text,
            category: g.category,
          })),
          ...sessions.map((s) => ({
            kind: 'session' as const,
            id: s.id,
            when: s.occurred_at,
            session: s,
          })),
          ...moods.map((m) => ({
            kind: 'mood' as const,
            id: m.id,
            when: m.created_at,
            mood: m.mood,
          })),
        ]
        merged.sort(sortByWhenDesc)
        setItems(merged)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignored?.()) setLoadError(messageForError(err, t('tracking.timeline.loadError')))
      })
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    let ignore = false
    load(() => ignore)
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carries its own stale-response guard so a slow retry can't setState after unmount.
  const retryIgnoreRef = useRef(false)
  useEffect(() => () => { retryIgnoreRef.current = true }, [])

  function retryLoad() {
    setRetrying(true)
    load(() => retryIgnoreRef.current)
  }

  // Dismiss an open row menu on Escape or a tap/click outside it (a popup contract
  // implied by aria-haspopup that wasn't otherwise honored).
  useEffect(() => {
    if (!menuId) return
    function onPointerDown(e: PointerEvent) {
      const menu = document.getElementById(`menu-${menuId}`)
      if (menu && !menu.contains(e.target as Node)) setMenuId(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuId])

  function startEdit(s: Session) {
    setEditingId(s.id)
    setMenuId(null)
    setEditType(s.type)
    setEditMin(Math.max(1, Math.round(s.duration_seconds / 60)))
    setEditWhen(toDatetimeLocal(new Date(s.occurred_at)))
    setEditNotes(s.notes ?? '')
    setEditIntention(s.intention ?? '')
    setEditFocus(s.focus != null ? String(s.focus) : '')
    setEditCalm(s.calm != null ? String(s.calm) : '')
    setError(null)
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    setError(null)
    try {
      const updated = await sessionService.update(id, {
        type: editType,
        duration_seconds: editMin * 60,
        // `editWhen` is a local datetime-local value; send the UTC instant
        // (mirrors LogSessionPage / MeditatePage).
        occurred_at: new Date(editWhen).toISOString(),
        notes: editNotes.trim() || null,
        intention: editIntention.trim() || null,
        focus: editFocus ? Number(editFocus) : null,
        calm: editCalm ? Number(editCalm) : null,
      })
      setItems(
        (prev) =>
          prev
            ?.map((it) =>
              it.kind === 'session' && it.id === id
                ? { ...it, when: updated.occurred_at, session: updated }
                : it,
            )
            .sort(sortByWhenDesc) ?? null,
      )
      setEditingId(null)
      showToast(t('tracking.timeline.updated'))
    } catch {
      setError(t('tracking.timeline.updateError'))
    } finally {
      setSavingEdit(false)
    }
  }

  // Sessions and one-tap mood check-ins expose a Delete here (mood logs have no other
  // home); journal/gratitude are managed on their own pages.
  const handleDelete = useUndoableDelete<TimelineItem>({
    list: items,
    setList: setItems,
    getId: (it) => it.id,
    remove: (id) => sessionService.remove(id),
    messages: { success: t('tracking.timeline.sessionDeleted'), error: t('tracking.timeline.sessionDeleteError') },
    onStart: () => {
      setMenuId(null)
      setError(null)
    },
  })

  const handleDeleteMood = useUndoableDelete<TimelineItem>({
    list: items,
    setList: setItems,
    getId: (it) => it.id,
    remove: (id) => moodLogService.remove(id),
    messages: { success: t('tracking.timeline.moodRemoved'), error: t('tracking.timeline.moodRemoveError') },
    onStart: () => {
      setMenuId(null)
      setError(null)
    },
  })

  async function exportCsv() {
    setError(null)
    setExporting(true)
    try {
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
      showToast(t('tracking.timeline.exported'))
    } catch {
      setError(t('tracking.timeline.exportError'))
    } finally {
      setExporting(false)
    }
  }

  const hasSession = !!items?.some((it) => it.kind === 'session')

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>{t('tracking.timeline.title')}</h1>
        <p className="page-subtitle">{t('tracking.timeline.subtitle')}</p>
      </header>

      <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
      <ErrorBanner message={error} />

      {items === null && !loadError && <Loading />}

      {items && items.length === 0 && (
        <EmptyState>
          {t('tracking.timeline.emptyPre')} <Link to="/meditate">{t('tracking.timeline.emptySit')}</Link>
          {t('tracking.timeline.emptyMid')}{' '}
          <Link to="/journal">{t('tracking.timeline.emptyNote')}</Link>
          {t('tracking.timeline.emptyOr')} <Link to="/gratitude">{t('tracking.timeline.emptyGratitude')}</Link>{' '}
          {t('tracking.timeline.emptyPost')}
        </EmptyState>
      )}

      {items && items.length > 0 && (
        <ul className="timeline">
          {items.map((item) => {
            const accent =
              item.kind === 'gratitude'
                ? gratitudeColor(item.category)
                : item.kind === 'mood'
                  ? MOOD_COLORS[item.mood]
                  : item.kind === 'journal' && item.mood
                    ? MOOD_COLORS[item.mood]
                    : undefined
            // The row glyph: a lucide activity icon for session/journal/gratitude (shared
            // ACTIVITY_META, tinted to the activity colour), and the mood face for a mood row.
            const activityIcon =
              item.kind === 'session'
                ? ['resonance_breathing', 'energizing_breathing'].includes(item.session.type)
                  ? ACTIVITY_META.breathe
                  : ACTIVITY_META.meditate
                : item.kind === 'journal'
                  ? ACTIVITY_META.journal
                  : item.kind === 'gratitude'
                    ? ACTIVITY_META.gratitude
                    : null

            // Sessions: editable inline (the folded-in History). Edit form replaces the row.
            if (item.kind === 'session' && editingId === item.id) {
              return (
                <li key={`session-${item.id}`} className="timeline-item timeline-item--session">
                  <div className="session-edit" style={{ width: '100%' }}>
                    <label>
                      {t('tracking.timeline.type')}
                      <select value={editType} onChange={(e) => setEditType(e.target.value as MeditationType)}>
                        {Object.entries(TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('tracking.timeline.duration')}
                      <input
                        type="number"
                        min="1"
                        value={editMin}
                        onChange={(e) => setEditMin(Math.max(1, Number(e.target.value)))}
                      />
                    </label>
                    <label>
                      {t('tracking.timeline.when')}
                      <input
                        type="datetime-local"
                        value={editWhen}
                        title={t('tracking.timeline.yourLocalTime')}
                        onChange={(e) => setEditWhen(e.target.value)}
                      />
                    </label>
                    <label>
                      {t('tracking.timeline.focus')}
                      <RatingChips ariaLabel={t('tracking.timeline.focusRatingAria')} value={editFocus} onChange={setEditFocus} />
                    </label>
                    <label>
                      {t('tracking.timeline.calm')}
                      <RatingChips ariaLabel={t('tracking.timeline.calmRatingAria')} value={editCalm} onChange={setEditCalm} />
                    </label>
                    <label>
                      {t('tracking.timeline.intention')}
                      <textarea
                        rows={2}
                        value={editIntention}
                        maxLength={140}
                        placeholder={t('tracking.timeline.intentionPlaceholder')}
                        onChange={(e) => setEditIntention(e.target.value)}
                      />
                    </label>
                    <label>
                      {t('tracking.timeline.notes')}
                      <textarea rows={2} value={editNotes} maxLength={2000} onChange={(e) => setEditNotes(e.target.value)} />
                    </label>
                    <div className="session-edit-actions">
                      <button type="button" onClick={() => saveEdit(item.id)} disabled={savingEdit}>
                        {savingEdit ? t('common.saving') : t('tracking.timeline.editSave')}
                      </button>
                      <button type="button" className="link-neutral" onClick={() => setEditingId(null)}>
                        {t('tracking.timeline.editCancel')}
                      </button>
                    </div>
                  </div>
                </li>
              )
            }

            return (
              <li
                key={`${item.kind}-${item.id}`}
                className={`timeline-item timeline-item--${item.kind}`}
                style={accent ? { borderLeftColor: accent } : undefined}
              >
                <span className="timeline-emoji" aria-hidden="true">
                  {activityIcon ? (
                    <activityIcon.icon
                      size={18}
                      strokeWidth={1.75}
                      style={{ color: activityIcon.color }}
                    />
                  ) : item.kind === 'mood' ? (
                    MOOD_META[item.mood].emoji
                  ) : null}
                </span>
                <div className="timeline-body">
                  <div className="timeline-line">
                    {item.kind === 'session' ? (
                      <span className="timeline-text">
                        {TYPE_LABELS[item.session.type]} · {minutes(item.session.duration_seconds)}
                      </span>
                    ) : item.kind === 'mood' ? (
                      <span className="timeline-text">{t('tracking.timeline.felt', { mood: MOOD_META[item.mood].label.toLowerCase() })}</span>
                    ) : (
                      <span className="timeline-text">{item.text}</span>
                    )}
                    {item.kind === 'journal' && item.mood && (
                      <span
                        className="journal-mood"
                        style={{ ['--pill' as any]: MOOD_COLORS[item.mood] }}
                      >
                        {cap(item.mood)}
                      </span>
                    )}
                    {(item.kind === 'session' || item.kind === 'mood') && (
                      <span className="journal-entry-actions" id={`menu-${item.id}`}>
                        {menuId === item.id && (
                          <>
                            {item.kind === 'session' && (
                              <button
                                type="button"
                                className="link-neutral"
                                onClick={() => startEdit(item.session)}
                              >
                                {t('tracking.timeline.edit')}
                              </button>
                            )}
                            <button
                              type="button"
                              className="link-danger"
                              onClick={() =>
                                item.kind === 'mood' ? handleDeleteMood(item.id) : handleDelete(item.id)
                              }
                            >
                              {t('tracking.timeline.delete')}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="journal-entry-menu"
                          aria-label={item.kind === 'mood' ? t('tracking.timeline.moodActions') : t('tracking.timeline.sessionActions')}
                          title={item.kind === 'mood' ? t('tracking.timeline.moodActionsTitle') : t('tracking.timeline.sessionActionsTitle')}
                          aria-haspopup="true"
                          aria-expanded={menuId === item.id}
                          aria-controls={`menu-${item.id}`}
                          onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                        >
                          ⋯
                        </button>
                      </span>
                    )}
                  </div>
                  {/* Captured intention + focus/calm self-ratings, shown when present. */}
                  {item.kind === 'session' && item.session.intention && (
                    <p className="timeline-intention">
                      <span className="timeline-intention-icon" aria-hidden="true">✦</span>{' '}
                      {item.session.intention}
                    </p>
                  )}
                  {item.kind === 'session' &&
                    (item.session.focus != null || item.session.calm != null) && (
                      <span className="timeline-ratings muted">
                        {item.session.focus != null && (
                          <span>{t('tracking.timeline.focusReadout', { n: item.session.focus })}</span>
                        )}
                        {item.session.calm != null && (
                          <span>{t('tracking.timeline.calmReadout', { n: item.session.calm })}</span>
                        )}
                      </span>
                    )}
                  <span className="timeline-meta muted">
                    {item.kind === 'session'
                      ? t('tracking.timeline.metaPractice')
                      : item.kind === 'journal'
                        ? t('tracking.timeline.metaJournal')
                        : item.kind === 'mood'
                          ? t('tracking.timeline.metaMood')
                          : t('tracking.timeline.metaGratitude')}
                    {' · '}
                    {formatWhen(item.when)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hasSession && (
        <p className="history-export muted">
          <button type="button" className="link-neutral" onClick={exportCsv} disabled={exporting}>
            {exporting ? t('tracking.timeline.exporting') : t('tracking.timeline.exportCsv')}
          </button>
        </p>
      )}
    </main>
  )
}
