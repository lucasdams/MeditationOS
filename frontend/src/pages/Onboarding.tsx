import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import QuestPicker, { tooFewQuestsMessage } from '../components/QuestPicker'
import { MIN_QUEST_FEATURES } from '../types'

// First-run activation flow, shown by ProtectedRoute while quest_features is null
// (i.e. only for genuinely new users). It collects a goal, experience, and preferred
// time, then personalizes the daily quests, sets a reminder, tunes the breathing pace,
// and drops the user into a first session. Replaces the bare quest picker.

const GOALS = [
  { key: 'stress', label: 'Calm & stress relief', emoji: '🌊', quests: ['breathe', 'gratitude', 'journal'], starter: '/breathe' },
  { key: 'sleep', label: 'Better sleep', emoji: '🌙', quests: ['breathe', 'gratitude', 'meditate'], starter: '/breathe' },
  { key: 'focus', label: 'Focus & clarity', emoji: '🎯', quests: ['meditate', 'breathe', 'journal'], starter: '/meditate' },
] as const

const EXPERIENCE = [
  { key: 'new', label: 'New to meditation', bpm: 6 },
  { key: 'some', label: 'Some experience', bpm: 4.5 },
  { key: 'seasoned', label: 'Seasoned practitioner', bpm: 3 },
] as const

const TIMES = [
  { key: 'morning', label: 'Mornings', hour: 8 },
  { key: 'midday', label: 'Midday', hour: 12 },
  { key: 'evening', label: 'Evenings', hour: 19 },
  { key: 'none', label: 'No reminder for now', hour: null as number | null },
] as const

type GoalKey = (typeof GOALS)[number]['key']
type ExperienceKey = (typeof EXPERIENCE)[number]['key']
type TimeKey = (typeof TIMES)[number]['key']

type Step = 'welcome' | 'goal' | 'experience' | 'time' | 'quests'
const STEPS: Step[] = ['welcome', 'goal', 'experience', 'time', 'quests']

export default function Onboarding() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [goal, setGoal] = useState<GoalKey | null>(null)
  const [experience, setExperience] = useState<ExperienceKey | null>(null)
  const [time, setTime] = useState<TimeKey | null>(null)
  const [quests, setQuests] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const go = (next: Step) => {
    setError(null)
    setStep(next)
  }

  function pickGoal(key: GoalKey) {
    // Seed quests from the preset only on first pick or when the goal actually
    // changes, so re-tapping the same goal (or returning to this step) doesn't
    // wipe quests the user hand-toggled later in the flow.
    if (key !== goal) {
      setQuests([...(GOALS.find((g) => g.key === key)?.quests ?? [])])
    }
    setGoal(key)
    go('experience')
  }

  function toggleQuest(key: string, on: boolean) {
    setQuests((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))
    setError(null)
  }

  async function finish() {
    if (quests.length < MIN_QUEST_FEATURES) {
      setError(tooFewQuestsMessage)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Tune the breathing pace for next time (local-only preference).
      const bpm = EXPERIENCE.find((e) => e.key === experience)?.bpm
      if (bpm) {
        try {
          localStorage.setItem('breathe.bpm', String(bpm))
        } catch {
          /* non-fatal */
        }
      }
      // Set a reminder from the preferred time (optional — failure is non-fatal).
      const hour = TIMES.find((t) => t.key === time)?.hour ?? null
      if (hour !== null) {
        await authService.setReminders(true, hour).catch(() => {})
      }
      // Choosing quests closes the first-run gate and unlocks the app.
      await authService.setQuestFeatures(quests)
      await refresh()
      navigate(GOALS.find((g) => g.key === goal)?.starter ?? '/')
    } catch (err) {
      setError(messageForError(err))
      setSubmitting(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <main className="auth-card onboarding">
      <AuthBrand />
      <div
        className="onboarding-progress"
        role="group"
        aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}
      >
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`onboarding-dot${i <= stepIndex ? ' active' : ''}`}
            aria-current={i === stepIndex ? 'step' : undefined}
            aria-hidden={i === stepIndex ? undefined : 'true'}
          />
        ))}
      </div>

      {step === 'welcome' && (
        <>
          <h1>Welcome 🧘</h1>
          <p className="muted">
            A few quick questions so we can shape MeditationOS around you. Takes about 30
            seconds — you can change everything later in Settings.
          </p>
          <button type="button" onClick={() => go('goal')}>
            Let’s begin
          </button>
        </>
      )}

      {step === 'goal' && (
        <>
          <h1>What brings you here?</h1>
          <p className="muted">We’ll suggest daily practices to match.</p>
          <div className="onboarding-options">
            {GOALS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`selectable onboarding-choice${goal === g.key ? ' selected' : ''}`}
                onClick={() => pickGoal(g.key)}
              >
                <span className="onboarding-emoji">{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'experience' && (
        <>
          <h1>How much have you practiced?</h1>
          <p className="muted">This sets a comfortable starting breathing pace.</p>
          <div className="onboarding-options">
            {EXPERIENCE.map((e) => (
              <button
                key={e.key}
                type="button"
                className={`selectable onboarding-choice${experience === e.key ? ' selected' : ''}`}
                onClick={() => {
                  setExperience(e.key)
                  go('time')
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
          <button type="button" className="onboarding-back" onClick={() => go('goal')}>
            ← Back
          </button>
        </>
      )}

      {step === 'time' && (
        <>
          <h1>When do you want to practice?</h1>
          <p className="muted">We’ll send a gentle email nudge (skip if you’d rather not).</p>
          <div className="onboarding-options">
            {TIMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`selectable onboarding-choice${time === t.key ? ' selected' : ''}`}
                onClick={() => {
                  setTime(t.key)
                  go('quests')
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="onboarding-back" onClick={() => go('experience')}>
            ← Back
          </button>
        </>
      )}

      {step === 'quests' && (
        <>
          <h1>Your daily quests</h1>
          <p className="muted">
            We’ve picked a few based on your goal — pick at least {MIN_QUEST_FEATURES}. Change
            anytime in Settings.
          </p>
          <QuestPicker
            selected={quests}
            onToggle={toggleQuest}
            legend="Daily quest practices"
          />
          <ErrorBanner message={error} />
          <button type="button" onClick={finish} disabled={submitting}>
            {submitting ? 'Setting up…' : 'Start practicing'}
          </button>
          <button type="button" className="onboarding-back" onClick={() => go('time')}>
            ← Back
          </button>
        </>
      )}
    </main>
  )
}
