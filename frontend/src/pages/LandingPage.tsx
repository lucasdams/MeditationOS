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
  LineChart,
  Repeat,
  ShieldCheck,
  Download,
  Trash2,
  Lock,
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
  { Icon: Sparkles, title: 'Spirit', body: 'Awaken a living companion you raise through practice — it evolves down a path shaped by how you meditate, and grows as you show up.' },
  { Icon: ChartLine, title: 'Dashboard & analytics', body: 'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.' },
  { Icon: Sprout, title: 'Streaks, XP & missions', body: 'Rotating daily missions, XP and levels, and a streak with a forgiving rest day — gentle, not grindy.' },
]

// The three-step promise: what actually happens when you start. Kept to plain verbs.
const STEPS: { Icon: ComponentType<LucideProps>; title: string; body: string }[] = [
  { Icon: Sprout, title: 'Sit for a few minutes', body: 'Start a timer, follow a breathing pacer, or gaze at a candle. No account or audio download needed to try it.' },
  { Icon: Repeat, title: 'Log it — automatically', body: 'Every session, breath, gratitude note, and journal entry lands in one place, building your streak as you go.' },
  { Icon: LineChart, title: 'Watch the pattern emerge', body: 'Your dashboard turns the raw practice into streaks, trends, and a heatmap — so you can see the habit take hold.' },
]

// Honest "what you get" value stack — real capabilities the app already ships. No stats, no claims.
const VALUE_STACK = [
  'Nine ways to practice — timer, resonance breathing, gratitude, journal, candle gazing, and more',
  'One clean dashboard that turns every session into streaks, trends, and an activity heatmap',
  'A living Spirit companion you raise through practice, plus gentle XP, levels, and daily missions',
  'Your data stays yours — export everything as JSON or delete your account at any time',
  'Try it instantly as a guest — no email, no card, no audio library to wade through',
]

export default function LandingPage() {
  const [guestError, setGuestError] = useState('')

  return (
    <main id="main-content" className="landing">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">Data-first meditation</span>
          <h1 id="landing-hero-title">
            Meditation that <span className="landing-hero-accent">tracks itself</span>.
          </h1>
          <p className="landing-tagline">
            Track your practice, build streaks, and breathe with intention — all in one
            place. MeditationOS is built around <strong>your practice data</strong>, not
            another audio library. A few minutes a day, and the habit takes hold.
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
        </div>

        {/* Calm supporting visual: a lightweight, self-contained breathing circle (pure
            CSS — no heavy asset, no pacer state). Decorative, so hidden from the a11y tree. */}
        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-breath">
            <span className="landing-breath-ring landing-breath-ring--outer" />
            <span className="landing-breath-ring landing-breath-ring--mid" />
            <span className="landing-breath-orb" />
          </div>
          <p className="landing-breath-caption">Breathe in… and out.</p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="landing-section" aria-labelledby="landing-how-title">
        <h2 id="landing-how-title" className="landing-section-title">
          How it works
        </h2>
        <p className="landing-section-lead muted">
          Three steps, and the app does the tracking for you.
        </p>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="landing-step">
              <span className="landing-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="landing-step-icon" aria-hidden="true">
                <s.Icon size={22} strokeWidth={1.75} />
              </span>
              <h3>{s.title}</h3>
              <p className="muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Feature highlights ───────────────────────────────────────────── */}
      <section className="landing-section" aria-labelledby="landing-features-title">
        <h2 id="landing-features-title" className="landing-section-title">
          Everything in one calm place
        </h2>
        <p className="landing-section-lead muted">
          Nine ways to practice and reflect — every one of them feeds the same clean picture
          of your progress.
        </p>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature">
              <span className="landing-feature-icon" aria-hidden="true">
                <f.Icon size={24} strokeWidth={1.75} />
              </span>
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust: privacy-first + honest "why a few minutes" framing ────── */}
      <section className="landing-section landing-trust" aria-labelledby="landing-trust-title">
        <div className="landing-trust-head">
          <span className="landing-trust-badge" aria-hidden="true">
            <ShieldCheck size={26} strokeWidth={1.75} />
          </span>
          <h2 id="landing-trust-title" className="landing-section-title">
            Your practice data stays yours
          </h2>
          <p className="landing-section-lead muted">
            Privacy-first by design. No selling your reflections, no dark patterns — just a
            record of your practice that you fully control.
          </p>
        </div>
        <div className="landing-trust-grid">
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Download size={20} strokeWidth={1.75} />
            </span>
            <h3>Export anytime</h3>
            <p className="muted">
              Download everything you’ve logged as JSON whenever you want. It’s your data —
              take it with you.
            </p>
          </div>
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Trash2 size={20} strokeWidth={1.75} />
            </span>
            <h3>Delete anytime</h3>
            <p className="muted">
              Permanently delete your account and its data from Settings, in a couple of
              clicks. No “contact support to cancel”.
            </p>
          </div>
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Lock size={20} strokeWidth={1.75} />
            </span>
            <h3>Yours by default</h3>
            <p className="muted">
              Your sessions and journals are tied to your account and not shared. Read exactly
              what we store in the <Link to="/privacy">Privacy policy</Link>.
            </p>
          </div>
        </div>
        <p className="landing-trust-note muted">
          Why a few minutes a day? Because a small, repeatable practice is easier to keep than
          a big one — and keeping it is the whole point. MeditationOS is a practice tracker,
          not a treatment, and makes no medical claims.
        </p>
      </section>

      {/* ── "Why I built this" + honest value stack ──────────────────────── */}
      <section className="landing-section landing-story" aria-labelledby="landing-story-title">
        <div className="landing-story-note">
          <h2 id="landing-story-title" className="landing-section-title">
            Why I built this
          </h2>
          <p>
            I wanted to meditate consistently, but every app I tried was a wall of audio
            tracks — and none of them showed me whether the habit was actually sticking. So I
            built the tool I wanted: one that turns your practice into <em>data</em>, celebrates
            you showing up, and stays out of the way. MeditationOS is that tool, and it’s free
            to start.
          </p>
          <p className="muted landing-story-signoff">— The maker of MeditationOS</p>
        </div>
        <div className="landing-value">
          <h3>What you get</h3>
          <ul className="landing-value-list">
            {VALUE_STACK.map((item) => (
              <li key={item}>
                <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Honest, easily-populated slot for REAL testimonials later. Ships with no
            fabricated quotes — just an invitation, so the section reads well today. */}
        <aside className="landing-testimonials" aria-label="Practitioner stories">
          <p className="landing-testimonials-lead muted">
            Building your practice with MeditationOS? We’d love to feature your story here.
          </p>
          {/*
            TODO: replace this slot with real, opt-in testimonials once collected. Suggested shape:
            <figure className="landing-quote">
              <blockquote>“…real user quote…”</blockquote>
              <figcaption>— Real name / handle, with permission</figcaption>
            </figure>
            Do NOT add fabricated quotes, ratings, or user counts.
          */}
        </aside>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="landing-section landing-final-cta" aria-labelledby="landing-final-title">
        <h2 id="landing-final-title" className="landing-section-title">
          Start your practice today
        </h2>
        <p className="landing-section-lead muted">
          Free to begin, no audio library to sift through. Just you, a few quiet minutes, and a
          record that grows with you.
        </p>
        <div className="landing-cta landing-cta--center">
          <Link to="/register" className="landing-primary">
            Get started — it’s free
          </Link>
          <Link to="/login" className="landing-secondary">
            Log in
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
