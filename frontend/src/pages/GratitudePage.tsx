import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gratitudeService } from '../services/gratitude'
import { dashboardService } from '../services/dashboard'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { gratitudeColor, tint } from '../lib/colors'
import type { Gratitude, GratitudeCategory } from '../types'

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

export default function GratitudePage() {
  const [category, setCategory] = useState<GratitudeCategory | null>(null)
  const [showAllThemes, setShowAllThemes] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Gratitude[] | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null) // entry whose Delete is revealed
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
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

  useEffect(() => {
    gratitudeService
      .list({ limit: GRAT_PAGE, offset: 0 })
      .then((rows) => {
        setEntries(rows)
        setHasMore(rows.length === GRAT_PAGE)
      })
      .catch(() => setError('Could not load your gratitude journal.'))
  }, [])

  async function loadMore() {
    if (!entries) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await gratitudeService.list({ limit: GRAT_PAGE, offset: entries.length })
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
      const before = await dashboardService.getStats()
      const entry = await gratitudeService.create({ category, text: text.trim() })
      setEntries((prev) => [entry, ...(prev ?? [])])
      const after = await dashboardService.getStats()
      // True gain from the server, itemized (gratitude entry + any quest/streak bonus).
      const bd = buildXpBreakdown(before, after, '🙏 Gratitude')
      setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
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
    <main className="gratitude">
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
            placeholder={category === 'custom' ? 'Write your own…' : "I'm grateful for…"}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" onClick={save} disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </section>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="grat-journal">
        <h2>Recent</h2>
        {!entries && !error && <p>Loading…</p>}
        {entries && entries.length === 0 && (
          <p className="muted">No entries yet — your first grateful moment starts here.</p>
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
                  <span className="journal-mood" style={{ background: tint(color), color }}>
                    {LABELS[e.category] ?? e.category}
                  </span>
                  <span className="journal-entry-actions">
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
          onClose={() => setReward(null)}
        />
      )}
    </main>
  )
}
