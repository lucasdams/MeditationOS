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
  HeartHandshake,
  Album,
  Coffee,
  Trophy,
  HandHeart,
  NotebookPen,
  Flame,
  SmilePlus,
  AudioLines,
  Accessibility,
  Crosshair,
  BedDouble,
  Unplug,
  Repeat,
  Footprints,
  Dumbbell,
  Lock,
  ChevronRight,
  type LucideProps,
} from 'lucide-react'
import { spiritService } from '../services/spirit'
import { dashboardService } from '../services/dashboard'
import { GUIDED_MIN_LEVEL, isGuidedUnlocked } from '../lib/guidedSessions'
import { weakestNeed } from '../lib/spiritNeeds'
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
//
// The base need is the card's explicit `feeds` override when set, else `BASE_NEED[kind]` — so a
// `kind:'meditation'` heart practice (e.g. Loving-kindness) can feed `joyful` while STILL counting
// as the heart path's signature (signature is `kind`-based, unchanged) → `['nourished','joyful']`
// for a Vata spirit.
function feedsFor(card: PracticeCard, path: SpiritPath | null): SpiritNeedKey[] {
  const base = card.feeds ?? BASE_NEED[card.kind]
  if (path && SIGNATURE_KINDS[path].includes(card.kind)) return ['nourished', base]
  return [base]
}

interface PracticeCard {
  to: string
  // A lucide line-icon component (consistent line icons, no system emoji).
  icon: ComponentType<LucideProps>
  name: string
  desc: string
  kind: PracticeKind
  // Optional per-card BASE-need override. When set it replaces `BASE_NEED[kind]` as the need this
  // practice feeds (e.g. a heart/joy meditation feeds `joyful`, not `rested`). The signature logic
  // is unaffected — it's still `kind`-based — so a `kind:'meditation'` override still nourishes Vata.
  feeds?: SpiritNeedKey
  // Per-card accent (light + dark), mirroring the home tiles / nav pills.
  light: string
  dark: string
  // A level-gated card carries its guided-structure id so the page can resolve the
  // lock state + required level from GUIDED_MIN_LEVEL (single source of truth). Absent
  // → always unlocked.
  gate?: import('../lib/guidedSessions').GuidedStructureId
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
    // Meditation — attention / mind practices (kind:'meditation', feed Rest).
    title: 'Meditation',
    cards: [
      { to: '/meditate', icon: Brain, name: 'Mindfulness', desc: 'Open, unguided sitting', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=focus', icon: Crosshair, name: 'Focused attention', desc: 'Single-pointed concentration — steady a scattered mind', kind: 'meditation', light: '#4f46e5', dark: '#a5b4fc' },
      { to: '/meditate?guided=name-feelings', icon: SmilePlus, name: 'Name what you feel', desc: 'Notice a feeling, name it precisely, let it be', kind: 'meditation', light: '#2f6fe0', dark: '#82b4ff' },
      { to: '/meditate?guided=chakra-om', icon: AudioLines, name: 'Chakra Om', desc: 'Chant Om up through the seven chakras', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd', gate: 'chakra-om' },
      { to: '/meditate?guided=mantra', icon: Repeat, name: 'Mantra', desc: 'A word to rest the mind on — an anchor for a busy head', kind: 'meditation', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=just-sit', icon: Unplug, name: 'Dopamine reset', desc: 'Sit with nothing — rebuild your tolerance for stillness', kind: 'meditation', light: '#0d9488', dark: '#5eead4' },
      { to: '/trataka', icon: Flame, name: 'Candle gazing', desc: 'Trataka — steady focus on a flame', kind: 'meditation', light: '#d97706', dark: '#f5a742' },
    ],
  },
  {
    // Body — somatic practices (kind:'meditation', feed Rest): scanning, moving, releasing.
    title: 'Body',
    cards: [
      { to: '/meditate?guided=body-scan', icon: ScanLine, name: 'Body scan', desc: 'Guided head-to-toe relaxation', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd' },
      { to: '/meditate?guided=yoga-nidra', icon: BedDouble, name: 'Yoga Nidra', desc: 'Non-sleep deep rest — lie back and let the body unwind', kind: 'meditation', light: '#6d28d9', dark: '#c4b5fd' },
      { to: '/meditate?guided=pmr', icon: Dumbbell, name: 'Muscle release', desc: 'Tense and release, part by part, to melt tension out', kind: 'meditation', light: '#2563eb', dark: '#93c5fd' },
      { to: '/meditate?guided=stretching', icon: Accessibility, name: 'Mindful stretching', desc: 'Gentle guided stretches — move with the breath', kind: 'meditation', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/meditate?guided=walking', icon: Footprints, name: 'Mindful walking', desc: 'Attention in motion — for when sitting is too much', kind: 'meditation', light: '#0284c7', dark: '#7dd3fc' },
    ],
  },
  {
    // Heart practices — guided meditations (kind:'meditation', so they still nourish a Vata/heart
    // spirit via the signature) that FEED JOY rather than rest. The per-card `feeds: 'joyful'`
    // override reclassifies them away from the default rested base need.
    title: 'Heart',
    cards: [
      { to: '/meditate?guided=loving-kindness', icon: Heart, name: 'Loving-kindness', desc: 'Guided metta — warmth & goodwill', kind: 'meditation', feeds: 'joyful', light: '#db2777', dark: '#f472b6' },
      { to: '/meditate?guided=self-compassion', icon: HeartHandshake, name: 'Self-compassion', desc: 'Turn kindness inward — meet yourself like a good friend', kind: 'meditation', feeds: 'joyful', light: '#8b5cf6', dark: '#c4b5fd' },
      { to: '/meditate?guided=recall-good', icon: Album, name: 'Recount a good memory', desc: 'Relive a happy memory in vivid detail', kind: 'meditation', feeds: 'joyful', light: '#d97706', dark: '#f5c151' },
      { to: '/meditate?guided=savoring', icon: Coffee, name: 'Savor something good', desc: 'Slow down and soak in a simple good thing', kind: 'meditation', feeds: 'joyful', light: '#16a34a', dark: '#4ade80' },
      { to: '/meditate?guided=celebrate-win', icon: Trophy, name: 'Celebrate a win', desc: 'Acknowledge something you did — big or small', kind: 'meditation', feeds: 'joyful', light: '#c026d3', dark: '#e879f9' },
    ],
  },
  {
    title: 'Reflection',
    cards: [
      { to: '/gratitude', icon: HandHeart, name: 'Gratitude', desc: "Note what you're grateful for", kind: 'gratitude', light: '#b9760a', dark: '#f5c151' },
      { to: '/journal', icon: NotebookPen, name: 'Journal', desc: 'Reflect in writing', kind: 'journal', light: '#2f6fe0', dark: '#82b4ff' },
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
  // The user's level — drives the guided-practice level gates (e.g. Chakra Om at
  // level 5). Fetched non-blocking like the header; null until known, which keeps
  // gated cards locked (fail safe) rather than flashing them open then closing.
  const [level, setLevel] = useState<number | null>(null)
  const reducedMotion = prefersReducedMotion()

  useEffect(() => {
    // Non-blocking enhancement — a failure just hides the spirit nudge; the list still works.
    spiritService
      .get()
      .then(setSpirit)
      .catch(() => setSpirit(null))
  }, [])

  useEffect(() => {
    // Non-blocking — a failure leaves level null so gated cards stay locked.
    dashboardService
      .getStats()
      .then((s) => setLevel(s.level))
      .catch(() => {})
  }, [])

  // Only guide by needs for a creature that has chosen a path. A pathless spark shows the practices
  // + their generic feeds, but no "needs now" highlight (ADR-0031: the spirit is always alive).
  const guiding = spirit != null && spirit.path != null
  const need = guiding ? weakestNeed(spirit.needs) : null

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
              const feeds = feedsFor(card, spirit?.path ?? null)
              const needed = need != null && feeds.includes(need)
              const CardIcon = card.icon
              const locked = card.gate != null && !isGuidedUnlocked(card.gate, level)

              // A level-locked card is non-interactive (a <div>, not a <Link>): a Lock
              // badge over the icon, muted text, and a "Reach level N to unlock" line in
              // place of the description. No feed badges — it can't be practiced yet.
              if (locked) {
                const minLevel = GUIDED_MIN_LEVEL[card.gate!]
                return (
                  <div
                    key={card.to}
                    className="practice-card practice-card--locked"
                    aria-disabled="true"
                  >
                    <span className="practice-card-icon" aria-hidden="true">
                      <Lock size={20} strokeWidth={1.9} />
                    </span>
                    <span className="practice-card-body">
                      <span className="practice-card-name">{card.name}</span>
                      <span className="practice-card-desc practice-card-locked-hint">
                        Reach level {minLevel} to unlock
                      </span>
                    </span>
                  </div>
                )
              }

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
