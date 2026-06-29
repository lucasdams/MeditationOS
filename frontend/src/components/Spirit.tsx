import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { Loading, RetryableError } from './StateViews'
import { messageForError } from '../lib/errors'
import type {
  SpiritNeedTier,
  SpiritPath,
  SpiritStage,
  SpiritState,
} from '../types'

/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022, ADR-0023).
 *
 * A single living companion you CHOOSE once (ADR-0023) and grow through practice, rendered as a
 * procedural SVG that gains structure from `spark` → `wisp` → `fledgling` → `ascendant` →
 * `radiant`. The spirit grows down one of three chosen forms, keyed to the chosen `path`
 * (labelled in the UI as the Ayurvedic dosha):
 *
 * Each form is nourished by the practice that BALANCES its dosha (Ayurveda balances by
 * opposites — see backend SPIRIT_PRACTICE_FOR_PATH):
 *
 *  - `stillness` → Kapha — a serene seated mini-Buddha (resonance BREATHING keeps it nourished).
 *  - `breath`    → Pitta — a fierce fire-and-water blaze of flame tongues (GRATITUDE + JOURNALING nourish it).
 *  - `heart`     → Vata  — an airy wisp of breeze and drifting motes (MEDITATION nourishes it).
 *
 * Until the user chooses (path === null), the spirit is a PATHLESS SPARK: a neutral, un-themed
 * glowing mote with no creature form yet — the picker invites the choice.
 *
 * Each form is drawn distinctly across the five stages, in the flat vector style of
 * SanctuaryPlant (hardcoded hex fills, a 0 0 80 80 viewBox), with its own palette.
 *
 * The REACTIVITY / ANIMATION layer (CSS keyframes + Web Animations API + the breathing pacer's
 * rAF clock — no new deps):
 *
 *  - Idle: a gentle, slow float plus a soft aura pulse on the home-screen spirit. Calm,
 *    never frantic — the motion idiom of `zen-float` / `meditate-pulse`.
 *  - Condition as MOTION (ADR-0023): the aura's pulse intensity/opacity scales with the overall
 *    `condition` factor (the weakest need), via the `--spirit-glow` custom property — so a
 *    well-tended spirit breathes a touch more and a neglected one is calmer/dimmer; still
 *    floored, never fully still-dark (the no-catastrophe guardrail — it never affects progress).
 *  - Session-complete celebration: a brief, happy one-shot (a soft scale/glow swell via the
 *    Web Animations API), triggered by `celebrate` from the post-session RewardOverlay flow.
 *  - Breathing-pacer sync (the signature moment): on BreathePage, `paceScale` is the SAME
 *    `scaleAt(...)` value the breathe-circle uses (one rAF clock, no drift). The spirit's
 *    aura/scale expands on the inhale and contracts on the exhale — meditating *with* it.
 *  - `prefers-reduced-motion`: when set, EVERYTHING holds static — no float, no pulse, no
 *    celebration, no pacer sync — mirroring BreathePage's STATIC_SCALE stance. Non-negotiable.
 *
 * Like SanctuaryScene, this can be handed a `spirit` by the parent (DashboardPage fetches it
 * once and passes it down) or fetch its own as a standalone fallback. Loading / error /
 * empty (first awakening) states follow the app's conventions.
 */

// A calm, friendly label per stage — used for the screen-reader description and the quiet
// caption under the art. A brand-new user is at `spark`; we frame that as the first awakening.
// Exported so SpiritPage shares the same labels/notes (a single source of truth).
export const STAGE_COPY: Record<SpiritStage, { name: string; note: string }> = {
  spark: { name: 'Spark', note: 'Your spirit is just awakening.' },
  wisp: { name: 'Wisp', note: 'Your spirit is taking shape.' },
  fledgling: { name: 'Fledgling', note: 'Your spirit is finding its form.' },
  ascendant: { name: 'Ascendant', note: 'Your spirit is growing brighter.' },
  radiant: { name: 'Radiant', note: 'Your spirit shines fully.' },
}

// The dosha each path is labelled as in the UI (ADR-0023; the internal `path` value is
// unchanged). `name` is the displayed creature name, `element` its Ayurvedic elements, `vibe` a
// short personality line, `practice` the signature activity that keeps it nourished, and `glyph`
// a small decorative emoji for the picker card. Exported as the single source of truth so the
// picker, hero read-out, and care nudges all relabel consistently.
// Each dosha is kept in good shape by the practice that BALANCES it — Ayurveda balances by
// opposites, so a creature's signature practice is the OPPOSITE quality to its own nature, not a
// match for its element. `balance` names that quality; `practice` is the app practice that
// provides it.
export const DOSHA: Record<
  SpiritPath,
  {
    name: string
    element: string
    vibe: string
    practice: string
    balance: string
    glyph: string
    // Why its favoured practice helps — the balance-by-opposites rationale, in plain language, for
    // the choose page (so the choice is about a real practice fit, not a cosmetic preview).
    why: string
  }
> = {
  stillness: {
    name: 'Kapha',
    element: 'Earth + Water',
    vibe: 'Grounded, calm, and steady.',
    practice: 'breathwork',
    balance: 'energizing',
    glyph: '🪷',
    why: 'Earth-and-water Kapha can grow heavy and sluggish — breathwork gets its energy moving and keeps it bright.',
  },
  breath: {
    name: 'Pitta',
    element: 'Fire + Water',
    vibe: 'Sharp, intense, and energetic.',
    practice: 'gratitude & journaling',
    balance: 'cooling',
    glyph: '🔥',
    why: 'Fiery Pitta runs hot and sharp — cooling, reflective gratitude & journaling soothes it so it doesn’t burn out.',
  },
  heart: {
    name: 'Vata',
    element: 'Air + Ether',
    vibe: 'Light, mobile, and expressive.',
    practice: 'meditation',
    balance: 'grounding',
    glyph: '🍃',
    why: 'Airy Vata is light and easily scattered — grounding meditation settles and steadies it.',
  },
}

// A friendly name per path for screen-reader labels — the dosha name (ADR-0023). Exported so
// SpiritPage shares the same path labels.
export const PATH_COPY: Record<SpiritPath, string> = {
  stillness: DOSHA.stillness.name,
  breath: DOSHA.breath.name,
  heart: DOSHA.heart.name,
}

// The three doshas in the order the picker presents them (Kapha / Pitta / Vata).
export const PATH_ORDER: SpiritPath[] = ['stillness', 'breath', 'heart']

// Calm, never-shaming copy per care tier (ADR-0023 guardrail: nudge, never shame). `label` is
// the pill text, `tone` the CSS state suffix. Exported so SpiritPage + the home summary share it.
export const TIER_COPY: Record<SpiritNeedTier, { label: string; tone: string }> = {
  thriving: { label: 'Thriving', tone: 'thriving' },
  content: { label: 'Content', tone: 'content' },
  restless: { label: 'Restless', tone: 'restless' },
  unwell: { label: 'Needs care', tone: 'unwell' },
}

// A care-need tier is "low" (worth a gentle nudge) once it slips below content.
export function isLowTier(tier: SpiritNeedTier): boolean {
  return tier === 'restless' || tier === 'unwell'
}

// Friendly per-need labels + the practice that revives each (ADR-0023). `nourished` is the
// signature need, so its reviving practice depends on the chosen creature; `rested` and `joyful`
// are path-agnostic. Used for the needs read-out and the per-need care nudges.
export const NEED_COPY: Record<
  keyof SpiritState['needs'],
  { label: string; icon: string }
> = {
  // Labels name the DIMENSION (a noun), not a positive state — so "Nourishment · Needs care"
  // reads honestly, rather than "Nourished" claiming the opposite of the tier beside it.
  nourished: { label: 'Nourishment', icon: '🍲' },
  rested: { label: 'Rest', icon: '🌙' },
  joyful: { label: 'Joy', icon: '✨' },
}

// Calm display names for the cosmetic slots and their options (matching the backend catalog
// SPIRIT_COSMETICS_CATALOG). Unknown keys fall back to a tidied key. Exported as the single
// source of truth so SpiritPage (the customize tree) and SpiritChoosePage (the grows-into
// preview) label options identically.
export const SLOT_LABEL: Record<string, string> = {
  aura: 'Aura',
  accessory: 'Accessory',
  habitat: 'Habitat',
  companion: 'Companion',
  mount: 'Mount',
  weather: 'Weather',
  ground: 'Ground',
  // BODY cosmetics — the recolour + resize + shape that change the creature itself.
  palette: 'Colour',
  size: 'Size',
  form: 'Shape',
}

export const OPTION_LABEL: Record<string, string> = {
  soft: 'Soft glow',
  warm: 'Warm glow',
  starlit: 'Starlit',
  ember: 'Ember glow',
  frost: 'Frost glow',
  rose: 'Rose glow',
  halo: 'Halo',
  leaf_crown: 'Leaf crown',
  ribbon: 'Ribbon',
  flower: 'Flower',
  scarf: 'Scarf',
  star: 'Star',
  meadow: 'Meadow',
  dusk: 'Dusk',
  night: 'Night sky',
  garden: 'Garden',
  seaside: 'Seaside',
  cottage: 'Cottage',
  firefly: 'Firefly',
  bird: 'Bird',
  cat: 'Cat',
  // Path-exclusive companions (only offered to the matching creature, per_path in the catalog).
  kitsune: 'Nine-tail fox',
  tortoise: 'Jade tortoise',
  crane: 'Paper crane',
  cloud: 'Cloud',
  lotus: 'Lotus',
  leaf: 'Leaf boat',
  // Path-exclusive cosmetics (aura / accessory / habitat / mount), per_path in the catalog —
  // each only offered to its matching dosha spirit.
  emberflame: 'Ember aura',
  grove: 'Grove aura',
  zephyr: 'Zephyr aura',
  ember_crown: 'Ember crown',
  mossy_circlet: 'Mossy circlet',
  feather_plume: 'Feather plume',
  ember_canyon: 'Ember canyon',
  misty_grove: 'Misty grove',
  open_sky: 'Open sky',
  emberstone: 'Ember sun-stone',
  boulder: 'Mossy boulder',
  feather: 'Drifting feather',
  // Universal tier-deepening options (added to enrich each slot's tree).
  dewlight: 'Dewlight',
  twilight: 'Twilight',
  aurora: 'Aurora',
  berry_sprig: 'Berry sprig',
  tiny_bell: 'Jingle bell',
  antlers: 'Antlers',
  lily_pond: 'Lily pond',
  autumn_grove: 'Autumn grove',
  starfall: 'Starfall',
  snail: 'Garden snail',
  frog: 'Little frog',
  owl: 'Round owl',
  mossy_stump: 'Mossy stump',
  reed_raft: 'Reed raft',
  crystal: 'Floating crystal',
  // Legendary tier-4 ultimates (one universal capstone per slot — the prestige endgame).
  prismatic: 'Prismatic halo',
  star_crown: 'Star crown',
  nebula: 'Cosmic nebula',
  dragon: 'Curled dragon',
  comet: 'Radiant comet',
  aurora_storm: 'Aurora storm',
  mandala: 'Sacred mandala',
  // Weather — an ambient drifting overlay across the scene.
  petals: 'Drifting petals',
  mist: 'Soft mist',
  rain: 'Gentle rain',
  leaffall: 'Falling leaves',
  snow: 'Falling snow',
  fireflies: 'Drifting fireflies',
  // Path-exclusive weathers (one per dosha, per_path in the catalog).
  ember_drift: 'Drifting embers',
  pollenfall: 'Pollen fall',
  galeswirl: 'Gale swirl',
  // Ground — a foreground base strip along the very bottom.
  grass: 'Grassy ground',
  pebbles: 'Pebble bed',
  clover: 'Clover patch',
  mushrooms: 'Toadstools',
  wildflowers: 'Wildflower bed',
  crystals: 'Crystal cluster',
  // Path-exclusive grounds (one per dosha, per_path in the catalog).
  emberbed: 'Ember bed',
  stonegarden: 'Stone garden',
  cloudfloor: 'Cloud floor',
  // Quirky / hobby cosmetics — personality, not nature.
  headphones: 'Headphones',
  nerd_glasses: 'Nerd glasses',
  gaming_headset: 'Gaming headset',
  beanie: 'Beanie',
  party_hat: 'Party hat',
  dumbbell: 'Floating dumbbell',
  coffee_mug: 'Steaming mug',
  open_book: 'Open book',
  game_controller: 'Game controller',
  boombox: 'Boombox',
  // BODY-recolour palettes (the `palette` slot). `ember` / `frost` / `rose` / `dusk` already have
  // labels above (shared keys from the aura / habitat slots) that read fine as colours too, so only
  // the genuinely-new palette keys are added here.
  sage: 'Sage',
  gold: 'Gold',
  aqua: 'Aqua',
  coral: 'Coral',
  mint: 'Mint',
  ocean: 'Ocean',
  plum: 'Plum',
  blossom: 'Blossom',
  slate: 'Slate',
  midnight: 'Midnight',
  // BODY-resize sizes (the `size` slot).
  tiny: 'Tiny',
  small: 'Small',
  large: 'Large',
  giant: 'Giant',
  // BODY-shape forms (the `form` slot) — swap each creature's body for an alternate form. Per-path:
  // Vata wisps, Pitta blazes, Kapha still-life bodies (a huddle, a stone cairn, an orbiting atom).
  // (Kapha's `cairn` key labels the stone-stack body here, distinct from the mossy-boulder MOUNT,
  // whose own `boulder` key lives above in this global label map.)
  tendrils: 'Tendrils',
  sleek: 'Sleek',
  billowy: 'Billowy',
  // Vata form variants. `halo` + `lotus` reuse keys already labelled above (aura `halo` → "Halo",
  // mount `lotus` → "Lotus") — the flat map is keyed by option name, so those labels are shared and
  // need no re-entry here. Only the genuinely-new keys are added.
  flurry: 'Flurry',
  streamer: 'Streamer',
  wildfire: 'Wildfire',
  emberlit: 'Ember',
  bonfire: 'Bonfire',
  inferno: 'Inferno',
  flicker: 'Flicker',
  puff: 'Puff',
  cluster: 'Cluster',
  cairn: 'Cairn',
  orbital: 'Orbital',
  // Kapha form variants. `enso` + `prism` are new; `lotus` is shared (its existing "Lotus" fits).
  enso: 'Ensō',
  prism: 'Prism',
}

// Tidy an unknown key into a label (e.g. "leaf_crown" → "Leaf crown") as a safe fallback.
export function titleize(key: string): string {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const slotLabel = (slot: string) => SLOT_LABEL[slot] ?? titleize(slot)
export const optionLabel = (option: string) => OPTION_LABEL[option] ?? titleize(option)

// The practice that revives a given need for a given creature (ADR-0023). Nourished is the
// signature need (per dosha); rested wants a steady daily rhythm; joyful wants variety.
export function reviveHint(
  need: keyof SpiritState['needs'],
  path: SpiritPath | null,
): string {
  if (need === 'nourished') {
    const practice = path ? DOSHA[path].practice : 'your practice'
    return `a few minutes of ${practice} would revive it`
  }
  if (need === 'rested') return 'a calm daily rhythm would settle it'
  return 'a little variety in your practice would lift it'
}

// The three needs in display order, so the read-out + nudges iterate consistently.
const NEED_ORDER: Array<keyof SpiritState['needs']> = ['nourished', 'rested', 'joyful']

/**
 * NeedsReadout — the three tended needs (Nourishment / Rest / Joy) as labeled 0–100 bars
 * (ADR-0023). Each shows its dimension label, current tier word, and a fill bar for the level
 * (the need's 0..1 factor), tinted by tier. Visual-only. Reused by the home summary + SpiritPage.
 */
export function NeedsReadout({ needs }: { needs: SpiritState['needs'] }) {
  return (
    <ul className="spirit-needs" aria-label="Care needs">
      {NEED_ORDER.map((key) => {
        const need = needs[key]
        const copy = NEED_COPY[key]
        const tier = TIER_COPY[need.tier]
        const pct = Math.round(need.factor * 100)
        return (
          <li key={key} className={`spirit-need spirit-need--${tier.tone}`}>
            <div className="spirit-need-head">
              <span className="spirit-need-icon" aria-hidden="true">
                {copy.icon}
              </span>
              <span className="spirit-need-label">{copy.label}</span>
              <span className="spirit-need-tier">{tier.label}</span>
            </div>
            <div
              className="spirit-need-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${copy.label}: ${pct} of 100 — ${tier.label}`}
            >
              <span className="spirit-need-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * CareNudge — a single, kind care nudge for the lowest need that's slipped below content
 * (ADR-0023 guardrail: nudge, never shame). Names the creature (dosha) and the practice that
 * revives it. Renders nothing when every need is content-or-better. Reused on the home + page.
 */
export function CareNudge({
  needs,
  path,
}: {
  needs: SpiritState['needs']
  path: SpiritPath | null
}) {
  // Surface the single most-depleted low need so the nudge stays one calm line, not a list.
  const TIER_RANK: Record<SpiritNeedTier, number> = {
    unwell: 0,
    restless: 1,
    content: 2,
    thriving: 3,
  }
  const low = NEED_ORDER.filter((k) => isLowTier(needs[k].tier)).sort(
    (a, b) => TIER_RANK[needs[a].tier] - TIER_RANK[needs[b].tier],
  )
  if (low.length === 0) return null
  const key = low[0]
  const tier = needs[key].tier
  const tierLabel = TIER_COPY[tier].label.toLowerCase()
  const creature = path ? `Your ${DOSHA[path].name}` : 'Your spark'
  return (
    <p className="spirit-care-nudge" role="status">
      <span aria-hidden="true">🌿 </span>
      {creature} is {tierLabel} — {reviveHint(key, path)}.
    </p>
  )
}

// A distinct palette per path: stillness (Kapha) is a serene warm gold/amber; breath (Pitta) is
// a fierce fire-and-water blaze — a bright ember core, flame tongues, with a cool teal-water
// undertone in `deep`; heart (Vata) is an airy sky-and-ether spirit — a pale-white wisp core, a
// soft sky-blue body, lavender breeze accents, and a deeper periwinkle base. `core` is the bright
// heart, `glow` the aura, `accent` the path's defining feature (halo / flame / breeze), `deep` base.
// The 4-stop body colour ramp every form draws from (`core` bright heart → `glow` aura → `accent`
// defining feature → `deep` base). The dosha default lives in PATH_PALETTE; the `palette` cosmetic
// swaps in an alternate ramp (PALETTES) of the same shape.
type BodyPalette = { core: string; glow: string; accent: string; deep: string }

const PATH_PALETTE: Record<SpiritPath, BodyPalette> = {
  stillness: { core: '#fef3c7', glow: '#fcd34d', accent: '#f59e0b', deep: '#b45309' },
  // Pitta — fire + water: a white-hot ember core (`core`), an orange flame body (`glow`), a
  // searing red-orange flame edge (`accent`), and a cool teal water-base (`deep`).
  breath: { core: '#fff7ed', glow: '#fb923c', accent: '#ef4444', deep: '#0d9488' },
  // Vata — air + ether: a pale luminous core (`core`), a soft sky-blue body (`glow`), a lavender
  // breeze accent (`accent`), and a deeper periwinkle base for wisps/leaves (`deep`).
  heart: { core: '#f5f7ff', glow: '#bae6fd', accent: '#c4b5fd', deep: '#818cf8' },
}

// COSMETIC RECOLOUR (the `palette` slot) — a body recolour applied IN PLACE of the dosha's default
// `PATH_PALETTE` (so the creature's own colours change, not a layer drawn around it). Each palette
// is a full 4-stop ramp (light `core` → bright `glow` → defining `accent` → `deep` base) matching
// PATH_PALETTE's shape, so any form renders legibly with it; tuned to read on the warm cream theme.
// Absent (no `palette` cosmetic) → the dosha keeps its default identity (a bare creature is
// pixel-identical to today). Keys MUST match the backend `palette` catalog options + PALETTE labels.
const PALETTES: Record<string, { core: string; glow: string; accent: string; deep: string }> = {
  ember: { core: '#fff1e6', glow: '#fb923c', accent: '#ef4444', deep: '#b91c1c' },
  rose: { core: '#fff0f4', glow: '#fb7185', accent: '#e11d48', deep: '#9f1239' },
  frost: { core: '#eef6ff', glow: '#7dd3fc', accent: '#38bdf8', deep: '#0369a1' },
  sage: { core: '#f0f7ec', glow: '#a3c293', accent: '#6f9460', deep: '#3f6212' },
  gold: { core: '#fff8e6', glow: '#fcd34d', accent: '#f59e0b', deep: '#b45309' },
  dusk: { core: '#f3eefb', glow: '#c4b5fd', accent: '#8b5cf6', deep: '#6d28d9' },
  aqua: { core: '#e6fbf6', glow: '#5eead4', accent: '#14b8a6', deep: '#0f766e' },
  coral: { core: '#fff1ea', glow: '#fdba74', accent: '#f97316', deep: '#c2410c' },
  mint: { core: '#eafff5', glow: '#6ee7b7', accent: '#10b981', deep: '#047857' },
  ocean: { core: '#e8f1ff', glow: '#60a5fa', accent: '#3b82f6', deep: '#1e3a8a' },
  plum: { core: '#fbeefb', glow: '#e879f9', accent: '#c026d3', deep: '#86198f' },
  blossom: { core: '#fff0f7', glow: '#f9a8d4', accent: '#ec4899', deep: '#9d174d' },
  slate: { core: '#eef2f6', glow: '#94a3b8', accent: '#64748b', deep: '#334155' },
  midnight: { core: '#ebebff', glow: '#a5b4fc', accent: '#6366f1', deep: '#312e81' },
}

// COSMETIC RESIZE (the `size` slot) — a uniform scale of the CREATURE BODY (+ its accessory),
// independent of the growth stage. Applied as an SVG transform on the creature group around the
// 80×80 viewBox centre, so the body shrinks/grows within its scene while the aura/habitat/etc. stay
// their normal size. Absent (no `size` cosmetic) → 1.0 (the stage's natural size, unchanged). Keys
// MUST match the backend `size` catalog options + SIZE labels. `giant` is dialled to 1.28 so the
// fullest radiant body stays clear of the 80×80 frame and an equipped accessory.
const SIZES: Record<string, number> = { tiny: 0.78, small: 0.9, large: 1.16, giant: 1.28 }

const STAGE_ORDER: SpiritStage[] = ['spark', 'wisp', 'fledgling', 'ascendant', 'radiant']

// 1-based stage index (1 = spark … 5 = radiant) — drives how much structure each form draws.
function stageIndex(stage: SpiritStage): number {
  return STAGE_ORDER.indexOf(stage) + 1
}

// How far through the ladder this stage sits, 0..1.
function stageProgress(stage: SpiritStage): number {
  return (stageIndex(stage) - 1) / (STAGE_ORDER.length - 1)
}

// The floored condition-glow band [0.7, 1]. The condition factor lives in [0..1]; we raise the
// *visual* floor here so the companion stays clearly legible on light backgrounds even when a
// need is depleted (a low factor rendered the early-stage spark too faint to see). A well-tended
// spirit still visibly brightens it (0.7 neglected → 1.0 thriving) — just never into low contrast.
// This is the no-catastrophe guardrail in the art: condition only dims the look, never hides it.
const SPIRIT_GLOW_FLOOR = 0.7
const SPIRIT_GLOW_CEIL = 1

// Clamp the condition factor into the floored visual band (the backend bounds it; defend anyway).
function clampGlow(glow: number): number {
  return Math.max(SPIRIT_GLOW_FLOOR, Math.min(SPIRIT_GLOW_CEIL, glow))
}

// The VITALITY band — a SECOND, wider-range expression signal off the SAME raw condition factor
// (ADR-0023; condition is the WEAKEST of nourishment / rest / joy). Where `--spirit-glow` is
// gently floored at 0.7 (so the aura never dims into low contrast), vitality runs a wider but
// still-legible 0.4 (unwell) → 1.0 (thriving). It's the primary good↔bad cue: CSS uses it to
// drive the creature's SATURATION (washed-out when low, vivid when high), the LIVELINESS of its
// float (smaller/slower when low), and a slight droop+shrink POSTURE when unwell. Never reaches
// 0 — the sprite always stays visible (the no-catastrophe guardrail). Still calm and kind: a low
// spirit looks gently muted/wilted, never alarming.
const SPIRIT_VITALITY_FLOOR = 0.4
function conditionVitality(factor: number): number {
  const f = Math.max(0, Math.min(1, Number.isFinite(factor) ? factor : 1))
  return SPIRIT_VITALITY_FLOOR + (1 - SPIRIT_VITALITY_FLOOR) * f
}

// A coarse condition TIER derived from the raw factor, mirroring the backend's care tiers, so CSS
// can add discrete touches via the `data-condition` attribute if useful. Derived here (not threaded
// as a prop) so the art keys off the single condition factor it already receives.
function conditionTier(factor: number): SpiritNeedTier {
  const f = Number.isFinite(factor) ? factor : 1
  if (f >= 0.85) return 'thriving'
  if (f >= 0.6) return 'content'
  if (f >= 0.35) return 'restless'
  return 'unwell'
}

// True when the OS asks for reduced motion. Read at render (a one-shot, like BreathePage),
// so the static path is chosen before any animation class / inline transform is applied.
// Exported so SpiritPage threads the same real value into its hero art.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The pacer maps `scaleAt` (the breathe-circle's [0.35, 1] band) onto a GENTLE companion
// scale: it should breathe *with* the circle, not mimic its full swing. We map the band into
// a soft [0.9, 1.06] so the spirit swells on the inhale and settles on the exhale, never
// shrinking away. Floored so it stays present even at the bottom of the breath.
const PACE_MIN = 0.9
const PACE_MAX = 1.06
function paceToScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) return 1
  // scaleAt lives in [MIN_SCALE=0.35, MAX_SCALE=1]; normalise then map into the gentle band.
  const t = Math.max(0, Math.min(1, (scale - 0.35) / (1 - 0.35)))
  return PACE_MIN + (PACE_MAX - PACE_MIN) * t
}

// ── Cosmetics (steps 5 + 6) ──────────────────────────────────────────────────────────────
// Applied cosmetics — the visible payoff of spending coins — drawn on the art in the same flat
// vector style. The slots and their options track the backend SPIRIT_COSMETICS_CATALOG
// (aura / accessory / habitat / companion / mount — see that catalog for the live set); the
// option maps below (AURA_STYLE, etc.) are the authoritative client-side list. Each is static
// (the step-4 animation layer wraps the whole SVG; cosmetics don't fight it).
export type SpiritCosmetics = Record<string, string>

// Per-option aura tint + reach. `null` (no aura owned) falls back to the path's own glow in
// `Aura` below — so an un-adorned spirit looks exactly as it did before cosmetics shipped.
const AURA_STYLE: Record<string, { tint: string; grow: number; strength: number }> = {
  soft: { tint: '#bfdbfe', grow: 4, strength: 2.0 },
  warm: { tint: '#fcd34d', grow: 6, strength: 2.6 },
  starlit: { tint: '#c4b5fd', grow: 8, strength: 3.2 },
  ember: { tint: '#f97316', grow: 6, strength: 2.6 },
  frost: { tint: '#7dd3fc', grow: 6, strength: 2.4 },
  rose: { tint: '#fda4af', grow: 5, strength: 2.2 },
  // Universal additions: a soft green dew glow (tier 1), a deep-purple dusk glow (tier 2), and a
  // shimmering multi-hue aurora ribbon (the universal tier-3 crown). Each layers its own
  // procedural decor over this base glow (cases below).
  dewlight: { tint: '#86efac', grow: 5, strength: 2.2 },
  twilight: { tint: '#a78bfa', grow: 7, strength: 2.8 },
  aurora: { tint: '#5eead4', grow: 9, strength: 3.2 },
  // LEGENDARY (tier 4) — the prismatic halo: the widest, brightest aura, a full rainbow radiant
  // ring layered over this base glow (case below).
  prismatic: { tint: '#fef9c3', grow: 12, strength: 3.6 },
  // Path-exclusive auras: warm ember halo for Pitta, verdant grove for Kapha, airy zephyr for
  // Vata. Each layers its own procedural motes/leaves/wisps over this base glow (cases below).
  emberflame: { tint: '#ea580c', grow: 9, strength: 3.0 },
  grove: { tint: '#10b981', grow: 9, strength: 2.8 },
  zephyr: { tint: '#e0f2fe', grow: 9, strength: 2.6 },
}

// A soft outer aura shared by every path — its opacity carries the static daily-glow read-out.
// The aura warms/cools to the path's glow colour and grows a touch with maturity. An owned
// `aura` cosmetic re-tints it, expands its reach, and lifts its strength (the spend payoff).
function Aura({ path, p, g, aura }: { path: SpiritPath; p: number; g: number; aura?: string }) {
  const pal = PATH_PALETTE[path]
  const style = aura ? AURA_STYLE[aura] : undefined
  const fill = style ? style.tint : pal.glow
  const strength = style ? style.strength : 1
  const r = 24 + p * 8 + (style?.grow ?? 0)
  return (
    <>
      <circle cx={40} cy={40} r={r} fill={fill} opacity={Math.min(0.6, 0.14 * g * strength)} />
      <circle cx={40} cy={40} r={r - 8} fill={fill} opacity={Math.min(0.7, 0.22 * g * strength)} />
      {/* Starlit aura scatters a few faint stars in the halo — the richest, level-gated aura. */}
      {aura === 'starlit' &&
        Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2
          return (
            <circle
              key={`star-${k}`}
              cx={40 + Math.cos(a) * (r - 4)}
              cy={40 + Math.sin(a) * (r - 4)}
              r={0.9}
              fill="#ffffff"
              opacity={0.85 * g}
            />
          )
        })}
      {/* Soft aura (polish) — keeps its pale-blue identity but gains depth: a faint outer wash
          beyond the base glow and a brighter inner core, so the halo reads as layered light rather
          than a flat disc, plus a thin highlight rim for a gentle sheen. */}
      {aura === 'soft' && (
        <>
          <circle cx={40} cy={40} r={r + 3} fill={fill} opacity={Math.min(0.3, 0.07 * g * strength)} />
          <circle cx={40} cy={38} r={r - 14} fill="#eff6ff" opacity={Math.min(0.5, 0.16 * g * strength)} />
          <circle cx={40} cy={40} r={r - 4} fill="none" stroke="#dbeafe" strokeWidth={0.8} opacity={0.4 * g} />
        </>
      )}
      {/* Ember aura (polish) — keeps its hot-orange identity but gains depth: a smouldering deep
          outer wash, a hotter golden core, and a few faint rising sparks so it reads as living
          warmth rather than a flat orange disc. */}
      {aura === 'ember' && (
        <>
          <circle cx={40} cy={42} r={r + 2} fill="#b45309" opacity={Math.min(0.28, 0.07 * g * strength)} />
          <circle cx={40} cy={42} r={r - 12} fill="#fbbf24" opacity={Math.min(0.55, 0.18 * g * strength)} />
          {Array.from({ length: 4 }, (_, k) => {
            const a = (k / 4) * Math.PI * 2 - Math.PI / 2
            return (
              <circle
                key={`emberspark-${k}`}
                cx={40 + Math.cos(a) * (r - 2)}
                cy={40 + Math.sin(a) * (r - 2) - 2}
                r={k % 2 ? 0.9 : 0.6}
                fill="#fed7aa"
                opacity={0.7 * g}
              />
            )
          })}
        </>
      )}
      {/* Dewlight (tier 1, universal) — a soft green dew glow: a fresh inner verdant core under the
          green base, with a ring of tiny dew droplets catching a pale highlight around the halo. */}
      {aura === 'dewlight' && (
        <>
          <circle cx={40} cy={40} r={r - 11} fill="#bbf7d0" opacity={Math.min(0.55, 0.18 * g * strength)} />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2 + 0.3
            const dx = 40 + Math.cos(a) * (r - 2)
            const dy = 40 + Math.sin(a) * (r - 2)
            return (
              <g key={`dew-${k}`}>
                <circle cx={dx} cy={dy} r={k % 2 ? 1.4 : 1.0} fill="#4ade80" opacity={0.7 * g} />
                <circle cx={dx - 0.4} cy={dy - 0.5} r={0.4} fill="#f0fdf4" opacity={0.85 * g} />
              </g>
            )
          })}
        </>
      )}
      {/* Twilight (tier 2, universal) — a deep-purple dusk glow: a darker indigo wash bleeding out
          beyond the violet base into a graded inner core, with a scatter of faint first-stars high
          in the halo where the dusk is deepest. */}
      {aura === 'twilight' && (
        <>
          <circle cx={40} cy={40} r={r + 2} fill="#4c1d95" opacity={Math.min(0.34, 0.09 * g * strength)} />
          <circle cx={40} cy={41} r={r - 10} fill="#7c3aed" opacity={Math.min(0.5, 0.16 * g * strength)} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = -Math.PI / 2 + (k - 2) * 0.5
            return (
              <circle
                key={`dusk-star-${k}`}
                cx={40 + Math.cos(a) * (r - 3)}
                cy={40 + Math.sin(a) * (r - 3)}
                r={k % 2 ? 0.9 : 0.6}
                fill={k % 2 ? '#ede9fe' : '#c4b5fd'}
                opacity={0.85 * g}
              />
            )
          })}
        </>
      )}
      {/* Aurora (tier 3, universal capstone) — a shimmering multi-hue ribbon glow: layered curved
          bands in teal/violet/rose sweeping across the upper halo like northern lights, over a
          cool inner wash, with a few drifting light motes. The richest universal aura. */}
      {aura === 'aurora' && (
        <>
          <circle cx={40} cy={40} r={r - 12} fill="#99f6e4" opacity={Math.min(0.45, 0.14 * g * strength)} />
          {['#5eead4', '#a78bfa', '#fda4af'].map((hue, k) => {
            const rr = r - 1 - k * 3
            const x0 = 40 + Math.cos(Math.PI + 0.5) * rr
            const y0 = 40 + Math.sin(Math.PI + 0.5) * rr
            const x1 = 40 + Math.cos(-0.5) * rr
            const y1 = 40 + Math.sin(-0.5) * rr
            const cx = 40 + (k - 1) * 3
            const cy = 40 - rr - 4 + k * 2
            return (
              <path
                key={`aurora-band-${k}`}
                d={`M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`}
                fill="none"
                stroke={hue}
                strokeWidth={2.2 - k * 0.3}
                strokeLinecap="round"
                opacity={0.7 * g}
              />
            )
          })}
          {Array.from({ length: 4 }, (_, k) => {
            const a = (k / 4) * Math.PI * 2 + 0.4
            return (
              <circle
                key={`aurora-mote-${k}`}
                cx={40 + Math.cos(a) * (r - 2)}
                cy={40 + Math.sin(a) * (r - 2)}
                r={0.7}
                fill="#f0fdfa"
                opacity={0.7 * g}
              />
            )
          })}
        </>
      )}
      {/* LEGENDARY (tier 4) — Prismatic: a full rainbow radiant halo. Seven concentric spectral
          rings sweep the whole circle (the joyful, spectacular endgame aura), with a bright white
          inner core and a ring of sparkling motes catching every hue. The richest aura in the slot. */}
      {aura === 'prismatic' && (
        <>
          <circle cx={40} cy={40} r={r - 14} fill="#ffffff" opacity={Math.min(0.5, 0.16 * g * strength)} />
          {['#f87171', '#fb923c', '#fde047', '#4ade80', '#38bdf8', '#818cf8', '#c084fc'].map(
            (hue, k) => (
              <circle
                key={`prism-ring-${k}`}
                cx={40}
                cy={40}
                r={r - k * 1.6}
                fill="none"
                stroke={hue}
                strokeWidth={1.3}
                opacity={Math.min(0.8, 0.32 * g) * (1 - k * 0.06)}
              />
            ),
          )}
          {Array.from({ length: 10 }, (_, k) => {
            const a = (k / 10) * Math.PI * 2 + 0.25
            const hues = ['#fef08a', '#fca5a5', '#a5b4fc', '#86efac', '#f0abfc']
            return (
              <circle
                key={`prism-mote-${k}`}
                cx={40 + Math.cos(a) * (r + 1)}
                cy={40 + Math.sin(a) * (r + 1)}
                r={k % 2 ? 1.1 : 0.7}
                fill={hues[k % hues.length]}
                opacity={0.85 * g}
              />
            )
          })}
        </>
      )}
      {/* PATH-EXCLUSIVE: Emberflame (Pitta) — a hot orange halo of flickering motes ringing the
          glow, motes nearer the top (the flame rises) and sized to alternate like licking embers,
          with cream sparks lifting just above. */}
      {aura === 'emberflame' &&
        Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2 - Math.PI / 2
          const rise = -Math.sin(a) * 2 // motes drift upward (the flame rises)
          return (
            <g key={`ember-${k}`}>
              <circle
                cx={40 + Math.cos(a) * (r - 3)}
                cy={40 + Math.sin(a) * (r - 3) + rise}
                r={k % 2 ? 1.6 : 1.1}
                fill={k % 3 ? '#fbbf24' : '#f97316'}
                opacity={0.85 * g}
              />
              {k % 2 === 0 && (
                <circle
                  cx={40 + Math.cos(a) * (r + 1)}
                  cy={40 + Math.sin(a) * (r + 1) - 2}
                  r={0.7}
                  fill="#fff7ed"
                  opacity={0.7 * g}
                />
              )}
            </g>
          )
        })}
      {/* PATH-EXCLUSIVE: Grove (Kapha) — a verdant mossy halo, soft leaf buds ringing the glow as
          little jade ellipses (tilted around the circle so each leaf points outward) over a faint
          green moss ring. */}
      {aura === 'grove' && (
        <>
          <circle cx={40} cy={40} r={r - 2} fill="none" stroke="#047857" strokeWidth={1.2} opacity={0.3 * g} />
          {Array.from({ length: 7 }, (_, k) => {
            const a = (k / 7) * Math.PI * 2
            const lx = 40 + Math.cos(a) * (r - 1)
            const ly = 40 + Math.sin(a) * (r - 1)
            const deg = (a * 180) / Math.PI + 90
            return (
              <ellipse
                key={`leaf-${k}`}
                cx={lx}
                cy={ly}
                rx={1.1}
                ry={2.4}
                fill={k % 2 ? '#34d399' : '#10b981'}
                opacity={0.8 * g}
                transform={`rotate(${deg} ${lx} ${ly})`}
              />
            )
          })}
        </>
      )}
      {/* PATH-EXCLUSIVE: Zephyr (Vata) — wispy white-blue swirls of air: three thin curved arcs
          sweeping around the glow like a breeze, with a couple of faint motes carried on the wind. */}
      {aura === 'zephyr' && (
        <>
          {Array.from({ length: 3 }, (_, k) => {
            const a0 = (k / 3) * Math.PI * 2
            const rr = r - 1 - k * 2
            const x0 = 40 + Math.cos(a0) * rr
            const y0 = 40 + Math.sin(a0) * rr
            const x1 = 40 + Math.cos(a0 + 1.4) * rr
            const y1 = 40 + Math.sin(a0 + 1.4) * rr
            const cx = 40 + Math.cos(a0 + 0.7) * (rr + 4)
            const cy = 40 + Math.sin(a0 + 0.7) * (rr + 4)
            return (
              <path
                key={`wisp-${k}`}
                d={`M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`}
                fill="none"
                stroke={k % 2 ? '#bae6fd' : '#f8fafc'}
                strokeWidth={1.1}
                strokeLinecap="round"
                opacity={0.75 * g}
              />
            )
          })}
          {Array.from({ length: 3 }, (_, k) => {
            const a = (k / 3) * Math.PI * 2 + 0.5
            return (
              <circle
                key={`breeze-${k}`}
                cx={40 + Math.cos(a) * (r + 1)}
                cy={40 + Math.sin(a) * (r + 1)}
                r={0.8}
                fill="#e0f2fe"
                opacity={0.6 * g}
              />
            )
          })}
        </>
      )}
    </>
  )
}

// The habitat backdrop — a small scene the spirit sits in, drawn behind the figure (so it
// never occludes it). A soft rounded panel with a path-agnostic palette per option.
//
// Habitat hygiene (the spirit must read clearly IN FRONT): the central figure occupies roughly
// x≈26–54, y≈16–66 of the 80×80 viewBox. So NO opaque habitat element sits in that region —
// prominent decor (suns, the cottage house) is pushed toward the EDGES / BOTTOM / CORNERS, and
// the broad backdrop panels are kept LOW-opacity so they recede as a true, unobtrusive
// background. The spirit clearly stands in front; each scene stays recognizable, just behind.
function Habitat({ habitat, g }: { habitat: string; g: number }) {
  if (habitat === 'meadow') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A faint warm-sky wash behind everything, for daytime depth (kept low-opacity so the
            figure reads clearly in front). */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#dcfce7" opacity={0.22} />
        {/* Distant rolling hills along the horizon, pushed behind the ground band. */}
        <path d="M 4 58 Q 20 48 38 56 T 76 54 L 76 60 L 4 60 Z" fill="#86efac" opacity={0.3} />
        {/* Ground band only, kept low at the very bottom — well clear of the figure. */}
        <rect x={6} y={56} width={68} height={18} rx={6} fill="#bbf7d0" opacity={0.55} />
        <rect x={6} y={63} width={68} height={11} rx={6} fill="#86efac" opacity={0.6} />
        {/* A few simple grass blades along the ground. */}
        {Array.from({ length: 7 }, (_, k) => (
          <rect key={k} x={12 + k * 8} y={58} width={1.4} height={6} rx={0.7} fill="#4ade80" opacity={0.6} />
        ))}
        {/* A couple of tiny wildflowers tucked into the outer corners for warmth. */}
        {[10, 70].map((fx, k) => (
          <circle key={k} cx={fx} cy={61} r={1.1} fill={k % 2 ? '#f9a8d4' : '#fcd34d'} opacity={0.7} />
        ))}
      </g>
    )
  }
  if (habitat === 'dusk') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A soft dusk wash — faint enough to recede behind the figure. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#fcd9b6" opacity={0.3} />
        <rect x={4} y={48} width={72} height={26} rx={10} fill="#f9a8d4" opacity={0.3} />
        {/* A setting sun tucked low in the bottom-left corner, off the figure's centre. */}
        <circle cx={16} cy={66} r={8} fill="#fb923c" opacity={0.4} />
      </g>
    )
  }
  if (habitat === 'night') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A faint night wash so the figure stays bright in front of it. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#1e293b" opacity={0.32} />
        {/* A deeper band up top for sky depth — the night reads darker overhead. */}
        <rect x={4} y={6} width={72} height={26} rx={10} fill="#0f172a" opacity={0.22} />
        {/* A scattering of stars hugging the outer edge, and a crescent moon in the corner. */}
        {Array.from({ length: 9 }, (_, k) => {
          const a = (k / 9) * Math.PI * 2
          return (
            <circle key={k} cx={40 + Math.cos(a) * 31} cy={38 + Math.sin(a) * 28} r={0.9} fill="#e0e7ff" opacity={0.9} />
          )
        })}
        {/* A couple of brighter twinkles in the corners for atmosphere. */}
        {[
          { x: 12, y: 12 },
          { x: 70, y: 44 },
        ].map((s, k) => (
          <circle key={`tw-${k}`} cx={s.x} cy={s.y} r={1.4} fill="#f8fafc" opacity={0.85} />
        ))}
        {/* A soft halo around the moon so it glows rather than sits flat. */}
        <circle cx={64} cy={16} r={9} fill="#fde68a" opacity={0.18} />
        <circle cx={64} cy={16} r={6} fill="#fde68a" opacity={0.85} />
        <circle cx={61} cy={14} r={6} fill="#1e293b" opacity={0.85} />
      </g>
    )
  }
  if (habitat === 'garden') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* Flower bed low at the bottom, clear of the figure. */}
        <rect x={6} y={58} width={68} height={16} rx={6} fill="#bbf7d0" opacity={0.6} />
        <rect x={6} y={65} width={68} height={9} rx={6} fill="#86efac" opacity={0.65} />
        {/* Flowers kept to the outer columns so none sits under the centred figure. */}
        {[12, 22, 58, 68].map((fx, k) => (
          <g key={k}>
            <rect x={fx - 0.5} y={54} width={1} height={6} rx={0.5} fill="#4ade80" opacity={0.7} />
            <circle cx={fx} cy={53} r={2.2} fill={k % 2 ? '#f472b6' : '#fcd34d'} opacity={0.75} />
            <circle cx={fx} cy={53} r={0.9} fill="#fb923c" opacity={0.75} />
          </g>
        ))}
      </g>
    )
  }
  if (habitat === 'seaside') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A pale sky wash and a calm low band of water — both faint, both behind. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#bae6fd" opacity={0.28} />
        {/* The sun lifted into the top-right corner, off the figure's centre. */}
        <circle cx={64} cy={16} r={7} fill="#fcd34d" opacity={0.45} />
        <rect x={4} y={56} width={72} height={18} rx={10} fill="#38bdf8" opacity={0.32} />
        <rect x={4} y={62} width={72} height={12} rx={10} fill="#0ea5e9" opacity={0.3} />
      </g>
    )
  }
  if (habitat === 'cottage') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A pale sky wash, kept faint so the figure reads clearly in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#e0f2fe" opacity={0.28} />
        {/* The home pushed into the bottom-right corner and shrunk, clear of the figure (which
            reaches to x≈54) — walls, pitched roof, door and window, low and to the edge. */}
        <rect x={60} y={50} width={16} height={14} rx={1.5} fill="#fde7c8" opacity={0.7} />
        <path d="M 58 50 L 68 42 L 78 50 Z" fill="#d97706" opacity={0.65} />
        <rect x={65} y={56} width={4} height={8} rx={0.6} fill="#b45309" opacity={0.7} />
        <rect x={71} y={53} width={3.5} height={3.5} rx={0.5} fill="#bae6fd" opacity={0.7} />
        {/* A wisp of ground to settle the cottage, low at the bottom. */}
        <rect x={6} y={62} width={68} height={12} rx={6} fill="#bbf7d0" opacity={0.45} />
      </g>
    )
  }
  if (habitat === 'lily_pond') {
    // A calm lily pond — a still teal water band banked low, with lily pads and a couple of
    // blooms floating at the edges, and faint reeds in the corners. Restful, rested.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A soft pale wash for air above the water, kept faint behind the figure. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#ccfbf1" opacity={0.24} />
        {/* The still pond surface banked low at the very bottom, clear of the figure. */}
        <rect x={6} y={56} width={68} height={18} rx={8} fill="#5eead4" opacity={0.32} />
        <rect x={6} y={64} width={68} height={10} rx={8} fill="#2dd4bf" opacity={0.3} />
        {/* Two pale ripple lines across the surface for stillness. */}
        <rect x={14} y={60} width={18} height={1} rx={0.5} fill="#99f6e4" opacity={0.55} />
        <rect x={48} y={66} width={16} height={1} rx={0.5} fill="#99f6e4" opacity={0.5} />
        {/* Lily pads tucked into the outer columns, off the figure's centre. */}
        {[12, 66].map((px, k) => (
          <g key={k}>
            <ellipse cx={px} cy={62} rx={6} ry={3} fill="#34d399" opacity={0.55} />
            <path d={`M ${px} 62 L ${px + 5} 60`} stroke="#0f766e" strokeWidth={0.8} opacity={0.4} />
          </g>
        ))}
        {/* A single lotus bloom resting on the left pad, low and to the edge. */}
        <circle cx={12} cy={60} r={1.8} fill="#f9a8d4" opacity={0.7} />
        <circle cx={12} cy={60} r={0.8} fill="#fbcfe8" opacity={0.8} />
        {/* Faint reeds rising in the bottom corners. */}
        {[8, 72].map((rx2, k) => (
          <rect key={`reed-${k}`} x={rx2} y={52} width={1} height={10} rx={0.5} fill="#15803d" opacity={0.4} />
        ))}
      </g>
    )
  }
  if (habitat === 'autumn_grove') {
    // A warm autumn grove — a golden wash, slim bare trunks pushed to the edges, a leaf-litter
    // band low at the bottom, and a few warm leaves drifting down the outer columns. Nourished.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A warm golden wash, faint so the figure reads clearly in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#fef3c7" opacity={0.26} />
        <rect x={4} y={44} width={72} height={30} rx={10} fill="#fcd9b6" opacity={0.24} />
        {/* Slim trunks at the far edges, clear of the centred figure. */}
        {[9, 71].map((tx, k) => (
          <rect key={k} x={tx} y={20} width={2.4} height={42} rx={1} fill="#b45309" opacity={0.4} />
        ))}
        {/* A soft canopy of warm foliage hugging the top corners. */}
        <ellipse cx={11} cy={20} rx={9} ry={6} fill="#ea580c" opacity={0.3} />
        <ellipse cx={69} cy={18} rx={10} ry={7} fill="#d97706" opacity={0.3} />
        {/* A leaf-litter band banked low at the very bottom. */}
        <rect x={6} y={60} width={68} height={14} rx={6} fill="#f59e0b" opacity={0.3} />
        <rect x={6} y={66} width={68} height={8} rx={6} fill="#c2410c" opacity={0.3} />
        {/* A few warm leaves drifting down the outer columns, off the figure's centre. */}
        {[
          { x: 14, y: 34, c: '#ea580c' },
          { x: 18, y: 50, c: '#f59e0b' },
          { x: 64, y: 30, c: '#d97706' },
          { x: 68, y: 46, c: '#ea580c' },
        ].map((l, k) => (
          <ellipse key={`leaf-${k}`} cx={l.x} cy={l.y} rx={2} ry={1.1} fill={l.c} opacity={0.7} transform={`rotate(${k % 2 ? 30 : -25} ${l.x} ${l.y})`} />
        ))}
      </g>
    )
  }
  if (habitat === 'starfall') {
    // Deep night with drifting shooting stars — a darker indigo wash, a dense field of stars at
    // the edges, and a few streaking meteors raking the corners. Joyful, celebratory.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A deep indigo night wash, faint so the figure stays bright in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#1e1b4b" opacity={0.34} />
        <rect x={4} y={6} width={72} height={30} rx={10} fill="#312e81" opacity={0.22} />
        {/* A dense field of small stars hugging the outer ring, clear of the centre. */}
        {Array.from({ length: 14 }, (_, k) => {
          const a = (k / 14) * Math.PI * 2
          const r = k % 2 ? 33 : 29
          return (
            <circle key={k} cx={40 + Math.cos(a) * r} cy={38 + Math.sin(a) * (r - 3)} r={k % 3 ? 0.8 : 1.3} fill="#e0e7ff" opacity={0.9} />
          )
        })}
        {/* Drifting shooting stars raking the corners — a bright head with a fading tail. */}
        {[
          { x: 14, y: 14, dx: 8, dy: 4 },
          { x: 66, y: 20, dx: 7, dy: 5 },
          { x: 20, y: 50, dx: 9, dy: 3 },
        ].map((m, k) => (
          <g key={`meteor-${k}`}>
            <line x1={m.x} y1={m.y} x2={m.x - m.dx} y2={m.y - m.dy} stroke="#c7d2fe" strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
            <circle cx={m.x} cy={m.y} r={1.3} fill="#f8fafc" opacity={0.9} />
          </g>
        ))}
      </g>
    )
  }
  if (habitat === 'ember_canyon') {
    // PATH-EXCLUSIVE (Pitta / breath) — a warm canyon at dusk: a deep ember-glow wash, a
    // distant glowing rim pushed to the corners, and a few embers drifting up the edges.
    return (
      <g opacity={g} aria-hidden="true">
        {/* The warm dusk wash, faint so the figure reads in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#7c2d12" opacity={0.26} />
        <rect x={4} y={46} width={72} height={28} rx={10} fill="#ea580c" opacity={0.28} />
        {/* A low ember glow banked along the very bottom — the canyon floor's heat. */}
        <rect x={4} y={62} width={72} height={12} rx={10} fill="#f97316" opacity={0.32} />
        {/* Distant canyon walls pushed to the left and right edges, clear of the figure. */}
        <path d="M 4 74 L 4 30 L 18 38 L 14 74 Z" fill="#7c2d12" opacity={0.4} />
        <path d="M 76 74 L 76 26 L 60 36 L 66 74 Z" fill="#7c2d12" opacity={0.4} />
        {/* A few embers drifting up the outer columns, off the figure's centre. */}
        {[10, 16, 64, 70].map((ex, k) => (
          <circle key={k} cx={ex} cy={34 + (k % 2) * 14} r={k % 2 ? 0.9 : 1.3} fill="#fbbf24" opacity={0.85} />
        ))}
      </g>
    )
  }
  if (habitat === 'misty_grove') {
    // PATH-EXCLUSIVE (Kapha / stillness) — a grounded, still grove: a soft jade wash, mossy
    // stones banked low at the bottom, and pale mist drifting across the edges.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A cool jade wash, faint so it recedes behind the figure. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#047857" opacity={0.22} />
        {/* Mossy ground banked low at the very bottom, clear of the figure. */}
        <rect x={6} y={58} width={68} height={16} rx={6} fill="#10b981" opacity={0.4} />
        <rect x={6} y={65} width={68} height={9} rx={6} fill="#047857" opacity={0.45} />
        {/* Smooth stones tucked into the bottom corners, off the figure's centre. */}
        <ellipse cx={14} cy={62} rx={9} ry={6} fill="#78716c" opacity={0.55} />
        <ellipse cx={66} cy={64} rx={8} ry={5} fill="#a16207" opacity={0.45} />
        <ellipse cx={11} cy={60} rx={4} ry={2.4} fill="#34d399" opacity={0.5} />
        {/* Two low bands of pale mist drifting across the edges, kept clear of the centre. */}
        <rect x={4} y={40} width={20} height={3} rx={1.5} fill="#a7f3d0" opacity={0.4} />
        <rect x={56} y={48} width={20} height={3} rx={1.5} fill="#a7f3d0" opacity={0.4} />
      </g>
    )
  }
  if (habitat === 'open_sky') {
    // PATH-EXCLUSIVE (Vata / heart) — an airy open sky: a pale wash with a few soft drifting
    // clouds pushed to the edges and a faint windy bluff banked low at the bottom.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A pale sky wash, faint so the figure reads clearly in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#e0f2fe" opacity={0.32} />
        <rect x={4} y={34} width={72} height={40} rx={10} fill="#bae6fd" opacity={0.26} />
        {/* Soft clouds pushed to the top and side edges, off the figure's centre. */}
        {[
          { cx: 14, cy: 18, r: 4 },
          { cx: 66, cy: 14, r: 4.5 },
          { cx: 70, cy: 34, r: 3.5 },
        ].map((c, k) => (
          <g key={k}>
            <ellipse cx={c.cx} cy={c.cy} rx={c.r * 1.6} ry={c.r} fill="#f8fafc" opacity={0.7} />
            <ellipse cx={c.cx - c.r} cy={c.cy + 1} rx={c.r} ry={c.r * 0.7} fill="#f8fafc" opacity={0.7} />
            <ellipse cx={c.cx + c.r} cy={c.cy + 1} rx={c.r} ry={c.r * 0.7} fill="#f8fafc" opacity={0.7} />
          </g>
        ))}
        {/* A faint windy bluff banked low at the very bottom, clear of the figure. */}
        <path d="M 4 74 L 4 64 Q 26 56 50 62 T 76 60 L 76 74 Z" fill="#cbd5e1" opacity={0.4} />
      </g>
    )
  }
  if (habitat === 'nebula') {
    // LEGENDARY (tier 4) — a cosmic nebula backdrop: deep violet/indigo clouds of stellar gas
    // billowing over a near-black void, a dense scatter of stars across the whole frame, and a
    // faint spiral wisp — the rested, awe-filled endgame habitat. The richest backdrop in the slot.
    return (
      <g opacity={g} aria-hidden="true">
        {/* The deep cosmic void wash, faint so the figure stays bright in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#1e1b4b" opacity={0.4} />
        {/* Billowing nebula gas clouds pushed to the corners/edges, clear of the centre. */}
        {[
          { cx: 14, cy: 18, rx: 14, ry: 10, c: '#7c3aed' },
          { cx: 66, cy: 22, rx: 13, ry: 9, c: '#db2777' },
          { cx: 18, cy: 58, rx: 12, ry: 8, c: '#2563eb' },
          { cx: 64, cy: 60, rx: 13, ry: 9, c: '#9333ea' },
        ].map((c, k) => (
          <ellipse key={`gas-${k}`} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={c.c} opacity={0.26} />
        ))}
        {/* A faint spiral wisp threading the upper edge, evoking a distant galaxy arm. */}
        <path
          d="M 10 16 Q 30 8 50 14 T 72 24"
          fill="none"
          stroke="#c4b5fd"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.4}
        />
        {/* A dense star field scattered across the whole frame — deterministic positions. */}
        {Array.from({ length: 22 }, (_, k) => {
          const a = (k / 22) * Math.PI * 2 * 3.1
          const rad = 14 + (k % 5) * 6
          const sx = 40 + Math.cos(a) * rad
          const sy = 38 + Math.sin(a) * (rad - 2)
          return (
            <circle
              key={`star-${k}`}
              cx={sx}
              cy={sy}
              r={k % 4 === 0 ? 1.2 : 0.7}
              fill={k % 3 ? '#e0e7ff' : '#fef9c3'}
              opacity={0.9}
            />
          )
        })}
      </g>
    )
  }
  return null
}

// A small worn accessory drawn on top of the figure (above its head, near y≈40-14). Each
// option is a distinct, flat little shape — the on-character payoff of spending coins.
function Accessory({ accessory, g }: { accessory: string; g: number }) {
  // The figures sit roughly centred on x=40; their "head" tops out around y≈26-30. We perch
  // accessories just above that band so they read as worn rather than floating.
  const topY = 24
  if (accessory === 'halo') {
    // A floating golden ring: a soft outer bloom, the bright gold band itself, and a faint
    // highlight along the near edge so it reads as a glowing halo rather than a flat outline.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Soft glow blooming around the ring. */}
        <ellipse
          cx={40}
          cy={topY}
          rx={9}
          ry={3}
          fill="none"
          stroke="#fef9c3"
          strokeWidth={3.6}
          opacity={0.4}
        />
        {/* The bright gold band — the halo's defining shape, unchanged. */}
        <ellipse
          cx={40}
          cy={topY}
          rx={9}
          ry={3}
          fill="none"
          stroke="#fde68a"
          strokeWidth={1.8}
        />
        {/* A brighter highlight along the front-lower arc for a touch of shine. */}
        <path
          d={`M 31.5 ${topY + 1.2} Q 40 ${topY + 3.6} 48.5 ${topY + 1.2}`}
          fill="none"
          stroke="#fffbeb"
          strokeWidth={0.8}
          strokeLinecap="round"
          opacity={0.9}
        />
      </g>
    )
  }
  if (accessory === 'leaf_crown') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A ring of small leaves resting on the brow. */}
        {Array.from({ length: 5 }, (_, k) => {
          const a = (k / 4) * Math.PI - Math.PI
          const lx = 40 + Math.cos(a) * 8
          const ly = topY + 2 - Math.sin(a) * 2
          return (
            <ellipse
              key={k}
              cx={lx}
              cy={ly}
              rx={2.4}
              ry={1.2}
              fill="#4ade80"
              transform={`rotate(${(a * 180) / Math.PI} ${lx} ${ly})`}
            />
          )
        })}
      </g>
    )
  }
  if (accessory === 'ribbon') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A small bow off to one side. */}
        <path d={`M 47 ${topY} l 4 -2 v 4 z`} fill="#f472b6" />
        <path d={`M 47 ${topY} l 4 2 v -4 z`} fill="#ec4899" />
        <circle cx={47} cy={topY} r={1.1} fill="#be185d" />
      </g>
    )
  }
  if (accessory === 'flower') {
    // A small blossom tucked by the head: five rounded petals each with a soft inner shade and a
    // tiny highlight, around a golden centre dotted with pollen — fuller and rounder than a flat
    // ring of dots, but the same little flower.
    const cx = 48
    const cy = topY + 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {Array.from({ length: 5 }, (_, k) => {
          const a = (k / 5) * Math.PI * 2
          const px = cx + Math.cos(a) * 2.4
          const py = cy + Math.sin(a) * 2.4
          return (
            <g key={k}>
              {/* The petal, with a slightly deeper base tucked toward the centre. */}
              <circle cx={px} cy={py} r={1.7} fill="#f9a8d4" />
              <circle
                cx={px - Math.cos(a) * 0.5}
                cy={py - Math.sin(a) * 0.5}
                r={0.9}
                fill="#f472b6"
                opacity={0.7}
              />
              {/* A small highlight on the outer edge of each petal. */}
              <circle
                cx={px + Math.cos(a) * 0.6}
                cy={py + Math.sin(a) * 0.6}
                r={0.4}
                fill="#fce7f3"
                opacity={0.9}
              />
            </g>
          )
        })}
        {/* The golden centre with a couple of pollen dots and a soft highlight. */}
        <circle cx={cx} cy={cy} r={1.4} fill="#fbbf24" />
        <circle cx={cx - 0.5} cy={cy - 0.5} r={0.4} fill="#fde68a" />
        <circle cx={cx + 0.6} cy={cy + 0.4} r={0.3} fill="#d97706" />
      </g>
    )
  }
  if (accessory === 'scarf') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A little scarf wrapped low at the neck/base, with a hanging tail. */}
        <rect x={33} y={40} width={14} height={3.4} rx={1.7} fill="#60a5fa" />
        <rect x={44} y={42} width={3} height={7} rx={1.4} fill="#3b82f6" />
      </g>
    )
  }
  if (accessory === 'star') {
    // A tiny five-point star floating just above the head.
    const sx = 40
    const sy = topY - 5
    const pts = Array.from({ length: 5 }, (_, k) => {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2
      return `${(sx + Math.cos(a) * 3).toFixed(2)},${(sy + Math.sin(a) * 3).toFixed(2)}`
    })
    return (
      <polygon
        points={pts.join(' ')}
        fill="#fde68a"
        stroke="#fbbf24"
        strokeWidth={0.5}
        opacity={0.95 * g}
        aria-hidden="true"
      />
    )
  }
  if (accessory === 'berry_sprig') {
    // A little nourishing sprig tucked at the brow: a short stem with a couple of leaves and a
    // small cluster of red berries, so it reads as foraged greenery even at this scale.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The stem, rising and curving off to one side of the head. */}
        <path
          d={`M 45 ${topY + 2} Q 47.5 ${topY - 3} 47 ${topY - 7}`}
          fill="none"
          stroke="#3f6212"
          strokeWidth={1}
          strokeLinecap="round"
        />
        {/* Two leaves off the stem, with a lighter centre vein. */}
        <ellipse
          cx={43.4}
          cy={topY - 1.6}
          rx={2.6}
          ry={1.3}
          fill="#4ade80"
          transform={`rotate(-32 43.4 ${topY - 1.6})`}
        />
        <ellipse
          cx={49.4}
          cy={topY - 3.2}
          rx={2.4}
          ry={1.2}
          fill="#22c55e"
          transform={`rotate(34 49.4 ${topY - 3.2})`}
        />
        <line
          x1={43.4}
          y1={topY - 1.6}
          x2={45}
          y2={topY - 1}
          stroke="#bbf7d0"
          strokeWidth={0.4}
        />
        {/* A small cluster of berries at the tip, brightest in front. */}
        <circle cx={46.2} cy={topY - 7.4} r={1.5} fill="#dc2626" />
        <circle cx={48} cy={topY - 6.6} r={1.4} fill="#ef4444" />
        <circle cx={47} cy={topY - 8.6} r={1.2} fill="#f87171" />
        <circle cx={46.6} cy={topY - 7.9} r={0.4} fill="#fecaca" />
      </g>
    )
  }
  if (accessory === 'tiny_bell') {
    // A small jingle bell on a cord: a short cord looping down from the brow to a gold bell with
    // a seam, a slot, and a little clapper bead, so it reads as a cheerful chime.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The cord looping down off the head. */}
        <path
          d={`M 44 ${topY + 1} Q 47 ${topY + 3} 47 ${topY + 6}`}
          fill="none"
          stroke="#a16207"
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        {/* The bell cap, then the rounded gold body. */}
        <rect x={46} y={topY + 5.4} width={2} height={1.4} rx={0.6} fill="#ca8a04" />
        <path
          d={`M 43.6 ${topY + 11} Q 43.6 ${topY + 6.6} 47 ${topY + 6.6} Q 50.4 ${topY + 6.6} 50.4 ${topY + 11} Z`}
          fill="#fbbf24"
          stroke="#d97706"
          strokeWidth={0.5}
        />
        {/* The mouth band and slot, plus a bright highlight and the clapper bead. */}
        <rect x={43.4} y={topY + 10.4} width={7.2} height={1.4} rx={0.7} fill="#f59e0b" />
        <line
          x1={45.4}
          y1={topY + 11.1}
          x2={48.6}
          y2={topY + 11.1}
          stroke="#92400e"
          strokeWidth={0.7}
        />
        <circle cx={45.4} cy={topY + 8.4} r={0.9} fill="#fef3c7" opacity={0.85} />
        <circle cx={47} cy={topY + 12.4} r={1} fill="#b45309" />
      </g>
    )
  }
  if (accessory === 'antlers') {
    // Small branching antlers: a pair of warm tawny antlers sweeping up and out from the brow,
    // each with a couple of short tines, drawn symmetrically so they read as a calm woodland crown.
    const antler = (dir: 1 | -1) => {
      const baseX = 40 + dir * 2.5
      return (
        <g key={dir}>
          {/* The main beam, curving up and outward. */}
          <path
            d={`M ${baseX} ${topY + 1}
                Q ${baseX + dir * 4} ${topY - 4} ${baseX + dir * 5.5} ${topY - 11}`}
            fill="none"
            stroke="#a16207"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          {/* A lower forward tine. */}
          <path
            d={`M ${baseX + dir * 2.4} ${topY - 2.4} q ${dir * 3} ${-1.4} ${dir * 3.6} ${-4}`}
            fill="none"
            stroke="#b45309"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          {/* An upper tine near the top of the beam. */}
          <path
            d={`M ${baseX + dir * 4.6} ${topY - 7.4} q ${dir * 2.6} ${-0.6} ${dir * 3.2} ${-3.2}`}
            fill="none"
            stroke="#b45309"
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          {/* A soft highlight up the front of the beam for a little volume. */}
          <path
            d={`M ${baseX - dir * 0.3} ${topY}
                Q ${baseX + dir * 3.4} ${topY - 4.2} ${baseX + dir * 5} ${topY - 10.4}`}
            fill="none"
            stroke="#fcd34d"
            strokeWidth={0.5}
            strokeLinecap="round"
            opacity={0.7}
          />
        </g>
      )
    }
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {antler(-1)}
        {antler(1)}
      </g>
    )
  }
  // --- Quirky personality / hobby accessories (universal) --------------------------------
  // Playful worn items that express the practitioner's vibe (music, study, gaming, cosy,
  // celebration) rather than a nature/dosha theme. Each perches on the head like the others and
  // is condition-responsive via `g`.
  if (accessory === 'headphones') {
    // Sleek over-ear headphones: a slim band arcing over the crown into two rounded ear cups, each
    // with a soft cushion and a highlight so they read as worn cans.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The headband arcing over the head. */}
        <path
          d={`M 31 ${topY + 4} Q 40 ${topY - 7} 49 ${topY + 4}`}
          fill="none"
          stroke="#1e3a8a"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <path
          d={`M 31.5 ${topY + 3.6} Q 40 ${topY - 6} 48.5 ${topY + 3.6}`}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={0.7}
          strokeLinecap="round"
          opacity={0.8}
        />
        {/* The two ear cups, each a rounded blue shell with a paler cushion. */}
        {[30.6, 49.4].map((ex, k) => (
          <g key={k}>
            <rect x={ex - 2} y={topY + 3} width={4} height={6} rx={2} fill="#2563eb" />
            <rect x={ex - 1.1} y={topY + 4} width={2.2} height={4} rx={1.1} fill="#93c5fd" />
          </g>
        ))}
      </g>
    )
  }
  if (accessory === 'nerd_glasses') {
    // Round studious spectacles: two circular dark frames joined by a bridge, with a faint lens
    // glint, sitting low on the brow like worn specs.
    const lensY = topY + 8
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The two round frames. */}
        {[35.4, 44.6].map((lx, k) => (
          <g key={k}>
            <circle
              cx={lx}
              cy={lensY}
              r={3.2}
              fill="#bfdbfe"
              fillOpacity={0.25}
              stroke="#1f2937"
              strokeWidth={1.1}
            />
            {/* A small lens glint, upper-left of each lens. */}
            <line
              x1={lx - 1.4}
              y1={lensY - 1.4}
              x2={lx - 0.2}
              y2={lensY - 0.2}
              stroke="#f8fafc"
              strokeWidth={0.6}
              strokeLinecap="round"
              opacity={0.85}
            />
          </g>
        ))}
        {/* The bridge between the lenses. */}
        <line x1={38.4} y1={lensY - 0.4} x2={41.6} y2={lensY - 0.4} stroke="#1f2937" strokeWidth={1} />
        {/* Stubby temple arms reaching to the sides. */}
        <line x1={32.4} y1={lensY - 0.8} x2={30} y2={lensY - 1.6} stroke="#1f2937" strokeWidth={0.9} strokeLinecap="round" />
        <line x1={47.6} y1={lensY - 0.8} x2={50} y2={lensY - 1.6} stroke="#1f2937" strokeWidth={0.9} strokeLinecap="round" />
      </g>
    )
  }
  if (accessory === 'gaming_headset') {
    // An over-ear gaming headset: a chunky dark band over the crown, two big ear cups with a glowing
    // cyan RGB accent ring, and a boom mic curving down to the mouth with a red foam tip.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The thick headband arcing over the head. */}
        <path
          d={`M 30 ${topY + 4} Q 40 ${topY - 8} 50 ${topY + 4}`}
          fill="none"
          stroke="#111827"
          strokeWidth={2.8}
          strokeLinecap="round"
        />
        {/* The two ear cups — dark shells, each ringed with a glowing cyan RGB accent. */}
        {[29.6, 50.4].map((ex, k) => (
          <g key={k}>
            <rect x={ex - 2.4} y={topY + 2.6} width={4.8} height={7} rx={2.2} fill="#1f2937" />
            <rect
              x={ex - 1.5}
              y={topY + 3.6}
              width={3}
              height={5}
              rx={1.5}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={0.9}
            />
          </g>
        ))}
        {/* The boom mic swinging down from the left cup to the mouth, tipped with a red foam ball. */}
        <path
          d={`M 30 ${topY + 9} Q 31 ${topY + 15} 36 ${topY + 16}`}
          fill="none"
          stroke="#111827"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <circle cx={36.4} cy={topY + 16.2} r={1.8} fill="#ef4444" />
        <circle cx={35.8} cy={topY + 15.6} r={0.5} fill="#fecaca" opacity={0.9} />
      </g>
    )
  }
  if (accessory === 'beanie') {
    // A cosy knit beanie: a rounded teal cap pulled over the crown with a ribbed fold band and a
    // couple of knit lines, topped with a soft cream pompom.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The cap dome over the top of the head. */}
        <path
          d={`M 31 ${topY + 6} Q 31 ${topY - 8} 40 ${topY - 8} Q 49 ${topY - 8} 49 ${topY + 6} Z`}
          fill="#14b8a6"
        />
        {/* A couple of knit lines up the cap for a stitched feel. */}
        <path d={`M 36 ${topY + 5} Q 35 ${topY - 4} 38 ${topY - 7}`} fill="none" stroke="#0d9488" strokeWidth={0.6} opacity={0.8} />
        <path d={`M 44 ${topY + 5} Q 45 ${topY - 4} 42 ${topY - 7}`} fill="none" stroke="#0d9488" strokeWidth={0.6} opacity={0.8} />
        {/* The ribbed fold band at the brim. */}
        <rect x={30.6} y={topY + 4} width={18.8} height={3.4} rx={1.7} fill="#2dd4bf" />
        <line x1={34} y1={topY + 4.4} x2={34} y2={topY + 7} stroke="#0d9488" strokeWidth={0.5} opacity={0.7} />
        <line x1={40} y1={topY + 4.4} x2={40} y2={topY + 7} stroke="#0d9488" strokeWidth={0.5} opacity={0.7} />
        <line x1={46} y1={topY + 4.4} x2={46} y2={topY + 7} stroke="#0d9488" strokeWidth={0.5} opacity={0.7} />
        {/* The soft pompom on top. */}
        <circle cx={40} cy={topY - 9} r={2.4} fill="#f1f5f9" />
        <circle cx={39.2} cy={topY - 9.8} r={0.7} fill="#ffffff" opacity={0.9} />
      </g>
    )
  }
  if (accessory === 'party_hat') {
    // A striped cone party hat: a tall triangle of alternating magenta and yellow stripes balanced
    // on the crown, topped with a little pompom and a row of confetti dots.
    const apexX = 40
    const apexY = topY - 14
    const baseL = 33.5
    const baseR = 46.5
    const baseY = topY + 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The cone body, magenta. */}
        <path
          d={`M ${apexX} ${apexY} L ${baseL} ${baseY} L ${baseR} ${baseY} Z`}
          fill="#ec4899"
        />
        {/* A couple of yellow chevron stripes banding the cone. */}
        <path d={`M 36.6 ${topY - 7.4} L 43.4 ${topY - 7.4} L 42 ${topY - 5} L 38 ${topY - 5} Z`} fill="#fde047" />
        <path d={`M 35 ${topY - 2.4} L 45 ${topY - 2.4} L 46.5 ${baseY} L 33.5 ${baseY} Z`} fill="#fde047" />
        {/* A few confetti dots drifting beside the hat. */}
        <circle cx={49} cy={topY - 8} r={0.9} fill="#38bdf8" />
        <circle cx={32} cy={topY - 4} r={0.8} fill="#a3e635" />
        <circle cx={47} cy={topY - 12} r={0.7} fill="#fb7185" />
        {/* The pompom topping the cone. */}
        <circle cx={apexX} cy={apexY} r={2.2} fill="#f8fafc" />
        <circle cx={apexX - 0.7} cy={apexY - 0.7} r={0.6} fill="#ffffff" opacity={0.9} />
      </g>
    )
  }
  // --- Path-exclusive accessories (per_path in the catalog) ------------------------------
  // ember_crown → breath (Pitta/fire), mossy_circlet → stillness (Kapha/earth), feather_plume →
  // heart (Vata/air). The backend only offers each to its matching creature; the palette follows
  // the dosha so it reads on-theme. Each perches on the brow like the universal accessories and is
  // condition-responsive via `g`.
  if (accessory === 'ember_crown') {
    // A small ember crown: a fan of warm flame tongues rising from a low band on the brow, with
    // a brighter cream core to each so it reads as fire even at this scale.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The low band the flames rise from. */}
        <path
          d={`M 32 ${topY + 1} Q 40 ${topY - 1} 48 ${topY + 1}`}
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {/* Five flame tongues, tallest in the centre. */}
        {Array.from({ length: 5 }, (_, k) => {
          const t = k / 4 // 0..1 across the band
          const fx = 33 + t * 14
          const h = 4 + Math.sin(t * Math.PI) * 4 // taller toward the middle
          return (
            <g key={k}>
              <path
                d={`M ${fx - 1.6} ${topY} Q ${fx} ${topY - h} ${fx + 1.6} ${topY} Z`}
                fill={k % 2 === 0 ? '#f97316' : '#fb923c'}
              />
              <path
                d={`M ${fx - 0.7} ${topY - 0.4} Q ${fx} ${topY - h * 0.6} ${fx + 0.7} ${topY - 0.4} Z`}
                fill="#fbbf24"
              />
            </g>
          )
        })}
      </g>
    )
  }
  if (accessory === 'mossy_circlet') {
    // An earthen circlet: a stone band across the brow, a few rounded pebbles set into it, and
    // little moss tufts and a leaf so it reads grounded and grove-like.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The stone band. */}
        <path
          d={`M 31 ${topY + 1.5} Q 40 ${topY - 2.5} 49 ${topY + 1.5}`}
          fill="none"
          stroke="#78716c"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        {/* Set pebbles along the band. */}
        {[34, 40, 46].map((px, k) => (
          <circle
            key={k}
            cx={px}
            cy={topY - (k === 1 ? 1.6 : 0.4)}
            r={1.5}
            fill={k === 1 ? '#a16207' : '#a8a29e'}
          />
        ))}
        {/* Moss tufts and a small leaf nestled on the band. */}
        <circle cx={37} cy={topY - 0.6} r={1.2} fill="#34d399" />
        <circle cx={43.4} cy={topY - 0.8} r={1.1} fill="#10b981" />
        <ellipse
          cx={48}
          cy={topY - 0.2}
          rx={1.8}
          ry={1}
          fill="#047857"
          transform={`rotate(-28 48 ${topY - 0.2})`}
        />
      </g>
    )
  }
  if (accessory === 'feather_plume') {
    // An airy feather plume: a slender white quill curving up off one side of the head with a few
    // soft barbs, and a tiny floating wisp above to give the air spirit a sense of lift.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The quill, curving up and back from the brow. */}
        <path
          d={`M 46 ${topY + 1} Q 49 ${topY - 6} 47.5 ${topY - 11}`}
          fill="none"
          stroke="#f8fafc"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {/* A few soft barbs feathering off the quill. */}
        {Array.from({ length: 4 }, (_, k) => {
          const t = k / 3 // 0..1 up the quill
          const qx = 46 + 1.6 * Math.sin(t * Math.PI)
          const qy = topY + 1 - t * 11.5
          return (
            <line
              key={k}
              x1={qx}
              y1={qy}
              x2={qx + 2.6}
              y2={qy - 1.4}
              stroke={k % 2 === 0 ? '#bae6fd' : '#e0f2fe'}
              strokeWidth={0.9}
              strokeLinecap="round"
            />
          )
        })}
        {/* A tiny floating wind wisp above, for lift. */}
        <path
          d={`M 41 ${topY - 6} q 2 -1.4 4 0`}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
      </g>
    )
  }
  if (accessory === 'star_crown') {
    // LEGENDARY (tier 4) — a crown of stars: an arc of five-point golden stars set in a band
    // sweeping over the brow, the tallest at the centre, each with a soft halo glow. Joyful, the
    // spectacular endgame accessory and the richest in the slot.
    const star = (cx: number, cy: number, s: number, k: number) => {
      // A small five-point star built from its outer/inner radius points.
      const pts = Array.from({ length: 10 }, (_, i) => {
        const rad = i % 2 === 0 ? s : s * 0.45
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
        return `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`
      }).join(' ')
      return (
        <g key={k}>
          <circle cx={cx} cy={cy} r={s * 1.7} fill="#fde68a" opacity={0.35} />
          <polygon points={pts} fill={k % 2 === 0 ? '#fde047' : '#fbbf24'} />
          <circle cx={cx} cy={cy} r={s * 0.3} fill="#fffbeb" />
        </g>
      )
    }
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The faint band the stars are set along, arcing over the brow. */}
        <path
          d={`M 31 ${topY + 1} Q 40 ${topY - 6} 49 ${topY + 1}`}
          fill="none"
          stroke="#fcd34d"
          strokeWidth={0.8}
          strokeLinecap="round"
          opacity={0.6}
        />
        {/* Five stars arched across the band, tallest (largest) at the centre. */}
        {Array.from({ length: 5 }, (_, k) => {
          const t = k / 4 // 0..1 across the band
          const sx = 32 + t * 16
          const lift = Math.sin(t * Math.PI) * 5 // higher toward the middle
          const sy = topY - lift
          const size = 1.6 + Math.sin(t * Math.PI) * 1.4
          return star(sx, sy, size, k)
        })}
      </g>
    )
  }
  return null
}

// A small friend that keeps the spirit company — drawn at the bottom-left of the 80×80
// viewBox, in front of the habitat but well clear of the centred figure, so it never fights
// the spirit. Static like every other cosmetic (the outer layer carries any animation).
function Companion({ companion, g }: { companion: string; g: number }) {
  // The little friend sits on the ground band, off to the left of the figure.
  const baseX = 16
  const baseY = 62
  if (companion === 'firefly') {
    return (
      <g opacity={g} aria-hidden="true">
        {/* A couple of soft glowing dots hovering low and left — each a layered halo (wide soft
            glow → warm aura → bright core → white-hot pinpoint) with a faint trailing spark, so
            the little lights read as living embers rather than flat dots. */}
        {[
          { x: baseX - 2, y: baseY - 6 },
          { x: baseX + 6, y: baseY - 12 },
        ].map((d, k) => (
          <g key={k}>
            <circle cx={d.x} cy={d.y} r={4.4} fill="#fde68a" opacity={0.16} />
            <circle cx={d.x} cy={d.y} r={3} fill="#fcd34d" opacity={0.42} />
            <circle cx={d.x} cy={d.y} r={1.6} fill="#fef08a" opacity={0.95} />
            <circle cx={d.x - 0.4} cy={d.y - 0.4} r={0.7} fill="#fffbeb" opacity={0.95} />
            {/* A faint trailing spark drifting below the glow. */}
            <circle cx={d.x - 2.6} cy={d.y + 2.4} r={0.7} fill="#fde68a" opacity={0.5} />
          </g>
        ))}
      </g>
    )
  }
  if (companion === 'bird') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A small perched bird — round body, head, beak, tail, now with a paler belly, a
            darker folded wing, a little chest crest and an eye glint for depth. */}
        <ellipse cx={baseX} cy={baseY - 4} rx={4} ry={3.2} fill="#60a5fa" />
        {/* Pale belly highlight along the lower front. */}
        <ellipse cx={baseX - 1} cy={baseY - 2.6} rx={2.6} ry={2} fill="#bfdbfe" opacity={0.85} />
        {/* A folded wing, slightly darker, lifted over the back. */}
        <path
          d={`M ${baseX - 2} ${baseY - 5} q 4 -1.4 5.6 1.6 q -3 1.4 -5.6 0.6 z`}
          fill="#3b82f6"
        />
        <circle cx={baseX + 3} cy={baseY - 7} r={2.2} fill="#3b82f6" />
        {/* A tiny crest tuft on the crown. */}
        <path d={`M ${baseX + 3} ${baseY - 9} l 0.6 -1.8 l 1 1.4 z`} fill="#2563eb" />
        <path d={`M ${baseX + 5} ${baseY - 7} l 2.4 0.8 l -2.4 0.8 z`} fill="#f59e0b" />
        <path d={`M ${baseX - 4} ${baseY - 4} l -3 1.6 l 3 1 z`} fill="#2563eb" />
        <circle cx={baseX + 3.6} cy={baseY - 7.4} r={0.5} fill="#0f172a" />
        {/* Eye glint. */}
        <circle cx={baseX + 3.4} cy={baseY - 7.7} r={0.2} fill="#f8fafc" />
      </g>
    )
  }
  if (companion === 'cat') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A small curled cat resting by the base. */}
        <ellipse cx={baseX} cy={baseY - 2} rx={6} ry={3.6} fill="#fbbf24" />
        <circle cx={baseX - 4.5} cy={baseY - 4} r={2.6} fill="#f59e0b" />
        <path d={`M ${baseX - 6.5} ${baseY - 5.6} l 0.8 -2 l 1.4 1.4 z`} fill="#f59e0b" />
        <path d={`M ${baseX - 3.5} ${baseY - 5.8} l 0.8 -2 l 1.2 1.6 z`} fill="#f59e0b" />
        {/* A tail curling around the body. */}
        <path
          d={`M ${baseX + 5} ${baseY - 1} q 4 -1 3 -4`}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={baseX - 5.2} cy={baseY - 4} r={0.5} fill="#0f172a" />
      </g>
    )
  }
  // --- Path-exclusive companions (per_path in the catalog) -------------------------------
  // kitsune → breath (Pitta/fire), tortoise → stillness (Kapha), crane → heart (Vata). The
  // backend only offers each to its matching creature; the art follows the same warm/jade/airy
  // palettes as the dosha so it reads on-theme. Each is condition-responsive via `g`.
  if (companion === 'kitsune') {
    // A sitting nine-tail fox: a fan of nine slender tapered tails swept up/behind, a pointed-ear
    // head + snout, a small body, and a soft ember glow accent for the fire spirit.
    const tailRootX = baseX + 4
    const tailRootY = baseY - 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Ember glow accent — a warm halo behind the fox (the fire spirit's signature). */}
        <circle cx={baseX} cy={baseY - 5} r={9} fill="#fb923c" opacity={0.18} />
        {/* The fan of nine tails, generated across an angular spread sweeping up and behind. */}
        {Array.from({ length: 9 }).map((_, k) => {
          const t = k / 8 // 0..1 across the fan
          const angle = -150 + t * 90 // degrees: sweeping from low-back up and over
          const rad = (angle * Math.PI) / 180
          const len = 11 + Math.sin(t * Math.PI) * 3 // longer in the middle of the fan
          const tipX = tailRootX + Math.cos(rad) * len
          const tipY = tailRootY + Math.sin(rad) * len
          // A control point bows each tail outward for a gentle taper.
          const ctrlX = tailRootX + Math.cos(rad) * len * 0.55 - 2
          const ctrlY = tailRootY + Math.sin(rad) * len * 0.55
          return (
            <g key={k}>
              <path
                d={`M ${tailRootX} ${tailRootY} Q ${ctrlX} ${ctrlY} ${tipX} ${tipY}`}
                fill="none"
                stroke={k % 2 === 0 ? '#f97316' : '#fb923c'}
                strokeWidth={2}
                strokeLinecap="round"
              />
              {/* Cream tail-tip. */}
              <circle cx={tipX} cy={tipY} r={1.2} fill="#fef3c7" />
            </g>
          )
        })}
        {/* Body — a small sitting haunch. */}
        <ellipse cx={baseX} cy={baseY - 2} rx={4.6} ry={4} fill="#f97316" />
        {/* Head + pointed ears + snout. */}
        <circle cx={baseX - 3} cy={baseY - 7} r={3} fill="#fb923c" />
        <path d={`M ${baseX - 5.5} ${baseY - 8.5} l 0.4 -2.6 l 1.8 1.6 z`} fill="#ea580c" />
        <path d={`M ${baseX - 1.6} ${baseY - 9} l 1.4 -2.4 l 0.9 2.2 z`} fill="#ea580c" />
        {/* Snout poking forward, with a cream tip. */}
        <path d={`M ${baseX - 6} ${baseY - 6.4} l -2.6 1 l 2.4 1.2 z`} fill="#fed7aa" />
        <circle cx={baseX - 8.4} cy={baseY - 5.6} r={0.7} fill="#7c2d12" />
        {/* Eye. */}
        <circle cx={baseX - 3.6} cy={baseY - 7.4} r={0.5} fill="#7c2d12" />
      </g>
    )
  }
  if (companion === 'tortoise') {
    // A serene jade tortoise: a domed shell with a couple of hexagon ridge lines, head poking
    // out, stubby legs, and a tiny moss fleck on the shell.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Stubby legs along the ground. */}
        <ellipse cx={baseX - 4} cy={baseY + 1} rx={1.6} ry={1.1} fill="#047857" />
        <ellipse cx={baseX + 4} cy={baseY + 1} rx={1.6} ry={1.1} fill="#047857" />
        {/* Head poking out to the left, with a soft-brown neck. */}
        <ellipse cx={baseX - 7} cy={baseY - 3} rx={2.4} ry={1.9} fill="#34d399" />
        <circle cx={baseX - 8.4} cy={baseY - 3.4} r={0.5} fill="#064e3b" />
        {/* The domed shell. */}
        <path
          d={`M ${baseX - 6} ${baseY - 1}
              Q ${baseX} ${baseY - 10} ${baseX + 6} ${baseY - 1} Z`}
          fill="#10b981"
        />
        {/* Hexagon ridge lines on the shell. */}
        <path
          d={`M ${baseX - 2.4} ${baseY - 1} l 1.2 -3.2 l 2.4 0 l 1.2 3.2`}
          fill="none"
          stroke="#047857"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <path
          d={`M ${baseX} ${baseY - 7} l -1.6 2 M ${baseX} ${baseY - 7} l 1.6 2`}
          fill="none"
          stroke="#047857"
          strokeWidth={0.8}
        />
        {/* A tiny moss/leaf fleck on the shell. */}
        <circle cx={baseX + 2.4} cy={baseY - 5} r={1} fill="#86efac" />
      </g>
    )
  }
  if (companion === 'crane') {
    // An elegant standing paper crane (origami): a folded angular body + wing, a long curved
    // neck, a small head + beak with a little red crown, and one leg.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* One slender leg to the ground. */}
        <path
          d={`M ${baseX} ${baseY - 4} l 0.4 5`}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1}
          strokeLinecap="round"
        />
        {/* Folded angular body — a paper triangle. */}
        <path
          d={`M ${baseX - 6} ${baseY - 5} L ${baseX + 6} ${baseY - 7} L ${baseX + 1} ${baseY - 2} Z`}
          fill="#f8fafc"
          stroke="#bae6fd"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
        {/* A folded wing lifted over the back. */}
        <path
          d={`M ${baseX - 2} ${baseY - 6} L ${baseX + 4} ${baseY - 12} L ${baseX + 5} ${baseY - 6} Z`}
          fill="#e0f2fe"
          stroke="#bae6fd"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
        {/* A long curved neck sweeping up and forward to the head. */}
        <path
          d={`M ${baseX - 5} ${baseY - 5} Q ${baseX - 9} ${baseY - 12} ${baseX - 6} ${baseY - 14}`}
          fill="none"
          stroke="#f8fafc"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {/* Head + a small angular beak. */}
        <circle cx={baseX - 6} cy={baseY - 14.5} r={1.6} fill="#f8fafc" />
        <path
          d={`M ${baseX - 7.4} ${baseY - 14.6} l -2.4 0.5 l 2.2 1 z`}
          fill="#f59e0b"
        />
        {/* A little red crown atop the head, and an eye. */}
        <circle cx={baseX - 5.4} cy={baseY - 16} r={0.9} fill="#ef4444" />
        <circle cx={baseX - 6.2} cy={baseY - 14.8} r={0.4} fill="#0f172a" />
      </g>
    )
  }
  // --- Universal companions (tiers 1–3, no per_path) -------------------------------------
  if (companion === 'snail') {
    // A cute little snail inching along the ground: a soft body with a poking head, two stubby
    // eye-stalks, and a coiled spiral shell with a glossy highlight.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The soft body resting on the ground, tapering to a tail behind. */}
        <path
          d={`M ${baseX - 7} ${baseY + 1}
              Q ${baseX - 8} ${baseY - 3} ${baseX - 5} ${baseY - 3}
              L ${baseX + 5} ${baseY - 2}
              Q ${baseX + 8} ${baseY - 1} ${baseX + 7} ${baseY + 1} Z`}
          fill="#fcd5b5"
        />
        {/* Two stubby eye-stalks with dark tips, poking up at the front. */}
        <path
          d={`M ${baseX - 6} ${baseY - 3} l -0.6 -3 M ${baseX - 4.4} ${baseY - 3} l 0.4 -3.2`}
          fill="none"
          stroke="#f0a878"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
        <circle cx={baseX - 6.6} cy={baseY - 6.2} r={0.7} fill="#3f2a1d" />
        <circle cx={baseX - 4} cy={baseY - 6.4} r={0.7} fill="#3f2a1d" />
        {/* The coiled spiral shell sitting on the body. */}
        <circle cx={baseX + 1} cy={baseY - 4} r={4.4} fill="#f59e0b" />
        <circle cx={baseX + 1} cy={baseY - 4} r={4.4} fill="none" stroke="#b45309" strokeWidth={0.6} />
        <path
          d={`M ${baseX + 1} ${baseY - 4}
              m 0 -2.6
              a 2.6 2.6 0 1 1 -0.1 0
              M ${baseX + 1} ${baseY - 4}
              m 0 -1.1
              a 1.1 1.1 0 1 1 -0.1 0`}
          fill="none"
          stroke="#b45309"
          strokeWidth={0.6}
        />
        {/* A glossy highlight on the shell. */}
        <circle cx={baseX - 0.4} cy={baseY - 5.6} r={1} fill="#fde68a" opacity={0.8} />
      </g>
    )
  }
  if (companion === 'frog') {
    // A small sitting frog: a rounded green body, two domed eyes with bright pupils, a wide
    // smile, and front feet planted on the ground — cheerful and round.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Back haunches just visible behind the body. */}
        <ellipse cx={baseX - 5} cy={baseY - 1} rx={2.6} ry={2} fill="#16a34a" />
        <ellipse cx={baseX + 5} cy={baseY - 1} rx={2.6} ry={2} fill="#16a34a" />
        {/* The rounded body. */}
        <ellipse cx={baseX} cy={baseY - 2.5} rx={5.6} ry={4.4} fill="#22c55e" />
        {/* Paler belly. */}
        <ellipse cx={baseX} cy={baseY - 0.6} rx={3.4} ry={2.2} fill="#bbf7d0" opacity={0.9} />
        {/* Front feet planted on the ground. */}
        <ellipse cx={baseX - 3.2} cy={baseY + 1.4} rx={1.6} ry={0.9} fill="#16a34a" />
        <ellipse cx={baseX + 3.2} cy={baseY + 1.4} rx={1.6} ry={0.9} fill="#16a34a" />
        {/* Two domed eyes perched on top with bright pupils and glints. */}
        <circle cx={baseX - 3} cy={baseY - 7} r={2.2} fill="#22c55e" />
        <circle cx={baseX + 3} cy={baseY - 7} r={2.2} fill="#22c55e" />
        <circle cx={baseX - 3} cy={baseY - 7} r={1.2} fill="#f8fafc" />
        <circle cx={baseX + 3} cy={baseY - 7} r={1.2} fill="#f8fafc" />
        <circle cx={baseX - 2.7} cy={baseY - 6.8} r={0.7} fill="#0f172a" />
        <circle cx={baseX + 3.3} cy={baseY - 6.8} r={0.7} fill="#0f172a" />
        {/* A wide friendly smile. */}
        <path
          d={`M ${baseX - 3.4} ${baseY - 2.6} q 3.4 2.6 6.8 0`}
          fill="none"
          stroke="#15803d"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
      </g>
    )
  }
  if (companion === 'owl') {
    // A perched round owl: a plump body, a flat-topped head with two ear tufts, big round eyes,
    // a small triangular beak, a hint of wing feathers, and two little feet gripping the ground.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Two little feet gripping the perch. */}
        <path
          d={`M ${baseX - 2.4} ${baseY + 1} l -1.4 1.4 M ${baseX - 2.4} ${baseY + 1} l 0 1.6
              M ${baseX + 2.4} ${baseY + 1} l 1.4 1.4 M ${baseX + 2.4} ${baseY + 1} l 0 1.6`}
          fill="none"
          stroke="#b45309"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
        {/* The plump body. */}
        <ellipse cx={baseX} cy={baseY - 3} rx={6} ry={7} fill="#92633b" />
        {/* A paler feathered belly. */}
        <ellipse cx={baseX} cy={baseY - 1.5} rx={3.6} ry={4.4} fill="#d8b48a" />
        {/* Hints of folded wings on each side. */}
        <path
          d={`M ${baseX - 6} ${baseY - 5} q -1 5 1.4 7.5`}
          fill="none"
          stroke="#6b4423"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
        <path
          d={`M ${baseX + 6} ${baseY - 5} q 1 5 -1.4 7.5`}
          fill="none"
          stroke="#6b4423"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
        {/* Two ear tufts on the flat-topped head. */}
        <path d={`M ${baseX - 4.4} ${baseY - 9} l -0.6 -2.6 l 2 1.4 z`} fill="#6b4423" />
        <path d={`M ${baseX + 4.4} ${baseY - 9} l 0.6 -2.6 l -2 1.4 z`} fill="#6b4423" />
        {/* Big round eye discs with bright pupils and glints. */}
        <circle cx={baseX - 2.6} cy={baseY - 7.5} r={2.4} fill="#f8fafc" />
        <circle cx={baseX + 2.6} cy={baseY - 7.5} r={2.4} fill="#f8fafc" />
        <circle cx={baseX - 2.6} cy={baseY - 7.5} r={1.2} fill="#1f2937" />
        <circle cx={baseX + 2.6} cy={baseY - 7.5} r={1.2} fill="#1f2937" />
        <circle cx={baseX - 2.2} cy={baseY - 7.9} r={0.4} fill="#f8fafc" />
        <circle cx={baseX + 3} cy={baseY - 7.9} r={0.4} fill="#f8fafc" />
        {/* A small triangular beak between the eyes. */}
        <path d={`M ${baseX} ${baseY - 6} l -1 1.6 l 2 0 z`} fill="#f59e0b" />
      </g>
    )
  }
  // --- Quirky HOBBY companions (universal, no per_path) ----------------------------------
  // Little personality props that float beside the spirit instead of animals/nature — gym,
  // coffee, reading, gaming, music. Each is a small, recognizable object on a fun palette and
  // condition-responsive via `g`.
  if (companion === 'dumbbell') {
    // A small floating dumbbell (gym): two slate weight-bells on a steel bar, a knurled grip and
    // a soft highlight, with a tiny motion glint so it reads as hovering.
    const cy = baseY - 6
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The steel bar across the middle. */}
        <rect x={baseX - 4} y={cy - 1.1} width={8} height={2.2} rx={1} fill="#94a3b8" />
        {/* Knurled grip lines on the bar. */}
        <path
          d={`M ${baseX - 2} ${cy - 1} l 0 2 M ${baseX} ${cy - 1} l 0 2 M ${baseX + 2} ${cy - 1} l 0 2`}
          stroke="#64748b"
          strokeWidth={0.5}
        />
        {/* The two weight-bells at each end. */}
        <rect x={baseX - 7.5} y={cy - 4} width={3.5} height={8} rx={1.4} fill="#475569" />
        <rect x={baseX + 4} y={cy - 4} width={3.5} height={8} rx={1.4} fill="#475569" />
        {/* Inner collars, a shade lighter. */}
        <rect x={baseX - 5} y={cy - 3} width={1.6} height={6} rx={0.7} fill="#64748b" />
        <rect x={baseX + 3.4} y={cy - 3} width={1.6} height={6} rx={0.7} fill="#64748b" />
        {/* A soft highlight on the left bell and a tiny hover glint. */}
        <rect x={baseX - 6.8} y={cy - 3.2} width={1} height={3} rx={0.5} fill="#cbd5e1" opacity={0.8} />
        <circle cx={baseX + 7} cy={cy - 5.5} r={0.7} fill="#e2e8f0" opacity={0.7} />
      </g>
    )
  }
  if (companion === 'coffee_mug') {
    // A steaming coffee mug (cosy): a warm terracotta mug with a handle, a dark coffee surface,
    // and two curling wisps of steam rising above it.
    const cy = baseY - 2
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The mug body. */}
        <path
          d={`M ${baseX - 4.5} ${cy - 5}
              L ${baseX + 4.5} ${cy - 5}
              L ${baseX + 3.6} ${cy + 1}
              Q ${baseX} ${cy + 2.4} ${baseX - 3.6} ${cy + 1} Z`}
          fill="#ea580c"
        />
        {/* A paler rim band at the top. */}
        <ellipse cx={baseX} cy={cy - 5} rx={4.5} ry={1.2} fill="#fb923c" />
        {/* The dark coffee surface inside. */}
        <ellipse cx={baseX} cy={cy - 5} rx={3.4} ry={0.9} fill="#3f2a1d" />
        {/* The handle on the right. */}
        <path
          d={`M ${baseX + 4.2} ${cy - 4} q 4 0.5 0 5`}
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {/* A glossy highlight down the front. */}
        <path d={`M ${baseX - 2.6} ${cy - 4} l -0.4 4`} stroke="#fdba74" strokeWidth={0.8} opacity={0.7} />
        {/* Two curling wisps of steam rising above the cup. */}
        {[-1.6, 1.6].map((dx, k) => (
          <path
            key={`steam-${k}`}
            d={`M ${baseX + dx} ${cy - 6.5} q ${k ? 2 : -2} -2 0 -4 q ${k ? -2 : 2} -2 0 -4`}
            fill="none"
            stroke="#fed7aa"
            strokeWidth={0.8}
            strokeLinecap="round"
            opacity={0.7}
          />
        ))}
      </g>
    )
  }
  if (companion === 'open_book') {
    // An open book / floating tome (reading): two cream pages spread from an indigo spine, a few
    // text lines on each leaf, and a thin ribbon bookmark trailing below.
    const cy = baseY - 5
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The two open pages, fanning out from the centre spine. */}
        <path
          d={`M ${baseX} ${cy - 3}
              Q ${baseX - 5} ${cy - 4} ${baseX - 8} ${cy - 1}
              L ${baseX - 7} ${cy + 4}
              Q ${baseX - 4} ${cy + 2} ${baseX} ${cy + 3} Z`}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
        <path
          d={`M ${baseX} ${cy - 3}
              Q ${baseX + 5} ${cy - 4} ${baseX + 8} ${cy - 1}
              L ${baseX + 7} ${cy + 4}
              Q ${baseX + 4} ${cy + 2} ${baseX} ${cy + 3} Z`}
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
        {/* The indigo spine/cover ridge down the middle. */}
        <path d={`M ${baseX} ${cy - 3} l 0 6`} stroke="#4f46e5" strokeWidth={1.4} strokeLinecap="round" />
        {/* A few faint text lines on each page. */}
        {[0, 1.6, 3.2].map((dy, k) => (
          <g key={`line-${k}`}>
            <path d={`M ${baseX - 6.5} ${cy - 0.5 + dy} l 4.4 0`} stroke="#94a3b8" strokeWidth={0.4} />
            <path d={`M ${baseX + 2.1} ${cy - 0.5 + dy} l 4.4 0`} stroke="#94a3b8" strokeWidth={0.4} />
          </g>
        ))}
        {/* A thin red ribbon bookmark trailing below the spine. */}
        <path d={`M ${baseX} ${cy + 3} l 0 4 l -1 -1.4 l 1 0.4 l 1 -1.8 z`} fill="#ef4444" />
      </g>
    )
  }
  if (companion === 'game_controller') {
    // A little game controller (gaming): a rounded slate gamepad with a teal D-pad, two coloured
    // face buttons, twin thumbsticks and a glowing status dot.
    const cy = baseY - 5
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The gamepad body — a rounded bar with two grip lobes. */}
        <path
          d={`M ${baseX - 8} ${cy}
              Q ${baseX - 9} ${cy + 4} ${baseX - 5} ${cy + 4}
              Q ${baseX - 2} ${cy + 3.5} ${baseX} ${cy + 3}
              Q ${baseX + 2} ${cy + 3.5} ${baseX + 5} ${cy + 4}
              Q ${baseX + 9} ${cy + 4} ${baseX + 8} ${cy}
              Q ${baseX + 7} ${cy - 3} ${baseX + 3} ${cy - 2.5}
              L ${baseX - 3} ${cy - 2.5}
              Q ${baseX - 7} ${cy - 3} ${baseX - 8} ${cy} Z`}
          fill="#334155"
        />
        {/* The teal D-pad cross on the left. */}
        <path
          d={`M ${baseX - 5.4} ${cy - 0.6} h 1.4 v -1.4 h 1.4 v 1.4 h 1.4 v 1.4 h -1.4 v 1.4 h -1.4 v -1.4 h -1.4 z`}
          fill="#2dd4bf"
        />
        {/* Two coloured face buttons on the right. */}
        <circle cx={baseX + 4.4} cy={cy - 0.4} r={1.1} fill="#f43f5e" />
        <circle cx={baseX + 2.4} cy={cy + 1.4} r={1.1} fill="#fbbf24" />
        {/* Twin thumbsticks. */}
        <circle cx={baseX - 1.5} cy={cy + 2.2} r={1.2} fill="#0f172a" />
        <circle cx={baseX + 1.5} cy={cy + 2.2} r={1.2} fill="#0f172a" />
        {/* A glowing status dot in the centre. */}
        <circle cx={baseX} cy={cy - 1} r={0.7} fill="#a3e635" />
      </g>
    )
  }
  if (companion === 'boombox') {
    // A tiny boombox with music notes (music): a charcoal stereo with two speaker cones, a thin
    // handle, and a couple of pink-violet music notes drifting up out of it.
    const cy = baseY - 3
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A thin carry handle arcing over the top. */}
        <path
          d={`M ${baseX - 5} ${cy - 4} q 5 -3 10 0`}
          fill="none"
          stroke="#475569"
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        {/* The charcoal body. */}
        <rect x={baseX - 7} y={cy - 4} width={14} height={8} rx={1.4} fill="#1f2937" />
        {/* A lighter top control strip. */}
        <rect x={baseX - 6} y={cy - 3.2} width={12} height={1.6} rx={0.6} fill="#374151" />
        {/* Two speaker cones. */}
        <circle cx={baseX - 3.4} cy={cy + 1} r={2.4} fill="#4b5563" />
        <circle cx={baseX + 3.4} cy={cy + 1} r={2.4} fill="#4b5563" />
        <circle cx={baseX - 3.4} cy={cy + 1} r={1} fill="#9ca3af" />
        <circle cx={baseX + 3.4} cy={cy + 1} r={1} fill="#9ca3af" />
        {/* A couple of music notes drifting up out of the boombox. */}
        {[
          { x: baseX + 5, y: cy - 6, c: '#f472b6' },
          { x: baseX + 8, y: cy - 9, c: '#a78bfa' },
        ].map((n, k) => (
          <g key={`note-${k}`}>
            <ellipse cx={n.x} cy={n.y} rx={1.3} ry={1} fill={n.c} />
            <path d={`M ${n.x + 1.2} ${n.y} l 0 -3.4`} stroke={n.c} strokeWidth={0.8} strokeLinecap="round" />
            <path d={`M ${n.x + 1.2} ${n.y - 3.4} l 1.6 0.7`} stroke={n.c} strokeWidth={0.8} strokeLinecap="round" />
          </g>
        ))}
      </g>
    )
  }
  if (companion === 'dragon') {
    // LEGENDARY (tier 4) — a small mythical dragon curled on the ground: a coiled emerald body
    // with a back ridge of golden spines, little folded wings, a horned head with a bright eye,
    // and wisps of breath. Nourished, the spectacular endgame companion and the richest in the slot.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The coiled tail looping behind the body. */}
        <path
          d={`M ${baseX + 6} ${baseY + 1}
              Q ${baseX + 11} ${baseY - 2} ${baseX + 8} ${baseY - 6}
              Q ${baseX + 5} ${baseY - 9} ${baseX + 2} ${baseY - 6}`}
          fill="none"
          stroke="#15803d"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        {/* The curled body resting on the ground. */}
        <ellipse cx={baseX} cy={baseY - 2.5} rx={6.5} ry={4.6} fill="#16a34a" />
        {/* A paler underbelly. */}
        <ellipse cx={baseX - 0.5} cy={baseY - 0.6} rx={4} ry={2.4} fill="#86efac" opacity={0.9} />
        {/* A little folded wing lifted over the back. */}
        <path
          d={`M ${baseX + 1} ${baseY - 5} q 5 -3 6.5 0.5 q -3 1.6 -6.5 1.2 z`}
          fill="#22c55e"
        />
        <path
          d={`M ${baseX + 3.5} ${baseY - 5.2} l 0 4`}
          stroke="#15803d"
          strokeWidth={0.5}
          opacity={0.7}
        />
        {/* A ridge of golden back-spines running along the spine. */}
        {[-4, -1.5, 1, 3.5].map((dx, k) => (
          <path
            key={`spine-${k}`}
            d={`M ${baseX + dx} ${baseY - 6.4} l 1 -2.2 l 1 2.2 z`}
            fill={k % 2 ? '#fbbf24' : '#fde047'}
          />
        ))}
        {/* The horned head turned to face left, with a bright eye and a small horn. */}
        <circle cx={baseX - 6} cy={baseY - 6} r={3} fill="#16a34a" />
        <path d={`M ${baseX - 7.6} ${baseY - 8.2} l -0.4 -2 l 1.6 1.2 z`} fill="#fde047" />
        <path d={`M ${baseX - 8.8} ${baseY - 5.6} l -2.4 0.3 l 2.2 1.2 z`} fill="#15803d" />
        <circle cx={baseX - 6.6} cy={baseY - 6.4} r={0.7} fill="#fffbeb" />
        <circle cx={baseX - 6.7} cy={baseY - 6.4} r={0.35} fill="#0f172a" />
        {/* Two faint wisps of breath drifting from the snout. */}
        {[0, 1].map((k) => (
          <path
            key={`breath-${k}`}
            d={`M ${baseX - 10.5} ${baseY - 5.6 - k * 1.6} q -2.2 -0.6 -3.6 0.8`}
            fill="none"
            stroke="#bbf7d0"
            strokeWidth={0.7}
            strokeLinecap="round"
            opacity={0.6}
          />
        ))}
      </g>
    )
  }
  return null
}

function Mount({ mount, g }: { mount: string; g: number }) {
  // A serene thing the spirit floats on / rides (the "mount") — drawn centered and low so the
  // figure rests ON it. It sits UNDER the creature, in the static background band, so it never
  // floats away with the figure and never obscures it (ADR-0023).
  const cx = 40
  const cy = 66
  if (mount === 'cloud') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A soft cloud the spirit floats on — overlapping white/sky puffs with a flat base,
            a faint cast shadow below and a soft top highlight for depth. */}
        <ellipse cx={cx} cy={cy + 6} rx={15} ry={2.4} fill="#cbd5e1" opacity={0.4} />
        <ellipse cx={cx} cy={cy + 2} rx={18} ry={5} fill="#f1f5f9" />
        <circle cx={cx - 9} cy={cy} r={6} fill="#e0f2fe" />
        <circle cx={cx + 9} cy={cy} r={6} fill="#e0f2fe" />
        <circle cx={cx - 11} cy={cy + 1.5} r={3.5} fill="#bae6fd" opacity={0.7} />
        <circle cx={cx + 11} cy={cy + 1.5} r={3.5} fill="#bae6fd" opacity={0.7} />
        <circle cx={cx - 2} cy={cy - 3} r={7.5} fill="#ffffff" />
        <circle cx={cx + 5} cy={cy - 1} r={6.5} fill="#ffffff" />
        <circle cx={cx - 1} cy={cy - 5} r={2.6} fill="#ffffff" opacity={0.9} />
      </g>
    )
  }
  if (mount === 'lotus') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A lotus the spirit rests on — a green pad with calm pink petals fanned around it,
            shaded with a darker rim, petal-tip highlights and golden stamen dots. */}
        <ellipse cx={cx} cy={cy + 4} rx={16} ry={4} fill="#22c55e" opacity={0.55} />
        <ellipse cx={cx} cy={cy + 3} rx={16} ry={4.5} fill="#86efac" />
        <ellipse cx={cx} cy={cy + 2.4} rx={10} ry={2.4} fill="#bbf7d0" opacity={0.8} />
        {[-12, -6, 0, 6, 12].map((dx, k) => (
          <path
            key={k}
            d={`M ${cx + dx} ${cy + 1} q ${dx * 0.4} -8 0 -11 q ${-dx * 0.4} 3 0 11 z`}
            fill="#fbcfe8"
            stroke="#f9a8d4"
            strokeWidth={0.5}
          />
        ))}
        {[-12, -6, 0, 6, 12].map((dx, k) => (
          <path
            key={`hl-${k}`}
            d={`M ${cx + dx} ${cy - 1} q ${dx * 0.2} -4 0 -7`}
            stroke="#fdf2f8"
            strokeWidth={0.6}
            fill="none"
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
        <ellipse cx={cx} cy={cy} rx={4} ry={2.5} fill="#fce7f3" />
        {[-1.6, 1.6].map((dx, k) => (
          <circle key={`st-${k}`} cx={cx + dx} cy={cy - 0.4} r={0.9} fill="#fbbf24" />
        ))}
      </g>
    )
  }
  if (mount === 'leaf') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A drifting leaf-boat the spirit sits on — a green leaf with a central vein. */}
        <path
          d={`M ${cx - 18} ${cy} q 18 9 36 0 q -18 -9 -36 0 z`}
          fill="#4ade80"
          stroke="#16a34a"
          strokeWidth={1}
        />
        <path
          d={`M ${cx - 16} ${cy} L ${cx + 16} ${cy}`}
          stroke="#16a34a"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {[-9, -3, 3, 9].map((dx, k) => (
          <path
            key={k}
            d={`M ${cx + dx} ${cy} l ${dx > 0 ? 3 : -3} -2.5`}
            stroke="#16a34a"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        ))}
      </g>
    )
  }
  if (mount === 'mossy_stump') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A flat mossy tree stump the spirit settles on — a woody trunk slab with bark sides,
            ring grain on the cut top and a jade carpet of moss along the rim. */}
        <path
          d={`M ${cx - 16} ${cy + 1} q -1 7 3 8 q 13 3 26 0 q 4 -1 3 -8 z`}
          fill="#8b5e34"
          stroke="#5c3a1e"
          strokeWidth={1}
        />
        {[-8, 0, 8].map((dx, k) => (
          <path
            key={`bark-${k}`}
            d={`M ${cx + dx} ${cy + 2} l 0 6`}
            stroke="#5c3a1e"
            strokeWidth={0.7}
            strokeLinecap="round"
            opacity={0.7}
          />
        ))}
        <ellipse cx={cx} cy={cy} rx={17} ry={5} fill="#a97c50" stroke="#7a5230" strokeWidth={1} />
        <ellipse cx={cx} cy={cy} rx={11} ry={3.2} fill="none" stroke="#8b5e34" strokeWidth={0.7} />
        <ellipse cx={cx} cy={cy} rx={6} ry={1.8} fill="none" stroke="#8b5e34" strokeWidth={0.7} />
        <ellipse cx={cx} cy={cy} rx={2} ry={0.8} fill="#7a5230" />
        <path
          d={`M ${cx - 17} ${cy - 1} q 5 -3 12 -2 q 8 -2 14 0 q 6 1 8 2 q -4 3 -17 3 q -13 0 -17 -3 z`}
          fill="#10b981"
        />
        <ellipse cx={cx - 8} cy={cy - 1} rx={3} ry={1.5} fill="#34d399" opacity={0.9} />
        <ellipse cx={cx + 9} cy={cy} rx={2.4} ry={1.3} fill="#047857" opacity={0.9} />
      </g>
    )
  }
  if (mount === 'reed_raft') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A little woven reed raft the spirit rests on — straw-gold reeds lashed side by side
            with two darker binding cords and a faint ripple of water beneath. */}
        <path
          d={`M ${cx - 19} ${cy + 5} q 19 5 38 0`}
          stroke="#7dd3fc"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
          opacity={0.6 * g}
        />
        <path
          d={`M ${cx - 18} ${cy + 3} q 18 4 36 0 q 1 -4 0 -7 q -18 -4 -36 0 q -1 3 0 7 z`}
          fill="#d9b46a"
          stroke="#a07d3a"
          strokeWidth={1}
        />
        {[-15, -10.5, -6, -1.5, 3, 7.5, 12, 16.5].map((dx, k) => (
          <path
            key={`reed-${k}`}
            d={`M ${cx + dx} ${cy - 3.5} q 0.6 5 0 9`}
            stroke="#b8923f"
            strokeWidth={0.7}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        {[-7, 7].map((dx, k) => (
          <path
            key={`cord-${k}`}
            d={`M ${cx + dx} ${cy - 4} q 1 4 0 8`}
            stroke="#6b4f24"
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <path
          d={`M ${cx - 16} ${cy - 2.5} q 16 -3 32 0`}
          stroke="#f0d98a"
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    )
  }
  if (mount === 'crystal') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A floating faceted crystal the spirit perches on — a violet gem with a flat upper
            facet, bright cut faces, a soft glow halo and a few rising sparkles. */}
        <ellipse cx={cx} cy={cy + 1} rx={15} ry={7} fill="#c4b5fd" opacity={0.35 * g} />
        <path
          d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy - 6} L ${cx + 13} ${cy - 2}
              L ${cx + 8} ${cy + 5} L ${cx} ${cy + 8} L ${cx - 8} ${cy + 5} z`}
          fill="#8b5cf6"
          stroke="#6d28d9"
          strokeWidth={1}
        />
        <path
          d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy - 6} L ${cx + 13} ${cy - 2}
              L ${cx} ${cy + 1} z`}
          fill="#c4b5fd"
        />
        <path d={`M ${cx} ${cy - 6} L ${cx} ${cy + 8}`} stroke="#ddd6fe" strokeWidth={0.7} />
        <path d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy + 1}`} stroke="#a78bfa" strokeWidth={0.7} />
        <path d={`M ${cx + 13} ${cy - 2} L ${cx} ${cy + 1}`} stroke="#a78bfa" strokeWidth={0.7} />
        <path d={`M ${cx - 8} ${cy + 5} L ${cx} ${cy + 1}`} stroke="#7c3aed" strokeWidth={0.6} />
        <path d={`M ${cx + 8} ${cy + 5} L ${cx} ${cy + 1}`} stroke="#7c3aed" strokeWidth={0.6} />
        <path d={`M ${cx - 4} ${cy - 4} l 4 -1`} stroke="#f5f3ff" strokeWidth={1} strokeLinecap="round" />
        {[-9, 0, 9].map((dx, k) => (
          <path
            key={`spark-${k}`}
            d={`M ${cx + dx} ${cy - 9 - (k % 2) * 2} l 0 -2 M ${cx + dx - 1} ${cy - 10 - (k % 2) * 2} l 2 0`}
            stroke="#ddd6fe"
            strokeWidth={0.7}
            strokeLinecap="round"
            opacity={0.85 * g}
          />
        ))}
      </g>
    )
  }
  if (mount === 'emberstone') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Pitta (breath): a glowing ember sun-stone — a warm disc with a molten core and a
            few rising sparks, its heat fading as the spirit dims. */}
        <ellipse cx={cx} cy={cy + 3} rx={17} ry={4.5} fill="#7c2d12" opacity={0.6} />
        <ellipse cx={cx} cy={cy} rx={16} ry={6} fill="#ea580c" />
        <ellipse cx={cx} cy={cy - 0.5} rx={11} ry={4} fill="#f97316" />
        <ellipse cx={cx} cy={cy - 1} rx={6} ry={2.4} fill="#fbbf24" />
        {[-7, 0, 7].map((dx, k) => (
          <circle
            key={k}
            cx={cx + dx}
            cy={cy - 8 - (k % 2) * 2}
            r={1.2}
            fill="#fbbf24"
            opacity={0.85 * g}
          />
        ))}
      </g>
    )
  }
  if (mount === 'boulder') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Kapha (stillness): a flat mossy boulder — a grey-brown stone slab capped with jade
            moss the spirit settles upon. */}
        <path
          d={`M ${cx - 17} ${cy + 4} q -1 -8 6 -9 q 5 -3 11 0 q 8 1 6 9 z`}
          fill="#78716c"
          stroke="#57534e"
          strokeWidth={1}
        />
        <path
          d={`M ${cx - 16} ${cy - 3} q 6 -4 16 0 q 10 -1 15 1 q -3 3 -15 3 q -11 1 -16 -4 z`}
          fill="#10b981"
        />
        <ellipse cx={cx - 6} cy={cy - 3} rx={3} ry={1.6} fill="#34d399" opacity={0.9} />
        <ellipse cx={cx + 7} cy={cy - 2} rx={2.6} ry={1.4} fill="#047857" opacity={0.9} />
      </g>
    )
  }
  if (mount === 'feather') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Vata (heart): a floating feather adrift on a breeze — a soft white quill with a pale
            shaft and a wisp of air curling beneath it. */}
        <path
          d={`M ${cx - 17} ${cy + 1} q 10 -10 34 -4 q -10 9 -34 4 z`}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={0.8}
        />
        <path
          d={`M ${cx - 15} ${cy} q 14 -5 31 -2`}
          stroke="#bae6fd"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
        {[-9, -3, 4, 11].map((dx, k) => (
          <path
            key={k}
            d={`M ${cx + dx} ${cy} q 4 -4 6 -7`}
            stroke="#e0f2fe"
            strokeWidth={0.7}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <path
          d={`M ${cx - 14} ${cy + 6} q 9 4 26 1`}
          stroke="#e0f2fe"
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
          opacity={0.7 * g}
        />
      </g>
    )
  }
  if (mount === 'comet') {
    // LEGENDARY (tier 4) — a radiant comet the spirit rides: a blazing star-core haloed in gold,
    // a long streaming tail trailing back and down, and a scatter of sparks in its wake. Joyful,
    // the spectacular endgame mount and the richest in the slot.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The long luminous tail streaming back-and-down behind the core, fading outward. */}
        <path
          d={`M ${cx} ${cy} Q ${cx - 16} ${cy + 6} ${cx - 26} ${cy + 12}`}
          fill="none"
          stroke="#fde68a"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.3 * g}
        />
        <path
          d={`M ${cx} ${cy} Q ${cx - 15} ${cy + 5} ${cx - 24} ${cy + 10}`}
          fill="none"
          stroke="#fef08a"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6 * g}
        />
        <path
          d={`M ${cx} ${cy} Q ${cx - 14} ${cy + 4} ${cx - 22} ${cy + 8}`}
          fill="none"
          stroke="#fffbeb"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.85 * g}
        />
        {/* The blazing comet head — a soft outer glow, a warm halo, a bright core. */}
        <circle cx={cx} cy={cy} r={9} fill="#fde68a" opacity={0.3 * g} />
        <circle cx={cx} cy={cy} r={5.5} fill="#fbbf24" opacity={0.7 * g} />
        <circle cx={cx} cy={cy} r={3} fill="#fffbeb" />
        {/* A four-point starburst over the core. */}
        <path
          d={`M ${cx} ${cy - 7} L ${cx} ${cy + 7} M ${cx - 7} ${cy} L ${cx + 7} ${cy}`}
          stroke="#fef9c3"
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.9 * g}
        />
        {/* A few sparks scattered along the tail's wake. */}
        {[
          { x: cx - 12, y: cy + 5 },
          { x: cx - 18, y: cy + 9 },
          { x: cx - 23, y: cy + 13 },
        ].map((s, k) => (
          <circle key={`comet-spark-${k}`} cx={s.x} cy={s.y} r={k % 2 ? 1.1 : 0.7} fill="#fde047" opacity={0.8 * g} />
        ))}
      </g>
    )
  }
  return null
}

function Weather({ weather, g }: { weather: string; g: number }) {
  // An ambient overlay drifting OVER the whole 80×80 scene — the FRONT-MOST layer (drawn after
  // the creature + accessory). Kept light and low-opacity so the figure always reads through it:
  // a scatter of small particles across the field, never a solid sheet. Procedural like the rest
  // of the art (anchored coords, condition factor `g`, aria-hidden, no asset imports).
  if (weather === 'petals') {
    // Soft pink cherry petals drifting down across the scene.
    return (
      <g opacity={0.85 * g} aria-hidden="true">
        {Array.from({ length: 9 }, (_, k) => {
          const x = 8 + ((k * 23) % 64)
          const y = 8 + ((k * 31) % 60)
          return (
            <ellipse
              key={k}
              cx={x}
              cy={y}
              rx={1.8}
              ry={1}
              fill="#fbcfe8"
              opacity={0.7}
              transform={`rotate(${(k * 40) % 360} ${x} ${y})`}
            />
          )
        })}
      </g>
    )
  }
  if (weather === 'mist') {
    // A few pale horizontal wisps of mist banding softly across the scene.
    return (
      <g opacity={0.7 * g} aria-hidden="true">
        {[18, 34, 50, 64].map((y, k) => (
          <ellipse
            key={k}
            cx={k % 2 ? 50 : 32}
            cy={y}
            rx={26}
            ry={2.6}
            fill="#e2e8f0"
            opacity={0.32}
          />
        ))}
      </g>
    )
  }
  if (weather === 'rain') {
    // Thin slanted rain streaks falling across the scene.
    return (
      <g opacity={0.8 * g} aria-hidden="true">
        {Array.from({ length: 11 }, (_, k) => {
          const x = 6 + ((k * 19) % 68)
          const y = 6 + ((k * 27) % 56)
          return (
            <line
              key={k}
              x1={x}
              y1={y}
              x2={x - 2}
              y2={y + 5}
              stroke="#93c5fd"
              strokeWidth={0.8}
              strokeLinecap="round"
              opacity={0.6}
            />
          )
        })}
      </g>
    )
  }
  if (weather === 'leaffall') {
    // Amber autumn leaves drifting down — small tapered leaf shapes scattered across the field.
    return (
      <g opacity={0.85 * g} aria-hidden="true">
        {Array.from({ length: 8 }, (_, k) => {
          const x = 9 + ((k * 25) % 62)
          const y = 7 + ((k * 33) % 58)
          const fill = k % 2 ? '#f59e0b' : '#fb923c'
          return (
            <path
              key={k}
              d={`M ${x} ${y} q 2 -1.6 3.4 0 q -1.4 1.6 -3.4 0 z`}
              fill={fill}
              opacity={0.7}
              transform={`rotate(${(k * 55) % 360} ${x} ${y})`}
            />
          )
        })}
      </g>
    )
  }
  if (weather === 'snow') {
    // Soft white snowflakes drifting down — gentle dots of varied size across the scene.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 12 }, (_, k) => {
          const x = 6 + ((k * 17) % 68)
          const y = 6 + ((k * 29) % 60)
          const r = 0.8 + (k % 3) * 0.4
          return <circle key={k} cx={x} cy={y} r={r} fill="#f8fafc" opacity={0.85} />
        })}
      </g>
    )
  }
  if (weather === 'fireflies') {
    // Warm fireflies drifting over the scene — each a soft halo around a bright core.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => {
          const x = 10 + ((k * 21) % 60)
          const y = 10 + ((k * 26) % 52)
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={3} fill="#fde68a" opacity={0.18} />
              <circle cx={x} cy={y} r={1.2} fill="#fef08a" opacity={0.9} />
              <circle cx={x - 0.3} cy={y - 0.3} r={0.5} fill="#fffbeb" opacity={0.95} />
            </g>
          )
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Pitta / breath) — drifting embers/sparks rising over the scene on a FIRE
  // palette: each a warm orange halo around a bright ember core, the hottest tinier sparks above.
  if (weather === 'ember_drift') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 8 }, (_, k) => {
          const x = 8 + ((k * 23) % 64)
          const y = 10 + ((k * 29) % 56)
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={2.6} fill="#fb923c" opacity={0.18} />
              <circle cx={x} cy={y} r={1.1} fill="#f97316" opacity={0.9} />
              <circle cx={x - 0.3} cy={y - 0.4} r={0.4} fill="#fed7aa" opacity={0.95} />
            </g>
          )
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Kapha / stillness) — a slow golden pollen/spore fall on an EARTH/GROVE palette:
  // tiny amber-gold motes drifting down, soft and grounded rather than fiery.
  if (weather === 'pollenfall') {
    return (
      <g opacity={0.85 * g} aria-hidden="true">
        {Array.from({ length: 11 }, (_, k) => {
          const x = 6 + ((k * 19) % 68)
          const y = 7 + ((k * 31) % 60)
          const r = 0.7 + (k % 3) * 0.35
          return <circle key={k} cx={x} cy={y} r={r} fill="#d9c45a" opacity={0.8} />
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Vata / heart) — swirling wind gusts/motes on an AIR/SKY palette: pale curved
  // gust arcs sweeping across the scene with a few soft white motes carried along them.
  if (weather === 'galeswirl') {
    return (
      <g opacity={0.8 * g} aria-hidden="true">
        {Array.from({ length: 5 }, (_, k) => {
          const x = 8 + ((k * 17) % 52)
          const y = 12 + ((k * 21) % 52)
          return (
            <g key={k}>
              <path
                d={`M ${x} ${y} q 9 -5 18 0 q -6 4 -13 1`}
                stroke="#dbeafe"
                strokeWidth={0.9}
                fill="none"
                strokeLinecap="round"
                opacity={0.65}
              />
              <circle cx={x + 18} cy={y + 1} r={0.9} fill="#f0f9ff" opacity={0.85} />
            </g>
          )
        })}
      </g>
    )
  }
  if (weather === 'aurora_storm') {
    // LEGENDARY (tier 4) — an auroral storm overlay: broad rippling curtains of teal/violet/rose
    // light sweeping across the upper scene, with a scatter of bright stars and drifting light
    // motes. Joyful, the spectacular endgame weather and the richest in the slot.
    return (
      <g opacity={0.85 * g} aria-hidden="true">
        {/* Three layered aurora curtains rippling across the upper field, each a wide wavy band. */}
        {['#5eead4', '#a78bfa', '#fda4af'].map((hue, k) => {
          const yBase = 14 + k * 9
          return (
            <path
              key={`curtain-${k}`}
              d={`M 2 ${yBase} Q 20 ${yBase - 8} 40 ${yBase} T 78 ${yBase}
                  L 78 ${yBase + 10} Q 58 ${yBase + 4} 40 ${yBase + 11}
                  T 2 ${yBase + 10} Z`}
              fill={hue}
              opacity={0.18}
            />
          )
        })}
        {/* Thin bright ripple lines threading through the curtains. */}
        {[16, 26, 36].map((y, k) => (
          <path
            key={`ripple-${k}`}
            d={`M 4 ${y} Q 24 ${y - 5} 44 ${y} T 76 ${y}`}
            fill="none"
            stroke={k % 2 ? '#ccfbf1' : '#ede9fe'}
            strokeWidth={0.8}
            strokeLinecap="round"
            opacity={0.5}
          />
        ))}
        {/* A scatter of bright stars and drifting motes over the storm — deterministic positions. */}
        {Array.from({ length: 12 }, (_, k) => {
          const x = 6 + ((k * 23) % 66)
          const y = 6 + ((k * 19) % 44)
          return (
            <circle
              key={`storm-star-${k}`}
              cx={x}
              cy={y}
              r={k % 3 === 0 ? 1.1 : 0.6}
              fill={k % 2 ? '#f0fdfa' : '#f5f3ff'}
              opacity={0.85}
            />
          )
        })}
      </g>
    )
  }
  return null
}

function Ground({ ground, g }: { ground: string; g: number }) {
  // A low FOREGROUND base strip along the very bottom edge (the "floor"). Drawn in front of the
  // habitat/mount so it reads as the ground the figure rests on. Anchored to the bottom band
  // (y≈72), kept short so it never climbs into the figure. Procedural, aria-hidden, no assets.
  const top = 72
  if (ground === 'grass') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A soft soil band, then a row of simple grass blades along the very bottom. */}
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#4ade80" opacity={0.5} />
        {Array.from({ length: 18 }, (_, k) => (
          <rect
            key={k}
            x={4 + k * 4.2}
            y={top - 4}
            width={1.2}
            height={5 + (k % 3)}
            rx={0.6}
            fill="#22c55e"
            opacity={0.7}
          />
        ))}
      </g>
    )
  }
  if (ground === 'pebbles') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A bed of rounded pebbles in muted greys along the bottom. */}
        <rect x={2} y={top + 1} width={76} height={5} rx={2} fill="#94a3b8" opacity={0.4} />
        {Array.from({ length: 12 }, (_, k) => (
          <ellipse
            key={k}
            cx={6 + k * 6.4}
            cy={top + 2 + (k % 2)}
            rx={2.4}
            ry={1.6}
            fill={k % 2 ? '#cbd5e1' : '#94a3b8'}
            opacity={0.8}
          />
        ))}
      </g>
    )
  }
  if (ground === 'clover') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A lush clover patch — a green band dotted with little trefoil leaves. */}
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#34d399" opacity={0.45} />
        {Array.from({ length: 8 }, (_, k) => {
          const x = 8 + k * 9
          const y = top
          return (
            <g key={k}>
              <circle cx={x - 1.4} cy={y} r={1.3} fill="#10b981" opacity={0.85} />
              <circle cx={x + 1.4} cy={y} r={1.3} fill="#10b981" opacity={0.85} />
              <circle cx={x} cy={y - 1.6} r={1.3} fill="#10b981" opacity={0.85} />
            </g>
          )
        })}
      </g>
    )
  }
  if (ground === 'mushrooms') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A mossy base with a few red-capped toadstools dotted along it. */}
        <rect x={2} y={top + 1} width={76} height={5} rx={2} fill="#65a30d" opacity={0.4} />
        {[12, 30, 50, 68].map((x, k) => (
          <g key={k}>
            <rect x={x - 1} y={top - 2} width={2} height={4} rx={1} fill="#fef3c7" opacity={0.9} />
            <path
              d={`M ${x - 3.4} ${top - 2} q 3.4 -3.4 6.8 0 z`}
              fill={k % 2 ? '#ef4444' : '#dc2626'}
              opacity={0.85}
            />
            <circle cx={x - 1} cy={top - 3} r={0.4} fill="#fff7ed" opacity={0.9} />
            <circle cx={x + 1.2} cy={top - 2.4} r={0.4} fill="#fff7ed" opacity={0.9} />
          </g>
        ))}
      </g>
    )
  }
  if (ground === 'wildflowers') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A flowering meadow strip — a green band with little stemmed blossoms. */}
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#4ade80" opacity={0.45} />
        {[8, 20, 32, 44, 56, 68].map((x, k) => {
          const petal = ['#f472b6', '#fcd34d', '#a78bfa'][k % 3]
          return (
            <g key={k}>
              <rect x={x - 0.4} y={top - 5} width={0.8} height={6} rx={0.4} fill="#16a34a" opacity={0.7} />
              {[-1.6, 1.6, 0].map((dx, j) => (
                <circle key={j} cx={x + dx} cy={top - 5 - (j === 2 ? 1.4 : 0)} r={1.1} fill={petal} opacity={0.85} />
              ))}
              <circle cx={x} cy={top - 5} r={0.6} fill="#fb923c" opacity={0.9} />
            </g>
          )
        })}
      </g>
    )
  }
  if (ground === 'crystals') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A cluster of upright crystals rising from a cool base band. */}
        <rect x={2} y={top + 1} width={76} height={5} rx={2} fill="#67e8f9" opacity={0.35} />
        {[10, 24, 40, 56, 70].map((x, k) => {
          const h = 5 + (k % 3) * 2
          const fill = k % 2 ? '#a5f3fc' : '#7dd3fc'
          return (
            <g key={k}>
              <path
                d={`M ${x} ${top - h} L ${x + 2.2} ${top + 1} L ${x - 2.2} ${top + 1} Z`}
                fill={fill}
                opacity={0.85}
              />
              <line x1={x} y1={top - h} x2={x} y2={top + 1} stroke="#e0f2fe" strokeWidth={0.4} opacity={0.7} />
            </g>
          )
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Pitta / breath) — a bed of glowing coals underfoot on a FIRE palette: a dark
  // ember base band lit by a scatter of bright orange-red coals with the hottest cores on top.
  if (ground === 'emberbed') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top + 1} width={76} height={5} rx={2} fill="#7c2d12" opacity={0.55} />
        {Array.from({ length: 12 }, (_, k) => {
          const x = 6 + k * 6.2
          const y = top + 2 + (k % 2)
          return (
            <g key={k}>
              <ellipse cx={x} cy={y} rx={2.4} ry={1.5} fill={k % 2 ? '#ea580c' : '#dc2626'} opacity={0.85} />
              <circle cx={x} cy={y - 0.3} r={0.7} fill="#fb923c" opacity={0.9} />
            </g>
          )
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Kapha / stillness) — a raked zen stone garden on an EARTH/GROVE palette: a pale
  // sand band with curved rake lines and a few grounded jade/grey stones resting on it.
  if (ground === 'stonegarden') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#d6d3c4" opacity={0.55} />
        {[top + 1.5, top + 3.5].map((y, k) => (
          <path
            key={`r${k}`}
            d={`M 4 ${y} q 18 -2 36 0 q 18 2 36 0`}
            stroke="#a8a29e"
            strokeWidth={0.5}
            fill="none"
            opacity={0.55}
          />
        ))}
        {[16, 40, 62].map((x, k) => (
          <ellipse
            key={`s${k}`}
            cx={x}
            cy={top + 1}
            rx={3 + (k % 2)}
            ry={2}
            fill={k % 2 ? '#6b7280' : '#3f6212'}
            opacity={0.8}
          />
        ))}
      </g>
    )
  }
  // PATH-EXCLUSIVE (Vata / heart) — a soft cloud floor on an AIR/SKY palette: overlapping white
  // cloud puffs forming a billowy strip the figure rests on, with a faint blue base shadow.
  if (ground === 'cloudfloor') {
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top + 2} width={76} height={4} rx={2} fill="#bae6fd" opacity={0.4} />
        {[10, 22, 34, 46, 58, 70].map((x, k) => (
          <circle key={k} cx={x} cy={top + 1} r={4 + (k % 2)} fill="#f8fafc" opacity={0.9} />
        ))}
        <rect x={2} y={top + 3} width={76} height={3} rx={1.5} fill="#ffffff" opacity={0.85} />
      </g>
    )
  }
  if (ground === 'mandala') {
    // LEGENDARY (tier 4) — a glowing sacred mandala floor: concentric golden rings radiating from
    // a centred lotus motif, a ring of petal spokes, and a faint outer glow, drawn FLATTENED (a
    // wide, low ellipse) so it reads as a floor seen in perspective. Rested, the richest ground.
    const mcx = 40
    // Anchored to the foreground band; flattened vertically so it lies on the floor.
    const my = top + 1
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* A soft outer glow pooled under the figure. */}
        <ellipse cx={mcx} cy={my} rx={34} ry={6} fill="#fde68a" opacity={0.22} />
        {/* Concentric golden rings, flattened into the floor plane. */}
        {[30, 22, 14, 7].map((rx, k) => (
          <ellipse
            key={`ring-${k}`}
            cx={mcx}
            cy={my}
            rx={rx}
            ry={rx * 0.2}
            fill="none"
            stroke={k % 2 ? '#fcd34d' : '#fbbf24'}
            strokeWidth={0.8}
            opacity={0.7}
          />
        ))}
        {/* A ring of petal spokes radiating outward, set on the mid ring. */}
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2
          const x1 = mcx + Math.cos(a) * 9
          const y1 = my + Math.sin(a) * 9 * 0.2
          const x2 = mcx + Math.cos(a) * 18
          const y2 = my + Math.sin(a) * 18 * 0.2
          return (
            <line
              key={`spoke-${k}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={k % 2 ? '#fde047' : '#f59e0b'}
              strokeWidth={k % 2 ? 0.6 : 1}
              strokeLinecap="round"
              opacity={0.7}
            />
          )
        })}
        {/* A small centred lotus motif at the heart of the mandala. */}
        {[-3, 0, 3].map((dx, k) => (
          <ellipse
            key={`petal-${k}`}
            cx={mcx + dx}
            cy={my - (k === 1 ? 0.6 : 0)}
            rx={1.4}
            ry={2.4}
            fill="#fef08a"
            opacity={0.85}
            transform={`rotate(${k === 0 ? -22 : k === 2 ? 22 : 0} ${mcx + dx} ${my})`}
          />
        ))}
        <circle cx={mcx} cy={my} r={1.4} fill="#fffbeb" />
      </g>
    )
  }
  return null
}

/**
 * `stillness` — a serene seated mini-Buddha. Spark: a tiny glowing seated mote. It gains a
 * head, body, folded legs, then a halo and a lotus base as it matures, ending a radiant
 * figure haloed in gold. Warm amber/gold palette.
 */
function StillnessForm({
  stage,
  g,
  pal: palProp,
  form,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
}) {
  // The recolour cosmetic (`palette`) replaces the dosha's body colours; absent → the default.
  const pal = palProp ?? PATH_PALETTE.stillness
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  // Grows up the ladder; everything is centred on x=40.
  const scale = 0.7 + p * 0.55
  const cy = 44
  const bodyW = 16 * scale
  const bodyH = 18 * scale
  // The `form` (shape) cosmetic swaps the CENTRAL BODY for a genuinely different still-life form
  // (the seated figure, a huddle of orbs, a balanced stone cairn, or an orbiting atom). The lotus
  // base, halo, glow and folded-legs framing stay the same for every form. Absent / unknown →
  // `seated`, the identity look, so a bare Kapha is pixel-identical to before. Only `stillness`
  // keys matter; other doshas ignore them and fall through to the seated default.
  const bodyForm =
    form === 'cluster' ||
    form === 'cairn' ||
    form === 'orbital' ||
    form === 'lotus' ||
    form === 'enso' ||
    form === 'prism'
      ? form
      : 'seated'
  return (
    <g>
      {/* Lotus base, from fledgling onward — a few warm petals under the seated figure. */}
      {i >= 3 &&
        Array.from({ length: 5 }, (_, k) => {
          const a = (k / 4) * Math.PI - Math.PI
          const px = 40 + Math.cos(a) * (bodyW * 0.9)
          const py = cy + bodyH * 0.55 - Math.sin(a) * 2
          return (
            <ellipse
              key={k}
              cx={px}
              cy={py}
              rx={3.4 * scale}
              ry={1.8 * scale}
              fill={pal.deep}
              opacity={0.55 * g}
            />
          )
        })}
      {/* Halo behind the head, from ascendant onward — the serene defining feature. */}
      {i >= 4 && (
        <circle
          cx={40}
          cy={cy - bodyH * 0.5}
          r={7 * scale}
          fill="none"
          stroke={pal.accent}
          strokeWidth={1.6}
          opacity={(i >= 5 ? 0.95 : 0.7) * g}
        />
      )}
      {/* Folded legs — a soft rounded base the body sits on (wisp onward gains structure). */}
      <path
        d={`M ${40 - bodyW} ${cy + bodyH * 0.45}
            Q 40 ${cy + bodyH * 0.75} ${40 + bodyW} ${cy + bodyH * 0.45}
            Q 40 ${cy + bodyH * 0.95} ${40 - bodyW} ${cy + bodyH * 0.45} Z`}
        fill={pal.accent}
        opacity={(0.6 + 0.3 * p) * g}
      />
      {/* ── The central body — the seated default, or a `form` variant in its place. ── */}
      {bodyForm === 'seated' && (
        <>
          {/* The seated body — a calm rounded torso. */}
          <ellipse
            cx={40}
            cy={cy}
            rx={bodyW * 0.62}
            ry={bodyH * 0.55}
            fill={pal.glow}
            opacity={(0.7 + 0.25 * p) * g}
          />
          {/* The head — appears as a distinct, brighter mote from wisp; a lone mote at spark. */}
          <circle
            cx={40}
            cy={cy - bodyH * 0.5}
            r={i >= 2 ? 5 * scale : 6 * scale}
            fill={pal.core}
            opacity={(0.85 + 0.15 * p) * g}
          />
          {/* Inner-light highlight for the seated mote. */}
          <circle cx={38.5} cy={cy - bodyH * 0.5 - 1} r={1.6 * scale} fill="#ffffff" opacity={0.8 * g} />
          {/* Radiant gains a small ushnisha crown-point — the final flourish. */}
          {i >= 5 && <circle cx={40} cy={cy - bodyH * 0.5 - 5 * scale} r={1.8} fill={pal.accent} opacity={0.9 * g} />}
        </>
      )}

      {/* `cluster` — a calm huddle of overlapping orbs/stones, more + larger up the stages. The
          larger orbs read as `glow`, two highlights as `core`, one or two as `accent`; a white core
          highlight crowns the brightest. Laid out in a rounded blob over the lotus base. */}
      {bodyForm === 'cluster' &&
        (() => {
          const count = 4 + i // 5 → 9 orbs across spark → radiant
          // A deterministic rounded-blob scatter around (40, cy): each orb on a jittered ring.
          const orbs = Array.from({ length: count }, (_, k) => {
            const a = (k / count) * Math.PI * 2 + 0.6
            // Alternate inner/outer ring so the blob fills rather than forming a hollow ring.
            const ring = (k % 3 === 0 ? 0.35 : k % 2 === 0 ? 0.7 : 1) * bodyW * 0.62
            const r = (3 + ((k * 1.7) % 4)) * scale // radii spread 3–7 * scale
            return {
              k,
              cx: 40 + Math.cos(a) * ring,
              // Flatten vertically so the huddle sits low and wide on the base.
              cy: cy + Math.sin(a) * ring * 0.62,
              r,
            }
          })
          // Brightest orb = the largest; gets the white core highlight.
          const bright = orbs.reduce((m, o) => (o.r > m.r ? o : m), orbs[0])
          return (
            <>
              {orbs.map((o) => {
                const fill =
                  o.k % 4 === 1 ? pal.core : o.k % 4 === 3 ? pal.accent : pal.glow
                return (
                  <circle
                    key={o.k}
                    cx={o.cx}
                    cy={o.cy}
                    r={o.r}
                    fill={fill}
                    opacity={(0.72 + 0.2 * p) * g}
                  />
                )
              })}
              <circle
                cx={bright.cx - bright.r * 0.3}
                cy={bright.cy - bright.r * 0.3}
                r={1.5 * scale}
                fill="#ffffff"
                opacity={0.85 * g}
              />
            </>
          )
        })()}

      {/* `cairn` — a balanced vertical stack of flattened ellipse "stones", largest at the bottom
          rising smaller, earthy fills bottom→top (deep, accent, glow), capped by a small core stone.
          More stones up the stages. Stacked from the lotus base upward, centred on x=40. */}
      {bodyForm === 'cairn' &&
        (() => {
          const count = Math.min(5, 3 + Math.floor(i / 2)) // 3 → 5 stones
          const fills = [pal.deep, pal.accent, pal.glow, pal.core, pal.glow]
          const baseY = cy + bodyH * 0.5 // bottom of the stack rests on the base
          let y = baseY
          const stones = Array.from({ length: count }, (_, k) => {
            // Largest at the bottom, tapering up.
            const t = k / (count - 1)
            const rx = (10 - 5.5 * t) * scale
            const ry = (3.4 - 1.1 * t) * scale
            const sy = y - ry
            y = sy - ry * 0.9 // next stone sits just above, with a slight overlap
            return { k, rx, ry, cy: sy, fill: fills[Math.min(k, fills.length - 1)] }
          })
          return (
            <>
              {stones.map((s) => (
                <ellipse
                  key={s.k}
                  cx={40}
                  cy={s.cy}
                  rx={s.rx}
                  ry={s.ry}
                  fill={s.fill}
                  opacity={(0.78 + 0.18 * p) * g}
                />
              ))}
            </>
          )
        })()}

      {/* `orbital` — an atom / star: a bright core with a white highlight, ringed by ellipse
          OUTLINES rotated 0/60/120° (and a 4th at the top stages), each carrying a small "electron"
          dot. Reads as an atom/flower/star; longer orbits up the stages. Centred on (40, cy). */}
      {bodyForm === 'orbital' &&
        (() => {
          const long = i >= 4 // ascendant+ stretches the orbits and adds a 4th
          const orx = (long ? 15.5 : 14) * scale
          const ory = 5 * scale
          const angles = long ? [0, 45, 90, 135] : [0, 60, 120]
          return (
            <>
              {angles.map((deg, k) => (
                <g key={k} transform={`rotate(${deg} 40 ${cy})`}>
                  <ellipse
                    cx={40}
                    cy={cy}
                    rx={orx}
                    ry={ory}
                    fill="none"
                    stroke={pal.accent}
                    strokeWidth={1}
                    opacity={0.7 * g}
                  />
                  {/* An electron dot riding the orbit (on the +x side of the ellipse). */}
                  <circle cx={40 + orx} cy={cy} r={1} fill={pal.glow} opacity={0.9 * g} />
                </g>
              ))}
              {/* The bright nucleus. */}
              <circle cx={40} cy={cy} r={4 * scale} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
              <circle cx={38.7} cy={cy - 1.2} r={1.3 * scale} fill="#ffffff" opacity={0.85 * g} />
            </>
          )
        })()}

      {/* `lotus` — a flower: `5 + i` petals (filled ellipses) radiating from the centre at evenly-
          spaced angles, each pointing OUTWARD, fills alternating glow/accent, crowned by a bright
          core centre with a tiny white highlight. More petals up the stages. Centred on (40, cy). */}
      {bodyForm === 'lotus' &&
        (() => {
          const petals = 5 + i // 6 → 10 petals across spark → radiant
          const reach = 6 * scale // how far each petal's centre sits from the flower centre
          return (
            <>
              {Array.from({ length: petals }, (_, k) => {
                const a = (k / petals) * Math.PI * 2 - Math.PI / 2 // start at the top
                const px = 40 + Math.cos(a) * reach
                const py = cy + Math.sin(a) * reach
                return (
                  <ellipse
                    key={k}
                    cx={px}
                    cy={py}
                    rx={3 * scale}
                    ry={6 * scale}
                    fill={k % 2 === 0 ? pal.glow : pal.accent}
                    opacity={(0.7 + 0.22 * p) * g}
                    // Point the long axis OUTWARD (ellipse is tall by default → +90° to aim radially).
                    transform={`rotate(${(a * 180) / Math.PI + 90} ${px} ${py})`}
                  />
                )
              })}
              {/* The bright flower centre + a tiny highlight. */}
              <circle cx={40} cy={cy} r={3.2 * scale} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
              <circle cx={38.8} cy={cy - 1} r={1.2 * scale} fill="#ffffff" opacity={0.85 * g} />
            </>
          )
        })()}

      {/* `enso` — a zen ensō / ripples: concentric ring OUTLINES (2 at low stages, 3 from ascendant)
          around a soft core dot. Calm, meditative, never busy. Centred on (40, cy). */}
      {bodyForm === 'enso' &&
        (() => {
          const rings =
            i >= 4
              ? [6 * scale, 11 * scale, 15 * scale] // ascendant+ gains the outer ripple
              : [6 * scale, 11 * scale]
          return (
            <>
              {rings.map((r, k) => (
                <circle
                  key={k}
                  cx={40}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={k % 2 === 0 ? pal.accent : pal.glow}
                  strokeWidth={1.4}
                  opacity={(0.55 + 0.25 * p) * g}
                />
              ))}
              {/* A soft centre dot at the still point. */}
              <circle cx={40} cy={cy} r={2.4 * scale} fill={pal.core} opacity={(0.8 + 0.15 * p) * g} />
            </>
          )
        })()}

      {/* `prism` — a faceted gem: a hexagon OUTLINE polygon with internal facet lines from each
          vertex to the centre. An earthy mineral; slightly larger at higher stages. Centred on
          (40, cy). */}
      {bodyForm === 'prism' &&
        (() => {
          const r = (10 + p * 2) * scale // ~11*scale mid-ladder, a touch larger up the stages
          const verts = Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2 - Math.PI / 2 // flat-top-ish hexagon
            return { x: 40 + Math.cos(a) * r, y: cy + Math.sin(a) * r }
          })
          const points = verts.map((v) => `${v.x},${v.y}`).join(' ')
          return (
            <>
              {/* The translucent gem body. */}
              <polygon
                points={points}
                fill={pal.glow}
                fillOpacity={0.5 * g}
                stroke={pal.deep}
                strokeWidth={1.4}
                strokeLinejoin="round"
                opacity={(0.8 + 0.15 * p) * g}
              />
              {/* Internal facets — a line from each vertex to the centre. */}
              {verts.map((v, k) => (
                <line
                  key={k}
                  x1={v.x}
                  y1={v.y}
                  x2={40}
                  y2={cy}
                  stroke={pal.accent}
                  strokeWidth={0.8}
                  opacity={0.35 * g}
                />
              ))}
              {/* A bright glint at the gem's heart. */}
              <circle cx={40} cy={cy} r={1.6 * scale} fill={pal.core} opacity={0.9 * g} />
            </>
          )
        })()}
    </g>
  )
}

/**
 * `breath` → **Pitta** — a fierce fire-and-water creature (ADR-0023). Sharp, intense, energetic:
 * a blazing ember body crowned with flame tongues, rising from a cool teal water-base. Spark is a
 * single banked ember; each stage adds taller, more numerous flame tongues, eyes, a water pool,
 * rising sparks, and finally a full radiant blaze with an aura of embers — fierce but never scary
 * (rounded silhouette, friendly eyes). Warm fire palette (`core` white-hot → `glow` orange →
 * `accent` red) over a teal `deep` water element. Internal `path` value stays `breath`.
 */
function PittaForm({
  stage,
  g,
  pal: palProp,
  form,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
}) {
  const pal = palProp ?? PATH_PALETTE.breath
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  // The blaze grows taller and the body fuller up the ladder.
  const baseY = 52
  // The `form` (shape) cosmetic varies the SILHOUETTE — how many flame tongues the blaze throws
  // and how broad/tall the ember body reads — without ever fixing the stage growth: each variant
  // OFFSETS the stage's tongue count (`i`) so the creature still visibly grows up the ladder.
  // Absent / unknown → the identity look (tongues = i, bodyR/flameTop unchanged), so a bare Pitta
  // is pixel-identical to before. Only `breath` keys matter; the other doshas ignore them.
  let tongueCount = i
  let bodyMul = 1
  let flameLift = 0 // extra height added to the tallest tongue (raised flameTop)
  // The blaze's reach: the base flame height (16 + p*18). Some forms scale it taller/shorter.
  let flameSpan = 16 + p * 18
  // `puff` swaps the SHARP teardrop tongues for soft ROUNDED billows (drawn below), a clearly
  // different silhouette while keeping the same count + positions.
  const isPuff = form === 'puff'
  if (form === 'wildfire') {
    // A wild blaze of many flames — capped so radiant (i + 3 = 8) reads fierce, not a hedge.
    tongueCount = Math.min(8, i + 3)
  } else if (form === 'emberlit') {
    // A focused, banked ember: few flames but the tallest licks ~25% higher, slimmer body.
    tongueCount = Math.max(1, i - 1)
    flameLift = (16 + p * 18) * 0.25
    bodyMul = 0.85
  } else if (form === 'bonfire') {
    // A stout, wide ember — same flame count, a broad body (kept inside the 80×80 frame).
    bodyMul = 1.32
  } else if (form === 'inferno') {
    // A towering roaring blaze: the MOST flames (i + 5, capped at 9), licking ~30% higher off a
    // slightly fuller body. Reads taller + bigger than wildfire, never just "more".
    tongueCount = Math.min(9, i + 5)
    flameSpan = (16 + p * 18) * 1.3
    bodyMul = 1.08
  } else if (form === 'flicker') {
    // A small, gentle low flame: a couple of tongues, ~40% SHORTER, a slim ember — a calm,
    // banked coal that barely licks up.
    tongueCount = Math.max(2, i - 1)
    flameSpan = (16 + p * 18) * 0.6
    bodyMul = 0.8
  }
  const bodyR = (6 + p * 5) * bodyMul
  const bodyCy = baseY - bodyR * 0.6
  // Flame tongues licking up off the body — one at spark, up to five at radiant (shape varies it).
  const tongues = tongueCount
  const flameTop = baseY - flameSpan - flameLift // how high the tallest tongue reaches
  return (
    <g>
      {/* Water element — a cool teal pool the fire rises from, widening from wisp onward. The
          fire-and-water duality of Pitta (ADR-0023). A single ripple at spark, a pool later. */}
      <ellipse
        cx={cx}
        cy={baseY + 6}
        rx={bodyR + 4 + p * 4}
        ry={2.6 + p * 1.6}
        fill={pal.deep}
        opacity={(0.45 + 0.2 * p) * g}
      />
      {i >= 3 && (
        <ellipse
          cx={cx}
          cy={baseY + 6}
          rx={bodyR + 9 + p * 4}
          ry={1.4 + p}
          fill="none"
          stroke={pal.deep}
          strokeWidth={1.1}
          opacity={0.4 * g}
        />
      )}
      {/* Flame shapes licking up off the ember body. By default SHARP, pointed teardrop tongues;
          with `form === 'puff'` they become soft ROUNDED billows (overlapping rounded blobs) — a
          clearly different, billowy silhouette. Outer flames are searing red (`accent`), the
          central one the hot orange body colour. More + taller each stage. */}
      {Array.from({ length: tongues }, (_, k) => {
        // Spread flames across the top of the body; the centre one rises highest.
        const t = tongues === 1 ? 0 : (k / (tongues - 1)) * 2 - 1 // -1..1
        const tx = cx + t * (bodyR * 0.8)
        const sway = t * 3 // outer flames lean outward
        const tipY = flameTop + Math.abs(t) * (6 + p * 3) // centre tallest
        const w = (2.6 + p * 1.6) * (1 - Math.abs(t) * 0.25)
        const baseTy = bodyCy - bodyR * 0.2
        const fill = k === Math.floor(tongues / 2) ? pal.glow : pal.accent
        const opacity = (0.7 + 0.25 * p) * g
        if (isPuff) {
          // A soft billow: a rounded blob rising from the body, made of stacked circles — a
          // lower wide base puff and a smaller cap nearer the tip. Rounded, never pointed.
          const puffX = tx + sway * 0.5
          const baseR = w * 1.5 // a broad, soft base
          const capR = w * 1.05 // a smaller cap riding higher (toward the tip)
          const baseCy = baseTy - (baseTy - tipY) * 0.32
          const capCy = baseTy - (baseTy - tipY) * 0.72
          return (
            <g key={k} className="pitta-puff">
              <circle cx={puffX} cy={baseCy} r={baseR} fill={fill} opacity={opacity} />
              <circle cx={puffX} cy={capCy} r={capR} fill={fill} opacity={opacity} />
            </g>
          )
        }
        return (
          <path
            key={k}
            d={`M ${tx - w} ${baseTy}
                Q ${tx - w * 0.4 + sway} ${(baseTy + tipY) / 2} ${tx + sway} ${tipY}
                Q ${tx + w * 0.4 + sway} ${(baseTy + tipY) / 2} ${tx + w} ${baseTy} Z`}
            fill={fill}
            opacity={opacity}
          />
        )
      })}
      {/* The ember body — a hot rounded blaze with a white-hot heart. The fierce-but-friendly
          silhouette: a rounded teardrop, not a jagged shape. */}
      <path
        d={`M ${cx} ${bodyCy - bodyR * 1.3}
            Q ${cx + bodyR} ${bodyCy - bodyR * 0.4} ${cx + bodyR} ${bodyCy + bodyR * 0.5}
            Q ${cx + bodyR} ${baseY} ${cx} ${baseY}
            Q ${cx - bodyR} ${baseY} ${cx - bodyR} ${bodyCy + bodyR * 0.5}
            Q ${cx - bodyR} ${bodyCy - bodyR * 0.4} ${cx} ${bodyCy - bodyR * 1.3} Z`}
        fill={pal.glow}
        opacity={(0.8 + 0.2 * p) * g}
      />
      {/* White-hot inner core. */}
      <ellipse
        cx={cx}
        cy={bodyCy + 1}
        rx={bodyR * 0.5}
        ry={bodyR * 0.6}
        fill={pal.core}
        opacity={(0.85 + 0.15 * p) * g}
      />
      {/* Fierce-but-kind eyes — appear from wisp onward, two sharp upward-tilted slivers. */}
      {i >= 2 && (
        <>
          {[-1, 1].map((dir) => (
            <path
              key={dir}
              d={`M ${cx + dir * (bodyR * 0.4) - 1.4} ${bodyCy + 0.6}
                  q 1.4 -1.4 2.8 0`}
              fill="none"
              stroke="#7c2d12"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.9 * g}
            />
          ))}
        </>
      )}
      {/* Rising sparks / embers — from fledgling onward, a few flecks lifting off the blaze. */}
      {i >= 3 &&
        Array.from({ length: i - 1 }, (_, k) => {
          const a = (k / Math.max(1, i - 1)) * Math.PI - Math.PI / 2
          return (
            <circle
              key={`spark-${k}`}
              cx={cx + Math.cos(a) * (bodyR + 4)}
              cy={flameTop + 2 + Math.sin(a) * 3}
              r={0.9 + p * 0.5}
              fill={pal.accent}
              opacity={0.75 * g}
            />
          )
        })}
      {/* Radiant: a fierce ring of embers crowning the full blaze — the fullest form. */}
      {i >= 5 &&
        Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2
          return (
            <circle
              key={`ember-${k}`}
              cx={cx + Math.cos(a) * (bodyR + 10)}
              cy={bodyCy + Math.sin(a) * (bodyR + 10)}
              r={1.3}
              fill={k % 2 === 0 ? pal.glow : pal.core}
              opacity={0.8 * g}
            />
          )
        })}
    </g>
  )
}

/**
 * `heart` → **Vata** — an airy air-and-ether creature (ADR-0023). Light, mobile, expressive: a
 * graceful flowing wisp of breeze with a luminous core, trailing curling air-currents and a few
 * drifting motes/leaves. Spark is a single faint mote of mist; each stage adds a fuller flowing
 * body, gentle eyes, longer trailing wisps of breeze, more drifting leaves, and finally a full
 * radiant swirl haloed in a ring of orbiting motes — light and expressive, never heavy. Airy
 * palette (`core` pale luminous → `glow` sky-blue body → `accent` lavender breeze) over a deeper
 * periwinkle `deep` for the trailing currents. Internal `path` value stays `heart`.
 */
function VataForm({
  stage,
  g,
  pal: palProp,
  form,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
}) {
  const pal = palProp ?? PATH_PALETTE.heart
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  const cy = 38
  // The `form` (shape) cosmetic varies the SILHOUETTE — how many trailing breeze "legs" (wisps)
  // the creature has and how broad its body reads — without ever fixing the stage growth: each
  // variant OFFSETS the stage's wisp count (`i`) so the creature still visibly grows up the ladder.
  // Absent / unknown → the identity look (wispCount = i, widthMul = 1, no length change), so a bare
  // Vata is pixel-identical to before. Only `heart` keys matter; the other doshas have no forms yet.
  let wispCount = i
  let widthMul = 1
  let wispLenMul = 1
  // `halo` arranges the currents in a RING radiating out from the body centre instead of trailing
  // down — a spun halo of short currents. Set below; default false keeps every other form trailing.
  const isHalo = form === 'halo'
  if (form === 'tendrils') {
    // Many trailing legs — a fuller fan of breeze. Capped so radiant (i + 4 = 9) reads graceful,
    // not a tangle; the stroke is thinned a touch below (via `widthMul`-independent thinning).
    wispCount = Math.min(8, i + 4)
  } else if (form === 'sleek') {
    // A streamlined, few-legged wisp: fewer but LONGER currents and a slimmer body.
    wispCount = Math.max(2, i - 1)
    widthMul = 0.78
    wispLenMul = 1.25
  } else if (form === 'billowy') {
    // A round, full-bodied wisp — same leg count, a broader body + currents.
    widthMul = 1.3
  } else if (form === 'flurry') {
    // A busy whirl of MANY short currents — capped at 9 so radiant reads lively, not a tangle.
    wispCount = Math.min(9, i + 4)
    wispLenMul = 0.55
  } else if (form === 'streamer') {
    // A few VERY long flowing ribbons — fewer currents, each streaming almost twice as far.
    wispCount = Math.max(2, i - 2)
    wispLenMul = 1.8
  } else if (isHalo) {
    // A spun ring of short currents radiating outward from the body centre (positions set below).
    wispCount = Math.max(4, i + 1)
    wispLenMul = 0.7
  }
  // The wisp grows fuller and its trailing currents longer up the ladder. `widthMul` scales the
  // body (and so the wisp start positions, which key off bodyR) for the shape variant.
  const bodyR = (5 + p * 5) * widthMul
  // Trailing breeze currents curling off the body — count set by stage + the shape variant above.
  const wisps = wispCount
  // The trailing currents fall from ~y=44 (body bottom); cap the length so even `streamer`'s long
  // (×1.8) radiant ribbon keeps its tip inside the 80-tall frame. `halo`'s currents radiate from the
  // centre (not straight down) so they never reach the cap, leaving its short ring untouched.
  const wispLen = Math.min(34, (10 + p * 14) * wispLenMul)
  // Tendrils crowds the silhouette with extra legs, so thin each stroke a touch to keep it airy.
  const strokeThin = form === 'tendrils' ? 0.82 : 1
  return (
    <g>
      {/* Trailing air-currents — soft curling ribbons of breeze drifting off the body, the airy
          defining feature. Outer currents curl wider; more + longer each stage gives the
          "more developed" read. They flow down-and-out, so the creature reads as gliding. With
          `form === 'halo'` the same currents instead radiate outward in an evenly-spaced RING
          around the body centre — a spun halo of short curls rather than trailing legs. */}
      {Array.from({ length: wisps }, (_, k) => {
        if (isHalo) {
          // A ring of short currents radiating out from the body centre, each a stroked curl.
          const a = (k / wisps) * Math.PI * 2
          const r0 = bodyR * 0.9 // start just outside the body
          const startX = cx + Math.cos(a) * r0
          const startY = cy + Math.sin(a) * r0
          const endX = cx + Math.cos(a) * (r0 + wispLen)
          const endY = cy + Math.sin(a) * (r0 + wispLen)
          // Bow the curl tangentially so it reads as spun, not a plain spoke.
          const tang = 5 + p * 3
          const midX = (startX + endX) / 2 - Math.sin(a) * tang
          const midY = (startY + endY) / 2 + Math.cos(a) * tang
          return (
            <path
              key={k}
              d={`M ${startX} ${startY}
                  Q ${midX} ${midY} ${endX} ${endY}`}
              fill="none"
              stroke={k % 2 === 0 ? pal.accent : pal.deep}
              strokeWidth={(2.4 + p * 1.4) * 0.7 * strokeThin}
              strokeLinecap="round"
              opacity={(0.4 + 0.3 * p) * g}
            />
          )
        }
        const t = wisps === 1 ? 0 : (k / (wisps - 1)) * 2 - 1 // -1..1
        const startX = cx + t * (bodyR * 0.7)
        const startY = cy + bodyR * 0.6
        const curl = t * (8 + p * 6) // outer currents sweep further out
        const endX = startX + curl
        const endY = startY + wispLen * (1 - Math.abs(t) * 0.3)
        const midX = startX + curl * 0.4 - 4
        const midY = (startY + endY) / 2
        return (
          <path
            key={k}
            d={`M ${startX} ${startY}
                Q ${midX} ${midY} ${endX} ${endY}`}
            fill="none"
            stroke={k % 2 === 0 ? pal.accent : pal.deep}
            strokeWidth={(2.4 + p * 1.4) * (1 - Math.abs(t) * 0.3) * strokeThin}
            strokeLinecap="round"
            opacity={(0.4 + 0.3 * p) * g}
          />
        )
      })}
      {/* The flowing wisp body — a soft teardrop of breeze, lighter than air. A rounded,
          upward-tapering silhouette (graceful, never blocky), brightest at the core. */}
      <path
        d={`M ${cx} ${cy - bodyR * 1.4}
            Q ${cx + bodyR} ${cy - bodyR * 0.5} ${cx + bodyR} ${cy + bodyR * 0.3}
            Q ${cx + bodyR} ${cy + bodyR * 1.1} ${cx} ${cy + bodyR * 1.2}
            Q ${cx - bodyR} ${cy + bodyR * 1.1} ${cx - bodyR} ${cy + bodyR * 0.3}
            Q ${cx - bodyR} ${cy - bodyR * 0.5} ${cx} ${cy - bodyR * 1.4} Z`}
        fill={pal.glow}
        opacity={(0.6 + 0.25 * p) * g}
      />
      {/* Luminous inner core — the bright airy heart of the wisp. */}
      <ellipse
        cx={cx}
        cy={cy - bodyR * 0.1}
        rx={bodyR * 0.5}
        ry={bodyR * 0.6}
        fill={pal.core}
        opacity={(0.85 + 0.15 * p) * g}
      />
      <circle cx={cx - bodyR * 0.25} cy={cy - bodyR * 0.35} r={1.5 + p} fill="#ffffff" opacity={0.8 * g} />
      {/* Gentle, expressive eyes — appear from wisp onward, two soft rounded dots (kind, calm). */}
      {i >= 2 && (
        <>
          {[-1, 1].map((dir) => (
            <circle
              key={dir}
              cx={cx + dir * (bodyR * 0.34)}
              cy={cy + 0.4}
              r={0.9 + p * 0.4}
              fill={pal.deep}
              opacity={0.9 * g}
            />
          ))}
        </>
      )}
      {/* Drifting leaves on the breeze — from fledgling onward, a few small leaves carried
          alongside the wisp, the air-borne motion made visible. */}
      {i >= 3 &&
        Array.from({ length: i - 1 }, (_, k) => {
          const a = (k / Math.max(1, i - 1)) * Math.PI * 2
          const lx = cx + Math.cos(a) * (bodyR + 8 + p * 3)
          const ly = cy + Math.sin(a) * (bodyR + 6 + p * 2)
          return (
            <ellipse
              key={`leaf-${k}`}
              cx={lx}
              cy={ly}
              rx={2.4 + p}
              ry={1.1 + p * 0.4}
              fill={pal.accent}
              opacity={0.6 * g}
              transform={`rotate(${(a * 180) / Math.PI + 30} ${lx} ${ly})`}
            />
          )
        })}
      {/* Radiant: a full ring of orbiting motes swirling around the wisp — the airiest form. */}
      {i >= 5 &&
        Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2
          return (
            <circle
              key={`mote-${k}`}
              cx={cx + Math.cos(a) * (bodyR + 11)}
              cy={cy + Math.sin(a) * (bodyR + 11)}
              r={1.1}
              fill={k % 2 === 0 ? pal.core : pal.accent}
              opacity={0.8 * g}
            />
          )
        })}
    </g>
  )
}

/**
 * The PATHLESS SPARK (ADR-0023) — a neutral, un-themed glowing mote shown before the user
 * chooses a creature. No path palette, no creature features: just a soft white-gold core with a
 * faint halo, so it reads as "a spark waiting to become something". Drawn at every stage the
 * same calm way (a pathless spirit is, by design, always early — the choice comes first).
 */
function SparkForm({ g }: { g: number }) {
  // A warm amber spark with a defined edge so it reads clearly on light / beige backgrounds —
  // the old pale near-white core was nearly invisible. The halo carries the condition glow; the
  // core stays solidly opaque (not scaled by glow) so the spark is never hard to see.
  const halo = '#fbbf24'
  const core = '#fef3c7'
  return (
    <g>
      <circle cx={40} cy={40} r={20} fill={halo} opacity={Math.min(0.4, 0.18 * g)} />
      <circle cx={40} cy={40} r={13} fill={halo} opacity={Math.min(0.55, 0.3 * g)} />
      <circle cx={40} cy={40} r={8.5} fill={core} stroke="#d97706" strokeWidth={1.5} opacity={0.96} />
      <circle cx={40} cy={40} r={4.5} fill="#f59e0b" opacity={0.95} />
      <circle cx={38} cy={38.5} r={1.8} fill="#ffffff" opacity={0.9} />
    </g>
  )
}

// The creature figure per path (aura is now hoisted to its own static animated layer in
// SpiritArt, so the Form draws only the creature body — the part that floats).
const PATH_FORM: Record<
  SpiritPath,
  // `form` (shape) is the silhouette cosmetic — each Form varies its OWN silhouette by it: VataForm
  // its wisp count + body width, PittaForm its flame count + ember body, StillnessForm the seated
  // figure's proportions. Each renderer interprets only its own keys (a foreign/absent key → default).
  (props: { stage: SpiritStage; g: number; pal?: BodyPalette; form?: string }) => JSX.Element
> = {
  stillness: StillnessForm,
  breath: PittaForm,
  heart: VataForm,
}

// The form chosen for the art: the user's CHOSEN path (ADR-0023). NULL until they choose — a
// pathless spark has no creature form yet, so this returns null and the art renders the neutral
// SparkForm. Exported so SpiritPage uses the exact same selection logic (a single source of truth).
export function formFor(spirit: SpiritState): SpiritPath | null {
  return spirit.path
}

// The "Signature radiance" flourish (ADR-0028) — drawn ONLY when the full signature set is
// equipped. A subtle endgame touch: a soft extra halo blooming behind the figure plus a faint
// ring of sparkles around it, tinted to the path's accent. Kept tasteful + low-opacity so it
// reads as a gentle radiance, never a loud overlay. Condition-responsive (scaled by `g`, the
// floored glow). The ring only animates when `alive` (not reduced motion) via the
// `spirit-radiance--alive` class; otherwise it holds static (prefers-reduced-motion safe). No
// assets — pure procedural SVG, matching the rest of the art.
function SetRadiance({ path, g, alive }: { path: SpiritPath; g: number; alive: boolean }) {
  const pal = PATH_PALETTE[path]
  const sparkles = 10
  return (
    <g
      className={'spirit-radiance' + (alive ? ' spirit-radiance--alive' : '')}
      aria-hidden="true"
    >
      {/* A soft outer halo bloom behind the figure — the radiance itself. */}
      <circle cx={40} cy={40} r={34} fill={pal.glow} opacity={Math.min(0.18, 0.14 * g)} />
      <circle cx={40} cy={40} r={28} fill={pal.core} opacity={Math.min(0.16, 0.12 * g)} />
      {/* A faint sparkle ring around the figure — tiny accents, alternating size, tinted accent. */}
      {Array.from({ length: sparkles }, (_, k) => {
        const a = (k / sparkles) * Math.PI * 2 - Math.PI / 2
        const rr = 33
        return (
          <circle
            key={`radiance-${k}`}
            cx={40 + Math.cos(a) * rr}
            cy={40 + Math.sin(a) * rr}
            r={k % 2 ? 1.1 : 0.7}
            fill={k % 3 ? pal.accent : '#ffffff'}
            opacity={0.7 * g}
          />
        )
      })}
    </g>
  )
}

/**
 * The procedural spirit art, branched by the CHOSEN path (ADR-0023). When `path` is null the
 * spirit is a pathless spark, drawn as the neutral, un-themed SparkForm (no creature features
 * yet). `glow` (the overall condition factor) is clamped to the floored band.
 *
 * Motion is SPLIT into two layers (ADR-0023), so the background never drifts with the creature:
 *  - A STATIC background layer (the outer `<svg>` itself): the habitat backdrop and the aura.
 *    The aura is its own `<g class="spirit-aura">` that, when alive, runs an INDEPENDENT
 *    `spirit-aura-glow` keyframe (opacity/brightness in→out) on its own timeline — it glows up
 *    and down by itself, with depth driven by `--spirit-glow` (the condition factor). It does not
 *    float; it stays put behind the creature.
 *  - A FLOATING creature layer (`<g class="spirit-creature">`): the figure + accessory. When
 *    alive it runs `spirit-float` (the drift), so ONLY the creature moves. On BreathePage a
 *    `paceScale` (the breathe-circle's live `scaleAt` value) drives this same group via an inline
 *    transform synced to the pacer (the creature, not the background, follows the breath).
 *    `celebrate` fires a brief one-shot on this group via the Web Animations API.
 *
 * When reduced-motion is on, none of these apply — every layer holds static.
 */
export function SpiritArt({
  stage,
  path,
  glow,
  cosmetics,
  paceScale,
  celebrate = false,
  reducedMotion,
  previewing = false,
  setRadiant = false,
}: {
  stage: SpiritStage
  // The chosen creature, or null for a pathless spark (drawn neutral, no creature form).
  path: SpiritPath | null
  glow: number
  // Owned cosmetics {slot: option} — the applied aura / accessory / habitat shown on the art.
  cosmetics?: SpiritCosmetics
  // Live pacer scale (BreathePage's `scaleAt` value) — when set, the spirit syncs to the breath.
  paceScale?: number
  // One-shot happy reaction (session complete). Plays once when it flips true.
  celebrate?: boolean
  reducedMotion: boolean
  // True when the art shows a not-yet-bought cosmetic preview — announced to screen readers
  // (via the label + aria-live) so they know they're seeing a preview, not the applied look.
  previewing?: boolean
  // True when the full SIGNATURE SET is equipped (ADR-0028) — draws an extra subtle "Signature
  // radiance" flourish (a soft halo + a faint sparkle ring) over the scene. Advisory/visual only.
  setRadiant?: boolean
}) {
  const g = clampGlow(glow)
  const aura = cosmetics?.aura
  const accessory = cosmetics?.accessory
  const habitat = cosmetics?.habitat
  const companion = cosmetics?.companion
  const mount = cosmetics?.mount
  const weather = cosmetics?.weather
  const ground = cosmetics?.ground
  // BODY cosmetics (ADR: the look changes the creature itself, not just the layers around it).
  // `palette` recolours the body — swap the dosha default for an alternate ramp; absent → default,
  // so a bare creature keeps its dosha identity. `size` scales the body independent of the stage;
  // absent → 1.0 (the stage's natural size). Both resolve to the path-default / no-op when unset.
  const pal = (path && cosmetics?.palette && PALETTES[cosmetics.palette]) || (path ? PATH_PALETTE[path] : undefined)
  const sizeScale = SIZES[cosmetics?.size ?? ''] ?? 1
  // A pathless spark has no creature label yet — describe it as an awakening spark.
  const creature = path ? `${PATH_COPY[path]} spirit` : 'awakening spark'
  const label = `${STAGE_COPY[stage].name} ${creature}${previewing ? ' (preview)' : ''}`
  // The celebration + pacer transform now target the CREATURE group, so the static background
  // (habitat + aura) never swells with the one-shot or drifts with the breath.
  const creatureRef = useRef<SVGGElement | null>(null)

  // Session-complete celebration: a single, gentle swell + glow on the creature layer via the
  // Web Animations API, so it layers over the idle CSS without fighting it. Skipped under
  // reduced motion. Only the creature swells — the background holds still.
  useEffect(() => {
    if (!celebrate || reducedMotion) return
    const el = creatureRef.current
    if (!el || typeof el.animate !== 'function') return
    const anim = el.animate(
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.12)', filter: 'brightness(1.25)', offset: 0.4 },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 1100, easing: 'ease-in-out' },
    )
    return () => anim.cancel()
  }, [celebrate, reducedMotion])

  // In pacer mode the creature follows the breath via an inline transform on the SAME clock as
  // the breathe-circle (no idle float — the breath IS the motion). Reduced motion holds it at 1.
  const inPacerMode = paceScale !== undefined
  const liveScale = reducedMotion ? 1 : paceToScale(paceScale)

  // `--spirit-glow` lets the aura glow breathe a touch harder when the condition is high and
  // calmer when a need is a touch low — condition expressed as motion, still floored by `clampGlow`.
  // It lives on the SVG so both the (static) aura layer and the (floating) creature share it.
  // `--spirit-vitality` is the SECOND, wider-range cue off the RAW factor: CSS uses it for the
  // stronger expression (saturation, liveliness, posture). `data-condition` exposes the coarse tier
  // so CSS can add discrete touches if useful. (ADR-0031: the spirit is always alive — the floored
  // needs keep vitality in the calm-to-bright band; there is no unwell/dead state.)
  const vitality = conditionVitality(glow)
  const tier = conditionTier(glow)
  const svgStyle: CSSProperties = {
    ['--spirit-glow' as string]: g,
    ['--spirit-vitality' as string]: vitality,
  }

  // The float / glow / pace only run when alive (not reduced-motion). The OUTER svg is now a
  // STATIC layer — it never floats. The creature layer floats (or paces); the aura layer glows.
  // ADR-0031: the spirit is always alive — it can never die, so this is simply "not reduced motion".
  const alive = !reducedMotion
  // The LIVELY idle float runs whenever alive — there's no ailing/wilt state anymore (ADR-0031).
  const lively = alive
  // The creature group: idle float when lively & not pacing; a pacer transform when pacing.
  const creatureClass =
    'spirit-creature' +
    (lively && !inPacerMode ? ' spirit-creature--alive' : '') +
    (inPacerMode ? ' spirit-creature--pacing' : '')
  const creatureStyle: CSSProperties | undefined = inPacerMode
    ? { transform: `scale(${liveScale})` }
    : undefined
  // The aura group glows on its own independent timeline when alive (and not paced — during the
  // pacer moment the breath is the motion, so the aura holds steady rather than double-pulsing).
  const auraClass = 'spirit-aura' + (alive && !inPacerMode ? ' spirit-aura--alive' : '')
  // The companion moves at ITS OWN pace — a soft, slow bob/sway on a duration distinct from the
  // creature's float and the aura's glow (so the layers are visibly out of sync). Like the aura,
  // it holds steady during the pacer moment and under reduced motion.
  const companionClass =
    'spirit-companion' + (alive && !inPacerMode ? ' spirit-companion--alive' : '')

  return (
    <svg
      className="spirit-svg"
      style={svgStyle}
      data-condition={tier}
      viewBox="0 0 80 80"
      role="img"
      aria-label={label}
      aria-live="polite"
    >
      {/* ── STATIC background layer ── habitat backdrop + aura. Neither floats: they stay put so
          the background does not drift with the creature (ADR-0023). The aura glows up/down on
          its own `spirit-aura-glow` keyframe, independent of the creature's float. For a pathless
          spark the SparkForm carries its own halo, so no separate aura layer is drawn. */}
      {habitat && <Habitat habitat={habitat} g={g} />}
      {path && (
        <g className={auraClass}>
          <Aura path={path} p={stageProgress(stage)} g={g} aura={aura} />
        </g>
      )}
      {/* The companion sits in the static background band, off to the side of the figure — in
          front of the habitat but clear of the creature. It keeps the spirit company without
          fighting it, gently bobbing/swaying on its OWN independent rhythm (distinct from the
          creature's float and the aura's glow), held still under reduced motion. */}
      {companion && (
        <g className={companionClass}>
          <Companion companion={companion} g={g} />
        </g>
      )}
      {/* The mount sits centered and low in the static background band, UNDER the creature, so
          the figure appears to rest on / ride it without floating away with it or being hidden. */}
      {mount && <Mount mount={mount} g={g} />}
      {/* The ground is a FOREGROUND base strip along the very bottom — drawn in FRONT of the
          habitat/mount so it reads as the floor the figure rests on (but still behind the
          creature, which stands on it). */}
      {ground && <Ground ground={ground} g={g} />}
      {/* ── SIGNATURE RADIANCE (ADR-0028) ── when the full signature set is equipped, an extra
          subtle halo + sparkle ring blooms behind the figure (over the background, under the
          creature). */}
      {setRadiant && path && <SetRadiance path={path} g={g} alive={alive} />}
      {/* ── FLOATING creature layer ── only this group moves (and only when alive): idle float,
          pacer sync, or the celebration one-shot. The figure is always legible; the accessory
          perches on top. */}
      <g ref={creatureRef} className={creatureClass} style={creatureStyle}>
        {/* The `size` cosmetic scales the BODY + its accessory together, around the 80×80 viewBox
            centre (so the figure grows/shrinks in place). It's a static SVG transform on an inner
            group — kept SEPARATE from the outer group's CSS float / inline pacer transform so it
            composes with them rather than clobbering either. `scale(1)` (no `size` cosmetic) is a
            no-op identity, so a bare creature is unchanged. */}
        <g
          transform={
            sizeScale === 1 ? undefined : `translate(40 40) scale(${sizeScale}) translate(-40 -40)`
          }
        >
          {path ? (
            (() => {
              const Form = PATH_FORM[path]
              return <Form stage={stage} g={g} pal={pal} form={cosmetics?.form} />
            })()
          ) : (
            <SparkForm g={g} />
          )}
          {accessory && <Accessory accessory={accessory} g={g} />}
        </g>
      </g>
      {/* The weather is the FRONT-MOST overlay — drawn after everything (incl. the accessory) so
          its light particles drift OVER the whole scene. Kept subtle so it never obscures the
          figure. */}
      {weather && <Weather weather={weather} g={g} />}
    </svg>
  )
}

export default function Spirit({
  spirit: spiritProp,
  paceScale,
  celebrate = false,
  compact = false,
  sessionCount = 0,
}: {
  spirit?: SpiritState | null
  // Live pacer scale for BreathePage sync (the breathe-circle's `scaleAt` value). Omit on home.
  paceScale?: number
  // One-shot session-complete celebration (from the RewardOverlay flow). Omit on home.
  celebrate?: boolean
  // Smaller, chrome-free render for BreathePage (just the art, no stage/bond read-out).
  compact?: boolean
  // The user's logged-session count (from the dashboard stats). Used only for the pathless-spark
  // read-out: once they've taken their first breath, the "choose your companion" prompt warms into
  // a celebratory hatch invite (onboarding §5). Defaults to 0 → the gentle first-time copy.
  sessionCount?: number
}) {
  const [fetched, setFetched] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [loading, setLoading] = useState(spiritProp === undefined)

  function load() {
    setRetrying(true)
    spiritService
      .get()
      .then((s) => {
        setFetched(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, "Couldn't reach your spirit.")))
      .finally(() => {
        setRetrying(false)
        setLoading(false)
      })
  }

  // Only fetch when the parent hasn't supplied a spirit already.
  useEffect(() => {
    if (spiritProp !== undefined) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiritProp])

  const spirit = spiritProp !== undefined ? spiritProp : fetched

  if (error && !spirit) {
    return (
      <section className="spirit-home" aria-label="Your spirit">
        <RetryableError message={error} onRetry={load} retrying={retrying} />
      </section>
    )
  }

  // Loading: only when we're fetching our own and have nothing yet. When the parent passes a
  // not-yet-loaded `null`, we wait quietly (the dashboard renders other content meanwhile).
  if (!spirit) {
    if (loading && spiritProp === undefined) {
      return (
        <section className="spirit-home" aria-label="Your spirit">
          <Loading label="Waking your spirit…" />
        </section>
      )
    }
    return null
  }

  const { stage, condition, needs, bond, path, cosmetics } = spirit
  const copy = STAGE_COPY[stage]
  // The form is the CHOSEN path (ADR-0023); null = a pathless spark (neutral SparkForm). The
  // overall look (glow/vibrancy) reads from the condition factor — the weakest of the needs.
  const form: SpiritPath | null = formFor(spirit)

  // Read the OS reduced-motion preference once here and thread it down, so every motion path
  // (idle float, glow pulse, celebration, pacer sync) is gated by the single source of truth.
  const reducedMotion = prefersReducedMotion()
  const art = (
    <SpiritArt
      stage={stage}
      path={form}
      glow={condition.factor}
      cosmetics={cosmetics}
      paceScale={paceScale}
      celebrate={celebrate}
      reducedMotion={reducedMotion}
      // ADR-0028: the full signature set lights up an extra "Signature radiance" flourish.
      setRadiant={spirit.set_bonus.active}
    />
  )

  // Compact mode (BreathePage): just the art, no stage/bond chrome — the spirit breathes
  // alongside the pacer without crowding the focused breathing screen.
  if (compact) {
    return (
      // No wrapper aria-label: the inner SVG already carries role="img" + its own label, so a
      // label here would double-announce. The single label lives on the art.
      <div className="spirit-compact">
        <div className="spirit-art spirit-art--compact">{art}</div>
      </div>
    )
  }

  return (
    // No section aria-label here: the inner SVG already carries role="img" + its own label, so
    // labelling the wrapper too would double-announce. The error / loading states above keep
    // their label since they have no labelled art to stand in for it.
    <section className="spirit-home">
      <div className="spirit-art">{art}</div>
      {/* Quiet, calm read-out — the stage name, a gentle note, and the bond level. No XP bar,
          no shouted numbers; consistent with the app's low-pressure stance. */}
      {path === null ? (
        // Choose-first (ADR-0023): lead with the CHOICE, not a faint default spark — picking a
        // companion is the first step. The picker lives on its own focused page. Once the user
        // has taken their first breath (sessionCount ≥ 1), the prompt warms into a celebratory
        // "hatch" invite (onboarding §5) — the companion is the reward for that first sit.
        sessionCount >= 1 ? (
          <>
            <p className="spirit-stage">You’ve taken your first breath ✨</p>
            <p className="spirit-note muted">Now meet the companion you brought to life.</p>
            <p className="spirit-choose-prompt">
              <Link to="/spirit/choose" className="spirit-choose-cta">
                Meet your companion →
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="spirit-stage">Choose your companion</p>
            <p className="spirit-note muted">Pick the one whose nature fits you.</p>
            <p className="spirit-choose-prompt">
              <Link to="/spirit/choose" className="spirit-choose-cta">
                Choose your companion →
              </Link>
            </p>
          </>
        )
      ) : (
        // A chosen creature: its stage, a tidy needs read-out + a single kind, optional care nudge,
        // and the bond level. Always encouraging — never a warning (ADR-0031).
        <>
          <p className="spirit-stage">{copy.name}</p>
          <p className="spirit-note muted">{copy.note}</p>
          <NeedsReadout needs={needs} />
          <CareNudge needs={needs} path={path} />
          <p className="spirit-bond muted">Bond level {bond.level}</p>
        </>
      )}
    </section>
  )
}
