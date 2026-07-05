import { useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  Wind,
  HandHeart,
  NotebookPen,
  Flame,
  Target,
  Sparkles,
  ChartLine,
  Sprout,
  type LucideProps,
} from 'lucide-react'
import GuestButton from '../components/GuestButton'
import SiteFooter from '../components/SiteFooter'
import { useT } from '../i18n'

// Lucide line icons (not system emoji) to match the rest of the app — this is the public
// first impression, so it reads as one clean, cool set. Copy lives in the i18n catalog
// (auth.landing.feature.*); resolved with t() at render time so it re-labels on a locale switch.
const FEATURES: { Icon: ComponentType<LucideProps>; titleKey: string; bodyKey: string }[] = [
  { Icon: Brain, titleKey: 'auth.landing.feature.timer.title', bodyKey: 'auth.landing.feature.timer.body' },
  { Icon: Wind, titleKey: 'auth.landing.feature.breathing.title', bodyKey: 'auth.landing.feature.breathing.body' },
  { Icon: HandHeart, titleKey: 'auth.landing.feature.gratitude.title', bodyKey: 'auth.landing.feature.gratitude.body' },
  { Icon: NotebookPen, titleKey: 'auth.landing.feature.journal.title', bodyKey: 'auth.landing.feature.journal.body' },
  { Icon: Flame, titleKey: 'auth.landing.feature.trataka.title', bodyKey: 'auth.landing.feature.trataka.body' },
  { Icon: Target, titleKey: 'auth.landing.feature.goals.title', bodyKey: 'auth.landing.feature.goals.body' },
  { Icon: Sparkles, titleKey: 'auth.landing.feature.spirit.title', bodyKey: 'auth.landing.feature.spirit.body' },
  { Icon: ChartLine, titleKey: 'auth.landing.feature.analytics.title', bodyKey: 'auth.landing.feature.analytics.body' },
  { Icon: Sprout, titleKey: 'auth.landing.feature.streaks.title', bodyKey: 'auth.landing.feature.streaks.body' },
]

export default function LandingPage() {
  const { t } = useT()
  const [guestError, setGuestError] = useState('')

  return (
    <main id="main-content" className="landing">
      <section className="landing-hero">
        <h1>MeditationOS</h1>
        <p className="landing-tagline">
          {t('auth.landing.tagline.pre')}<strong>{t('auth.landing.tagline.emphasis')}</strong>{t('auth.landing.tagline.post')}
        </p>
        <div className="landing-cta">
          <Link to="/register" className="landing-primary">
            {t('auth.landing.getStarted')}
          </Link>
          <Link to="/login" className="landing-secondary">
            {t('auth.landing.login')}
          </Link>
        </div>
        <div className="landing-guest">
          <GuestButton onError={setGuestError} />
          <span className="muted">{t('auth.landing.noSignup')}</span>
          {guestError && (
            <p className="error" role="alert">
              {guestError}
            </p>
          )}
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.titleKey} className="landing-feature">
            <span className="landing-feature-icon" aria-hidden="true">
              <f.Icon size={24} strokeWidth={1.75} />
            </span>
            <h2>{t(f.titleKey)}</h2>
            <p className="muted">{t(f.bodyKey)}</p>
          </div>
        ))}
      </section>

      <SiteFooter />
    </main>
  )
}
