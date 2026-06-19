import { Link } from 'react-router-dom'
import GuestButton from '../components/GuestButton'
import SiteFooter from '../components/SiteFooter'

const FEATURES = [
  { emoji: '🧘', title: 'Meditation timer', body: 'Unguided “sit now” sessions with a calm timer, optional start / interval / end bells, and timing that survives a backgrounded tab.' },
  { emoji: '🫁', title: 'HRV resonance breathing', body: 'A guided pacer at your chosen slow rate, with an ocean-breath audio guide and a breathing circle to follow.' },
  { emoji: '🙏', title: 'Gratitude', body: 'Capture small moments of gratitude across 37 themes — with AI-suggested prompts, or write your own.' },
  { emoji: '📓', title: 'Journal', body: 'Reflect on a sit, tag a mood, and resurface a random past entry to revisit.' },
  { emoji: '🕯️', title: 'Candle gazing', body: 'An eyes-open focus practice (traditionally called Trataka) — rest your attention on a single, gently moving flame to steady a busy mind.' },
  { emoji: '🎯', title: 'Goals', body: 'Set recurring habits — meditate, breathe, journal — and watch progress fill in automatically from your activity.' },
  { emoji: '🌳', title: 'Sanctuary', body: 'Earn coins as you level up, then buy and upgrade a garden of plants, pets, and places.' },
  { emoji: '📊', title: 'Dashboard & analytics', body: 'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.' },
  { emoji: '🌱', title: 'Streaks, XP & quests', body: 'Rotating daily quests, XP and levels, and a streak with a forgiving rest day — gentle, not grindy.' },
]

export default function LandingPage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <h1>MeditationOS</h1>
        <p className="landing-tagline">
          A meditation app built around <strong>your practice data</strong> — not another
          audio library. Track sessions, build streaks, breathe with intention, and watch
          your progress grow.
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
          <GuestButton onError={() => {}} />
          <span className="muted">No sign-up needed to try it.</span>
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature">
            <span className="landing-feature-emoji" aria-hidden="true">
              {f.emoji}
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
