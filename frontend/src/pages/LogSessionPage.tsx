import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import RatingChips from '../components/RatingChips'
import { ErrorBanner } from '../components/StateViews'
import { newClientToken } from '../lib/sessionDraft'
import type { DashboardStats, MeditationType } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

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

  // Stable per-form-load token so retries after a transient error de-dupe server-side
  // (the backend collapses duplicate client_token values to a single session).
  const clientTokenRef = useRef<string>(newClientToken())

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

    // Pre-save stats are best-effort; a failure here should not block the save.
    const before = await dashboardService.getStats().catch(() => ZERO_STATS)

    // The save itself — this must succeed.
    try {
      await sessionService.create({
        type,
        duration_seconds: Math.round(mins * 60),
        // The picker holds a tz-naive local "YYYY-MM-DDThh:mm"; send a tz-aware ISO
        // string so the backend (which treats naive as UTC) buckets the session on the
        // user's local day, matching MeditatePage / BiometricCapture.
        occurred_at: new Date(occurredAt).toISOString(),
        notes: notes.trim() || null,
        focus: focus ? Number(focus) : null,
        calm: calm ? Number(calm) : null,
        // Stable per-load token so a retry after a transient error won't create a
        // duplicate session (the backend collapses by client_token).
        client_token: clientTokenRef.current,
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Could not save the session. Please try again.'
          : 'Something went wrong.',
      )
      setSubmitting(false)
      return
    }

    // Post-save stats are best-effort: the session is already saved, so a getStats
    // failure must not report a save error or skip the reward overlay.
    const after = await dashboardService.getStats().catch(() => before)
    // True gain from the server, itemized (the session + any quest/streak bonus).
    const label = type === 'resonance_breathing' ? '🫁 Breathing' : '🧘 Meditation'
    const bd = buildXpBreakdown(before, after, label)
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
    setSubmitting(false)
  }

  return (
    <main id="main-content" className="dashboard log-session">
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
              className={`selectable pattern-card${type === t.value ? ' selected' : ''}`}
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
        <RatingChips ariaLabel="Focus rating" value={focus} onChange={setFocus} />

        {/* Calm rating — inline 1–5 buttons instead of a dropdown */}
        <label>Calm (optional)</label>
        <RatingChips ariaLabel="Calm rating" value={calm} onChange={setCalm} />

        {/* Notes */}
        <label htmlFor="notes">Notes (optional)</label>
        <textarea
          id="notes"
          value={notes}
          rows={3}
          maxLength={2000}
          placeholder="Anything notable about this sit…"
          onChange={(e) => setNotes(e.target.value)}
        />

        <ErrorBanner message={error} />

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
