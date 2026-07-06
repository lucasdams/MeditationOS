import { useRef, useState, type ComponentType, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Wind, Sun, type LucideProps } from 'lucide-react'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import RatingChips from '../components/RatingChips'
import { ErrorBanner } from '../components/StateViews'
import { newClientToken } from '../lib/sessionDraft'
import { toDatetimeLocal } from '../lib/format'
import { dailySuggestion } from '../lib/intentionPrompts'
import { useT } from '../i18n'
import type { DashboardStats, MeditationType } from '../types'

// Pre-session intention cap — mirrors the backend (INTENTION_MAX_LENGTH = 140).
const INTENTION_MAX = 140

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// The meditation style picker was dropped; only the structural meditation-vs-breathing
// distinction remains, so a past breathing session can still be logged here. Labels are
// i18n keys resolved at render time so the picker re-labels live on a locale switch.
const TYPES: {
  value: MeditationType
  labelKey: string
  Icon: ComponentType<LucideProps>
  tint: string
}[] = [
  { value: 'mindfulness', labelKey: 'tracking.logSession.type.meditation', Icon: Brain, tint: '#ccfbf1' },
  { value: 'resonance_breathing', labelKey: 'tracking.logSession.type.breathing', Icon: Wind, tint: '#e0f2fe' },
  { value: 'energizing_breathing', labelKey: 'tracking.logSession.type.energizing', Icon: Sun, tint: '#fef3c7' },
]

// Quick-pick durations (minutes). A "Custom" option appears after these chips.
const DURATION_CHIPS = [5, 10, 15, 20, 30, 45, 60]

// Local "now" formatted for a <input type="datetime-local"> (YYYY-MM-DDThh:mm).
const nowLocal = () => toDatetimeLocal(new Date())

export default function LogSessionPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [type, setType] = useState<MeditationType>('mindfulness')
  const [minutes, setMinutes] = useState('10')
  const [customMinutes, setCustomMinutes] = useState('')
  const [occurredAt, setOccurredAt] = useState(nowLocal())
  const [notes, setNotes] = useState('')
  const [intention, setIntention] = useState('')
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

  // Stable daily suggestion for the intention placeholder (matches Meditate / Breathe).
  const intentionPlaceholder = dailySuggestion(new Date())

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
      setError(t('tracking.logSession.durationError'))
      return
    }
    if (!occurredAt) {
      setError(t('tracking.logSession.dateError'))
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
        // Optional pre-session intention — trimmed; blank is omitted (sent null).
        intention: intention.trim() || null,
        focus: focus ? Number(focus) : null,
        calm: calm ? Number(calm) : null,
        // Stable per-load token so a retry after a transient error won't create a
        // duplicate session (the backend collapses by client_token).
        client_token: clientTokenRef.current,
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? t('tracking.logSession.saveError')
          : messageForError(err),
      )
      setSubmitting(false)
      return
    }

    // Post-save stats are best-effort: the session is already saved, so a getStats
    // failure must not report a save error or skip the reward overlay.
    const after = await dashboardService.getStats().catch(() => before)
    // True gain from the server, itemized (the session + any quest/streak bonus).
    const isBreath = ['resonance_breathing', 'energizing_breathing'].includes(type)
    const bd = buildXpBreakdown(
      before,
      after,
      isBreath ? t('tracking.logSession.type.breathing') : t('tracking.logSession.type.meditation'),
      isBreath ? Wind : Brain,
    )
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
    setSubmitting(false)
  }

  return (
    <main id="main-content" className="dashboard log-session">
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('tracking.logSession.title')}</h1>
        <p className="page-subtitle">
          {t('tracking.logSession.subtitle')}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        {/* Practice type — pattern-card style matching how Breathe presents choices */}
        <label>{t('tracking.logSession.practice')}</label>
        <div className="pattern-cards" role="group" aria-label={t('tracking.logSession.practiceTypeAria')}>
          {TYPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`selectable pattern-card${type === opt.value ? ' selected' : ''}`}
              aria-pressed={type === opt.value}
              onClick={() => setType(opt.value)}
            >
              <span
                className="pattern-card-icon"
                style={{ background: opt.tint }}
                aria-hidden="true"
              >
                <opt.Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="pattern-card-body">
                <span className="pattern-card-name">{t(opt.labelKey)}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Duration — quick-pick chips + optional custom number input */}
        <label>{t('tracking.logSession.duration')}</label>
        <div className="log-session-duration-chips" role="group" aria-label={t('tracking.logSession.durationAria')}>
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
            {t('tracking.logSession.custom')}
          </button>
        </div>
        {isCustom && (
          <input
            id="minutes"
            type="number"
            min="1"
            placeholder={t('tracking.logSession.customPlaceholder')}
            aria-label={t('tracking.logSession.customAria')}
            value={customMinutes}
            onChange={(e) => handleCustomMinutes(e.target.value)}
            style={{ marginTop: '0.35rem' }}
          />
        )}

        {/* Date & time */}
        <label htmlFor="occurred">{t('tracking.logSession.dateTime')}</label>
        <input
          id="occurred"
          type="datetime-local"
          value={occurredAt}
          aria-describedby="occurred-hint"
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        <p id="occurred-hint" className="field-time-hint muted">
          {t('tracking.logSession.yourLocalTime')}
        </p>

        {/* Focus rating — inline 1–5 buttons instead of a dropdown */}
        <label>{t('tracking.logSession.focus')}</label>
        <RatingChips ariaLabel={t('tracking.logSession.focusRatingAria')} value={focus} onChange={setFocus} />

        {/* Calm rating — inline 1–5 buttons instead of a dropdown */}
        <label>{t('tracking.logSession.calm')}</label>
        <RatingChips ariaLabel={t('tracking.logSession.calmRatingAria')} value={calm} onChange={setCalm} />

        {/* Intention + notes — both optional free text, folded behind ONE quiet disclosure so the
            core form (type, duration, when, ratings) stays short. Values persist while collapsed. */}
        <details className="meditate-disclosure">
          <summary className="meditate-disclosure-summary">
            {t('tracking.logSession.reflection')}
          </summary>
          <div className="meditate-disclosure-body">
            <label htmlFor="intention" className="session-intention-label">
              {t('tracking.logSession.intention')} <span className="session-intention-opt">{t('tracking.logSession.optional')}</span>
            </label>
            <textarea
              id="intention"
              className="session-intention-input"
              rows={2}
              maxLength={INTENTION_MAX}
              placeholder={intentionPlaceholder}
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
            />
            <p className="session-intention-counter" aria-live="polite">
              {intention.length}/{INTENTION_MAX}
            </p>

            <label htmlFor="notes">{t('tracking.logSession.notes')}</label>
            <textarea
              id="notes"
              value={notes}
              rows={3}
              maxLength={2000}
              placeholder={t('tracking.logSession.notesPlaceholder')}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </details>

        <ErrorBanner message={error} />

        <button type="submit" disabled={submitting}>
          {submitting ? t('common.saving') : t('tracking.logSession.save')}
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
