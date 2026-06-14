import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { programService } from '../services/programs'
import { useToast } from '../context/ToastContext'
import type { Enrollment, ProgramSummary } from '../types'

const ACTIVITY_LINK: Record<string, string> = {
  meditate: '/meditate',
  breathe: '/breathe',
  gratitude: '/gratitude',
  journal: '/journal',
}

export default function ProgramsPage() {
  const { showToast } = useToast()
  const [catalog, setCatalog] = useState<ProgramSummary[] | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([programService.listCatalog(), programService.listEnrollments()])
      .then(([c, e]) => {
        setCatalog(c)
        setEnrollments(e)
      })
      .catch(() => setError('Could not load programs.'))
  }, [])

  async function start(key: string) {
    setBusy(key)
    try {
      await programService.enroll(key)
      setEnrollments(await programService.listEnrollments())
      showToast('Program started.')
    } catch {
      setError('Could not start that program.')
    } finally {
      setBusy(null)
    }
  }

  async function markDone(id: string) {
    setBusy(id)
    try {
      const updated = await programService.advance(id)
      setEnrollments((prev) => prev?.map((e) => (e.id === id ? updated : e)) ?? null)
      showToast(updated.completed ? 'Program complete! 🎉' : 'Day complete — nice.')
    } catch {
      setError('Could not update your progress.')
    } finally {
      setBusy(null)
    }
  }

  async function leave(id: string) {
    setBusy(id)
    try {
      await programService.leave(id)
      setEnrollments((prev) => prev?.filter((e) => e.id !== id) ?? null)
      showToast('Left the program.')
    } catch {
      setError('Could not leave that program.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="programs">
      <Link to="/">← Dashboard</Link>
      <h1>Programs</h1>
      <p className="muted">Guided multi-day plans — one short practice a day.</p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!catalog && !error && <p>Loading…</p>}

      {enrollments && enrollments.length > 0 && (
        <section>
          <h2>Your programs</h2>
          <ul className="program-list">
            {enrollments.map((e) => {
              const done = e.completed ? e.total_days : e.current_day - 1
              const pct = Math.round((done / e.total_days) * 100)
              return (
                <li key={e.id} className="program-enrollment">
                  <div className="program-head">
                    <strong>{e.title}</strong>
                    <span className="muted">
                      {e.completed ? 'Completed 🎉' : `Day ${e.current_day} of ${e.total_days}`}
                    </span>
                  </div>
                  <div className="program-bar">
                    <div className="program-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  {e.today && (
                    <div className="program-today">
                      <strong>{e.today.title}</strong>
                      <p className="muted">{e.today.detail}</p>
                      <div className="program-actions">
                        <Link className="program-do" to={ACTIVITY_LINK[e.today.activity] ?? '/'}>
                          Practice now
                        </Link>
                        <button type="button" disabled={busy === e.id} onClick={() => markDone(e.id)}>
                          Mark day done
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="program-leave"
                    disabled={busy === e.id}
                    onClick={() => leave(e.id)}
                  >
                    Leave program
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {catalog && (
        <section>
          <h2>Browse</h2>
          <ul className="program-list">
            {catalog.map((p) => (
              <li key={p.key} className="program-card">
                <div>
                  <strong>{p.title}</strong>{' '}
                  <span className="program-tag">{p.category}</span>
                  <p className="muted">{p.description}</p>
                  <p className="muted program-meta">{p.total_days} days</p>
                </div>
                <button type="button" disabled={busy === p.key} onClick={() => start(p.key)}>
                  {busy === p.key ? 'Starting…' : 'Start'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
