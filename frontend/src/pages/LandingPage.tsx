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
import { useT } from '../i18n'

// Lucide line icons (not system emoji) to match the rest of the app — this is the public
// first impression, so it reads as one clean, cool set. Copy lives in the i18n catalog
// (`landing.*`); the arrays carry the icon + the catalog keys, resolved with t() at render.
const FEATURES: { Icon: ComponentType<LucideProps>; titleKey: string; bodyKey: string }[] = [
  { Icon: Brain, titleKey: 'landing.feature.timer.title', bodyKey: 'landing.feature.timer.body' },
  { Icon: Wind, titleKey: 'landing.feature.breathing.title', bodyKey: 'landing.feature.breathing.body' },
  { Icon: HandHeart, titleKey: 'landing.feature.gratitude.title', bodyKey: 'landing.feature.gratitude.body' },
  { Icon: NotebookPen, titleKey: 'landing.feature.journal.title', bodyKey: 'landing.feature.journal.body' },
  { Icon: Flame, titleKey: 'landing.feature.trataka.title', bodyKey: 'landing.feature.trataka.body' },
  { Icon: Target, titleKey: 'landing.feature.goals.title', bodyKey: 'landing.feature.goals.body' },
  { Icon: Sparkles, titleKey: 'landing.feature.spirit.title', bodyKey: 'landing.feature.spirit.body' },
  { Icon: ChartLine, titleKey: 'landing.feature.dashboard.title', bodyKey: 'landing.feature.dashboard.body' },
  { Icon: Sprout, titleKey: 'landing.feature.xp.title', bodyKey: 'landing.feature.xp.body' },
]

// The three-step promise: what actually happens when you start.
const STEPS: { Icon: ComponentType<LucideProps>; titleKey: string; bodyKey: string }[] = [
  { Icon: Sprout, titleKey: 'landing.step.sit.title', bodyKey: 'landing.step.sit.body' },
  { Icon: Repeat, titleKey: 'landing.step.log.title', bodyKey: 'landing.step.log.body' },
  { Icon: LineChart, titleKey: 'landing.step.watch.title', bodyKey: 'landing.step.watch.body' },
]

// Honest "what you get" value stack — real capabilities the app already ships.
const VALUE_KEYS = [
  'landing.value.1',
  'landing.value.2',
  'landing.value.3',
  'landing.value.4',
  'landing.value.5',
]

export default function LandingPage() {
  const { t } = useT()
  const [guestError, setGuestError] = useState('')

  return (
    <main id="main-content" className="landing">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">{t('landing.hero.eyebrow')}</span>
          <h1 id="landing-hero-title">
            {t('landing.hero.titleLead')}
            <span className="landing-hero-accent">{t('landing.hero.titleAccent')}</span>
            <span className="landing-hero-end">{t('landing.hero.titleEnd')}</span>
          </h1>
          <p className="landing-tagline">{t('landing.hero.tagline')}</p>
          <div className="landing-cta">
            <Link to="/register" className="landing-primary">
              {t('landing.cta.getStarted')}
            </Link>
            <Link to="/login" className="landing-secondary">
              {t('landing.cta.login')}
            </Link>
          </div>
          <div className="landing-guest">
            <GuestButton onError={setGuestError} />
            <span className="muted">{t('landing.hero.guestNote')}</span>
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
          <p className="landing-breath-caption">{t('landing.hero.breatheCaption')}</p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="landing-section" aria-labelledby="landing-how-title">
        <h2 id="landing-how-title" className="landing-section-title">
          {t('landing.how.title')}
        </h2>
        <p className="landing-section-lead muted">{t('landing.how.lead')}</p>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.titleKey} className="landing-step">
              <span className="landing-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="landing-step-icon" aria-hidden="true">
                <s.Icon size={22} strokeWidth={1.75} />
              </span>
              <h3>{t(s.titleKey)}</h3>
              <p className="muted">{t(s.bodyKey)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Feature highlights ───────────────────────────────────────────── */}
      <section className="landing-section" aria-labelledby="landing-features-title">
        <h2 id="landing-features-title" className="landing-section-title">
          {t('landing.features.title')}
        </h2>
        <p className="landing-section-lead muted">{t('landing.features.lead')}</p>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.titleKey} className="landing-feature">
              <span className="landing-feature-icon" aria-hidden="true">
                <f.Icon size={24} strokeWidth={1.75} />
              </span>
              <h3>{t(f.titleKey)}</h3>
              <p className="muted">{t(f.bodyKey)}</p>
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
            {t('landing.trust.title')}
          </h2>
          <p className="landing-section-lead muted">{t('landing.trust.lead')}</p>
        </div>
        <div className="landing-trust-grid">
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Download size={20} strokeWidth={1.75} />
            </span>
            <h3>{t('landing.trust.export.title')}</h3>
            <p className="muted">{t('landing.trust.export.body')}</p>
          </div>
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Trash2 size={20} strokeWidth={1.75} />
            </span>
            <h3>{t('landing.trust.delete.title')}</h3>
            <p className="muted">{t('landing.trust.delete.body')}</p>
          </div>
          <div className="landing-trust-card">
            <span className="landing-trust-icon" aria-hidden="true">
              <Lock size={20} strokeWidth={1.75} />
            </span>
            <h3>{t('landing.trust.yours.title')}</h3>
            <p className="muted">
              {t('landing.trust.yours.bodyPre')}
              <Link to="/privacy">{t('landing.trust.yours.link')}</Link>
              {t('landing.trust.yours.bodyPost')}
            </p>
          </div>
        </div>
        <p className="landing-trust-note muted">{t('landing.trust.note')}</p>
      </section>

      {/* ── "Why I built this" + honest value stack ──────────────────────── */}
      <section className="landing-section landing-story" aria-labelledby="landing-story-title">
        <div className="landing-story-note">
          <h2 id="landing-story-title" className="landing-section-title">
            {t('landing.story.title')}
          </h2>
          <p>{t('landing.story.body')}</p>
          <p className="muted landing-story-signoff">{t('landing.story.signoff')}</p>
        </div>
        <div className="landing-value">
          <h3>{t('landing.value.heading')}</h3>
          <ul className="landing-value-list">
            {VALUE_KEYS.map((key) => (
              <li key={key}>
                <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Honest, easily-populated slot for REAL testimonials later. Ships with no
            fabricated quotes — just an invitation, so the section reads well today. */}
        <aside className="landing-testimonials" aria-label="Practitioner stories">
          <p className="landing-testimonials-lead muted">{t('landing.testimonials.lead')}</p>
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
          {t('landing.final.title')}
        </h2>
        <p className="landing-section-lead muted">{t('landing.final.lead')}</p>
        <div className="landing-cta landing-cta--center">
          <Link to="/register" className="landing-primary">
            {t('landing.cta.getStarted')}
          </Link>
          <Link to="/login" className="landing-secondary">
            {t('landing.cta.login')}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
