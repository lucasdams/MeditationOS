import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { goalService } from '../services/goals'
import { ACTIVITY_COLORS, ACTIVITY_META } from '../lib/colors'
import { useToast } from '../context/ToastContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { Goal, GoalActivity, GoalPeriod, GoalStatus } from '../types'

// Goal-form labels differ from the shared canonical ones where the goals context
// reads better ("Write gratitude", "Custom habit…"); the emoji/colour come from
// the shared ACTIVITY_META so they never drift.
const GOAL_LABELS: Record<GoalActivity, string> = {
  meditate: 'Meditate',
  breathe: 'Breathe',
  gratitude: 'Write gratitude',
  journal: 'Journal',
  custom: 'Custom habit…',
}
// Single source for a goal's display emoji+label so the form dropdown and the
// cards cannot drift. Custom goals show the user's own label when one is given.
function goalDisplay(activity: GoalActivity, label?: string | null): { emoji: string; label: string } {
  return {
    emoji: ACTIVITY_META[activity].emoji,
    label: activity === 'custom' && label ? label : GOAL_LABELS[activity],
  }
}

const ACTIVITIES: { key: GoalActivity; label: string; emoji: string }[] = (
  ['meditate', 'breathe', 'gratitude', 'journal', 'custom'] as const
).map((key) => ({ key, ...goalDisplay(key) }))

// Cadence presets — the only "target" is how often, not a number to type.
const CADENCES: { label: string; count: number; period: GoalPeriod }[] = [
  { label: 'Once a day', count: 1, period: 'day' },
  { label: 'Twice a day', count: 2, period: 'day' },
  { label: '3× a day', count: 3, period: 'day' },
  { label: 'Once a week', count: 1, period: 'week' },
  { label: '3× a week', count: 3, period: 'week' },
  { label: '5× a week', count: 5, period: 'week' },
  { label: '25 times total', count: 25, period: 'total' },
  { label: '50 times total', count: 50, period: 'total' },
  { label: '100 times total', count: 100, period: 'total' },
]

function cadenceLabel(count: number, period: GoalPeriod): string {
  if (period === 'total') return `${count} times total`
  const times = count === 1 ? 'Once' : count === 2 ? 'Twice' : `${count}×`
  return `${times} a ${period}`
}

export default function GoalsPage() {
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
        if (!ignored?.()) setLoadError(messageForError(err, "Couldn't load your goals."))
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
      setError('Give your custom habit a name.')
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
      showToast('Habit set. Now just keep showing up.')
      if (isCustom) setLabel('')
    } catch {
      setError("Couldn't create that goal.")
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
      showToast(updated.checked_in_today ? 'Done for today. ✓' : 'Undone — no harm.')
    } catch {
      setActionError("Couldn't update that check-in.")
    }
  }

  async function archive(id: string, status: GoalStatus) {
    setActionError(null)
    try {
      await goalService.setStatus(id, status)
      setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)
      showToast(status === 'archived' ? 'Tucked away.' : 'Back in rotation.')
    } catch {
      setActionError("Couldn't update that goal.")
    }
  }

  const remove = useUndoableDelete<Goal>({
    list: goals,
    setList: setGoals,
    getId: (g) => g.id,
    remove: (id) => goalService.remove(id),
    messages: { success: 'Goal deleted.', error: "Couldn't delete that goal." },
    onStart: () => setActionError(null),
  })

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Goals</h1>
        <p className="page-subtitle">Pick a habit and a cadence, then check in as you practice.</p>
      </header>

      {view === 'active' && (
        <section className="goal-compose">
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="activity">I want to…</label>
            <select
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value as GoalActivity)}
            >
              {ACTIVITIES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.emoji} {a.label}
                </option>
              ))}
            </select>

            {isCustom && (
              <>
                <label htmlFor="habit-name">Habit name</label>
                <input
                  id="habit-name"
                  type="text"
                  value={label}
                  maxLength={40}
                  placeholder="e.g. Gym, Read, Stretch"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </>
            )}

            <label htmlFor="cadence">How often?</label>
            <select
              id="cadence"
              value={cadenceIdx}
              onChange={(e) => setCadenceIdx(Number(e.target.value))}
            >
              {CADENCES.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label}
                </option>
              ))}
            </select>

            <ErrorBanner message={error} />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add goal'}
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
          Active
        </button>
        <button
          type="button"
          className={view === 'archived' ? 'goal-tab active' : 'goal-tab'}
          onClick={() => setView('archived')}
        >
          Archived
        </button>
      </div>

      <section className="goal-list">
        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        <ErrorBanner message={actionError} />
        {goals === null && !loadError && <Loading />}
        {goals && goals.length === 0 && (
          <EmptyState>
            {view === 'active'
              ? 'No habits yet. Pick one and a rhythm — small and repeatable beats grand.'
              : 'No archived goals.'}
          </EmptyState>
        )}
        {goals?.map((g) => {
          const display = goalDisplay(g.activity, g.label)
          const when = g.period === 'day' ? 'today' : g.period === 'week' ? 'this week' : 'all-time'
          const isCustomGoal = g.activity === 'custom'
          return (
            <article
              key={g.id}
              className="goal-card"
              style={{ ['--activity-accent' as string]: ACTIVITY_COLORS[g.activity] }}
            >
              <div className="goal-card-head">
                <strong>
                  {display.emoji} {display.label}
                </strong>
                <span className="goal-cadence">{cadenceLabel(g.count, g.period)}</span>
                {g.achieved && <span className="goal-achieved">✓ Done</span>}
              </div>
              <div
                className="goal-bar"
                role="progressbar"
                aria-label="Goal progress"
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
                {g.done} / {g.count} {when}
              </div>
              {isCustomGoal && g.status === 'active' && (
                <button
                  type="button"
                  className={g.checked_in_today ? 'goal-checkin done' : 'goal-checkin'}
                  onClick={() => toggleCheckin(g)}
                >
                  {g.checked_in_today ? '✓ Done today (tap to undo)' : 'Mark done today'}
                </button>
              )}
              <div className="goal-card-actions">
                {g.status === 'active' ? (
                  <button type="button" className="link-neutral" onClick={() => archive(g.id, 'archived')}>
                    Archive
                  </button>
                ) : (
                  <button type="button" className="link-neutral" onClick={() => archive(g.id, 'active')}>
                    Reactivate
                  </button>
                )}
                <button type="button" className="link-danger" onClick={() => remove(g.id)}>
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
