import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import type { MeditationType } from '../types'

// The meditation style picker was dropped; only the structural meditation-vs-breathing
// distinction remains, so a past breathing session can still be logged here.
const TYPES: { value: MeditationType; label: string; emoji: string; tint: string }[] = [
  { value: 'mindfulness', label: 'Meditation', emoji: '🧘', tint: '#ccfbf1' },
  { value: 'resonance_breathing', label: 'Breathing', emoji: '🫁', tint: '#e0f2fe' },
]

// Quick-pick durations (minutes). A "Custom" option appears after these chips.
const DURATION_CHIPS = [5, 10, 15, 20, 30, 45, 60]

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
  const [customMinutes, setCustomMinutes] = useState('')
  const [occurredAt, setOccurredAt] = useState(nowLocal())
  const [notes, setNotes] = useState('')
  const [focus, setFocus] = useState('') // '' = not rated
  const [calm, setCalm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  // Whether the user is entering a custom duration (not one of the preset chips).
  const isCustom = !DURATION_CHIPS.map(String).includes(minutes)

  function pickDuration(min: number) {
    setMinutes(String(min))
    setCustomMinutes('')
  }

  function handleCustomMinutes(val: string) {
    setCustomMinutes(val)
    setMinutes(val)
  }

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
        focus: focus ? Number(focus) : null,
        calm: calm ? Number(calm) : null,
      })
      const after = await dashboardService.getStats()
      // True gain from the server, itemized (the session + any quest/streak bonus).
      const label = type === 'resonance_breathing' ? '🫁 Breathing' : '🧘 Meditation'
      const bd = buildXpBreakdown(before, after, label)
      setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
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
    <main className="dashboard log-session">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Log a session</h1>
        <p className="page-subtitle">
          Record a meditation or breathing sit you did away from the app.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        {/* Practice type — pattern-card style matching how Breathe presents choices */}
        <label>Practice</label>
        <div className="pattern-cards" role="group" aria-label="Practice type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`pattern-card${type === t.value ? ' selected' : ''}`}
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
            >
              <span
                className="pattern-card-icon"
                style={{ background: t.tint }}
                aria-hidden="true"
              >
                {t.emoji}
              </span>
              <span className="pattern-card-body">
                <span className="pattern-card-name">{t.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Duration — quick-pick chips + optional custom number input */}
        <label>Duration (minutes)</label>
        <div className="log-session-duration-chips" role="group" aria-label="Duration in minutes">
          {DURATION_CHIPS.map((min) => (
            <button
              key={min}
              type="button"
              className={`chip${!isCustom && minutes === String(min) ? ' chip-active' : ''}`}
              aria-pressed={!isCustom && minutes === String(min)}
              onClick={() => pickDuration(min)}
            >
              {min}
            </button>
          ))}
          <button
            type="button"
            className={`chip${isCustom ? ' chip-active' : ''}`}
            aria-pressed={isCustom}
            onClick={() => {
              setCustomMinutes(isCustom ? customMinutes : '')
              setMinutes('')
            }}
          >
            Custom
          </button>
        </div>
        {isCustom && (
          <input
            id="minutes"
            type="number"
            min="1"
            placeholder="e.g. 25"
            aria-label="Custom duration in minutes"
            value={customMinutes}
            onChange={(e) => handleCustomMinutes(e.target.value)}
            style={{ marginTop: '0.35rem' }}
          />
        )}

        {/* Date & time */}
        <label htmlFor="occurred">Date &amp; time</label>
        <input
          id="occurred"
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />

        {/* Focus rating — inline 1–5 buttons instead of a dropdown */}
        <label>Focus (optional)</label>
        <div className="log-session-rating" role="group" aria-label="Focus rating">
          <button
            type="button"
            className={`chip${focus === '' ? ' chip-active' : ''}`}
            aria-pressed={focus === ''}
            onClick={() => setFocus('')}
          >
            Not rated
          </button>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${focus === String(n) ? ' chip-active' : ''}`}
              aria-pressed={focus === String(n)}
              onClick={() => setFocus(String(n))}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Calm rating — inline 1–5 buttons instead of a dropdown */}
        <label>Calm (optional)</label>
        <div className="log-session-rating" role="group" aria-label="Calm rating">
          <button
            type="button"
            className={`chip${calm === '' ? ' chip-active' : ''}`}
            aria-pressed={calm === ''}
            onClick={() => setCalm('')}
          >
            Not rated
          </button>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${calm === String(n) ? ' chip-active' : ''}`}
              aria-pressed={calm === String(n)}
              onClick={() => setCalm(String(n))}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Notes */}
        <label htmlFor="notes">Notes (optional)</label>
        <textarea
          id="notes"
          value={notes}
          rows={3}
          placeholder="Anything notable about this sit…"
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

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          onClose={() => navigate('/timeline')}
        />
      )}
    </main>
  )
}
