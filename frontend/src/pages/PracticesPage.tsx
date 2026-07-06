import { useEffect, useRef, useState, type ComponentType } from 'react'
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
  Sparkles,
  Moon,
  Anchor,
  Clock,
  PersonStanding,
  Sprout,
  type LucideProps,
} from 'lucide-react'
import { spiritService } from '../services/spirit'
import { dashboardService } from '../services/dashboard'
import { GUIDED_MIN_LEVEL, isGuidedUnlocked } from '../lib/guidedSessions'
import { roundOutFacet } from '../lib/spiritNeeds'
import { suggestedPractices } from '../lib/suggestions'
import { SpiritArt, NEED_COPY, prefersReducedMotion } from '../components/Spirit'
import { useT } from '../i18n'
import type { SpiritNeedKey, SpiritPath, SpiritState } from '../types'

// The Practices hub — one browsable "activities" screen listing every practice technique grouped
// by category. Each card deep-links into its practice with the variant pre-selected (Breathe reads
// `?pattern=`, Meditate reads `?guided=`; the reflection pages have their own routes).
//
// Each category reads as a DISTINCT block — an accent icon, a real title + one-line blurb, and a
// soft accent hairline — so the long list doesn't blur into one uniform grid. A small, optional
// "Suggested for you" set sits up top (time-of-day, or the spirit's least-fed facet).
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
  // i18n catalog keys for the card's name + one-line description, resolved with t() at render
  // (and before the search filter, so filtering matches the displayed language). English is the
  // source of truth — the catalog values are byte-identical to the original literals.
  nameKey: string
  descKey: string
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
  // i18n catalog keys for the group's title + one-line blurb, resolved with t() at render.
  titleKey: string
  // A lucide icon + one-line blurb + accent (light/dark) give each category its own identity,
  // so the sections read as distinct blocks rather than one long uniform grid.
  icon: ComponentType<LucideProps>
  blurbKey: string
  light: string
  dark: string
  cards: PracticeCard[]
}

const GROUPS: PracticeGroup[] = [
  {
    titleKey: 'practice.group.breathing.title',
    icon: Wind,
    blurbKey: 'practice.group.breathing.blurb',
    light: '#0e8aa6',
    dark: '#5fd2e8',
    cards: [
      { to: '/breathe?pattern=resonance', icon: Waves, nameKey: 'practice.card.resonance.name', descKey: 'practice.card.resonance.desc', kind: 'breathing', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/breathe?pattern=box', icon: Square, nameKey: 'practice.card.box.name', descKey: 'practice.card.box.desc', kind: 'breathing', light: '#0891b2', dark: '#67d6e8' },
      { to: '/breathe?pattern=energizing', icon: Sun, nameKey: 'practice.card.energizing.name', descKey: 'practice.card.energizing.desc', kind: 'breathing', light: '#b9760a', dark: '#f5c151' },
      { to: '/breathe?pattern=alternate', icon: Wind, nameKey: 'practice.card.alternate.name', descKey: 'practice.card.alternate.desc', kind: 'breathing', light: '#7c3aed', dark: '#c4b5fd' },
    ],
  },
  {
    // Meditation — attention / mind practices (kind:'meditation', feed Rest).
    titleKey: 'practice.group.meditation.title',
    icon: Brain,
    blurbKey: 'practice.group.meditation.blurb',
    light: '#5847f0',
    dark: '#a8a2ff',
    cards: [
      { to: '/meditate', icon: Brain, nameKey: 'practice.card.mindfulness.name', descKey: 'practice.card.mindfulness.desc', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=focus', icon: Crosshair, nameKey: 'practice.card.focus.name', descKey: 'practice.card.focus.desc', kind: 'meditation', light: '#4f46e5', dark: '#a5b4fc' },
      { to: '/meditate?guided=count-breath', icon: ListOrdered, nameKey: 'practice.card.countBreath.name', descKey: 'practice.card.countBreath.desc', kind: 'meditation', light: '#4f46e5', dark: '#a5b4fc' },
      { to: '/meditate?guided=noting', icon: Tags, nameKey: 'practice.card.noting.name', descKey: 'practice.card.noting.desc', kind: 'meditation', light: '#5847f0', dark: '#a8a2ff' },
      { to: '/meditate?guided=sound-bath', icon: Ear, nameKey: 'practice.card.soundBath.name', descKey: 'practice.card.soundBath.desc', kind: 'meditation', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=name-feelings', icon: SmilePlus, nameKey: 'practice.card.nameFeelings.name', descKey: 'practice.card.nameFeelings.desc', kind: 'meditation', light: '#2f6fe0', dark: '#82b4ff' },
      { to: '/meditate?guided=chakra-om', icon: AudioLines, nameKey: 'practice.card.chakraOm.name', descKey: 'practice.card.chakraOm.desc', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd', gate: 'chakra-om' },
      { to: '/meditate?guided=mantra', icon: Repeat, nameKey: 'practice.card.mantra.name', descKey: 'practice.card.mantra.desc', kind: 'meditation', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=just-sit', icon: Unplug, nameKey: 'practice.card.justSit.name', descKey: 'practice.card.justSit.desc', kind: 'meditation', light: '#0d9488', dark: '#5eead4' },
      { to: '/trataka', icon: Flame, nameKey: 'practice.card.trataka.name', descKey: 'practice.card.trataka.desc', kind: 'meditation', light: '#d97706', dark: '#f5a742' },
    ],
  },
  {
    // Body — somatic practices (kind:'meditation', feed Rest): scanning, moving, releasing.
    titleKey: 'practice.group.body.title',
    icon: PersonStanding,
    blurbKey: 'practice.group.body.blurb',
    light: '#7c3aed',
    dark: '#c4b5fd',
    cards: [
      { to: '/meditate?guided=body-scan', icon: ScanLine, nameKey: 'practice.card.bodyScan.name', descKey: 'practice.card.bodyScan.desc', kind: 'meditation', light: '#7c3aed', dark: '#c4b5fd' },
      { to: '/meditate?guided=yoga-nidra', icon: BedDouble, nameKey: 'practice.card.yogaNidra.name', descKey: 'practice.card.yogaNidra.desc', kind: 'meditation', light: '#6d28d9', dark: '#c4b5fd' },
      { to: '/meditate?guided=pmr', icon: Dumbbell, nameKey: 'practice.card.pmr.name', descKey: 'practice.card.pmr.desc', kind: 'meditation', light: '#2563eb', dark: '#93c5fd' },
      { to: '/meditate?guided=stretching', icon: Accessibility, nameKey: 'practice.card.stretching.name', descKey: 'practice.card.stretching.desc', kind: 'meditation', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/meditate?guided=walking', icon: Footprints, nameKey: 'practice.card.walking.name', descKey: 'practice.card.walking.desc', kind: 'meditation', light: '#0284c7', dark: '#7dd3fc' },
    ],
  },
  {
    // Heart practices — guided meditations (kind:'meditation', so they still nourish a Vata/heart
    // spirit via the signature) that FEED JOY rather than rest. The per-card `feeds: 'joyful'`
    // override reclassifies them away from the default rested base need.
    titleKey: 'practice.group.heart.title',
    icon: Heart,
    blurbKey: 'practice.group.heart.blurb',
    light: '#db2777',
    dark: '#f472b6',
    cards: [
      { to: '/meditate?guided=loving-kindness', icon: Heart, nameKey: 'practice.card.lovingKindness.name', descKey: 'practice.card.lovingKindness.desc', kind: 'meditation', feeds: 'joyful', light: '#db2777', dark: '#f472b6' },
      { to: '/meditate?guided=self-compassion', icon: HeartHandshake, nameKey: 'practice.card.selfCompassion.name', descKey: 'practice.card.selfCompassion.desc', kind: 'meditation', feeds: 'joyful', light: '#8b5cf6', dark: '#c4b5fd' },
      { to: '/meditate?guided=recall-good', icon: Album, nameKey: 'practice.card.recallGood.name', descKey: 'practice.card.recallGood.desc', kind: 'meditation', feeds: 'joyful', light: '#d97706', dark: '#f5c151' },
      { to: '/meditate?guided=savoring', icon: Coffee, nameKey: 'practice.card.savoring.name', descKey: 'practice.card.savoring.desc', kind: 'meditation', feeds: 'joyful', light: '#16a34a', dark: '#4ade80' },
      { to: '/meditate?guided=celebrate-win', icon: Trophy, nameKey: 'practice.card.celebrateWin.name', descKey: 'practice.card.celebrateWin.desc', kind: 'meditation', feeds: 'joyful', light: '#c026d3', dark: '#e879f9' },
      { to: '/meditate?guided=forgiveness', icon: Feather, nameKey: 'practice.card.forgiveness.name', descKey: 'practice.card.forgiveness.desc', kind: 'meditation', feeds: 'joyful', light: '#8b5cf6', dark: '#c4b5fd' },
      { to: '/meditate?guided=gratitude-sit', icon: Sunrise, nameKey: 'practice.card.gratitudeSit.name', descKey: 'practice.card.gratitudeSit.desc', kind: 'meditation', feeds: 'joyful', light: '#d97706', dark: '#f5c151' },
      { to: '/meditate?guided=sympathetic-joy', icon: PartyPopper, nameKey: 'practice.card.sympatheticJoy.name', descKey: 'practice.card.sympatheticJoy.desc', kind: 'meditation', feeds: 'joyful', light: '#c026d3', dark: '#e879f9' },
      { to: '/meditate?guided=awe', icon: Telescope, nameKey: 'practice.card.awe.name', descKey: 'practice.card.awe.desc', kind: 'meditation', feeds: 'joyful', light: '#7c3aed', dark: '#c4b5fd' },
    ],
  },
  {
    // Sleep — wind-down practices (kind:'meditation', feed Rest). Softer voice, bells taper off,
    // no bright end; several scripts intentionally underuse bells.
    titleKey: 'practice.group.sleep.title',
    icon: Moon,
    blurbKey: 'practice.group.sleep.blurb',
    light: '#4338ca',
    dark: '#a5b4fc',
    cards: [
      { to: '/meditate?guided=wind-down', icon: Sunset, nameKey: 'practice.card.windDown.name', descKey: 'practice.card.windDown.desc', kind: 'meditation', feeds: 'rested', light: '#6d28d9', dark: '#c4b5fd' },
      { to: '/meditate?guided=four-seven-eight', icon: CloudMoon, nameKey: 'practice.card.fourSevenEight.name', descKey: 'practice.card.fourSevenEight.desc', kind: 'meditation', feeds: 'rested', light: '#4338ca', dark: '#a5b4fc' },
      { to: '/meditate?guided=set-down-day', icon: CloudOff, nameKey: 'practice.card.setDownDay.name', descKey: 'practice.card.setDownDay.desc', kind: 'meditation', feeds: 'rested', light: '#6d28d9', dark: '#c4b5fd' },
    ],
  },
  {
    // Steady — self-regulation practices for harder moments (kind:'meditation', feed Rest, except
    // Soften/soothe/allow which feeds Joy as kindness toward self). Non-clinical: NOT treatment.
    titleKey: 'practice.group.steady.title',
    icon: Anchor,
    blurbKey: 'practice.group.steady.blurb',
    light: '#0d9488',
    dark: '#5eead4',
    cards: [
      { to: '/meditate?guided=physiological-sigh', icon: Wind, nameKey: 'practice.card.physiologicalSigh.name', descKey: 'practice.card.physiologicalSigh.desc', kind: 'meditation', feeds: 'rested', light: '#0e8aa6', dark: '#5fd2e8' },
      { to: '/meditate?guided=steady-senses', icon: Eye, nameKey: 'practice.card.steadySenses.name', descKey: 'practice.card.steadySenses.desc', kind: 'meditation', feeds: 'rested', light: '#0284c7', dark: '#7dd3fc' },
      { to: '/meditate?guided=steady-feet', icon: Footprints, nameKey: 'practice.card.steadyFeet.name', descKey: 'practice.card.steadyFeet.desc', kind: 'meditation', feeds: 'rested', light: '#0d9488', dark: '#5eead4' },
      { to: '/meditate?guided=steady-soothe', icon: Hand, nameKey: 'practice.card.steadySoothe.name', descKey: 'practice.card.steadySoothe.desc', kind: 'meditation', feeds: 'joyful', light: '#db2777', dark: '#f472b6' },
    ],
  },
  {
    // Everyday — short, anywhere, no-setup on-ramps (kind:'meditation', feed Rest).
    titleKey: 'practice.group.everyday.title',
    icon: Clock,
    blurbKey: 'practice.group.everyday.blurb',
    light: '#16a34a',
    dark: '#4ade80',
    cards: [
      { to: '/meditate?guided=three-breaths', icon: Leaf, nameKey: 'practice.card.threeBreaths.name', descKey: 'practice.card.threeBreaths.desc', kind: 'meditation', feeds: 'rested', light: '#16a34a', dark: '#4ade80' },
      { to: '/meditate?guided=stop-pause', icon: OctagonPause, nameKey: 'practice.card.stopPause.name', descKey: 'practice.card.stopPause.desc', kind: 'meditation', feeds: 'rested', light: '#2563eb', dark: '#93c5fd' },
      { to: '/meditate?guided=body-checkin', icon: Activity, nameKey: 'practice.card.bodyCheckin.name', descKey: 'practice.card.bodyCheckin.desc', kind: 'meditation', feeds: 'rested', light: '#0891b2', dark: '#67d6e8' },
      { to: '/meditate?guided=arriving', icon: DoorOpen, nameKey: 'practice.card.arriving.name', descKey: 'practice.card.arriving.desc', kind: 'meditation', feeds: 'rested', light: '#5847f0', dark: '#a8a2ff' },
    ],
  },
  {
    titleKey: 'practice.group.reflection.title',
    icon: NotebookPen,
    blurbKey: 'practice.group.reflection.blurb',
    light: '#b9760a',
    dark: '#f5c151',
    cards: [
      { to: '/gratitude', icon: HandHeart, nameKey: 'practice.card.gratitude.name', descKey: 'practice.card.gratitude.desc', kind: 'gratitude', light: '#b9760a', dark: '#f5c151' },
      { to: '/journal', icon: NotebookPen, nameKey: 'practice.card.journal.name', descKey: 'practice.card.journal.desc', kind: 'journal', light: '#2f6fe0', dark: '#82b4ff' },
    ],
  },
]

// A flat lookup of every practice card by its route, so the Suggested-for-you set (which works in
// routes) can resolve to real catalog cards and render them identically to the groups below.
const CARD_BY_TO = new Map<string, PracticeCard>(
  GROUPS.flatMap((group) => group.cards.map((card) => [card.to, card] as const)),
)

// Per-practice metadata for the friendlier hub, keyed by route (kept out of the catalog so the card
// list stays lean). `mins` is a SUGGESTED length shown as a gentle time cue — meditations run for
// whatever length you pick in the player, so it's guidance, not a hard limit. "You choose" here
// (browsing: the length is up to you) is deliberately NOT the player's "Untimed" (a duration
// option: no target at all) — the card describes the choice, the stepper names one option in it.
// `beginner` flags the low-barrier, no-jargon practices with a "Good first practice" badge so
// newcomers can spot easy entries anywhere in the list.
// `minsKey` is an i18n catalog key resolved at render (numeric minute values reuse the shared
// `practice.mins.*` keys; the browsing "You choose" cue has its own key). "You choose" here
// (the length is up to you) is deliberately NOT the player's "Untimed" — the card describes the
// choice, the stepper names one option in it.
const PRACTICE_META: Record<string, { minsKey: string; beginner?: boolean }> = {
  '/breathe?pattern=resonance': { minsKey: 'practice.mins.5', beginner: true },
  '/breathe?pattern=box': { minsKey: 'practice.mins.4' },
  '/breathe?pattern=energizing': { minsKey: 'practice.mins.3' },
  '/breathe?pattern=alternate': { minsKey: 'practice.mins.5' },
  '/meditate': { minsKey: 'practice.mins.youChoose' },
  '/meditate?guided=focus': { minsKey: 'practice.mins.10', beginner: true },
  '/meditate?guided=count-breath': { minsKey: 'practice.mins.10' },
  '/meditate?guided=noting': { minsKey: 'practice.mins.10' },
  '/meditate?guided=sound-bath': { minsKey: 'practice.mins.10' },
  '/meditate?guided=name-feelings': { minsKey: 'practice.mins.8' },
  '/meditate?guided=chakra-om': { minsKey: 'practice.mins.12' },
  '/meditate?guided=mantra': { minsKey: 'practice.mins.10' },
  '/meditate?guided=just-sit': { minsKey: 'practice.mins.10' },
  '/trataka': { minsKey: 'practice.mins.youChoose' },
  '/meditate?guided=body-scan': { minsKey: 'practice.mins.15', beginner: true },
  '/meditate?guided=yoga-nidra': { minsKey: 'practice.mins.20' },
  '/meditate?guided=pmr': { minsKey: 'practice.mins.12' },
  '/meditate?guided=stretching': { minsKey: 'practice.mins.10' },
  '/meditate?guided=walking': { minsKey: 'practice.mins.10' },
  '/meditate?guided=loving-kindness': { minsKey: 'practice.mins.10', beginner: true },
  '/meditate?guided=self-compassion': { minsKey: 'practice.mins.10' },
  '/meditate?guided=recall-good': { minsKey: 'practice.mins.8' },
  '/meditate?guided=savoring': { minsKey: 'practice.mins.5' },
  '/meditate?guided=celebrate-win': { minsKey: 'practice.mins.5' },
  '/meditate?guided=forgiveness': { minsKey: 'practice.mins.12' },
  '/meditate?guided=gratitude-sit': { minsKey: 'practice.mins.8' },
  '/meditate?guided=sympathetic-joy': { minsKey: 'practice.mins.8' },
  '/meditate?guided=awe': { minsKey: 'practice.mins.8' },
  '/meditate?guided=wind-down': { minsKey: 'practice.mins.15' },
  '/meditate?guided=four-seven-eight': { minsKey: 'practice.mins.8' },
  '/meditate?guided=set-down-day': { minsKey: 'practice.mins.10' },
  '/meditate?guided=physiological-sigh': { minsKey: 'practice.mins.2', beginner: true },
  '/meditate?guided=steady-senses': { minsKey: 'practice.mins.3' },
  '/meditate?guided=steady-feet': { minsKey: 'practice.mins.3' },
  '/meditate?guided=steady-soothe': { minsKey: 'practice.mins.5' },
  '/meditate?guided=three-breaths': { minsKey: 'practice.mins.1', beginner: true },
  '/meditate?guided=stop-pause': { minsKey: 'practice.mins.1', beginner: true },
  '/meditate?guided=body-checkin': { minsKey: 'practice.mins.2' },
  '/meditate?guided=arriving': { minsKey: 'practice.mins.1' },
  '/gratitude': { minsKey: 'practice.mins.3', beginner: true },
  '/journal': { minsKey: 'practice.mins.5' },
}

// The "New here? Start here" on-ramp — an ordered, curated handful of the gentlest practices, shown
// to newcomers so they aren't faced with all 48 at once. All ungated + beginner-flagged above.
const BEGINNER_STARTERS = [
  '/meditate?guided=three-breaths',
  '/breathe?pattern=resonance',
  '/meditate?guided=body-scan',
  '/meditate?guided=focus',
]

// One practice card — shared by the Suggested set and every category group so they stay identical.
// `compact` is the calm catalog-grid diet: icon, name, beginner tag and minutes only (no
// description) so the long shelves read quietly; the curated Beginner/Suggested sections render
// full cards (their descriptions are the explanation). The spirit round-out still reads through
// the `--needed` highlight + the nudge banner — the old per-card facet badges are gone (they were
// the grid's noisiest element; ADR-0032 keeps the balance informational, not front-and-centre).
// A level-locked card is non-interactive (a <div>, not a <Link>): a Lock badge over the icon,
// muted text, and a "Reach level N to unlock" line in place of the description.
function PracticeCardLink({
  card,
  need,
  path,
  level,
  compact = false,
}: {
  card: PracticeCard
  need: SpiritNeedKey | null
  path: SpiritPath | null
  level: number | null
  compact?: boolean
}) {
  const { t } = useT()
  const feeds = feedsFor(card, path)
  const needed = need != null && feeds.includes(need)
  const CardIcon = card.icon
  const locked = card.gate != null && !isGuidedUnlocked(card.gate, level)
  const meta = PRACTICE_META[card.to]

  if (locked) {
    const minLevel = GUIDED_MIN_LEVEL[card.gate!]
    return (
      <div className="practice-card practice-card--locked" aria-disabled="true">
        <span className="practice-card-icon" aria-hidden="true">
          <Lock size={20} strokeWidth={1.9} />
        </span>
        <span className="practice-card-body">
          <span className="practice-card-name">{t(card.nameKey)}</span>
          <span className="practice-card-desc practice-card-locked-hint">
            {t('practice.hub.lockedHint', { level: minLevel ?? '' })}
          </span>
        </span>
      </div>
    )
  }

  return (
    <Link
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
        <span className="practice-card-name">
          {t(card.nameKey)}
          {meta?.beginner && (
            <span className="practice-beginner-badge">
              <Sprout size={12} strokeWidth={2} aria-hidden="true" /> {t('practice.hub.beginnerBadge')}
            </span>
          )}
        </span>
        {!compact && <span className="practice-card-desc">{t(card.descKey)}</span>}
        {meta?.minsKey && (
          <span className="practice-card-feeds">
            <span className="practice-length">
              <Clock size={14} strokeWidth={1.9} aria-hidden="true" /> {t(meta.minsKey)}
            </span>
          </span>
        )}
      </span>
      <ChevronRight className="practice-card-go" size={18} strokeWidth={2} aria-hidden="true" />
    </Link>
  )
}

export default function PracticesPage() {
  const { t } = useT()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The user's level — drives the guided-practice level gates (e.g. Chakra Om at
  // level 5). Fetched non-blocking like the header; null until known, which keeps
  // gated cards locked (fail safe) rather than flashing them open then closing.
  const [level, setLevel] = useState<number | null>(null)
  // The live filter query — matched case-insensitively against each card's name + description.
  const [query, setQuery] = useState('')
  // The active category chip (a group titleKey), or null for the calm "All" overview where each
  // group shows only its first few cards. One shelf at a time keeps the big catalog uncrowded.
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  // The chip bar — "See all" scrolls back up to it so the expanded shelf lands in view.
  const filterRef = useRef<HTMLDivElement>(null)
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

  // Live search: filter each group's cards against the trimmed, lower-cased query (name + desc —
  // the description still indexes even though the compact grid cards no longer display it). With a
  // query, empty groups drop out and a gentle empty state shows if nothing at all matches. A search
  // overrides the category chips (an explicit act — results show across every group, in full).
  // Filtering is presentational — it never touches the round-out highlight, which still keys off
  // the (unfiltered) least-represented facet.
  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const filteredGroups = searching
    ? GROUPS.map((group) => ({
        ...group,
        cards: group.cards.filter(
          (card) =>
            t(card.nameKey).toLowerCase().includes(q) || t(card.descKey).toLowerCase().includes(q),
        ),
      })).filter((group) => group.cards.length > 0)
    : activeGroup
      ? GROUPS.filter((group) => group.titleKey === activeGroup)
      : GROUPS
  const noMatches = searching && filteredGroups.length === 0

  // The calm "All" overview shows each group as a short PREVIEW (its first few cards + a quiet
  // "See all N"); picking a chip (or searching) shows the full shelf. One shelf at a time keeps
  // the 40-odd-card catalog from reading as one endless, busy scroll.
  const PREVIEW_COUNT = 3
  const previewing = !searching && activeGroup === null

  // Open one group's full shelf (its chip becomes active) and bring the chip bar back into view so
  // the expanded shelf lands where the eye is. (scrollIntoView is absent in jsdom — guard it.)
  function openGroup(titleKey: string) {
    setActiveGroup(titleKey)
    filterRef.current?.scrollIntoView?.({ block: 'start' })
  }

  // Newcomer heuristic: a low (or not-yet-known) level → show the gentle "New here? Start here"
  // on-ramp instead of the personalised "Suggested for you" set. Returning practitioners (level > 3)
  // get Suggested; newcomers get the starter section. `null` (still loading) counts as a newcomer so
  // the friendly path shows first for a brand-new guest.
  const newcomer = level == null || level <= 3
  const notSearching = q === ''

  // "New here? Start here" — the curated starter routes resolved to real cards (drop any that don't).
  const beginnerCards = BEGINNER_STARTERS.map((to) => CARD_BY_TO.get(to)).filter(
    (card): card is PracticeCard => card != null,
  )

  // Suggested-for-you — a few gentle picks for returning practitioners, shown only when not searching
  // and not a newcomer (they get the starter section instead). Routes resolved to catalog cards.
  const suggestion =
    notSearching && !newcomer ? suggestedPractices({ hour: new Date().getHours(), facet: need }) : null
  const suggestedCards = suggestion
    ? suggestion.picks
        .map((to) => CARD_BY_TO.get(to))
        .filter((card): card is PracticeCard => card != null)
    : []

  return (
    <main id="main-content" className="dashboard practices-page">
      <Link to="/" className="back-link">
        {t('common.backHome')}
      </Link>
      <header className="page-head">
        <h1>{t('practice.hub.title')}</h1>
        <p className="page-subtitle">{t('practice.hub.subtitle')}</p>
      </header>

      {/* Programs — the two non-technique destinations reachable from here (the old nav dropdown is
          gone): a multi-day guided path, and logging a past session. Navigation, not techniques, so
          they sit in their own quiet row above the practice groups. */}
      <nav className="practices-programs" aria-label={t('practice.hub.programsLabel')}>
        <Link to="/paths" className="practices-program-link">
          <span className="practices-program-icon" aria-hidden="true">
            <Compass size={18} strokeWidth={1.9} />
          </span>
          <span className="practices-program-body">
            <span className="practices-program-name">{t('practice.hub.paths.name')}</span>
            <span className="practices-program-desc">{t('practice.hub.paths.desc')}</span>
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
            <span className="practices-program-name">{t('practice.hub.logPast.name')}</span>
            <span className="practices-program-desc">{t('practice.hub.logPast.desc')}</span>
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
          placeholder={t('practice.hub.search.placeholder')}
          aria-label={t('practice.hub.search.label')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {query !== '' && (
          <button
            type="button"
            className="practices-search-clear"
            aria-label={t('practice.hub.search.clear')}
            onClick={() => setQuery('')}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Category chips — the calm browse: "All" previews each shelf; one chip = one full shelf.
          A live search overrides the chips (results show across every group). */}
      <div className="practices-filter" role="group" aria-label={t('practice.hub.filter.aria')} ref={filterRef}>
        <button
          type="button"
          className={`chip${activeGroup === null ? ' chip-active' : ''}`}
          aria-pressed={activeGroup === null}
          onClick={() => setActiveGroup(null)}
        >
          {t('practice.hub.filter.all')}
        </button>
        {GROUPS.map((group) => (
          <button
            key={group.titleKey}
            type="button"
            className={`chip${activeGroup === group.titleKey ? ' chip-active' : ''}`}
            aria-pressed={activeGroup === group.titleKey}
            onClick={() => setActiveGroup(group.titleKey)}
          >
            {t(group.titleKey)}
          </button>
        ))}
      </div>

      {/* New here? Start here — a gentle on-ramp for newcomers so they aren't faced with all 48 at
          once. Curated easiest practices + warm copy. Hidden while searching, on a single-category
          view (the chips), and for returning practitioners (who see "Suggested for you" instead). */}
      {notSearching && activeGroup === null && newcomer && beginnerCards.length > 0 && (
        <section className="practices-group practices-beginner">
          <div className="practices-group-head">
            <span className="practices-group-icon" aria-hidden="true">
              <Sprout size={18} strokeWidth={1.9} />
            </span>
            <div className="practices-group-heading">
              <h2 className="practices-group-title">{t('practice.hub.beginner.title')}</h2>
              <p className="practices-group-blurb">
                {t('practice.hub.beginner.blurb')}
              </p>
            </div>
          </div>
          <div className="practices-grid">
            {beginnerCards.map((card) => (
              <PracticeCardLink
                key={card.to}
                card={card}
                need={need}
                path={spirit?.path ?? null}
                level={level}
              />
            ))}
          </div>
        </section>
      )}

      {guiding && need && activeGroup === null && (
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
            <strong>{spirit.name ?? t('practice.hub.nudge.fallbackName')}</strong> {t('practice.hub.nudge.before')}{' '}
            <strong className="practices-need-name">
              {(() => {
                const NeedIcon = NEED_COPY[need].icon
                return <NeedIcon size={16} strokeWidth={1.75} aria-hidden="true" />
              })()}{' '}
              {t(`needs.${need}`)}
            </strong>{' '}
            {t('practice.hub.nudge.after')}
          </p>
        </section>
      )}

      {/* Suggested for you — a small, ignorable set at the top: the spirit's least-fed facet when
          uneven, else a time-of-day pick, plus a short anytime on-ramp. Hidden while searching and
          on a single-category view. */}
      {suggestion && suggestedCards.length > 0 && activeGroup === null && (
        <section className="practices-group practices-suggested">
          <div className="practices-group-head">
            <span className="practices-group-icon" aria-hidden="true">
              <Sparkles size={18} strokeWidth={1.9} />
            </span>
            <div className="practices-group-heading">
              <h2 className="practices-group-title">{t('practice.hub.suggested.title')}</h2>
              <p className="practices-group-blurb">{suggestion.subtitle}</p>
            </div>
          </div>
          <div className="practices-grid">
            {suggestedCards.map((card) => (
              <PracticeCardLink
                key={card.to}
                card={card}
                need={need}
                path={spirit?.path ?? null}
                level={level}
              />
            ))}
          </div>
        </section>
      )}

      {noMatches && (
        <p className="practices-empty" role="status">
          {t('practice.hub.noMatches', { query: query.trim() })}
        </p>
      )}

      {filteredGroups.map((group) => {
        const GroupIcon = group.icon
        // The "All" overview shows a short preview of each shelf; a chip / search shows it whole.
        const visibleCards = previewing ? group.cards.slice(0, PREVIEW_COUNT) : group.cards
        const hiddenCount = group.cards.length - visibleCards.length
        return (
          <section
            key={group.titleKey}
            className="practices-group"
            style={{
              ['--section-fill' as string]: group.light,
              ['--section-fill-dark' as string]: group.dark,
            }}
          >
            <div className="practices-group-head">
              <span className="practices-group-icon" aria-hidden="true">
                <GroupIcon size={18} strokeWidth={1.9} />
              </span>
              <div className="practices-group-heading">
                <h2 className="practices-group-title">
                  {t(group.titleKey)}
                  <span className="practices-group-count">{group.cards.length}</span>
                </h2>
                <p className="practices-group-blurb">{t(group.blurbKey)}</p>
              </div>
            </div>
            <div className="practices-grid">
              {visibleCards.map((card) => (
                <PracticeCardLink
                  key={card.to}
                  card={card}
                  need={need}
                  path={spirit?.path ?? null}
                  level={level}
                  compact
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                className="practices-see-all"
                onClick={() => openGroup(group.titleKey)}
              >
                {t('practice.hub.seeAll', { count: group.cards.length })}
                <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </section>
        )
      })}
    </main>
  )
}
