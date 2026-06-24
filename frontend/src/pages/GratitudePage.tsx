import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gratitudeService } from '../services/gratitude'
import { dashboardService } from '../services/dashboard'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { gratitudeColor } from '../lib/colors'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { DashboardStats, Gratitude, GratitudeCategory } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

const CATEGORIES: { key: GratitudeCategory; label: string; emoji: string }[] = [
  { key: 'custom', label: 'Custom', emoji: '✏️' },
  { key: 'people', label: 'People', emoji: '🧡' },
  { key: 'health', label: 'Health', emoji: '🌿' },
  { key: 'nature', label: 'Nature', emoji: '🌅' },
  { key: 'experiences', label: 'Experiences', emoji: '✨' },
  { key: 'growth', label: 'Growth', emoji: '🌱' },
  { key: 'home', label: 'Home', emoji: '🏡' },
  { key: 'self', label: 'Yourself', emoji: '💪' },
  { key: 'simple_pleasures', label: 'Simple pleasures', emoji: '☕' },
  { key: 'small_moments', label: 'Small moments', emoji: '🍃' },
  { key: 'big_moments', label: 'Big moments', emoji: '🎉' },
  { key: 'spiritual', label: 'Spiritual', emoji: '🕊️' },
  { key: 'material', label: 'Things I have', emoji: '🎁' },
  { key: 'work', label: 'Work', emoji: '💼' },
  { key: 'food', label: 'Food', emoji: '🍽️' },
  { key: 'learning', label: 'Learning', emoji: '📚' },
  { key: 'creativity', label: 'Creativity', emoji: '🎨' },
  { key: 'kindness', label: 'Kindness', emoji: '🤝' },
  { key: 'music', label: 'Music', emoji: '🎵' },
  { key: 'animals', label: 'Animals', emoji: '🐾' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'friendship', label: 'Friendship', emoji: '👯' },
  { key: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { key: 'love', label: 'Love', emoji: '❤️' },
  { key: 'play', label: 'Play & fun', emoji: '🎲' },
  { key: 'memories', label: 'Memories', emoji: '📷' },
  { key: 'hope', label: 'Hope', emoji: '🌈' },
  { key: 'body', label: 'The body', emoji: '🧘' },
  { key: 'mind', label: 'The mind', emoji: '🧠' },
  { key: 'mornings', label: 'Mornings', emoji: '🌄' },
  { key: 'evenings', label: 'Evenings', emoji: '🌙' },
  { key: 'weather', label: 'Weather', emoji: '☀️' },
  { key: 'comfort', label: 'Comfort', emoji: '🛋️' },
  { key: 'freedom', label: 'Freedom', emoji: '🗽' },
  { key: 'abundance', label: 'Abundance', emoji: '🌾' },
  { key: 'community', label: 'Community', emoji: '🏘️' },
  { key: 'beauty', label: 'Beauty', emoji: '🌸' },
]
const LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
)

// A short, common-first subset shown by default so the composer stays close to the top;
// the rest hide behind "More themes". Keep "custom" (write-your-own) always visible.
const COMMON_KEYS: GratitudeCategory[] = [
  'custom',
  'people',
  'health',
  'nature',
  'experiences',
  'growth',
  'home',
  'self',
  'simple_pleasures',
  'work',
  'food',
  'friendship',
]
const COMMON = CATEGORIES.filter((c) => COMMON_KEYS.includes(c.key))
const REST = CATEGORIES.filter((c) => !COMMON_KEYS.includes(c.key))

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const GRAT_PAGE = 50
const MAX_LEN = 500
// Show the remaining-characters hint only as the user nears the limit, so it stays quiet.
const COUNTER_THRESHOLD = 50

export default function GratitudePage() {
  const [category, setCategory] = useState<GratitudeCategory | null>(null)
  const [showAllThemes, setShowAllThemes] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null) // save / load-more action errors
  const [loadError, setLoadError] = useState<string | null>(null) // the initial list failing
  const [retrying, setRetrying] = useState(false)
  const [entries, setEntries] = useState<Gratitude[] | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null) // entry whose Delete is revealed
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Stable pagination cursor: the number of rows fetched from the server so far.
  // Derived from rows received, NOT entries.length (which the user can mutate via
  // dedup or delete), so the next offset can't skip or re-fetch rows.
  const loadedCount = useRef(0)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  const remove = useUndoableDelete<Gratitude>({
    list: entries,
    setList: setEntries,
    getId: (e) => e.id,
    remove: (id) => gratitudeService.remove(id),
    messages: { success: 'Entry deleted.', error: 'Could not delete that entry.' },
    onStart: () => setError(null),
  })

  function loadInitial() {
    gratitudeService
      .list({ limit: GRAT_PAGE, offset: 0 })
      .then((rows) => {
        setEntries(rows)
        loadedCount.current = rows.length
        setHasMore(rows.length === GRAT_PAGE)
        setLoadError(null)
      })
      .catch((err) =>
        setLoadError(messageForError(err, 'Could not load your gratitude journal.')),
      )
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retryLoad() {
    setRetrying(true)
    loadInitial()
  }

  async function loadMore() {
    if (!entries) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await gratitudeService.list({ limit: GRAT_PAGE, offset: loadedCount.current })
      loadedCount.current += rows.length
      setEntries((prev) => {
        const seen = new Set((prev ?? []).map((e) => e.id))
        return [...(prev ?? []), ...rows.filter((r) => !seen.has(r.id))]
      })
      setHasMore(rows.length === GRAT_PAGE)
    } catch {
      setError('Could not load more entries.')
    } finally {
      setLoadingMore(false)
    }
  }

  async function fetchOptions(cat: GratitudeCategory) {
    setOptions([])
    setLoadingOptions(true)
    try {
      const res = await gratitudeService.suggestions(cat)
      setOptions(res.options)
    } catch {
      setOptions([]) // suggestions are a nicety; manual input still works
    } finally {
      setLoadingOptions(false)
    }
  }

  function pickCategory(cat: GratitudeCategory) {
    setCategory(cat)
    setText('')
    setOptions([])
    // "Custom" is write-your-own — no AI prompt suggestions.
    if (cat !== 'custom') void fetchOptions(cat)
  }

  async function save() {
    if (!category || !text.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Stats are best-effort and sit outside the create: a getStats failure must not
      // surface "could not save" for an entry that did save (which provokes a re-tap
      // and a duplicate, since create carries no idempotency token).
      let beforeOk = true
      const before = await dashboardService.getStats().catch(() => {
        beforeOk = false
        return ZERO_STATS
      })
      const entry = await gratitudeService.create({ category, text: text.trim() })
      setEntries((prev) => [entry, ...(prev ?? [])])
      // The new row shifts everything down by one server-side; advance the cursor so
      // the next loadMore doesn't re-fetch the row now sitting at the old boundary.
      loadedCount.current += 1
      // Post-save stats are best-effort too: the entry is already saved, so fall back
      // to `before` (zero gain) on failure rather than failing the whole save.
      const after = await dashboardService.getStats().catch(() => before)
      // Only show the reward when the BEFORE snapshot is real: with a zeroed `before`
      // the breakdown would treat the user's entire lifetime XP as this entry's gain.
      if (beforeOk) {
        // True gain from the server, itemized (gratitude entry + any quest/streak bonus).
        const bd = buildXpBreakdown(before, after, '🙏 Gratitude')
        setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
      }
      // Return to the "pick a category" state for next time.
      setCategory(null)
      setText('')
      setOptions([])
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main id="main-content" className="gratitude">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Gratitude</h1>
        <p className="page-subtitle">
          What are you grateful for right now? Pick a theme for ideas, or write your own.
        </p>
      </header>

      <div className="grat-categories">
        {COMMON.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip${category === c.key ? ' chip-active' : ''}`}
            onClick={() => pickCategory(c.key)}
          >
            <span aria-hidden="true">{c.emoji}</span> {c.label}
          </button>
        ))}
        {/* Keep a chosen theme on screen even when its from the collapsed set. */}
        {REST.map((c) =>
          showAllThemes || category === c.key ? (
            <button
              key={c.key}
              type="button"
              className={`chip${category === c.key ? ' chip-active' : ''}`}
              onClick={() => pickCategory(c.key)}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ) : null,
        )}
        <button
          type="button"
          className="chip grat-more"
          aria-expanded={showAllThemes}
          onClick={() => setShowAllThemes((v) => !v)}
        >
          {showAllThemes ? 'Fewer themes' : 'More themes…'}
        </button>
      </div>

      {category && (
        <section className="grat-compose">
          {category !== 'custom' && (
            <>
              <div className="grat-options-head">
                <span className="muted">
                  {loadingOptions ? 'Finding ideas…' : 'Tap an idea, or write your own'}
                </span>
                <button
                  type="button"
                  className="grat-reload"
                  onClick={() => void fetchOptions(category)}
                  disabled={loadingOptions}
                >
                  ↻ New ideas
                </button>
              </div>
              {!loadingOptions && options.length > 0 && (
                <div className="grat-options">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className="chip chip-soft"
                      onClick={() => setText(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <textarea
            rows={3}
            value={text}
            maxLength={MAX_LEN}
            aria-label="What you're grateful for"
            placeholder={category === 'custom' ? 'Write your own…' : "I'm grateful for…"}
            onChange={(e) => setText(e.target.value)}
          />
          {MAX_LEN - text.length <= COUNTER_THRESHOLD && (
            <p className="grat-counter muted" aria-live="polite">
              {MAX_LEN - text.length} left
            </p>
          )}
          <button type="button" onClick={save} disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </section>
      )}

      <ErrorBanner message={error} />

      <section className="grat-journal">
        <h2>Recent</h2>
        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        {!entries && !loadError && <Loading />}
        {entries && entries.length === 0 && (
          <EmptyState>No entries yet — your first grateful moment starts here.</EmptyState>
        )}
        {entries && entries.length > 0 && (
          <ul className="journal-list grat-log">
            {entries.map((e) => {
              const color = gratitudeColor(e.category)
              return (
              <li
                key={e.id}
                className="journal-entry"
                style={{ borderLeftColor: color }}
              >
                <div className="journal-entry-head">
                  <span className="muted">{fmtDate(e.created_at)}</span>
                  <span
                    className="journal-mood"
                    style={{ '--pill': color } as React.CSSProperties}
                  >
                    {LABELS[e.category] ?? e.category}
                  </span>
                  <span className="journal-entry-actions" id={`menu-${e.id}`}>
                    {menuId === e.id && (
                      <button
                        type="button"
                        className="link-danger"
                        onClick={() => {
                          remove(e.id)
                          setMenuId(null)
                        }}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="journal-entry-menu"
                      aria-label="Entry actions"
                      aria-haspopup="true"
                      aria-expanded={menuId === e.id}
                      aria-controls={`menu-${e.id}`}
                      onClick={() => setMenuId(menuId === e.id ? null : e.id)}
                    >
                      ⋯
                    </button>
                  </span>
                </div>
                <p className="journal-body">{e.text}</p>
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
