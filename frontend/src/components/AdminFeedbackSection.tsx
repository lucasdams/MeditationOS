import { useEffect, useState } from 'react'
import { adminService } from '../services/admin'
import type { AdminFeedback } from '../services/feedback'

/** Admin-only inbox of the in-app feedback users have sent. */
export default function AdminFeedbackSection() {
  const [entries, setEntries] = useState<AdminFeedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminService
      .listFeedback({ limit: 50 })
      .then((r) => setEntries(r.entries))
      .catch(() => setError('Could not load feedback.'))
  }, [])

  return (
    <section className="analytics-section">
      <h2>Feedback inbox</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {entries === null && !error && <p className="muted">Loading…</p>}
      {entries !== null && entries.length === 0 && <p className="muted">No feedback yet.</p>}
      {entries && entries.length > 0 && (
        <ul className="admin-feedback-list">
          {entries.map((f) => (
            <li key={f.id} className="admin-feedback-item">
              <div className="admin-feedback-meta">
                <span className={`admin-feedback-cat admin-feedback-cat--${f.category}`}>
                  {f.category}
                </span>
                <span className="muted">{f.email ?? 'anonymous'}</span>
                {f.path && <span className="muted">· {f.path}</span>}
                <span className="muted">· {new Date(f.created_at).toLocaleString()}</span>
              </div>
              <p className="admin-feedback-msg">{f.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
