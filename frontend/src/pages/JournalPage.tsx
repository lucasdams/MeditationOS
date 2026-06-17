import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { journalService } from '../services/journals'
import { gratitudeService } from '../services/gratitude'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { MOOD_COLORS, MOOD_META, tint } from '../lib/colors'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { dailyPrompt, randomPrompt, type JournalPrompt } from '../lib/journalPrompts'
import type { DashboardStats, Journal, MeditationType, Mood, Session } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// Derive the journal mood palette from the shared MOOD_META so the composer, the
// one-tap check-in, and the timeline always offer the identical canonical 15 moods.
const MOODS = Object.keys(MOOD_META) as Mood[]

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
  const [error, setError] = useState<string | null>(null) // save / load-more action errors
  const [loadError, setLoadError] = useState<string | null>(null) // the list query failing
  const [retrying, setRetrying] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [body, setBody] = useState('')
  const [mood, setMood] = useState<Mood | ''>('')
  const [sessionId, setSessionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [composing, setComposing] = useState(false) // expand the composer on focus/typing
  const [query, setQuery] = useState('') // text search over reflections
  const [moodFilter, setMoodFilter] = useState<Mood | ''>('') // filter the list by mood

  // Journaling prompt nudge — stable daily default, shuffleable, dismissible.
  const todayPrompt = useMemo(() => dailyPrompt(new Date()), [])
  const [currentPrompt, setCurrentPrompt] = useState<JournalPrompt>(todayPrompt)
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  // Which entry's edit/delete actions are revealed (kept tucked behind a ⋯ toggle
  // so entries read cleanly and the actions aren't a prominent default).
  const [menuId, setMenuId] = useState<string | null>(null)
  // "Resurface a memory" — one random past reflection (journal or gratitude).
  const [memory, setMemory] = useState<{
    kind: 'journal' | 'gratitude'
    text: string
    mood?: Mood | null
    when: string
  } | null>(null)
  const [resurfacing, setResurfacing] = useState(false)
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
  function loadInitial(q: string, mood: Mood | '', ignored?: () => boolean) {
    journalService
      .list({ q: q || undefined, mood: mood || undefined, limit: PAGE, offset: 0 })
      .then((rows) => {
        if (ignored?.()) return
        setEntries(rows)
        setHasMore(rows.length === PAGE)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignored?.()) setLoadError(messageForError(err, 'Could not load your journal.'))
      })
      .finally(() => {
        if (!ignored?.()) setRetrying(false)
      })
  }

  useEffect(() => {
    setEditingId(null)
    setMenuId(null)
    // Guard against an older search's response landing after a newer one.
    let ignore = false
    const t = setTimeout(
      () => loadInitial(query, moodFilter, () => ignore),
      query ? 300 : 0, // debounce typing; load immediately on mount/clear/mood change
    )
    return () => {
      ignore = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, moodFilter])

  function retryLoad() {
    setRetrying(true)
    loadInitial(query, moodFilter)
  }

  async function loadMore() {
    if (!entries) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await journalService.list({
        q: query || undefined,
        mood: moodFilter || undefined,
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
      // Stats are best-effort and sit outside the create: a getStats failure must not
      // surface "could not save" for an entry that did save (which provokes a re-tap
      // and a duplicate, since create carries no idempotency token).
      const before = await dashboardService.getStats().catch(() => ZERO_STATS)
      const created = await journalService.create({
        body: body.trim(),
        mood: mood || null,
        session_id: sessionId || null,
      })
      setEntries((prev) => [created, ...(prev ?? [])])
      setBody('')
      setMood('')
      setSessionId('')
      setComposing(false)
      // Itemized XP: the journal entry + any quest (write a journal / journal with a
      // mood) and streak bonus it just completed. Post-save stats are best-effort too:
      // the entry is already saved, so fall back to `before` (zero gain) on failure.
      const after = await dashboardService.getStats().catch(() => before)
      const bd = buildXpBreakdown(before, after, '📓 Journal entry')
      setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
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

  const handleDelete = useUndoableDelete<Journal>({
    list: entries,
    setList: setEntries,
    getId: (j) => j.id,
    remove: (id) => journalService.remove(id),
    messages: {
      success: 'Reflection deleted.',
      error: 'Could not delete that reflection.',
    },
    onStart: () => setError(null),
  })

  // Fetch a random journal and a random gratitude in parallel (each may be absent),
  // then surface one of them at random — a gentle "remember this?" moment.
  async function resurfaceMemory() {
    setResurfacing(true)
    try {
      const [j, g] = await Promise.all([
        journalService.random().catch(() => null),
        gratitudeService.random().catch(() => null),
      ])
      const candidates: NonNullable<typeof memory>[] = []
      if (j) candidates.push({ kind: 'journal', text: j.body, mood: j.mood, when: j.created_at })
      if (g) candidates.push({ kind: 'gratitude', text: g.text, when: g.created_at })
      if (candidates.length === 0) {
        setMemory(null)
        showToast('No past reflections to resurface yet.')
        return
      }
      setMemory(candidates[Math.floor(Math.random() * candidates.length)])
    } finally {
      setResurfacing(false)
    }
  }

  const sessionLabel = (s: Session) => `${TYPE_LABELS[s.type]} · ${formatWhen(s.occurred_at)}`

  // The composer expands once you focus it or have text; collapses back when empty.
  const composerOpen = composing || body.trim().length > 0

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Journal</h1>
        <p className="page-subtitle">
          A space to reflect — on your practice, your day, or anything on your mind.
        </p>
      </header>

      <section className="journal-compose">
        {!promptDismissed && (
          <div className="journal-nudge" role="note">
            <span className="journal-nudge-label">Need a nudge?</span>
            <button
              type="button"
              className="journal-nudge-text"
              aria-label={`Use prompt: ${currentPrompt.text}`}
              onClick={() => {
                if (!body.trim()) {
                  setBody(currentPrompt.text + ' ')
                  setComposing(true)
                }
              }}
            >
              {currentPrompt.text}
            </button>
            <div className="journal-nudge-actions">
              <button
                type="button"
                className="journal-nudge-shuffle"
                aria-label="Show another prompt"
                onClick={() => setCurrentPrompt((p) => randomPrompt(p))}
              >
                another
              </button>
              <button
                type="button"
                className="journal-nudge-dismiss"
                aria-label="Dismiss prompt"
                onClick={() => setPromptDismissed(true)}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <textarea
            id="body"
            aria-label="Reflection"
            rows={composerOpen ? 4 : 2}
            value={body}
            maxLength={5000}
            onFocus={() => setComposing(true)}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's on your mind?"
          />

          {composerOpen && (
            <>
              <div className="journal-compose-controls">
                <label className="field">
                  <span className="field-label">
                    Mood (optional)
                    {mood && (
                      <button
                        type="button"
                        className="field-clear"
                        onClick={(e) => {
                          e.preventDefault()
                          setMood('')
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </span>
                  <select value={mood} onChange={(e) => setMood(e.target.value as Mood | '')}>
                    <option value="">No mood</option>
                    {MOODS.map((m) => (
                      <option key={m} value={m}>
                        {cap(m)}
                      </option>
                    ))}
                  </select>
                </label>

                {sessions.length > 0 && (
                  <label className="field">
                    <span className="field-label">
                      On a session (optional)
                      {sessionId && (
                        <button
                          type="button"
                          className="field-clear"
                          onClick={(e) => {
                            e.preventDefault()
                            setSessionId('')
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </span>
                    <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                      <option value="">Not linked</option>
                      {sessions.slice(0, 20).map((s) => (
                        <option key={s.id} value={s.id}>
                          {sessionLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <ErrorBanner message={error} />
              <button type="submit" disabled={submitting || !body.trim()}>
                {submitting ? 'Saving…' : 'Save reflection'}
              </button>
            </>
          )}
        </form>
      </section>

      <section className="journal-list">
        <div className="journal-list-head">
          <h2 className="journal-list-title">Past reflections</h2>
          {entries && entries.length > 0 && (
            <button
              type="button"
              className="resurface-btn"
              onClick={resurfaceMemory}
              disabled={resurfacing}
            >
              {resurfacing ? 'Finding…' : '✨ Resurface a memory'}
            </button>
          )}
        </div>

        {memory && (
          <div className="memory-card">
            <div className="memory-head">
              <span className="memory-kind">
                {memory.kind === 'journal' ? '📓 From your journal' : '🙏 A gratitude'}
                {memory.mood && ` · ${cap(memory.mood)}`}
              </span>
              <span className="muted">{formatWhen(memory.when)}</span>
              <button
                type="button"
                className="memory-close"
                aria-label="Dismiss"
                onClick={() => setMemory(null)}
              >
                ✕
              </button>
            </div>
            <p className="memory-text">{memory.text}</p>
          </div>
        )}

        <input
          type="search"
          className="journal-search"
          value={query}
          placeholder="Search your reflections…"
          aria-label="Search reflections"
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Quiet mood filter — chips toggle the existing ?mood= list filter. */}
        <div
          className="journal-mood-filter"
          role="group"
          aria-label="Filter reflections by mood"
        >
          {MOODS.map((m) => {
            const active = moodFilter === m
            return (
              <button
                key={m}
                type="button"
                className={`selectable mood-filter-chip${active ? ' selected' : ''}`}
                aria-pressed={active}
                style={
                  active
                    ? { background: tint(MOOD_COLORS[m]), color: MOOD_COLORS[m], borderColor: MOOD_COLORS[m] }
                    : undefined
                }
                onClick={() => setMoodFilter(active ? '' : m)}
              >
                <span aria-hidden="true">{MOOD_META[m].emoji}</span> {MOOD_META[m].label}
              </button>
            )
          })}
        </div>

        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        {entries === null && !loadError && <Loading />}
        {entries && entries.length === 0 && (
          <EmptyState>
            {query || moodFilter
              ? `No reflections match ${[
                  query && `“${query}”`,
                  moodFilter && `mood ${MOOD_META[moodFilter].label}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}.`
              : 'No reflections yet. Write your first one above.'}
          </EmptyState>
        )}
        {entries?.map((j) => {
          const linked = j.session_id ? sessionById.get(j.session_id) : undefined
          const editing = editingId === j.id
          return (
            <article
              key={j.id}
              className="journal-entry"
              style={j.mood ? { borderLeftColor: MOOD_COLORS[j.mood] } : undefined}
            >
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
                  <span className="journal-entry-actions" id={`menu-${j.id}`}>
                    {menuId === j.id && (
                      <>
                        <button
                          type="button"
                          className="link-neutral"
                          onClick={() => {
                            startEdit(j)
                            setMenuId(null)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-danger"
                          onClick={() => {
                            handleDelete(j.id)
                            setMenuId(null)
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="journal-entry-menu"
                      aria-label="Entry actions"
                      aria-haspopup="true"
                      aria-expanded={menuId === j.id}
                      aria-controls={`menu-${j.id}`}
                      onClick={() => setMenuId(menuId === j.id ? null : j.id)}
                    >
                      ⋯
                    </button>
                  </span>
                )}
              </div>
              {editing ? (
                <div className="journal-edit">
                  <textarea
                    rows={4}
                    value={editBody}
                    maxLength={5000}
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

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          // No follow-up step here — let the quiet reward fade on its own.
          autoDismissMs={6000}
          onClose={() => setReward(null)}
        />
      )}
    </main>
  )
}
