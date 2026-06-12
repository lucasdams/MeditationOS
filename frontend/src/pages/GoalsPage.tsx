import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { goalService } from '../services/goals'
import type { Goal, GoalActivity, GoalPeriod, GoalStatus } from '../types'

const ACTIVITIES: { key: GoalActivity; label: string; emoji: string }[] = [
  { key: 'meditate', label: 'Meditate', emoji: '🧘' },
  { key: 'breathe', label: 'Breathe', emoji: '🫁' },
  { key: 'gratitude', label: 'Write gratitude', emoji: '🙏' },
  { key: 'journal', label: 'Journal', emoji: '📓' },
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
]

function cadenceLabel(count: number, period: GoalPeriod): string {
  const times = count === 1 ? 'Once' : count === 2 ? 'Twice' : `${count}×`
  return `${times} a ${period}`
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<GoalStatus>('active')

  const [activity, setActivity] = useState<GoalActivity>('meditate')
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const cadence = CADENCES[cadenceIdx]
    setSubmitting(true)
    try {
      const created = await goalService.create({
        activity,
        period: cadence.period,
        count: cadence.count,
      })
      if (view === 'active') setGoals((prev) => [created, ...(prev ?? [])])
    } catch {
      setError('Could not create that goal.')
    } finally {
      setSubmitting(false)
    }
  }

  async function archive(id: string, status: GoalStatus) {
    setError(null)
    try {
      await goalService.setStatus(id, status)
      setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)
    } catch {
      setError('Could not update that goal.')
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await goalService.remove(id)
      setGoals((prev) => prev?.filter((g) => g.id !== id) ?? null)
    } catch {
      setError('Could not delete that goal.')
    }
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
          const when = g.period === 'day' ? 'today' : 'this week'
          return (
            <article key={g.id} className="goal-card">
              <div className="goal-card-head">
                <strong>
                  {meta.emoji} {meta.label}
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
              <div className="goal-card-actions">
                {g.status === 'active' ? (
                  <button type="button" className="link-danger" onClick={() => archive(g.id, 'archived')}>
                    Archive
                  </button>
                ) : (
                  <button type="button" className="link-danger" onClick={() => archive(g.id, 'active')}>
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
