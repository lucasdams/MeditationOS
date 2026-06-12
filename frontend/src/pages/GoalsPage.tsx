import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { goalService } from '../services/goals'
import type { Goal, GoalStatus, GoalType } from '../types'

const GOAL_META: Record<GoalType, { label: string; unit: string; hint: string }> = {
  daily_minutes: { label: 'Daily minutes', unit: 'min today', hint: 'Minutes of practice today' },
  streak_days: { label: 'Streak', unit: 'days', hint: 'Consecutive days practiced' },
  total_hours: { label: 'Total hours', unit: 'hours', hint: 'Lifetime hours of practice' },
}

const GOAL_TYPES: GoalType[] = ['daily_minutes', 'streak_days', 'total_hours']

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<GoalStatus>('active')

  const [type, setType] = useState<GoalType>('daily_minutes')
  const [target, setTarget] = useState('10')
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
    const n = Number(target)
    if (!Number.isInteger(n) || n <= 0) {
      setError('Target must be a whole number greater than 0.')
      return
    }
    setSubmitting(true)
    try {
      const created = await goalService.create({ type, target: n })
      if (view === 'active') setGoals((prev) => [created, ...(prev ?? [])])
      setTarget('10')
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
            <label htmlFor="type">Goal</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GOAL_META[t].label}
                </option>
              ))}
            </select>
            <label htmlFor="target">Target ({GOAL_META[type].unit})</label>
            <input
              id="target"
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <small>{GOAL_META[type].hint}</small>
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
              ? 'No active goals yet. Set one above to give yourself something to aim at.'
              : 'No archived goals.'}
          </p>
        )}
        {goals?.map((g) => {
          const meta = GOAL_META[g.type]
          return (
            <article key={g.id} className="goal-card">
              <div className="goal-card-head">
                <strong>{meta.label}</strong>
                <span className="muted">
                  {g.current} / {g.target} {meta.unit}
                </span>
                {g.achieved && <span className="goal-achieved">✓ Achieved</span>}
              </div>
              <div className="goal-bar">
                <div
                  className={g.achieved ? 'goal-bar-fill done' : 'goal-bar-fill'}
                  style={{ width: `${Math.round(g.progress * 100)}%` }}
                />
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
