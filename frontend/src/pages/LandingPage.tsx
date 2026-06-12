import { Link } from 'react-router-dom'
import GuestButton from '../components/GuestButton'

const FEATURES = [
  { emoji: '🫁', title: 'HRV resonance breathing', body: 'A guided pacer at your chosen slow rate, with an ocean-breath audio guide.' },
  { emoji: '📊', title: 'A dashboard for your practice', body: 'Streaks, levels, a weekly breakdown, and a year-long activity heatmap.' },
  { emoji: '📓', title: 'Journal & gratitude', body: 'Reflect on a session and capture what you’re grateful for — with AI-suggested prompts.' },
  { emoji: '🎯', title: 'Goals & a garden', body: 'Set targets and grow a Sanctuary that flourishes the more you practice.' },
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
    </main>
  )
}
