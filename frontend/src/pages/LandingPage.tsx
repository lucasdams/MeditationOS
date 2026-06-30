import { useState } from 'react'
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
  { emoji: '🪷', title: 'Spirit', body: 'Awaken a living companion you raise through practice — it evolves down a path shaped by how you meditate, and needs your care to thrive.' },
  { emoji: '📊', title: 'Dashboard & analytics', body: 'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.' },
  { emoji: '🌱', title: 'Streaks, XP & missions', body: 'Rotating daily missions, XP and levels, and a streak with a forgiving rest day — gentle, not grindy.' },
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
