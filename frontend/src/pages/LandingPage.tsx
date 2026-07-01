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

// Lucide line icons (not system emoji) to match the rest of the app — this is the public
// first impression, so it reads as one clean, cool set.
const FEATURES: { Icon: ComponentType<LucideProps>; title: string; body: string }[] = [
  { Icon: Brain, title: 'Meditation timer', body: 'Unguided “sit now” sessions with a calm timer, optional start / interval / end bells, and timing that survives a backgrounded tab.' },
  { Icon: Wind, title: 'HRV resonance breathing', body: 'A guided pacer at your chosen slow rate, with an ocean-breath audio guide and a breathing circle to follow.' },
  { Icon: HandHeart, title: 'Gratitude', body: 'Capture small moments of gratitude across 37 themes — with AI-suggested prompts, or write your own.' },
  { Icon: NotebookPen, title: 'Journal', body: 'Reflect on a sit, tag a mood, and resurface a random past entry to revisit.' },
  { Icon: Flame, title: 'Candle gazing', body: 'An eyes-open focus practice (traditionally called Trataka) — rest your attention on a single, gently moving flame to steady a busy mind.' },
  { Icon: Target, title: 'Goals', body: 'Set recurring habits — meditate, breathe, journal — and watch progress fill in automatically from your activity.' },
  { Icon: Sparkles, title: 'Spirit', body: 'Awaken a living companion you raise through practice — it evolves down a path shaped by how you meditate, and needs your care to thrive.' },
  { Icon: ChartLine, title: 'Dashboard & analytics', body: 'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.' },
  { Icon: Sprout, title: 'Streaks, XP & missions', body: 'Rotating daily missions, XP and levels, and a streak with a forgiving rest day — gentle, not grindy.' },
]

export default function LandingPage() {
  const [guestError, setGuestError] = useState('')

  return (
    <main id="main-content" className="landing">
      <section className="landing-hero">
        <h1>MeditationOS</h1>
        <p className="landing-tagline">
          A meditation app built around <strong>your practice data</strong> — not another
          audio library. Track sessions, build streaks, and breathe with intention. A few
          minutes a day is how the practice <strong>rewires your brain</strong> and the
          habit takes hold.
        </p>
        <div className="landing-cta">
          <Link to="/register" className="landing-primary">
            Get started — it’s free
          </Link>
          <Link to="/login" className="landing-secondary">
            Log in
          </Link>
        </div>
        <div className="landing-guest">
          <GuestButton onError={setGuestError} />
          <span className="muted">No sign-up needed to try it.</span>
          {guestError && (
            <p className="error" role="alert">
              {guestError}
            </p>
          )}
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature">
            <span className="landing-feature-icon" aria-hidden="true">
              <f.Icon size={24} strokeWidth={1.75} />
            </span>
            <h2>{f.title}</h2>
            <p className="muted">{f.body}</p>
          </div>
        ))}
      </section>

      <SiteFooter />
    </main>
  )
}
