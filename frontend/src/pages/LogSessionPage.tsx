import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { newlyCompletedQuests } from '../lib/quests'
import RewardOverlay from '../components/RewardOverlay'
import type { MeditationType } from '../types'

const TYPES: { value: MeditationType; label: string }[] = [
  { value: 'mindfulness', label: 'Mindfulness' },
  { value: 'body_scan', label: 'Body scan' },
  { value: 'walking', label: 'Walking' },
  { value: 'loving_kindness', label: 'Loving-kindness' },
  { value: 'resonance_breathing', label: 'Resonance breathing' },
  { value: 'other', label: 'Other' },
]

// Local "now" formatted for a <input type="datetime-local"> (YYYY-MM-DDThh:mm).
const nowLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function LogSessionPage() {
  const navigate = useNavigate()
  const [type, setType] = useState<MeditationType>('mindfulness')
  const [minutes, setMinutes] = useState('10')
  const [occurredAt, setOccurredAt] = useState(nowLocal())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    quests: string[]
  } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const mins = Number(minutes)
    if (!Number.isFinite(mins) || mins <= 0) {
      setError('Duration must be a positive number of minutes.')
      return
    }
    if (!occurredAt) {
      setError('Please choose a date and time.')
      return
    }

    setSubmitting(true)
    try {
      const before = await dashboardService.getStats()
      await sessionService.create({
        type,
        duration_seconds: Math.round(mins * 60),
        occurred_at: occurredAt,
        notes: notes.trim() || null,
      })
      const after = await dashboardService.getStats()
      // True gain from the server (XP weighting + any daily-quest/streak bonus).
      setReward({
        afterXp: after.xp,
        xpGained: Math.max(0, after.xp - before.xp),
        quests: newlyCompletedQuests(before, after),
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Could not save the session. Please try again.'
          : 'Something went wrong.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-card">
      <h1>Log a session</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="type">Type</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value as MeditationType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="minutes">Duration (minutes)</label>
        <input
          id="minutes"
          type="number"
          min="1"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />

        <label htmlFor="occurred">Date &amp; time</label>
        <input
          id="occurred"
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />

        <label htmlFor="notes">Notes (optional)</label>
        <textarea
          id="notes"
          value={notes}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save session'}
        </button>
      </form>
      <p>
        <Link to="/">Back to dashboard</Link>
      </p>

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          questsCompleted={reward.quests}
          onClose={() => navigate('/sessions')}
        />
      )}
    </main>
  )
}
