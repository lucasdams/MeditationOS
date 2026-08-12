import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Feather, RotateCcw } from 'lucide-react'
import { prayerService } from '../services/prayers'
import { dashboardService } from '../services/dashboard'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { fmtDate, useT } from '../i18n'
import type { DashboardStats, Prayer } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// Render the API's UTC ISO timestamps in the user's locale + local time (via fmtDate).
const formatWhen = (iso: string) =>
  fmtDate(new Date(iso), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const formatDay = (iso: string) => fmtDate(new Date(iso), { month: 'short', day: 'numeric' })

const PAGE = 50

// The three filter tabs map to the backend's optional `answered` query param.
type Filter = 'all' | 'open' | 'answered'
const FILTERS: Filter[] = ['all', 'open', 'answered']
const answeredForFilter = (f: Filter): boolean | undefined =>
  f === 'open' ? false : f === 'answered' ? true : undefined

export default function PrayerPage() {
  const { t } = useT()
  const { showToast } = useToast()
  const [entries, setEntries] = useState<Prayer[] | null>(null)
  const [error, setError] = useState<string | null>(null) // save / action errors
  const [loadError, setLoadError] = useState<string | null>(null) // the list query failing
  const [retrying, setRetrying] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [composing, setComposing] = useState(false) // expand the composer on focus/typing
  const [filter, setFilter] = useState<Filter>('all')

  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  // Which entry's edit/delete actions are revealed (tucked behind a ⋯ toggle).
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [answeringId, setAnsweringId] = useState<string | null>(null)

  // Monotonic token for the active list request: a stale response never clobbers newer results.
  const loadSeq = useRef(0)

  function loadInitial(f: Filter) {
    const token = ++loadSeq.current
    const current = () => loadSeq.current === token
    prayerService
      .list({ answered: answeredForFilter(f), limit: PAGE, offset: 0 })
      .then((rows) => {
        if (!current()) return
        setEntries(rows)
        setHasMore(rows.length === PAGE)
        setLoadError(null)
      })
      .catch((err) => {
        if (current()) setLoadError(messageForError(err, t('prayer.loadError')))
      })
      .finally(() => {
        if (current()) setRetrying(false)
      })
  }

  useEffect(() => {
    setEditingId(null)
    setMenuId(null)
    loadInitial(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  function retryLoad() {
    setRetrying(true)
    loadInitial(filter)
  }

  async function loadMore() {
    if (!entries) return
    setError(null)
    setLoadingMore(true)
    try {
      const rows = await prayerService.list({
        answered: answeredForFilter(filter),
        limit: PAGE,
        offset: entries.length,
      })
      setEntries((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.id))
        return [...(prev ?? []), ...rows.filter((r) => !seen.has(r.id))]
      })
      setHasMore(rows.length === PAGE)
    } catch {
      setError(t('prayer.loadMoreError'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!body.trim()) return
    setSubmitting(true)
    try {
      // Stats are best-effort and sit outside the create: a getStats failure must not
      // surface "could not save" for a prayer that did save (which provokes a re-tap
      // and a duplicate, since create carries no idempotency token).
      const before = await dashboardService.getStats().catch(() => ZERO_STATS)
      const created = await prayerService.create({ body: body.trim() })
      // A new prayer is always "open", so only show it when the filter includes open ones.
      if (filter !== 'answered') setEntries((prev) => [created, ...(prev ?? [])])
      setBody('')
      setComposing(false)
      // Itemized XP: the prayer entry + any streak bonus it just completed. Post-save
      // stats are best-effort too — fall back to `before` (zero gain) on failure.
      const after = await dashboardService.getStats().catch(() => before)
      const bd = buildXpBreakdown(before, after, t('prayer.activityLabel'), Feather)
      setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
    } catch {
      setError(t('prayer.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(p: Prayer) {
    setEditingId(p.id)
    setEditBody(p.body)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBody('')
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return
    setSavingEdit(true)
    setError(null)
    try {
      const updated = await prayerService.update(id, { body: editBody.trim() })
      setEntries((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? null)
      cancelEdit()
      showToast(t('prayer.updated'))
    } catch {
      setError(t('prayer.updateError'))
    } finally {
      setSavingEdit(false)
    }
  }

  // Toggle answered on/off. Under the "open"/"answered" filters the entry falls out of
  // the current list, so drop it there; under "all" it stays and just re-styles.
  async function toggleAnswered(p: Prayer) {
    setAnsweringId(p.id)
    setError(null)
    const nextAnswered = p.answered_at === null
    try {
      const updated = await prayerService.update(p.id, { answered: nextAnswered })
      setEntries((prev) => {
        if (!prev) return prev
        if (filter === 'all') return prev.map((x) => (x.id === p.id ? updated : x))
        return prev.filter((x) => x.id !== p.id)
      })
    } catch {
      setError(t('prayer.answerError'))
    } finally {
      setAnsweringId(null)
    }
  }

  const handleDelete = useUndoableDelete<Prayer>({
    list: entries,
    setList: setEntries,
    getId: (p) => p.id,
    remove: (id) => prayerService.remove(id),
    messages: {
      success: t('prayer.deleted'),
      error: t('prayer.deleteError'),
    },
    onStart: () => setError(null),
  })

  // The composer expands once you focus it or have text; collapses back when empty.
  const composerOpen = composing || body.trim().length > 0

  const emptyMessage =
    filter === 'open'
      ? t('prayer.emptyOpen')
      : filter === 'answered'
        ? t('prayer.emptyAnswered')
        : t('prayer.empty')

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('prayer.title')}</h1>
        <p className="page-subtitle">{t('prayer.subtitle')}</p>
      </header>

      <section className="journal-compose">
        <form onSubmit={handleSubmit} noValidate>
          <textarea
            id="body"
            aria-label={t('prayer.composerAria')}
            rows={composerOpen ? 4 : 2}
            value={body}
            maxLength={5000}
            onFocus={() => setComposing(true)}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('prayer.composerPlaceholder')}
          />
          {composerOpen && (
            <>
              <ErrorBanner message={error} />
              <button type="submit" disabled={submitting || !body.trim()}>
                {submitting ? t('common.saving') : t('prayer.save')}
              </button>
            </>
          )}
        </form>
      </section>

      <section className="journal-list">
        <div className="journal-list-head">
          <h2 className="journal-list-title">{t('prayer.pastTitle')}</h2>
        </div>

        <div className="prayer-filter" role="group" aria-label={t('prayer.filterAria')}>
          {FILTERS.map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                className={`selectable prayer-filter-tab${active ? ' selected' : ''}`}
                aria-pressed={active}
                onClick={() => setFilter(f)}
              >
                {t(`prayer.filter.${f}`)}
              </button>
            )
          })}
        </div>

        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        {entries === null && !loadError && <Loading />}
        {entries && entries.length === 0 && <EmptyState>{emptyMessage}</EmptyState>}

        {entries?.map((p) => {
          const editing = editingId === p.id
          const answered = p.answered_at !== null
          return (
            <article
              key={p.id}
              className={`journal-entry prayer-entry${answered ? ' prayer-entry--answered' : ''}`}
            >
              <div className="journal-entry-head">
                <span className="muted">{formatWhen(p.created_at)}</span>
                {!editing && answered && p.answered_at && (
                  <span className="prayer-answered-badge">
                    <Check size={13} strokeWidth={2} aria-hidden="true" />
                    {t('prayer.answeredOn', { date: formatDay(p.answered_at) })}
                  </span>
                )}
                {!editing && (
                  <span className="journal-entry-actions" id={`menu-${p.id}`}>
                    <button
                      type="button"
                      className="prayer-answer-toggle"
                      disabled={answeringId === p.id}
                      onClick={() => toggleAnswered(p)}
                    >
                      {answered ? (
                        <>
                          <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
                          {t('prayer.reopen')}
                        </>
                      ) : (
                        <>
                          <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                          {t('prayer.markAnswered')}
                        </>
                      )}
                    </button>
                    {menuId === p.id && (
                      <>
                        <button
                          type="button"
                          className="link-neutral"
                          onClick={() => {
                            startEdit(p)
                            setMenuId(null)
                          }}
                        >
                          {t('prayer.edit')}
                        </button>
                        <button
                          type="button"
                          className="link-danger"
                          onClick={() => {
                            handleDelete(p.id)
                            setMenuId(null)
                          }}
                        >
                          {t('prayer.delete')}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="journal-entry-menu"
                      aria-label={t('prayer.entryActions')}
                      aria-expanded={menuId === p.id}
                      aria-controls={`menu-${p.id}`}
                      onClick={() => setMenuId(menuId === p.id ? null : p.id)}
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
                    aria-label={t('prayer.editBodyAria')}
                  />
                  <div className="journal-edit-actions">
                    <button
                      type="button"
                      onClick={() => saveEdit(p.id)}
                      disabled={savingEdit || !editBody.trim()}
                    >
                      {savingEdit ? t('common.saving') : t('prayer.editSave')}
                    </button>
                    <button type="button" className="link-neutral" onClick={cancelEdit}>
                      {t('prayer.editCancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="journal-body">{p.body}</p>
              )}
            </article>
          )
        })}
        {hasMore && (
          <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('prayer.loadMore')}
          </button>
        )}
      </section>

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          autoDismissMs={6000}
          onClose={() => setReward(null)}
        />
      )}
    </main>
  )
}
