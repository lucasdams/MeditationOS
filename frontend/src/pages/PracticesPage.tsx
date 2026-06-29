import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { SpiritArt, NEED_COPY, prefersReducedMotion } from '../components/Spirit'
import type { SpiritNeedKey, SpiritPath, SpiritState } from '../types'

// The Practices hub — one browsable "activities" screen listing every practice technique grouped
// by category. Each card deep-links into its practice with the variant pre-selected (Breathe reads
// `?pattern=`, Meditate reads `?guided=`; the reflection pages have their own routes).
//
// It's also SPIRIT-AWARE (ADR-0029): each card shows which of the spirit's three needs it feeds,
// and when you have a living creature the page highlights the practices that fill whatever it needs
// MOST right now (its weakest need) — turning "what should I practice?" into "what does my spirit
// need?". The spirit fetch is non-blocking: the practice list always renders even if it fails.

// How a practice feeds the spirit (ADR-0029): every SIT feeds `rested`, reflection feeds `joyful`,
// and a creature's SIGNATURE practice additionally feeds `nourished` (the path-specific identity
// need). `kind` drives both the base need and whether it's the current path's signature.
type PracticeKind = 'breathing' | 'meditation' | 'gratitude' | 'journal'

const BASE_NEED: Record<PracticeKind, SpiritNeedKey> = {
  breathing: 'rested',
  meditation: 'rested',
  gratitude: 'joyful',
  journal: 'joyful',
}

// The practice kind(s) that are each creature's SIGNATURE (balancing) practice → feed `nourished`.
// Mirrors DOSHA / the backend's per-path nourishment mapping. Pitta's signature is gratitude &
// journaling (both reflection kinds), so it lists two.
const SIGNATURE_KINDS: Record<SpiritPath, PracticeKind[]> = {
  stillness: ['breathing'], // Kapha ← energizing breathwork
  breath: ['gratitude', 'journal'], // Pitta ← gratitude & journaling
  heart: ['meditation'], // Vata ← meditation
}

// The needs a practice fills for THIS spirit: its base need, plus `nourished` when it's the chosen
// creature's signature practice. Pathless spark → no signature, so just the base need.
function feedsFor(kind: PracticeKind, path: SpiritPath | null): SpiritNeedKey[] {
  const base = BASE_NEED[kind]
  if (path && SIGNATURE_KINDS[path].includes(kind)) return ['nourished', base]
  return [base]
}

// The spirit's weakest need (what it needs most) — the lowest 0..1 factor wins, matching the
// backend's "overall condition = weakest need".
function weakestNeed(s: SpiritState): SpiritNeedKey {
  const keys: SpiritNeedKey[] = ['nourished', 'rested', 'joyful']
  return keys.reduce((a, b) => (s.needs[b].factor < s.needs[a].factor ? b : a))
}

interface PracticeCard {
  to: string
  emoji: string
  name: string
  desc: string
  kind: PracticeKind
  // Per-card accent (light + dark), mirroring the home tiles / nav pills.
  light: string
  dark: string
}

interface PracticeGroup {
  title: string
  cards: PracticeCard[]
}

const GROUPS: PracticeGroup[] = [
  {
    title: 'Breathing',
    cards: [
      { to: '/breathe?pattern=resonance', emoji: '🌊', name: 'Resonance', desc: 'Slow, longer-exhale breathing', kind: 'breathing', light: '#3d8597', dark: '#7fc0d2' },
      { to: '/breathe?pattern=box', emoji: '🟦', name: 'Box', desc: 'Equal in·hold·out·hold', kind: 'breathing', light: '#3a7d6f', dark: '#6fb6a8' },
      { to: '/breathe?pattern=energizing', emoji: '☀️', name: 'Energizing', desc: 'Brisk, active inhale', kind: 'breathing', light: '#b45309', dark: '#e3a83c' },
      { to: '/breathe?pattern=alternate', emoji: '🌬️', name: 'Alternate nostril', desc: 'Nadi Shodhana — balance left & right', kind: 'breathing', light: '#7d5a86', dark: '#c39fcc' },
    ],
  },
  {
    title: 'Meditation',
    cards: [
      { to: '/meditate', emoji: '🧘', name: 'Mindfulness', desc: 'Open, unguided sitting', kind: 'meditation', light: '#0f766e', dark: '#5ec0b1' },
      { to: '/meditate?guided=body-scan', emoji: '🌙', name: 'Body scan', desc: 'Guided head-to-toe relaxation', kind: 'meditation', light: '#3d8597', dark: '#7fc0d2' },
      { to: '/meditate?guided=loving-kindness', emoji: '💗', name: 'Loving-kindness', desc: 'Guided metta — warmth & goodwill', kind: 'meditation', light: '#b25563', dark: '#dd9aa4' },
    ],
  },
  {
    title: 'Reflection',
    cards: [
      { to: '/gratitude', emoji: '🙏', name: 'Gratitude', desc: "Note what you're grateful for", kind: 'gratitude', light: '#b45309', dark: '#e3a83c' },
      { to: '/journal', emoji: '📓', name: 'Journal', desc: 'Reflect in writing', kind: 'journal', light: '#7d5a86', dark: '#c39fcc' },
      { to: '/trataka', emoji: '🕯️', name: 'Candle gazing', desc: 'Trataka — steady focus on a flame', kind: 'meditation', light: '#c2410c', dark: '#f59e5a' },
    ],
  },
]

// A small need badge (icon + label) reusing NEED_COPY — `current` marks the spirit's weakest need.
function FeedBadge({ need, current }: { need: SpiritNeedKey; current: boolean }) {
  const copy = NEED_COPY[need]
  return (
    <span className={`practice-feed-badge${current ? ' practice-feed-badge--current' : ''}`}>
      <span aria-hidden="true">{copy.icon}</span> {copy.label}
    </span>
  )
}

export default function PracticesPage() {
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const reducedMotion = prefersReducedMotion()

  useEffect(() => {
    // Non-blocking enhancement — a failure just hides the spirit nudge; the list still works.
    spiritService
      .get()
      .then(setSpirit)
      .catch(() => setSpirit(null))
  }, [])

  // Only guide by needs for a creature that has chosen a path. A pathless spark shows the practices
  // + their generic feeds, but no "needs now" highlight (ADR-0031: the spirit is always alive).
  const guiding = spirit != null && spirit.path != null
  const need = guiding ? weakestNeed(spirit) : null

  return (
    <main id="main-content" className="dashboard practices-page">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <header className="page-head">
        <h1>Practices</h1>
        <p className="page-subtitle">Every way to practice — and what it gives your spirit.</p>
      </header>

      {guiding && need && (
        <section className="practices-spirit-nudge" aria-live="polite">
          <div className="practices-spirit-nudge-art" aria-hidden="true">
            <SpiritArt
              stage={spirit.stage}
              path={spirit.path}
              glow={spirit.condition.factor}
              cosmetics={spirit.cosmetics}
              reducedMotion={reducedMotion}
            />
          </div>
          <p className="practices-spirit-nudge-text">
            <strong>{spirit.name ?? 'Your spirit'}</strong> needs more{' '}
            <strong className="practices-need-name">
              <span aria-hidden="true">{NEED_COPY[need].icon}</span> {NEED_COPY[need].label}
            </strong>{' '}
            right now — the highlighted practices below will help.
          </p>
        </section>
      )}

      {GROUPS.map((group) => (
        <section key={group.title} className="practices-group">
          <h2 className="practices-group-title">{group.title}</h2>
          <div className="practices-grid">
            {group.cards.map((card) => {
              const feeds = feedsFor(card.kind, spirit?.path ?? null)
              const needed = need != null && feeds.includes(need)
              return (
                <Link
                  key={card.to}
                  to={card.to}
                  className={`practice-card${needed ? ' practice-card--needed' : ''}`}
                  style={{
                    ['--card-fill' as string]: card.light,
                    ['--card-fill-dark' as string]: card.dark,
                  }}
                >
                  {needed && (
                    <span className="practice-card-needed">Your spirit needs this</span>
                  )}
                  <span className="practice-card-emoji" aria-hidden="true">
                    {card.emoji}
                  </span>
                  <span className="practice-card-body">
                    <span className="practice-card-name">{card.name}</span>
                    <span className="practice-card-desc">{card.desc}</span>
                    <span className="practice-card-feeds">
                      {feeds.map((n) => (
                        <FeedBadge key={n} need={n} current={need === n} />
                      ))}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
