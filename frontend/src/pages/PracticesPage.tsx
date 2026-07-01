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
  ListOrdered,
  Tags,
  Ear,
  Feather,
  Sunrise,
  PartyPopper,
  Telescope,
  Sunset,
  CloudMoon,
  CloudOff,
  Eye,
  Hand,
  OctagonPause,
  Activity,
  Leaf,
  DoorOpen,
  Lock,
  ChevronRight,
  Search,
  X,
  Compass,
  Plus,
  type LucideProps,
} from 'lucide-react'
import { spiritService } from '../services/spirit'
import { dashboardService } from '../services/dashboard'
import { GUIDED_MIN_LEVEL, isGuidedUnlocked } from '../lib/guidedSessions'
import { roundOutFacet } from '../lib/spiritNeeds'
import { SpiritArt, NEED_COPY, prefersReducedMotion } from '../components/Spirit'
import type { SpiritNeedKey, SpiritPath, SpiritState } from '../types'

// The Practices hub — one browsable "activities" screen listing every practice technique grouped
// by category. Each card deep-links into its practice with the variant pre-selected (Breathe reads
// `?pattern=`, Meditate reads `?guided=`; the reflection pages have their own routes).
//
// It's also SPIRIT-AWARE: each card shows which of the spirit's three facets it feeds, and when you
// have a living creature the page gently highlights the practices that round out whatever facet has
// had a little less lately (ADR-0032 — an optional balance suggestion, not a "what it needs" demand;
// shown only when the balance is uneven). The spirit fetch is non-blocking: the list always renders.

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
      { to: '/meditate', icon: Brain, name: 'Mindfulness', desc: 'Open, unguided sitting — just be with the breath', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=focus', icon: Crosshair, name: 'Focused attention', desc: 'Steady a scattered mind on one anchor', kind: 'meditation', light: '#4f46e5', dark: '#a5b4fc' },
      { to: '/meditate?guided=count-breath', icon: ListOrdered, name: 'Count the breath', desc: 'Count each breath one to ten, restart when you drift', kind: 'meditation', light: '#4f46e5', dark: '#a5b4fc' },
      { to: '/meditate?guided=noting', icon: Tags, name: 'Noting', desc: 'Softly label what arises — thinking, hearing, feeling', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=sound-bath', icon: Ear, name: 'Sound meditation', desc: 'Rest attention on the sounds around you, near and far', kind: 'meditation', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=name-feelings', icon: SmilePlus, name: 'Name what you feel', desc: 'Notice a feeling, name it precisely, let it be', kind: 'meditation', light: '#2f6fe0', dark: '#82b4ff' },
      { to: '/meditate?guided=chakra-om', icon: AudioLines, name: 'Chakra Om', desc: 'Chant Om up through the seven chakras', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd', gate: 'chakra-om' },
      { to: '/meditate?guided=mantra', icon: Repeat, name: 'Mantra', desc: 'A word to rest the mind on — an anchor for a busy head', kind: 'meditation', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=just-sit', icon: Unplug, name: 'Dopamine reset', desc: 'Sit with nothing — relearn stillness', kind: 'meditation', light: '#0d9488', dark: '#5eead4' },
      { to: '/trataka', icon: Flame, name: 'Candle gazing', desc: 'Trataka — steady focus on a flame', kind: 'meditation', light: '#d97706', dark: '#f5a742' },
    ],
  },
  {
    // Body — somatic practices (kind:'meditation', feed Rest): scanning, moving, releasing.
    title: 'Body',
    cards: [
      { to: '/meditate?guided=body-scan', icon: ScanLine, name: 'Body scan', desc: 'Move awareness through the body, head to toe', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd' },
      { to: '/meditate?guided=yoga-nidra', icon: BedDouble, name: 'Yoga Nidra', desc: 'Non-sleep deep rest — lie back and unwind', kind: 'meditation', light: '#6d28d9', dark: '#c4b5fd' },
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
      { to: '/meditate?guided=loving-kindness', icon: Heart, name: 'Loving-kindness', desc: 'Send warm wishes to yourself and outward', kind: 'meditation', feeds: 'joyful', light: '#db2777', dark: '#f472b6' },
      { to: '/meditate?guided=self-compassion', icon: HeartHandshake, name: 'Self-compassion', desc: 'Turn kindness inward, like a good friend', kind: 'meditation', feeds: 'joyful', light: '#8b5cf6', dark: '#c4b5fd' },
      { to: '/meditate?guided=recall-good', icon: Album, name: 'Recount a good memory', desc: 'Relive a happy memory in vivid detail', kind: 'meditation', feeds: 'joyful', light: '#d97706', dark: '#f5c151' },
      { to: '/meditate?guided=savoring', icon: Coffee, name: 'Savor something good', desc: 'Slow down and soak in a simple good thing', kind: 'meditation', feeds: 'joyful', light: '#16a34a', dark: '#4ade80' },
      { to: '/meditate?guided=celebrate-win', icon: Trophy, name: 'Celebrate a win', desc: 'Acknowledge something you did — big or small', kind: 'meditation', feeds: 'joyful', light: '#c026d3', dark: '#e879f9' },
      { to: '/meditate?guided=forgiveness', icon: Feather, name: 'Forgiveness', desc: 'Set down an old hurt, gently — toward yourself or another', kind: 'meditation', feeds: 'joyful', light: '#8b5cf6', dark: '#c4b5fd' },
      { to: '/meditate?guided=gratitude-sit', icon: Sunrise, name: 'Gratitude meditation', desc: 'A guided gratitude sit — bring to mind what holds you up', kind: 'meditation', feeds: 'joyful', light: '#d97706', dark: '#f5c151' },
      { to: '/meditate?guided=sympathetic-joy', icon: PartyPopper, name: 'Sympathetic joy', desc: "Delight in others' good fortune — joy that costs nothing", kind: 'meditation', feeds: 'joyful', light: '#c026d3', dark: '#e879f9' },
      { to: '/meditate?guided=awe', icon: Telescope, name: 'Awe & wonder', desc: 'Evoke a sense of vastness — and feel yourself part of it', kind: 'meditation', feeds: 'joyful', light: '#7c3aed', dark: '#c4b5fd' },
    ],
  },
  {
    // Sleep — wind-down practices (kind:'meditation', feed Rest). Softer voice, bells taper off,
    // no bright end; several scripts intentionally underuse bells.
    title: 'Sleep',
    cards: [
      { to: '/meditate?guided=wind-down', icon: Sunset, name: 'Wind down', desc: 'Let the body grow heavy and give yourself permission to drift', kind: 'meditation', feeds: 'rested', light: '#6d28d9', dark: '#c4b5fd' },
      { to: '/meditate?guided=four-seven-eight', icon: CloudMoon, name: '4-7-8 breath', desc: 'In for four, hold for seven, out for eight — a settling rhythm', kind: 'meditation', feeds: 'rested', light: '#4338ca', dark: '#a5b4fc' },
      { to: '/meditate?guided=set-down-day', icon: CloudOff, name: 'Set down the day', desc: "Put the day's loose ends somewhere safe till morning", kind: 'meditation', feeds: 'rested', light: '#6d28d9', dark: '#c4b5fd' },
    ],
  },
  {
    // Steady — self-regulation practices for harder moments (kind:'meditation', feed Rest, except
    // Soften/soothe/allow which feeds Joy as kindness toward self). Non-clinical: NOT treatment.
    title: 'Steady',
    cards: [
      { to: '/meditate?guided=physiological-sigh', icon: Wind, name: 'Physiological sigh', desc: 'Two breaths in, one long breath out — the fastest reset', kind: 'meditation', feeds: 'rested', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/meditate?guided=steady-senses', icon: Eye, name: 'Ground in your senses', desc: 'Come back to now through your five senses (5-4-3-2-1)', kind: 'meditation', feeds: 'rested', light: '#0284c7', dark: '#7dd3fc' },
      { to: '/meditate?guided=steady-feet', icon: Footprints, name: 'Feet on the ground', desc: 'Drop your weight down and feel held', kind: 'meditation', feeds: 'rested', light: '#0d9488', dark: '#5eead4' },
      { to: '/meditate?guided=steady-soothe', icon: Hand, name: 'Soften, soothe, allow', desc: 'Meet a hard feeling with a kind touch', kind: 'meditation', feeds: 'joyful', light: '#db2777', dark: '#f472b6' },
    ],
  },
  {
    // Everyday — short, anywhere, no-setup on-ramps (kind:'meditation', feed Rest).
    title: 'Everyday',
    cards: [
      { to: '/meditate?guided=three-breaths', icon: Leaf, name: 'Three mindful breaths', desc: 'A one-minute reset — just three breaths', kind: 'meditation', feeds: 'rested', light: '#16a34a', dark: '#4ade80' },
      { to: '/meditate?guided=stop-pause', icon: OctagonPause, name: 'Pause & STOP', desc: 'Stop, Take a breath, Observe, Proceed', kind: 'meditation', feeds: 'rested', light: '#2563eb', dark: '#93c5fd' },
      { to: '/meditate?guided=body-checkin', icon: Activity, name: 'Body check-in', desc: 'A quick weather-report on your body', kind: 'meditation', feeds: 'rested', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=arriving', icon: DoorOpen, name: 'Arriving', desc: 'A clean pause between tasks or places', kind: 'meditation', feeds: 'rested', light: '#5847f0', dark: '#a8a2ff' },
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

// A small facet badge (icon + label) reusing NEED_COPY — `current` marks the facet the page is
// gently suggesting you round out (ADR-0032), so the matching cards read as "a little more of this".
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
  // The live filter query — matched case-insensitively against each card's name + description.
  const [query, setQuery] = useState('')
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

  // Only suggest a round-out for a creature that has chosen a path. A pathless spark shows the
  // practices + their generic feeds, but no highlight. ADR-0032: `need` is the least-represented
  // facet worth gently rounding out, or null when the balance is even (then no highlight/nudge).
  const guiding = spirit != null && spirit.path != null
  const need = guiding ? roundOutFacet(spirit.needs) : null

  // Live search: filter each group's cards against the trimmed, lower-cased query (name + desc).
  // With no query every group renders in full; with one, empty groups drop out and a gentle empty
  // state shows if nothing at all matches. Filtering is presentational — it never touches the
  // round-out highlight, which still keys off the (unfiltered) least-represented facet.
  const q = query.trim().toLowerCase()
  const filteredGroups = q
    ? GROUPS.map((group) => ({
        ...group,
        cards: group.cards.filter(
          (card) =>
            card.name.toLowerCase().includes(q) || card.desc.toLowerCase().includes(q),
        ),
      })).filter((group) => group.cards.length > 0)
    : GROUPS
  const noMatches = q !== '' && filteredGroups.length === 0

  return (
    <main id="main-content" className="dashboard practices-page">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <header className="page-head">
        <h1>Practices</h1>
        <p className="page-subtitle">Every way to practice — and what it gives your spirit.</p>
      </header>

      {/* Programs — the two non-technique destinations reachable from here (the old nav dropdown is
          gone): a multi-day guided path, and logging a past session. Navigation, not techniques, so
          they sit in their own quiet row above the practice groups. */}
      <nav className="practices-programs" aria-label="Programs">
        <Link to="/paths" className="practices-program-link">
          <span className="practices-program-icon" aria-hidden="true">
            <Compass size={18} strokeWidth={1.9} />
          </span>
          <span className="practices-program-body">
            <span className="practices-program-name">Guided paths</span>
            <span className="practices-program-desc">A day-by-day course to settle in</span>
          </span>
          <ChevronRight
            className="practices-program-go"
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
        <Link to="/sessions/new" className="practices-program-link">
          <span className="practices-program-icon" aria-hidden="true">
            <Plus size={18} strokeWidth={1.9} />
          </span>
          <span className="practices-program-body">
            <span className="practices-program-name">Log a past session</span>
            <span className="practices-program-desc">Record a practice you did offline</span>
          </span>
          <ChevronRight
            className="practices-program-go"
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      </nav>

      {/* Calm live search — filters the cards below as you type. Escape or the × clears it. */}
      <div className="practices-search">
        <Search
          className="practices-search-icon"
          size={18}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        <input
          type="search"
          className="practices-search-input"
          value={query}
          placeholder="Search practices…"
          aria-label="Search practices"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {query !== '' && (
          <button
            type="button"
            className="practices-search-clear"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

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
            <strong>{spirit.name ?? 'Your spirit'}</strong> has had a little less{' '}
            <strong className="practices-need-name">
              {(() => {
                const NeedIcon = NEED_COPY[need].icon
                return <NeedIcon size={16} strokeWidth={1.75} aria-hidden="true" />
              })()}{' '}
              {NEED_COPY[need].label}
            </strong>{' '}
            lately — the highlighted practices would round things out, if you feel like it.
          </p>
        </section>
      )}

      {noMatches && (
        <p className="practices-empty" role="status">
          No practices match “{query.trim()}”.
        </p>
      )}

      {filteredGroups.map((group) => (
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
