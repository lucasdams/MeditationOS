import { useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { Waves, Target, Moon, Compass, type LucideProps } from 'lucide-react'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useT } from '../i18n'

// First-run activation flow, shown by ProtectedRoute while quest_features is null (i.e. only
// for genuinely new users). Beginner-first (docs/beginner-first-revision.md §5): a single warm
// question shapes the daily quests and tone, then drops the user straight into a 1-minute guided
// breath. The companion's dosha pick is DEFERRED to AFTER that first sit (the "hatch"), so we
// don't gate onboarding on it. Experience / preferred-time / quest fine-tuning all remain
// editable later in Settings.

// One warm question. Each intent seeds a sensible default set of daily quests (reusing the
// previous goal→quests mapping) and is remembered as `onboarding.intent` so the hatch page can
// suggest a matching companion. "Just curious" uses a gentle, well-rounded default.
const INTENTS = [
  {
    key: 'calm',
    labelKey: 'auth.onboarding.intent.calm.label',
    subKey: 'auth.onboarding.intent.calm.sub',
    Icon: Waves,
    quests: ['breathe', 'gratitude', 'journal'],
  },
  {
    key: 'focus',
    labelKey: 'auth.onboarding.intent.focus.label',
    subKey: 'auth.onboarding.intent.focus.sub',
    Icon: Target,
    quests: ['meditate', 'breathe', 'journal'],
  },
  {
    key: 'sleep',
    labelKey: 'auth.onboarding.intent.sleep.label',
    subKey: 'auth.onboarding.intent.sleep.sub',
    Icon: Moon,
    quests: ['breathe', 'gratitude', 'meditate'],
  },
  {
    key: 'curious',
    labelKey: 'auth.onboarding.intent.curious.label',
    subKey: 'auth.onboarding.intent.curious.sub',
    Icon: Compass,
    quests: ['breathe', 'gratitude', 'journal'],
  },
] as const satisfies readonly {
  key: string
  labelKey: string
  subKey: string
  Icon: ComponentType<LucideProps>
  quests: string[]
}[]

type IntentKey = (typeof INTENTS)[number]['key']

// A gentle first-sit pace — slow enough to feel calming, the same value the old "new to
// meditation" experience used. Stored so the first guided breath opens at this rate.
const FIRST_SIT_BPM = '6'

export default function Onboarding() {
  const { t } = useT()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // The intent currently being committed, so we can disable the buttons + show progress and
  // never fire two setup calls from a double-tap.
  const [submitting, setSubmitting] = useState<IntentKey | null>(null)

  async function choose(intent: (typeof INTENTS)[number]) {
    setSubmitting(intent.key)
    setError(null)
    try {
      // Remember the intent so the hatch page can suggest a matching companion, and flag that a
      // hatch is pending so the first sit routes to the choose page instead of the usual close.
      // Local-only and non-fatal — failures here never block the (server-side) setup below.
      try {
        localStorage.setItem('breathe.bpm', FIRST_SIT_BPM)
        localStorage.setItem('onboarding.pendingHatch', '1')
        localStorage.setItem('onboarding.intent', intent.key)
      } catch {
        /* localStorage unavailable (private mode, etc.) — non-fatal */
      }
      // Choosing quests closes the first-run gate and unlocks the app.
      await authService.setQuestFeatures([...intent.quests])
      await refresh()
      // Straight into a zero-config 1-minute guided breath — the first win.
      navigate('/breathe?guided=1&duration=60')
    } catch (err) {
      setError(messageForError(err))
      setSubmitting(null)
    }
  }

  return (
    <main className="auth-card onboarding">
      <AuthBrand />
      <h1>{t('auth.onboarding.title')}</h1>
      <p className="muted">
        {t('auth.onboarding.intro')}
      </p>
      <h2 className="onboarding-question">{t('auth.onboarding.question')}</h2>
      <div className="onboarding-options" role="group" aria-label={t('auth.onboarding.question')}>
        {INTENTS.map((i) => (
          <button
            key={i.key}
            type="button"
            className="selectable onboarding-choice"
            disabled={submitting !== null}
            aria-busy={submitting === i.key}
            onClick={() => choose(i)}
          >
            <span className="onboarding-emoji" aria-hidden="true">
              <i.Icon size={22} strokeWidth={1.75} />
            </span>{' '}
            <span className="onboarding-choice-body">
              <span className="onboarding-choice-label">{t(i.labelKey)}</span>
              <span className="onboarding-choice-sub muted">{t(i.subKey)}</span>
            </span>
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
    </main>
  )
}
