import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { goalService } from '../services/goals'
import { ACTIVITY_COLORS } from '../lib/colors'
import { useToast } from '../context/ToastContext'
import { usePendingDelete } from '../hooks/usePendingDelete'
import type { Goal, GoalActivity, GoalPeriod, GoalStatus } from '../types'

const ACTIVITIES: { key: GoalActivity; label: string; emoji: string }[] = [
  { key: 'meditate', label: 'Meditate', emoji: '🧘' },
  { key: 'breathe', label: 'Breathe', emoji: '🫁' },
  { key: 'gratitude', label: 'Write gratitude', emoji: '🙏' },
  { key: 'journal', label: 'Journal', emoji: '📓' },
  { key: 'custom', label: 'Custom habit…', emoji: '⭐' },
]
const ACTIVITY_META: Record<GoalActivity, { label: string; emoji: string }> = Object.fromEntries(
  ACTIVITIES.map((a) => [a.key, { label: a.label, emoji: a.emoji }]),
) as Record<GoalActivity, { label: string; emoji: string }>

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
  const { schedule, cancel } = usePendingDelete()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<GoalStatus>('active')

  const [activity, setActivity] = useState<GoalActivity>('meditate')
  const [label, setLabel] = useState('') // the habit name, for custom goals
  const [cadenceIdx, setCadenceIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  function load(status: GoalStatus) {
    setGoals(null)
    goalService
      .list(status)
      .then(setGoals)
      .catch(() => setError('Could not load your goals.'))
  }

  useEffect(() => {
    load(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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
      showToast('Goal created.')
      if (isCustom) setLabel('')
    } catch {
      setError('Could not create that goal.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleCheckin(goal: Goal) {
    setError(null)
    try {
      const updated = goal.checked_in_today
        ? await goalService.undoCheckIn(goal.id)
        : await goalService.checkIn(goal.id)
      setGoals((prev) => prev?.map((g) => (g.id === updated.id ? updated : g)) ?? null)
      showToast(updated.checked_in_today ? 'Marked done today.' : 'Check-in undone.')
    } catch {
      setError('Could not update that check-in.')
    }
  }

  async function archive(id: string, status: GoalStatus) {
    setError(null)
    try {
      await goalService.setStatus(id, status)
      setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)
      showToast(status === 'archived' ? 'Goal archived.' : 'Goal reactivated.')
    } catch {
      setError('Could not update that goal.')
    }
  }

  function remove(id: string) {
    if (!goals) return
    const index = goals.findIndex((g) => g.id === id)
    if (index === -1) return
    const item = goals[index]
    setError(null)
    // Optimistically remove now; the real delete fires only after the undo window.
    setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)

    const restore = () =>
      setGoals((cur) => {
        if (!cur || cur.some((g) => g.id === id)) return cur
        const next = [...cur]
        next.splice(Math.min(index, next.length), 0, item)
        return next
      })

    schedule(id, () => {
      goalService.remove(id).catch(() => {
        restore()
        showToast('Could not delete that goal.', 'error')
      })
    })
    showToast('Goal deleted.', 'success', {
      label: 'Undo',
      onClick: () => {
        if (cancel(id)) restore()
      },
    })
  }

  return (
    <main className="dashboard">
      <header>
        <h1>Goals</h1>
      </header>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>

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

            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
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
        {goals === null && !error && <p>Loading…</p>}
        {goals && goals.length === 0 && (
          <p className="muted">
            {view === 'active'
              ? 'No active goals yet. Pick an activity and how often to build a habit.'
              : 'No archived goals.'}
          </p>
        )}
        {goals?.map((g) => {
          const meta = ACTIVITY_META[g.activity]
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
                  {meta.emoji} {isCustomGoal ? g.label : meta.label}
                </strong>
                <span className="goal-cadence">{cadenceLabel(g.count, g.period)}</span>
                {g.achieved && <span className="goal-achieved">✓ Done</span>}
              </div>
              <div className="goal-bar">
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
