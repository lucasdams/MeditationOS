import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Waves,
  Square,
  Sun,
  Wind,
  Brain,
  ScanLine,
  Heart,
  HandHeart,
  NotebookPen,
  Flame,
  ChevronRight,
  type LucideProps,
} from 'lucide-react'
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
  // A lucide line-icon component (consistent line icons, no system emoji).
  icon: ComponentType<LucideProps>
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
      { to: '/breathe?pattern=resonance', icon: Waves, name: 'Resonance', desc: 'Slow, longer-exhale breathing', kind: 'breathing', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/breathe?pattern=box', icon: Square, name: 'Box', desc: 'Equal in·hold·out·hold', kind: 'breathing', light: '#0891b2', dark: '#67d6e8' },
      { to: '/breathe?pattern=energizing', icon: Sun, name: 'Energizing', desc: 'Brisk, active inhale', kind: 'breathing', light: '#b9760a', dark: '#f5c151' },
      { to: '/breathe?pattern=alternate', icon: Wind, name: 'Alternate nostril', desc: 'Nadi Shodhana — balance left & right', kind: 'breathing', light: '#7c3aed', dark: '#c4b5fd' },
    ],
  },
  {
    title: 'Meditation',
    cards: [
      { to: '/meditate', icon: Brain, name: 'Mindfulness', desc: 'Open, unguided sitting', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=body-scan', icon: ScanLine, name: 'Body scan', desc: 'Guided head-to-toe relaxation', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd' },
      { to: '/meditate?guided=loving-kindness', icon: Heart, name: 'Loving-kindness', desc: 'Guided metta — warmth & goodwill', kind: 'meditation', light: '#d6396f', dark: '#f06a98' },
    ],
  },
  {
    title: 'Reflection',
    cards: [
      { to: '/gratitude', icon: HandHeart, name: 'Gratitude', desc: "Note what you're grateful for", kind: 'gratitude', light: '#b9760a', dark: '#f5c151' },
      { to: '/journal', icon: NotebookPen, name: 'Journal', desc: 'Reflect in writing', kind: 'journal', light: '#2f6fe0', dark: '#82b4ff' },
      { to: '/trataka', icon: Flame, name: 'Candle gazing', desc: 'Trataka — steady focus on a flame', kind: 'meditation', light: '#d97706', dark: '#f5a742' },
    ],
  },
]

// A small need badge (icon + label) reusing NEED_COPY — `current` marks the spirit's weakest need.
function FeedBadge({ need, current }: { need: SpiritNeedKey; current: boolean }) {
  const copy = NEED_COPY[need]
  const NeedIcon = copy.icon
  return (
    <span className={`practice-feed-badge${current ? ' practice-feed-badge--current' : ''}`}>
      <NeedIcon size={16} strokeWidth={1.75} aria-hidden="true" /> {copy.label}
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
              {(() => {
                const NeedIcon = NEED_COPY[need].icon
                return <NeedIcon size={16} strokeWidth={1.75} aria-hidden="true" />
              })()}{' '}
              {NEED_COPY[need].label}
            </strong>{' '}
            right now — the highlighted practices below will help.
          </p>
        </section>
      )}

      {GROUPS.map((group) => (
        <section key={group.title} className="practices-group">
          <h2 className="practices-group-title">
            {group.title}
            <span className="practices-group-count">{group.cards.length}</span>
          </h2>
          <div className="practices-grid">
            {group.cards.map((card) => {
              const feeds = feedsFor(card.kind, spirit?.path ?? null)
              const needed = need != null && feeds.includes(need)
              const CardIcon = card.icon
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
                  <span className="practice-card-icon" aria-hidden="true">
                    <CardIcon size={20} strokeWidth={1.9} />
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
                  <ChevronRight
                    className="practice-card-go"
                    size={18}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}
