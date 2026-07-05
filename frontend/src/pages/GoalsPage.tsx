import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { goalService } from '../services/goals'
import { ACTIVITY_COLORS, ACTIVITY_META, type ActivityIcon } from '../lib/colors'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { t as translate, useT } from '../i18n'
import type { Goal, GoalActivity, GoalPeriod, GoalStatus } from '../types'

// Goal-form labels differ from the shared canonical ones where the goals context
// reads better ("Write gratitude", "Custom habit…"); the icon/colour come from
// the shared ACTIVITY_META so they never drift. Labels are i18n keys resolved at
// render time so the form + cards re-label live on a locale switch.
const GOAL_LABEL_KEYS: Record<GoalActivity, string> = {
  meditate: 'tracking.goals.activity.meditate',
  breathe: 'tracking.goals.activity.breathe',
  gratitude: 'tracking.goals.activity.gratitude',
  journal: 'tracking.goals.activity.journal',
  custom: 'tracking.goals.activity.custom',
}
// Single source for a goal's display icon+label so the form dropdown and the
// cards cannot drift. Custom goals show the user's own label when one is given.
// `icon` is the shared lucide line-icon component (no system emoji).
function goalDisplay(activity: GoalActivity, label?: string | null): { icon: ActivityIcon; label: string } {
  return {
    icon: ACTIVITY_META[activity].icon,
    label: activity === 'custom' && label ? label : translate(GOAL_LABEL_KEYS[activity]),
  }
}

// The activity order for the form dropdown; labels are resolved at render time.
const ACTIVITY_KEYS: GoalActivity[] = ['meditate', 'breathe', 'gratitude', 'journal', 'custom']

// Cadence presets — the only "target" is how often, not a number to type. Each
// carries its i18n label key (resolved at render) alongside its count + period.
const CADENCES: { labelKey: string; count: number; period: GoalPeriod }[] = [
  { labelKey: 'tracking.goals.cadence.daily', count: 1, period: 'day' },
  { labelKey: 'tracking.goals.cadence.twiceDaily', count: 2, period: 'day' },
  { labelKey: 'tracking.goals.cadence.thriceDaily', count: 3, period: 'day' },
  { labelKey: 'tracking.goals.cadence.weekly', count: 1, period: 'week' },
  { labelKey: 'tracking.goals.cadence.thriceWeekly', count: 3, period: 'week' },
  { labelKey: 'tracking.goals.cadence.fiveWeekly', count: 5, period: 'week' },
  { labelKey: 'tracking.goals.cadence.total25', count: 25, period: 'total' },
  { labelKey: 'tracking.goals.cadence.total50', count: 50, period: 'total' },
  { labelKey: 'tracking.goals.cadence.total100', count: 100, period: 'total' },
]

function cadenceLabel(count: number, period: GoalPeriod): string {
  if (period === 'total') return translate('tracking.goals.cadence.totalN', { count })
  const times =
    count === 1
      ? translate('tracking.goals.cadence.once')
      : count === 2
        ? translate('tracking.goals.cadence.twice')
        : translate('tracking.goals.cadence.nTimes', { count })
  return period === 'day'
    ? translate('tracking.goals.cadence.perDay', { times })
    : translate('tracking.goals.cadence.perWeek', { times })
}

export default function GoalsPage() {
  const { t } = useT()
  const { showToast } = useToast()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState<string | null>(null) // create-goal form errors
  const [actionError, setActionError] = useState<string | null>(null) // check-in/archive/delete errors
  const [loadError, setLoadError] = useState<string | null>(null) // the goals list failing
  const [retrying, setRetrying] = useState(false)
  const [view, setView] = useState<GoalStatus>('active')

  const [activity, setActivity] = useState<GoalActivity>('meditate')
  const [label, setLabel] = useState('') // the habit name, for custom goals
  const [cadenceIdx, setCadenceIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  function load(status: GoalStatus, ignored?: () => boolean) {
    setGoals(null)
    goalService
      .list(status)
      .then((g) => {
        if (ignored?.()) return
        setGoals(g)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignored?.()) setLoadError(messageForError(err, t('tracking.goals.loadError')))
      })
      .finally(() => {
        if (!ignored?.()) setRetrying(false)
      })
  }

  useEffect(() => {
    // Guard against a previous tab's response landing under the current tab.
    let ignore = false
    load(view, () => ignore)
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function retryLoad() {
    setRetrying(true)
    load(view)
  }

  const isCustom = activity === 'custom'
  const trimmedLabel = label.trim()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (isCustom && !trimmedLabel) {
      setError(t('tracking.goals.needName'))
      return
    }
    const cadence = CADENCES[cadenceIdx]
    setSubmitting(true)
    try {
      const created = await goalService.create({
        activity,
        period: cadence.period,
        count: cadence.count,
        ...(isCustom ? { label: trimmedLabel } : {}),
      })
      if (view === 'active') setGoals((prev) => [created, ...(prev ?? [])])
      showToast(t('tracking.goals.created'))
      if (isCustom) setLabel('')
    } catch {
      setError(t('tracking.goals.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleCheckin(goal: Goal) {
    setActionError(null)
    try {
      const updated = goal.checked_in_today
        ? await goalService.undoCheckIn(goal.id)
        : await goalService.checkIn(goal.id)
      setGoals((prev) => prev?.map((g) => (g.id === updated.id ? updated : g)) ?? null)
      showToast(updated.checked_in_today ? t('tracking.goals.checkedIn') : t('tracking.goals.undone'))
    } catch {
      setActionError(t('tracking.goals.checkinError'))
    }
  }

  async function archive(id: string, status: GoalStatus) {
    setActionError(null)
    try {
      await goalService.setStatus(id, status)
      setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)
      showToast(status === 'archived' ? t('tracking.goals.archived') : t('tracking.goals.reactivated'))
    } catch {
      setActionError(t('tracking.goals.statusError'))
    }
  }

  const remove = useUndoableDelete<Goal>({
    list: goals,
    setList: setGoals,
    getId: (g) => g.id,
    remove: (id) => goalService.remove(id),
    messages: { success: t('tracking.goals.deleted'), error: t('tracking.goals.deleteError') },
    onStart: () => setActionError(null),
  })

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('tracking.goals.title')}</h1>
        <p className="page-subtitle">{t('tracking.goals.subtitle')}</p>
      </header>

      {view === 'active' && (
        <section className="goal-compose">
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="activity">{t('tracking.goals.iWantTo')}</label>
            <select
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value as GoalActivity)}
            >
              {ACTIVITY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {goalDisplay(key).label}
                </option>
              ))}
            </select>

            {isCustom && (
              <>
                <label htmlFor="habit-name">{t('tracking.goals.habitName')}</label>
                <input
                  id="habit-name"
                  type="text"
                  value={label}
                  maxLength={40}
                  placeholder={t('tracking.goals.habitPlaceholder')}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </>
            )}

            <label htmlFor="cadence">{t('tracking.goals.howOften')}</label>
            <select
              id="cadence"
              value={cadenceIdx}
              onChange={(e) => setCadenceIdx(Number(e.target.value))}
            >
              {CADENCES.map((c, i) => (
                <option key={c.labelKey} value={i}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>

            <ErrorBanner message={error} />
            <button type="submit" disabled={submitting}>
              {submitting ? t('tracking.goals.adding') : t('tracking.goals.add')}
            </button>
          </form>
        </section>
      )}

      <div className="goal-tabs">
        <button
          type="button"
          className={view === 'active' ? 'goal-tab active' : 'goal-tab'}
          onClick={() => setView('active')}
        >
          {t('tracking.goals.tabActive')}
        </button>
        <button
          type="button"
          className={view === 'archived' ? 'goal-tab active' : 'goal-tab'}
          onClick={() => setView('archived')}
        >
          {t('tracking.goals.tabArchived')}
        </button>
      </div>

      <section className="goal-list">
        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        <ErrorBanner message={actionError} />
        {goals === null && !loadError && <Loading />}
        {goals && goals.length === 0 && (
          <EmptyState>
            {view === 'active'
              ? t('tracking.goals.emptyActive')
              : t('tracking.goals.emptyArchived')}
          </EmptyState>
        )}
        {goals?.map((g) => {
          const display = goalDisplay(g.activity, g.label)
          const GoalIcon = display.icon
          const when =
            g.period === 'day'
              ? t('tracking.goals.when.today')
              : g.period === 'week'
                ? t('tracking.goals.when.week')
                : t('tracking.goals.when.total')
          const isCustomGoal = g.activity === 'custom'
          return (
            <article
              key={g.id}
              className="goal-card"
              style={{ ['--activity-accent' as string]: ACTIVITY_COLORS[g.activity] }}
            >
              <div className="goal-card-head">
                <strong>
                  <GoalIcon size={16} strokeWidth={1.75} aria-hidden="true" /> {display.label}
                </strong>
                <span className="goal-cadence">{cadenceLabel(g.count, g.period)}</span>
                {g.achieved && <span className="goal-achieved">{t('tracking.goals.done')}</span>}
              </div>
              <div
                className="goal-bar"
                role="progressbar"
                aria-label={t('tracking.goals.progressAria')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(g.progress * 100)}
              >
                <div
                  className={g.achieved ? 'goal-bar-fill done' : 'goal-bar-fill'}
                  style={{ width: `${Math.round(g.progress * 100)}%` }}
                />
              </div>
              <div className="goal-card-meta muted">
                {t('tracking.goals.meta', { done: g.done, count: g.count, when })}
                {/* Built-in activities count automatically from practice — say so, or a user
                    hunts for the check-in button that only custom habits have. */}
                {!isCustomGoal && <span className="goal-auto-note">{t('tracking.goals.autoNote')}</span>}
              </div>
              {isCustomGoal && g.status === 'active' && (
                <button
                  type="button"
                  className={g.checked_in_today ? 'goal-checkin done' : 'goal-checkin'}
                  onClick={() => toggleCheckin(g)}
                >
                  {g.checked_in_today ? t('tracking.goals.doneToday') : t('tracking.goals.markDone')}
                </button>
              )}
              <div className="goal-card-actions">
                {g.status === 'active' ? (
                  <button type="button" className="link-neutral" onClick={() => archive(g.id, 'archived')}>
                    {t('tracking.goals.archive')}
                  </button>
                ) : (
                  <button type="button" className="link-neutral" onClick={() => archive(g.id, 'active')}>
                    {t('tracking.goals.reactivate')}
                  </button>
                )}
                <button type="button" className="link-danger" onClick={() => remove(g.id)}>
                  {t('tracking.goals.delete')}
                </button>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
