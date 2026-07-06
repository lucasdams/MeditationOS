import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandHeart } from 'lucide-react'
import { gratitudeService } from '../services/gratitude'
import { dashboardService } from '../services/dashboard'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { gratitudeColor } from '../lib/colors'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { fmtDate, useT } from '../i18n'
import type { DashboardStats, Gratitude, GratitudeCategory } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// Category themes are TEXT-FIRST (no system emoji): each chip shows its label with a small
// colour dot accent (derived from gratitudeColor, so a theme's dot matches its log colour).
// Too many themes (~37) to hand-pick a distinct line icon each, and a calmer text-led grid
// reads better than a wall of icons.
const CATEGORIES: { key: GratitudeCategory; label: string }[] = [
  { key: 'custom', label: 'Custom' },
  { key: 'people', label: 'People' },
  { key: 'health', label: 'Health' },
  { key: 'nature', label: 'Nature' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'growth', label: 'Growth' },
  { key: 'home', label: 'Home' },
  { key: 'self', label: 'Yourself' },
  { key: 'simple_pleasures', label: 'Simple pleasures' },
  { key: 'small_moments', label: 'Small moments' },
  { key: 'big_moments', label: 'Big moments' },
  { key: 'spiritual', label: 'Spiritual' },
  { key: 'material', label: 'Things I have' },
  { key: 'work', label: 'Work' },
  { key: 'food', label: 'Food' },
  { key: 'learning', label: 'Learning' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'kindness', label: 'Kindness' },
  { key: 'music', label: 'Music' },
  { key: 'animals', label: 'Animals' },
  { key: 'travel', label: 'Travel' },
  { key: 'friendship', label: 'Friendship' },
  { key: 'family', label: 'Family' },
  { key: 'love', label: 'Love' },
  { key: 'play', label: 'Play & fun' },
  { key: 'memories', label: 'Memories' },
  { key: 'hope', label: 'Hope' },
  { key: 'body', label: 'The body' },
  { key: 'mind', label: 'The mind' },
  { key: 'mornings', label: 'Mornings' },
  { key: 'evenings', label: 'Evenings' },
  { key: 'weather', label: 'Weather' },
  { key: 'comfort', label: 'Comfort' },
  { key: 'freedom', label: 'Freedom' },
  { key: 'abundance', label: 'Abundance' },
  { key: 'community', label: 'Community' },
  { key: 'beauty', label: 'Beauty' },
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

// Locale-aware via the i18n fmtDate wrapper (never the browser locale). Named fmtDay so
// it doesn't shadow the imported helper.
const fmtDay = (iso: string) => fmtDate(new Date(iso), { month: 'short', day: 'numeric' })

const GRAT_PAGE = 50
const MAX_LEN = 500
// How many suggestion chips show before the quiet "+N more ideas" toggle.
const IDEAS_PREVIEW = 4
// Show the remaining-characters hint only as the user nears the limit, so it stays quiet.
const COUNTER_THRESHOLD = 50

export default function GratitudePage() {
  const { t } = useT()
  const [category, setCategory] = useState<GratitudeCategory | null>(null)
  const [showAllThemes, setShowAllThemes] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  // Long idea lists wrap into a dense chip band — preview a handful with a quiet "see all".
  const [allIdeasShown, setAllIdeasShown] = useState(false)
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
    messages: { success: t('tracking.gratitude.deleted'), error: t('tracking.gratitude.deleteError') },
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
        setLoadError(messageForError(err, t('tracking.gratitude.loadError'))),
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
      setError(t('tracking.gratitude.loadMoreError'))
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
    // Keep a hand-typed draft when switching themes — silently losing the user's words is
    // worse than a stale category. Only clear text that was auto-filled verbatim from a
    // suggestion (it belongs to the previous category's prompt set).
    if (options.includes(text)) setText('')
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
        const bd = buildXpBreakdown(before, after, t('tracking.gratitude.activityLabel'), HandHeart)
        setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
      }
      // Return to the "pick a category" state for next time.
      setCategory(null)
      setText('')
      setOptions([])
    } catch {
      setError(t('tracking.gratitude.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main id="main-content" className="gratitude">
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('tracking.gratitude.title')}</h1>
        <p className="page-subtitle">
          {t('tracking.gratitude.subtitle')}
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
            <span
              className="grat-chip-dot"
              aria-hidden="true"
              style={{ backgroundColor: gratitudeColor(c.key) }}
            />{' '}
            {c.label}
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
              <span
                className="grat-chip-dot"
                aria-hidden="true"
                style={{ backgroundColor: gratitudeColor(c.key) }}
              />{' '}
              {c.label}
            </button>
          ) : null,
        )}
        <button
          type="button"
          className="chip grat-more"
          aria-expanded={showAllThemes}
          onClick={() => setShowAllThemes((v) => !v)}
        >
          {showAllThemes ? t('tracking.gratitude.fewerThemes') : t('tracking.gratitude.moreThemes')}
        </button>
      </div>

      {category && (
        <section className="grat-compose">
          {category !== 'custom' && (
            <>
              <div className="grat-options-head">
                <span className="muted">
                  {loadingOptions ? t('tracking.gratitude.loadingIdeas') : t('tracking.gratitude.tapIdea')}
                </span>
                <button
                  type="button"
                  className="grat-reload"
                  onClick={() => void fetchOptions(category)}
                  disabled={loadingOptions}
                >
                  {t('tracking.gratitude.newIdeas')}
                </button>
              </div>
              {!loadingOptions && options.length > 0 && (
                <div className="grat-options">
                  {(allIdeasShown ? options : options.slice(0, IDEAS_PREVIEW)).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className="chip chip-soft"
                      onClick={() => setText(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                  {!allIdeasShown && options.length > IDEAS_PREVIEW && (
                    <button
                      type="button"
                      className="chip grat-more"
                      aria-expanded={false}
                      onClick={() => setAllIdeasShown(true)}
                    >
                      {t('tracking.gratitude.moreIdeas', { count: options.length - IDEAS_PREVIEW })}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <textarea
            rows={3}
            value={text}
            maxLength={MAX_LEN}
            aria-label={t('tracking.gratitude.textAria')}
            placeholder={category === 'custom' ? t('tracking.gratitude.customPlaceholder') : t('tracking.gratitude.gratefulPlaceholder')}
            onChange={(e) => setText(e.target.value)}
          />
          {MAX_LEN - text.length <= COUNTER_THRESHOLD && (
            <p className="grat-counter muted" aria-live="polite">
              {t('tracking.gratitude.charsLeft', { n: MAX_LEN - text.length })}
            </p>
          )}
          <button type="button" onClick={save} disabled={saving || !text.trim()}>
            {saving ? t('common.saving') : t('tracking.gratitude.save')}
          </button>
        </section>
      )}

      <ErrorBanner message={error} />

      <section className="grat-journal">
        <h2>{t('tracking.gratitude.recent')}</h2>
        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        {!entries && !loadError && <Loading />}
        {entries && entries.length === 0 && (
          <EmptyState>{t('tracking.gratitude.empty')}</EmptyState>
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
                  <span className="muted">{fmtDay(e.created_at)}</span>
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
                          // This row came from the server-side window we've already
                          // paged through, so shrink the cursor to match — otherwise the
                          // next "Load more" (offset = loadedCount) skips the row that
                          // shifted up into the deleted one's place. Erring toward a
                          // re-fetch is safe: the dedup in loadMore drops any repeat.
                          loadedCount.current = Math.max(0, loadedCount.current - 1)
                          setMenuId(null)
                        }}
                      >
                        {t('tracking.gratitude.delete')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="journal-entry-menu"
                      aria-label={t('tracking.gratitude.entryActions')}
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
            {loadingMore ? t('common.loading') : t('tracking.gratitude.loadMore')}
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
