import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Soup, Moon, Sparkles, ArrowRight, type LucideProps } from 'lucide-react'
import { spiritService } from '../services/spirit'
import { Loading, RetryableError } from './StateViews'
import { messageForError } from '../lib/errors'
import { roundOutFacet } from '../lib/spiritNeeds'
import { playBoop } from '../lib/sfx'
import { t, useT } from '../i18n'
import type {
  SpiritNeedTier,
  SpiritPath,
  SpiritStage,
  SpiritState,
} from '../types'

// A lucide line-icon component (consistent line icons app-wide, no system emoji).
export type NeedIcon = ComponentType<LucideProps>

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
 * Until the user chooses (path === null), the spirit is a PATHLESS EGG: a neutral, un-themed
 * warm egg with a spark glowing inside and a first hairline crack — the picker is the hatch.
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
// Exported so SpiritPage shares the same stage set/order (a single source of truth). Values are
// i18n catalog KEYS (locales/{en,ja}/spirit.ts), resolved with t() where they render.
export const STAGE_COPY: Record<SpiritStage, { nameKey: string; noteKey: string }> = {
  spark: { nameKey: 'spirit.stage.spark', noteKey: 'spirit.stage.note.spark' },
  wisp: { nameKey: 'spirit.stage.wisp', noteKey: 'spirit.stage.note.wisp' },
  fledgling: { nameKey: 'spirit.stage.fledgling', noteKey: 'spirit.stage.note.fledgling' },
  ascendant: { nameKey: 'spirit.stage.ascendant', noteKey: 'spirit.stage.note.ascendant' },
  radiant: { nameKey: 'spirit.stage.radiant', noteKey: 'spirit.stage.note.radiant' },
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

// Calm, never-shaming copy per care tier (ADR-0023 guardrail: nudge, never shame). `labelKey`
// is the pill text's i18n catalog key ('spirit.tier.*', resolved with t() where it renders),
// `tone` the CSS state suffix. Exported so SpiritPage + the home summary share it.
export const TIER_COPY: Record<SpiritNeedTier, { labelKey: string; tone: string }> = {
  thriving: { labelKey: 'spirit.tier.thriving', tone: 'thriving' },
  content: { labelKey: 'spirit.tier.content', tone: 'content' },
  restless: { labelKey: 'spirit.tier.restless', tone: 'restless' },
  unwell: { labelKey: 'spirit.tier.unwell', tone: 'unwell' },
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
  { labelKey: string; icon: NeedIcon }
> = {
  // Labels name the DIMENSION (a noun), not a positive state — so "Nourishment · Needs care"
  // reads honestly, rather than "Nourished" claiming the opposite of the tier beside it.
  // `labelKey` is the shared 'needs.*' i18n key (locales/{en,ja}/common.ts), resolved with t()
  // where it renders; `icon` is a lucide line-icon component, sized to context at each call site.
  nourished: { labelKey: 'needs.nourished', icon: Soup },
  rested: { labelKey: 'needs.rested', icon: Moon },
  joyful: { labelKey: 'needs.joyful', icon: Sparkles },
}

// Calm display names for the cosmetic slots and their options (matching the backend catalog
// SPIRIT_COSMETICS_CATALOG). Unknown keys fall back to a tidied key. Exported as the single
// source of truth so SpiritPage (the customize tree) and SpiritChoosePage (the grows-into
// preview) label options identically.
// I18N: the values here are the FROZEN ENGLISH, mirrored byte-identically in the catalogs as
// 'spirit.slot.<slot>' / 'spirit.option.<option>' (locales/{en,ja}/spirit.ts). Rendering goes
// through slotLabel()/optionLabel() below, which resolve those keys with t() at call time —
// these maps double as the KNOWN-KEY set (membership decides catalog lookup vs titleize).
export const SLOT_LABEL: Record<string, string> = {
  aura: 'Aura',
  accessory: 'Accessory',
  habitat: 'Habitat',
  companion: 'Companion',
  mount: 'Mount',
  weather: 'Weather',
  ground: 'Ground',
  // BODY cosmetics — the recolour + resize + shape + face that change the creature itself.
  palette: 'Colour',
  size: 'Size',
  form: 'Shape',
  face: 'Face',
}

export const OPTION_LABEL: Record<string, string> = {
  soft: 'Soft glow',
  warm: 'Warm glow',
  starlit: 'Starlit',
  neon: 'Neon glow',
  shadow: 'Shadow glow',
  ember: 'Ember glow',
  frost: 'Frost glow',
  rose: 'Rose glow',
  halo: 'Halo',
  leaf_crown: 'Leaf crown',
  ribbon: 'Ribbon',
  flower: 'Flower',
  scarf: 'Scarf',
  star: 'Star',
  dark_star: 'Dark star',
  meadow: 'Meadow',
  dusk: 'Dusk',
  night: 'Night sky',
  garden: 'Garden',
  seaside: 'Seaside',
  cottage: 'Cottage',
  storm_peak: 'Storm peak',
  neon_city: 'Neon city',
  volcano: 'Volcano',
  cosmic_void: 'Cosmic void',
  dojo: 'Dojo',
  zen_garden: 'Zen garden',
  sakura: 'Sakura',
  arcade: 'Arcade',
  underwater: 'Underwater',
  // Face (expression) cosmetics.
  kawaii: 'Happy face',
  wink: 'Wink',
  lashes: 'Lashes',
  tongue: 'Tongue out',
  frogface: 'Frog face',
  starry: 'Star eyes',
  sleepy: 'Sleepy',
  surprised: 'Surprised',
  hearts: 'Heart eyes',
  cool: 'Sunglasses',
  firefly: 'Firefly',
  bird: 'Bird',
  cat: 'Cat',
  phoenix: 'Phoenix',
  koi: 'Koi fish',
  jellyfish: 'Jellyfish',
  luna_moth: 'Luna moth',
  // Path-exclusive companions (only offered to the matching creature, per_path in the catalog).
  kitsune: 'Nine-tail fox',
  tortoise: 'Jade tortoise',
  crane: 'Paper crane',
  cloud: 'Cloud',
  lotus: 'Lotus',
  leaf: 'Leaf boat',
  hoverboard: 'Hoverboard',
  // Path-exclusive cosmetics (aura / accessory / habitat / mount), per_path in the catalog —
  // each only offered to its matching dosha spirit.
  emberflame: 'Ember aura',
  grove: 'Grove aura',
  zephyr: 'Zephyr aura',
  // Path-exclusive tier-2 auras (an earlier per-path signature glow before the tier-3 capstone).
  cinders: 'Cinder aura',
  dewfall: 'Dew aura',
  petalwind: 'Petal aura',
  // Path-exclusive tier-2 companions & accessories (earlier per-path options before the tier-3 capstones).
  emberling: 'Emberling',
  mosskit: 'Mosskit',
  butterfly: 'Butterfly',
  flame_tuft: 'Flame tuft',
  acorn_cap: 'Acorn cap',
  wind_ribbon: 'Wind ribbon',
  ember_crown: 'Ember crown',
  mossy_circlet: 'Mossy circlet',
  feather_plume: 'Feather plume',
  ember_canyon: 'Ember canyon',
  misty_grove: 'Misty grove',
  open_sky: 'Open sky',
  emberstone: 'Ember sun-stone',
  boulder: 'Mossy boulder',
  feather: 'Drifting feather',
  // Path-exclusive tier-2 habitats & mounts (earlier per-path options before the tier-3 capstones).
  ember_hollow: 'Ember hollow',
  fern_hollow: 'Fern hollow',
  cloud_terrace: 'Cloud terrace',
  ember_log: 'Ember log',
  mossy_rock: 'Mossy rock',
  drift_leaf: 'Drifting leaf',
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
  bubbles: 'Floating bubbles',
  confetti: 'Confetti',
  meteor_shower: 'Meteor shower',
  // Path-exclusive weathers (one per dosha, per_path in the catalog).
  ember_drift: 'Drifting embers',
  pollenfall: 'Pollen fall',
  galeswirl: 'Gale swirl',
  // Path-exclusive tier-2 weathers (earlier per-path options before the tier-3 capstones).
  heat_shimmer: 'Heat shimmer',
  dewdrift: 'Dew drift',
  featherfall: 'Feather fall',
  // Ground — a foreground base strip along the very bottom.
  grass: 'Grassy ground',
  pebbles: 'Pebble bed',
  clover: 'Clover patch',
  snow_bank: 'Snow bank',
  lava_rock: 'Lava rock',
  neon_grid: 'Neon grid',
  mushrooms: 'Toadstools',
  wildflowers: 'Wildflower bed',
  crystals: 'Crystal cluster',
  // Path-exclusive grounds (one per dosha, per_path in the catalog).
  emberbed: 'Ember bed',
  stonegarden: 'Stone garden',
  cloudfloor: 'Cloud floor',
  // Path-exclusive tier-2 grounds (earlier per-path options before the tier-3 capstones).
  ember_sand: 'Ember sand',
  mossbed: 'Moss bed',
  cloudtuft: 'Cloud tuft',
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
  // Worn accessories with attitude — three cool/edgy, three cutesy/girly.
  shades: 'Shades',
  spiked_collar: 'Spiked collar',
  backwards_cap: 'Backwards cap',
  bow: 'Bow',
  tiara: 'Tiara',
  heart_clip: 'Heart clip',
  // ADORED THINGS — beloved little darlings (companions), worn favourites (accessories) and a
  // cosy onsen backdrop. Keys are a GLOBAL namespace, so each is unique across every slot.
  duckling: 'Duckling',
  axolotl: 'Axolotl',
  boba: 'Bubble tea',
  capybara: 'Capybara',
  wired_earbuds: 'Wired earbuds',
  cat_ears: 'Cat ears',
  bucket_hat: 'Bucket hat',
  hot_spring: 'Hot spring',
  // Adored things, wave 2.
  mushroom: 'Mushroom',
  hedgehog: 'Hedgehog',
  penguin: 'Penguin',
  shiba: 'Shiba',
  beret: 'Beret',
  flower_crown: 'Flower crown',
  heartfall: 'Drifting hearts',
  campsite: 'Campsite',
  // Onsen & Earth — the cosy hot-spring set (coal-buddy / capybara direction).
  onsen_towel: 'Onsen towel',
  yuzu: 'Yuzu',
  otter: 'Otter',
  red_panda: 'Red panda',
  bamboo_grove: 'Bamboo grove',
  spring_stones: 'Spring stones',
  steam: 'Rising steam',
  tanuki: 'Tanuki',
  snow_monkey: 'Snow monkey',
  teahouse: 'Tea house',
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
  // BODY-shape forms (the `form` slot) — swap each creature's body for a DISTINCT alternate object.
  // Per-path: Vata air/ether OBJECTS (cloud / feather / leaf / constellation / dandelion /
  // whirlwind + the kept shooting-star meteor), Pitta fire OBJECTS (campfire / torch / comet / sun /
  // coals / lantern), Kapha still-life bodies (a huddle, a stone cairn, an orbiting atom).
  // (Kapha's `cairn` key labels the stone-stack body here, distinct from the mossy-boulder MOUNT,
  // whose own `boulder` key lives above in this global label map.)
  // Vata air/ether forms. `cloud` reuses the key already labelled above ("Cloud" — the cloud MOUNT);
  // the flat map is keyed by option name, so that label is shared and reads fine for the cloud form
  // too, needing no re-entry. The feather form is keyed `plume` (not `feather`/`feather_plume`, both
  // already labelled above as the drifting-feather MOUNT / feather-plume ACCESSORY) and the leaf form
  // `leaflet` (not `leaf`, already the "Leaf boat" MOUNT) — fresh keys so no existing label is
  // clobbered. `meteor` stays the kept shooting-star (keyed `meteor`, not `comet`, since `comet`
  // already labels the tier-4 "Radiant comet" MOUNT above).
  plume: 'Feather',
  leaflet: 'Leaf',
  constellation: 'Constellation',
  dandelion: 'Dandelion',
  whirlwind: 'Whirlwind',
  meteor: 'Meteor',
  // Pitta forms — each a DISTINCT fire OBJECT. `fireball` is labelled "Comet" (the comet concept),
  // keyed `fireball` to avoid the tier-4 "Radiant comet" MOUNT (`comet`). `sun` / `coals` reuse
  // those plain words as form keys (free in every other slot's option set).
  campfire: 'Campfire',
  torch: 'Torch',
  fireball: 'Comet',
  sun: 'Sunny',
  coals: 'Coals',
  lantern: 'Lantern',
  // A forked twin blaze.
  twin: 'Twin flame',
  cluster: 'Cluster',
  cairn: 'Cairn',
  orbital: 'Orbital',
  // Kapha form variants. `enso` + `prism` are new; `lotus` is shared (its existing "Lotus" fits).
  enso: 'Ensō',
  prism: 'Shard',
  // Newer Kapha forms — an organic seedling and a radial dharma wheel (the mandala-style form, keyed
  // `wheel` rather than `mandala` since `mandala` already labels the tier-4 "Sacred mandala" GROUND).
  sprout: 'Sprout',
  wheel: 'Dharma wheel',
}

// Tidy an unknown key into a label (e.g. "leaf_crown" → "Leaf crown") as a safe fallback.
export function titleize(key: string): string {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Localized at CALL time: known keys resolve from the i18n catalog (so the label follows the
// active locale); unknown keys keep the tidied-key fallback. Callers all sit under components
// that subscribe via useT(), so a locale switch re-renders them.
export const slotLabel = (slot: string) =>
  slot in SLOT_LABEL ? t(`spirit.slot.${slot}`) : titleize(slot)
export const optionLabel = (option: string) =>
  option in OPTION_LABEL ? t(`spirit.option.${option}`) : titleize(option)

// Path → dosha catalog key (Kapha / Pitta / Vata), so dosha copy localizes at the call site
// (mirrors the same map in SpiritPage / SpiritChoosePage).
const PATH_DOSHA_KEY: Record<SpiritPath, string> = {
  stillness: 'kapha',
  breath: 'pitta',
  heart: 'vata',
}

// A gentle, optional round-out hint for a given facet + creature (ADR-0032). Framed as an
// invitation ("would round things out"), never a demand: nourished suggests the dosha's balancing
// practice; rested suggests a calm rhythm; joyful suggests a little variety. Resolved from the
// i18n catalog at call time (rendered by CareNudge, which subscribes via useT).
export function roundOutHint(
  need: keyof SpiritState['needs'],
  path: SpiritPath | null,
): string {
  if (need === 'nourished') {
    const practice = path
      ? t(`spirit.dosha.${PATH_DOSHA_KEY[path]}.practice`)
      : t('spirit.nudge.yourPractice')
    return t('spirit.nudge.hint.nourished', { practice })
  }
  if (need === 'rested') return t('spirit.nudge.hint.rested')
  return t('spirit.nudge.hint.joyful')
}

// The three facets in display order, so the read-out + suggestion iterate consistently.
const NEED_ORDER: Array<keyof SpiritState['needs']> = ['nourished', 'rested', 'joyful']

/**
 * NeedsReadout — the three-facet recent-practice BALANCE (Nourishment / Rest / Joy) as labeled
 * 0–100 bars (ADR-0032 — informational, not debts). Each shows its facet label, current tier word,
 * and a fill bar for the level (the facet's 0..1 factor), tinted by tier. Visual-only. Reused by
 * the home summary + SpiritPage.
 */
export function NeedsReadout({ needs }: { needs: SpiritState['needs'] }) {
  const { t } = useT()
  return (
    <ul className="spirit-needs" aria-label={t('spirit.needs.aria')}>
      {NEED_ORDER.map((key) => {
        const need = needs[key]
        const copy = NEED_COPY[key]
        const NeedIconCmp = copy.icon
        const tier = TIER_COPY[need.tier]
        const label = t(copy.labelKey)
        const tierLabel = t(tier.labelKey)
        const pct = Math.round(need.factor * 100)
        return (
          <li key={key} className={`spirit-need spirit-need--${tier.tone}`}>
            <div className="spirit-need-head">
              <span className="spirit-need-icon" aria-hidden="true">
                <NeedIconCmp size={16} strokeWidth={1.75} />
              </span>
              <span className="spirit-need-label">{label}</span>
              <span className="spirit-need-tier">{tierLabel}</span>
            </div>
            <div
              className="spirit-need-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={t('spirit.needs.barAria', { label, pct, tier: tierLabel })}
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
 * CareNudge — at most ONE optional round-out suggestion (ADR-0032): the least-represented facet,
 * framed as a gentle invitation, and shown ONLY when the recent-practice balance is uneven
 * (roundOutFacet returns null on an even mix → renders nothing). Never a warning or a demand — the
 * companion is content regardless (that's Vitality); this is only "you could round this out, if you
 * like". Reused on the home + SpiritPage.
 */
export function CareNudge({
  needs,
  path,
}: {
  needs: SpiritState['needs']
  path: SpiritPath | null
}) {
  const { t } = useT()
  const key = roundOutFacet(needs)
  if (key === null) return null // the balance is even — no suggestion at all
  const creature = path
    ? t('spirit.nudge.creature', { name: t(`spirit.dosha.${PATH_DOSHA_KEY[path]}.name`) })
    : t('spirit.nudge.spark')
  const facet = t(NEED_COPY[key].labelKey).toLowerCase()
  return (
    <p className="spirit-care-nudge" role="status">
      {t('spirit.nudge.line', { creature, facet, hint: roundOutHint(key, path) })}
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
  // Kapha — earth: a fresh JADE-green ramp (mint-cream core → jade glow → emerald accent → deep
  // forest base). Grounded + growing, and clearly distinct from Pitta's fire. (Was a flat amber-gold,
  // which read as unattractive + doubled the `gold` cosmetic; users who want gold can still equip it.)
  stillness: { core: '#e9f7ee', glow: '#7fd3a3', accent: '#2fa56a', deep: '#1a6b45' },
  // Pitta — fire: a white-hot ember core (`core`), an orange flame body (`glow`), a searing
  // red-orange flame edge (`accent`), and a charred warm-dark base (`deep`) for its structural
  // parts (campfire logs, torch handle, lantern frame, coals). (Was a teal water-base, retired with
  // the old fire+water pool in the clean-flame redesign.)
  breath: { core: '#fff7ed', glow: '#fb923c', accent: '#ef4444', deep: '#7c2d12' },
  // Vata — air + ether: a luminous AMETHYST ramp (pale lavender core → soft violet glow → vivid
  // amethyst accent → deep purple base). Airy + ethereal. (Was a washed-out grey-mauve that read as
  // bland; this keeps the violet identity but far more vivid.)
  heart: { core: '#f6f0ff', glow: '#c9b0f5', accent: '#9061e8', deep: '#5b34ad' },
}

// COSMETIC RECOLOUR (the `palette` slot) — a body recolour applied IN PLACE of the dosha's default
// `PATH_PALETTE` (so the creature's own colours change, not a layer drawn around it). Each palette
// is a full 4-stop ramp (light `core` → bright `glow` → defining `accent` → `deep` base) matching
// PATH_PALETTE's shape, so any form renders legibly with it; tuned to read on the warm cream theme.
// Absent (no `palette` cosmetic) → the dosha keeps its default identity (a bare creature is
// pixel-identical to today). Keys MUST match the backend `palette` catalog options + PALETTE labels.
// Tuned so no two read alike — each palette owns a distinct HUE across the wheel (the old set doubled
// up: two near-identical teals, two muted mauves, a magenta crowding the pink). Warm→cool→purple→grey.
const PALETTES: Record<string, { core: string; glow: string; accent: string; deep: string }> = {
  ember: { core: '#fff1e6', glow: '#fb923c', accent: '#ef4444', deep: '#b91c1c' }, // red-orange (fire)
  rose: { core: '#fff0f4', glow: '#fb7185', accent: '#e11d48', deep: '#9f1239' }, // rose pink-red
  frost: { core: '#eaf6fd', glow: '#a5ddf5', accent: '#38bdf8', deep: '#0369a1' }, // icy CYAN/sky (was a teal ≈ aqua)
  sage: { core: '#f4f8e6', glow: '#bccb80', accent: '#7d9a2e', deep: '#4f6b16' }, // OLIVE/lime (was a muted green ≈ mint)
  gold: { core: '#fff8e6', glow: '#fcd34d', accent: '#f59e0b', deep: '#b45309' }, // amber/yellow
  dusk: { core: '#eeecfb', glow: '#bcb2f2', accent: '#7c6ce6', deep: '#4c3fb0' }, // INDIGO/lavender (was a mauve ≈ midnight)
  aqua: { core: '#e6fbf6', glow: '#5eead4', accent: '#14b8a6', deep: '#0f766e' }, // teal / turquoise
  coral: { core: '#fff1ea', glow: '#fdba74', accent: '#f97316', deep: '#c2410c' }, // orange (peach)
  mint: { core: '#e9fbef', glow: '#5fd98a', accent: '#22a94e', deep: '#15803d' }, // grass GREEN (was cyan-green ≈ aqua)
  ocean: { core: '#e8f1ff', glow: '#60a5fa', accent: '#3b82f6', deep: '#1e3a8a' }, // blue
  plum: { core: '#f4edfc', glow: '#cba6f5', accent: '#9333ea', deep: '#6b21a8' }, // VIOLET/purple (was a magenta ≈ blossom)
  blossom: { core: '#fff0f7', glow: '#f9a8d4', accent: '#ec4899', deep: '#9d174d' }, // pink
  slate: { core: '#eef2f6', glow: '#94a3b8', accent: '#64748b', deep: '#334155' }, // grey
  midnight: { core: '#f0ebef', glow: '#b89db0', accent: '#8d6a78', deep: '#4a3340' }, // dark aubergine (night)
}

// COSMETIC RESIZE (the `size` slot) — a uniform scale of the CREATURE BODY (+ its accessory),
// independent of the growth stage. Applied as an SVG transform on the creature group around the
// 80×80 viewBox centre, so the body shrinks/grows within its scene while the aura/habitat/etc. stay
// their normal size. Absent (no `size` cosmetic) → 1.0 (the stage's natural size, unchanged). Keys
// MUST match the backend `size` catalog options + SIZE labels. `giant` is dialled to 1.28 so the
// fullest radiant body stays clear of the 80×80 frame and an equipped accessory.
const SIZES: Record<string, number> = { tiny: 0.78, small: 0.9, large: 1.16, giant: 1.28 }

// ── Spirit-tailored cosmetics (harmonisation) ──────────────────────────────────────────────
// Worn / with-you cosmetics HARMONISE with the creature wearing them: they pick up the spirit's
// effective body palette (`pal` — the equipped `palette` cosmetic, else the dosha default from
// PATH_PALETTE) so a piece looks forged for THIS creature — a halo glows ember on a fire spirit,
// amber on an earth spirit, soft mauve on an air spirit. A pathless spark has no `pal`, so every
// cosmetic keeps its own default colours (pixel-identical to before harmonisation).

// A soft palette-matched bloom drawn BEHIND a cosmetic so it sits in the spirit's colour field
// rather than looking bolted on. Two stacked discs fake a gentle glow without an SVG filter; its
// opacity rides the daily-glow `g`. Null for a pathless spark (no palette → no bloom, unchanged).
function BelongingGlow({
  cx,
  cy,
  r,
  pal,
  g,
}: {
  cx: number
  cy: number
  r: number
  pal?: BodyPalette
  g: number
}) {
  if (!pal) return null
  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill={pal.glow} opacity={0.13 * g} />
      <circle cx={cx} cy={cy} r={r * 0.58} fill={pal.glow} opacity={0.16 * g} />
    </g>
  )
}

// A faint palette wash laid over a SCENE region (the habitat backdrop / the ground strip) so the
// whole scene reads in the spirit's colour field, not just the worn items. Rendered behind the
// creature at the call site. Null for a pathless spark (no palette → the scene is unchanged).
function SceneWash({
  pal,
  g,
  x,
  y,
  width,
  height,
  rx,
  strength,
}: {
  pal?: BodyPalette
  g: number
  x: number
  y: number
  width: number
  height: number
  rx: number
  strength: number
}) {
  if (!pal) return null
  return <rect x={x} y={y} width={width} height={height} rx={rx} fill={pal.glow} opacity={strength * g} />
}

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
  // Starlit reads as NIGHT: a dusk-violet halo (the old '#c39fcc' was the retired Vata mauve —
  // it read muddy/bland on every creature) with real sparkle-stars + a crescent in the decor.
  starlit: { tint: '#8d82d6', grow: 8, strength: 2.8 },
  ember: { tint: '#f97316', grow: 6, strength: 2.6 },
  frost: { tint: '#7dd3fc', grow: 6, strength: 2.4 },
  rose: { tint: '#fda4af', grow: 5, strength: 2.2 },
  // Universal additions: a soft green dew glow (tier 1), a deep-purple dusk glow (tier 2), and a
  // shimmering multi-hue aurora ribbon (the universal tier-3 crown). Each layers its own
  // procedural decor over this base glow (cases below).
  dewlight: { tint: '#86efac', grow: 5, strength: 2.2 },
  twilight: { tint: '#a78bfa', grow: 7, strength: 2.8 },
  aurora: { tint: '#5eead4', grow: 9, strength: 3.2 },
  // COOL/EDGY additions (universal tier-2): an electric neon glow + a moody shadow glow. Each layers
  // its own decor over the base glow (cases below).
  neon: { tint: '#22d3ee', grow: 7, strength: 3.0 },
  shadow: { tint: '#6d28d9', grow: 7, strength: 2.6 },
  // LEGENDARY (tier 4) — the prismatic halo: the widest, brightest aura, a full rainbow radiant
  // ring layered over this base glow (case below).
  prismatic: { tint: '#fef9c3', grow: 12, strength: 3.6 },
  // Path-exclusive auras: warm ember halo for Pitta, verdant grove for Kapha, airy zephyr for
  // Vata. Each layers its own procedural motes/leaves/wisps over this base glow (cases below).
  emberflame: { tint: '#ea580c', grow: 9, strength: 3.0 },
  grove: { tint: '#10b981', grow: 9, strength: 2.8 },
  zephyr: { tint: '#e0f2fe', grow: 9, strength: 2.6 },
  // Path-exclusive tier-2 auras — earlier, slightly smaller per-path glows (each layers its own
  // procedural decor over this base glow in the cases below): drifting cinders (Pitta), a dew-ring
  // (Kapha), a petal breeze (Vata).
  cinders: { tint: '#f97316', grow: 7, strength: 2.7 },
  dewfall: { tint: '#5eead4', grow: 7, strength: 2.4 },
  petalwind: { tint: '#c4b5fd', grow: 7, strength: 2.5 },
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
      <circle cx={40} cy={40} r={r - 8} fill={fill} opacity={Math.min(0.7, 0.26 * g * strength)} />
      {/* A thin rim at the halo's edge — the aura reads as a deliberate ring of the spirit's
          colour (accent for the bare path glow, the cosmetic's tint when one is applied) rather
          than a smudge fading into the page. Opacity rides the daily glow like the discs. */}
      <circle
        cx={40}
        cy={40}
        r={r - 1.5}
        fill="none"
        stroke={style ? style.tint : pal.accent}
        strokeWidth={1}
        opacity={0.32 * g}
      />
      {/* Neon aura — an electric cyan glow with a magenta rim + spark ticks radiating off the ring. */}
      {aura === 'neon' && (
        <>
          <circle cx={40} cy={40} r={r - 1.5} fill="none" stroke="#e879f9" strokeWidth={0.8} opacity={0.6 * g} />
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2
            return (
              <line
                key={`nz-${k}`}
                x1={40 + Math.cos(a) * (r - 3)}
                y1={40 + Math.sin(a) * (r - 3)}
                x2={40 + Math.cos(a) * (r + 1.5)}
                y2={40 + Math.sin(a) * (r + 1.5)}
                stroke={k % 2 ? '#22d3ee' : '#e879f9'}
                strokeWidth={0.7}
                strokeLinecap="round"
                opacity={0.7 * g}
              />
            )
          })}
        </>
      )}
      {/* Shadow aura — a dark violet core with a few smoky tendrils curling up (moody / edgy). */}
      {aura === 'shadow' && (
        <>
          <circle cx={40} cy={41} r={r - 10} fill="#1e1b3a" opacity={Math.min(0.42, 0.13 * g * strength)} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = (k / 5) * Math.PI * 2 - Math.PI / 2
            const x = 40 + Math.cos(a) * (r - 2)
            const y = 40 + Math.sin(a) * (r - 2)
            return (
              <path
                key={`sh-${k}`}
                d={`M ${x} ${y} q ${Math.cos(a) * 2} -3 0 -5`}
                fill="none"
                stroke="#6d28d9"
                strokeWidth={1}
                strokeLinecap="round"
                opacity={0.5 * g}
              />
            )
          })}
        </>
      )}
      {/* Starlit — a real NIGHT halo: a deeper indigo inner wash, five proper four-point sparkle
          stars around the ring (not faint dots), and a small crescent moon high in the halo. */}
      {aura === 'starlit' && (
        <>
          <circle cx={40} cy={40} r={r - 9} fill="#4c4390" opacity={Math.min(0.4, 0.12 * g * strength)} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = (k / 5) * Math.PI * 2 + 0.55
            const sx = 40 + Math.cos(a) * (r - 4)
            const sy = 40 + Math.sin(a) * (r - 4)
            const s = k % 2 ? 2.1 : 1.5
            return (
              <path
                key={`star-${k}`}
                d={`M ${sx} ${sy - s} Q ${sx + s * 0.22} ${sy - s * 0.22} ${sx + s} ${sy} Q ${sx + s * 0.22} ${sy + s * 0.22} ${sx} ${sy + s} Q ${sx - s * 0.22} ${sy + s * 0.22} ${sx - s} ${sy} Q ${sx - s * 0.22} ${sy - s * 0.22} ${sx} ${sy - s} Z`}
                fill={k % 2 ? '#fef9c3' : '#ffffff'}
                opacity={0.95 * g}
              />
            )
          })}
          {/* A small crescent moon high in the halo — one path (outer + inner curve), since the
              layered translucent washes rule out the bitten-circle trick (no masks in this file). */}
          {(() => {
            const mx = 40 + (r - 6) * 0.5
            const my = 40 - (r - 6) * 0.82
            return (
              <path
                d={`M ${mx} ${my - 2.6} Q ${mx - 3.6} ${my} ${mx} ${my + 2.6} Q ${mx - 1.5} ${my} ${mx} ${my - 2.6} Z`}
                fill="#fef3c7"
                opacity={0.95 * g}
              />
            )
          })()}
        </>
      )}
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
                {/* Sized up from r1.4/1.0 — the old droplets vanished at card size. */}
                <circle cx={dx} cy={dy} r={k % 2 ? 1.9 : 1.4} fill="#4ade80" opacity={0.8 * g} />
                <circle cx={dx - 0.5} cy={dy - 0.6} r={0.55} fill="#f0fdf4" opacity={0.9 * g} />
              </g>
            )
          })}
        </>
      )}
      {/* Twilight (tier 2, universal) — a warm dusk glow: a deep plum-rose wash bleeding out beyond
          a warmer inner core, with a scatter of faint golden first-stars high in the halo where the
          dusk is deepest. */}
      {aura === 'twilight' && (
        <>
          {/* Softened from the old near-black plum: dusk, not a dark hole on the warm page. */}
          <circle cx={40} cy={40} r={r + 2} fill="#6b4a63" opacity={Math.min(0.26, 0.07 * g * strength)} />
          <circle cx={40} cy={41} r={r - 10} fill="#a887a0" opacity={Math.min(0.45, 0.14 * g * strength)} />
          {/* The warm last-light band low on the halo — the sunset horizon under the first stars. */}
          <ellipse cx={40} cy={40 + r - 8} rx={r * 0.62} ry={3.4} fill="#f2a65e" opacity={Math.min(0.4, 0.13 * g * strength)} />
          <ellipse cx={40} cy={40 + r - 7.4} rx={r * 0.4} ry={1.8} fill="#fbd38d" opacity={Math.min(0.45, 0.15 * g * strength)} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = -Math.PI / 2 + (k - 2) * 0.5
            return (
              <circle
                key={`dusk-star-${k}`}
                cx={40 + Math.cos(a) * (r - 3)}
                cy={40 + Math.sin(a) * (r - 3)}
                r={k % 2 ? 0.9 : 0.6}
                fill={k % 2 ? '#fdf3e0' : '#e3a83c'}
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
          {/* One violet outer ring frames the halo (was 7 nested rings — they read as a dartboard,
              not radiance)… */}
          <circle
            cx={40}
            cy={40}
            r={r}
            fill="none"
            stroke="#c084fc"
            strokeWidth={1.2}
            opacity={Math.min(0.7, 0.3 * g)}
          />
          {/* …with the spectrum as RAYS: sixteen hue-cycled shafts of light radiating through the
              rim, alternating long/short like a sunburst. */}
          {Array.from({ length: 16 }, (_, k) => {
            const a = (k / 16) * Math.PI * 2 - Math.PI / 2
            const hues = ['#f87171', '#fb923c', '#fde047', '#4ade80', '#38bdf8', '#818cf8', '#c084fc', '#f472b6']
            const inner = r - (k % 2 ? 4 : 6.5)
            const outer = r + (k % 2 ? 1.5 : 3.5)
            return (
              <line
                key={`prism-ray-${k}`}
                x1={40 + Math.cos(a) * inner}
                y1={40 + Math.sin(a) * inner}
                x2={40 + Math.cos(a) * outer}
                y2={40 + Math.sin(a) * outer}
                stroke={hues[k % 8]}
                strokeWidth={k % 2 ? 0.9 : 1.4}
                strokeLinecap="round"
                opacity={Math.min(0.85, 0.34 * g)}
              />
            )
          })}
          {/* A soft triple rainbow arc over the crown of the halo. */}
          {['#f87171', '#fde047', '#38bdf8'].map((hue, k) => {
            const rr = r - 3 - k * 2
            return (
              <path
                key={`prism-arc-${k}`}
                d={`M ${40 - rr * 0.77} ${40 - rr * 0.64} A ${rr} ${rr} 0 0 1 ${40 + rr * 0.77} ${40 - rr * 0.64}`}
                fill="none"
                stroke={hue}
                strokeWidth={1.6 - k * 0.3}
                strokeLinecap="round"
                opacity={Math.min(0.7, 0.28 * g)}
              />
            )
          })}
          {Array.from({ length: 10 }, (_, k) => {
            const a = (k / 10) * Math.PI * 2 + 0.25
            const hues = ['#fef08a', '#fca5a5', '#d8b9d2', '#86efac', '#f0abfc']
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
          // Real flame-licks around the ring (the tier-3 capstone must clearly out-blaze the
          // tier-2 cinders' plain ember dots): each an upward teardrop flame — fire rises, so
          // every lick points up regardless of where it sits on the circle — with cream sparks
          // lifting off the alternates.
          const a = (k / 8) * Math.PI * 2 - Math.PI / 2
          const fx = 40 + Math.cos(a) * (r - 2)
          const fy = 40 + Math.sin(a) * (r - 2) - Math.sin(a) * 2
          const s = k % 2 ? 2.6 : 1.9
          return (
            <g key={`ember-${k}`}>
              <path
                d={`M ${fx} ${fy + s} Q ${fx - s * 0.75} ${fy}, ${fx} ${fy - s * 1.7} Q ${fx + s * 0.75} ${fy}, ${fx} ${fy + s} Z`}
                fill={k % 3 ? '#fbbf24' : '#f97316'}
                opacity={0.9 * g}
              />
              <path
                d={`M ${fx} ${fy + s * 0.6} Q ${fx - s * 0.35} ${fy}, ${fx} ${fy - s * 0.9} Q ${fx + s * 0.35} ${fy}, ${fx} ${fy + s * 0.6} Z`}
                fill="#fef3c7"
                opacity={0.8 * g}
              />
              {k % 2 === 0 && (
                <circle
                  cx={fx + 1}
                  cy={fy - s * 2.2}
                  r={0.7}
                  fill="#fff7ed"
                  opacity={0.75 * g}
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
          {/* A fuller leaf-ring than before (the old 1.1×2.4 leaves vanished at card size, leaving
              grove ≈ dewfall): nine bigger two-tone leaves, each with a pale vein. */}
          {Array.from({ length: 9 }, (_, k) => {
            const a = (k / 9) * Math.PI * 2
            const lx = 40 + Math.cos(a) * (r - 1)
            const ly = 40 + Math.sin(a) * (r - 1)
            const deg = (a * 180) / Math.PI + 90
            return (
              <g key={`leaf-${k}`} transform={`rotate(${deg} ${lx} ${ly})`}>
                <ellipse
                  cx={lx}
                  cy={ly}
                  rx={1.6}
                  ry={k % 2 ? 3.4 : 2.7}
                  fill={k % 3 === 0 ? '#059669' : k % 2 ? '#34d399' : '#10b981'}
                  opacity={0.85 * g}
                />
                <path
                  d={`M ${lx} ${ly - (k % 2 ? 2.6 : 2)} L ${lx} ${ly + (k % 2 ? 2.6 : 2)}`}
                  stroke="#d1fae5"
                  strokeWidth={0.35}
                  opacity={0.7 * g}
                />
              </g>
            )
          })}
          {/* A few warm fireflies drifting in the upper canopy — the living light dewfall lacks. */}
          {([[-0.5, -0.8], [0.35, -0.55], [-0.1, -1.05]] as const).map(([tx, ty], k) => (
            <g key={`gfly-${k}`}>
              <circle cx={40 + tx * (r - 7)} cy={40 + ty * (r - 9)} r={1.7} fill="#fde68a" opacity={0.3 * g} />
              <circle cx={40 + tx * (r - 7)} cy={40 + ty * (r - 9)} r={0.75} fill="#fbbf24" opacity={0.9 * g} />
            </g>
          ))}
        </>
      )}
      {/* PATH-EXCLUSIVE: Zephyr (Vata) — wispy white-blue swirls of air: three thin curved arcs
          sweeping around the glow like a breeze, with a couple of faint motes carried on the wind. */}
      {aura === 'zephyr' && (
        <>
          {/* Each swirl is drawn twice — a wide white body with a sky-blue core — so the breeze
              reads on the pale amethyst creature and the cream page alike (the old thin pale arcs
              were nearly invisible, leaving zephyr ≈ petalwind). */}
          {Array.from({ length: 3 }, (_, k) => {
            const a0 = (k / 3) * Math.PI * 2
            const rr = r - 1 - k * 2
            const x0 = 40 + Math.cos(a0) * rr
            const y0 = 40 + Math.sin(a0) * rr
            const x1 = 40 + Math.cos(a0 + 1.6) * rr
            const y1 = 40 + Math.sin(a0 + 1.6) * rr
            const cx = 40 + Math.cos(a0 + 0.8) * (rr + 5)
            const cy = 40 + Math.sin(a0 + 0.8) * (rr + 5)
            return (
              <g key={`wisp-${k}`}>
                <path
                  d={`M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  opacity={0.9 * g}
                />
                <path
                  d={`M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`}
                  fill="none"
                  stroke="#7dd3fc"
                  strokeWidth={1}
                  strokeLinecap="round"
                  opacity={0.85 * g}
                />
              </g>
            )
          })}
          {/* Motes carried on the wind, sky-tinted and big enough to read. */}
          {Array.from({ length: 4 }, (_, k) => {
            const a = (k / 4) * Math.PI * 2 + 0.5
            return (
              <circle
                key={`breeze-${k}`}
                cx={40 + Math.cos(a) * (r + 1)}
                cy={40 + Math.sin(a) * (r + 1)}
                r={k % 2 ? 1.2 : 0.9}
                fill={k % 2 ? '#bae6fd' : '#38bdf8'}
                opacity={0.8 * g}
              />
            )
          })}
        </>
      )}
      {/* PATH-EXCLUSIVE tier-2: Cinders (Pitta) — a scatter of small drifting embers around the
          glow, rising a touch (the fire's breath); lighter than the emberflame capstone. */}
      {aura === 'cinders' &&
        Array.from({ length: 10 }, (_, k) => {
          const a = (k / 10) * Math.PI * 2
          const rr = r - 2 + (k % 3) * 2
          const rise = -Math.abs(Math.sin(a)) * 2
          return (
            <circle
              key={`cinder-${k}`}
              cx={40 + Math.cos(a) * rr}
              cy={40 + Math.sin(a) * rr + rise}
              r={k % 3 === 0 ? 1.3 : 0.8}
              fill={k % 2 ? '#fb923c' : '#f97316'}
              opacity={0.8 * g}
            />
          )
        })}
      {/* PATH-EXCLUSIVE tier-2: Dewfall (Kapha) — a soft ring hung with dew droplets, each with a
          tiny highlight; grounded and calm, the earlier companion to the grove capstone. */}
      {aura === 'dewfall' && (
        <>
          <circle cx={40} cy={40} r={r - 2} fill="none" stroke="#5eead4" strokeWidth={1} opacity={0.28 * g} />
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2
            const dx = 40 + Math.cos(a) * (r - 1)
            const dy = 40 + Math.sin(a) * (r - 1)
            return (
              <g key={`dew-${k}`}>
                <circle cx={dx} cy={dy} r={k % 2 ? 1.5 : 1.1} fill={k % 2 ? '#99f6e4' : '#5eead4'} opacity={0.85 * g} />
                <circle cx={dx - 0.4} cy={dy - 0.4} r={0.4} fill="#f0fdfa" opacity={0.9 * g} />
              </g>
            )
          })}
        </>
      )}
      {/* PATH-EXCLUSIVE tier-2: Petal breeze (Vata) — soft petals drifting on the air around the
          glow; the earlier, gentler companion to the zephyr capstone. */}
      {aura === 'petalwind' &&
        Array.from({ length: 7 }, (_, k) => {
          const a = (k / 7) * Math.PI * 2
          const rr = r - 1
          const px = 40 + Math.cos(a) * rr
          const py = 40 + Math.sin(a) * rr
          const deg = (a * 180) / Math.PI + 40
          return (
            <ellipse
              key={`petal-${k}`}
              cx={px}
              cy={py}
              rx={2}
              ry={1}
              fill={k % 2 ? '#ddd6fe' : '#c4b5fd'}
              opacity={0.8 * g}
              transform={`rotate(${deg} ${px} ${py})`}
            />
          )
        })}
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
    // A deep blue night sky (richer than the old grey wash), darker overhead, with varied stars, a
    // couple of sparkle-twinkles, and a glowing moon with faint craters. Stars hug the edges, clear
    // of the centred figure.
    const stars: [number, number, number][] = [
      [14, 14, 1.3], [24, 9, 0.8], [40, 8, 0.7], [50, 12, 0.6], [10, 30, 0.9], [72, 40, 1.2],
      [16, 52, 0.8], [69, 56, 0.9], [27, 61, 0.7], [56, 63, 0.9], [8, 44, 0.7], [46, 60, 0.6],
    ]
    return (
      <g opacity={g} aria-hidden="true">
        {/* Deep night-blue panel, darker at the top for sky depth. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#243357" opacity={0.66} />
        <rect x={4} y={6} width={72} height={32} rx={10} fill="#131e40" opacity={0.55} />
        {/* Stars of varied size. */}
        {stars.map(([x, y, r], k) => (
          <circle key={k} cx={x} cy={y} r={r} fill="#fdf6e3" opacity={0.92} />
        ))}
        {/* A couple of bright sparkle-twinkles. */}
        {[[20, 20], [64, 47]].map(([x, y], k) => (
          <g key={`tw-${k}`}>
            <circle cx={x} cy={y} r={0.6} fill="#ffffff" />
            <line x1={x - 2.2} y1={y} x2={x + 2.2} y2={y} stroke="#ffffff" strokeWidth={0.35} opacity={0.65} />
            <line x1={x} y1={y - 2.2} x2={x} y2={y + 2.2} stroke="#ffffff" strokeWidth={0.35} opacity={0.65} />
          </g>
        ))}
        {/* A glowing moon with faint craters, top-right. */}
        <circle cx={64} cy={15} r={9} fill="#fde68a" opacity={0.2} />
        <circle cx={64} cy={15} r={5.2} fill="#fdf0c8" />
        <circle cx={62.4} cy={13.4} r={1.1} fill="#e8d7a4" opacity={0.6} />
        <circle cx={65.6} cy={16.4} r={0.8} fill="#e8d7a4" opacity={0.5} />
        <circle cx={62.8} cy={17} r={0.6} fill="#e8d7a4" opacity={0.5} />
      </g>
    )
  }
  if (habitat === 'storm_peak') {
    // A brooding storm over dark mountain peaks — heavy clouds, side rain, a forked lightning bolt.
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#3f4756" opacity={0.62} />
        <rect x={4} y={6} width={72} height={30} rx={10} fill="#262b38" opacity={0.55} />
        {/* Storm clouds along the top. */}
        {([[18, 15, 9], [40, 11, 11], [62, 16, 9]] as const).map(([cx, cy, r], k) => (
          <ellipse key={`cl-${k}`} cx={cx} cy={cy} rx={r} ry={r * 0.58} fill="#1e2230" opacity={0.55} />
        ))}
        {/* Mountain-peak silhouette behind the figure. */}
        <path d="M 4 61 L 19 41 L 29 52 L 44 33 L 58 53 L 70 43 L 76 61 Z" fill="#191d25" opacity={0.82} />
        <path d="M 44 33 L 48 39 L 44 41 L 40 39 Z" fill="#cbd5e1" opacity={0.35} />
        {/* Rain streaks (kept to the side columns, clear of the centred figure). */}
        {Array.from({ length: 12 }, (_, k) => {
          const left = k < 6
          const x = left ? 8 + k * 3.4 : 56 + (k - 6) * 3.4
          const y = 18 + ((k * 11) % 22)
          return <line key={`rn-${k}`} x1={x} y1={y} x2={x - 2.4} y2={y + 7} stroke="#93a7c4" strokeWidth={0.5} opacity={0.4} />
        })}
        {/* Forked lightning. */}
        <path d="M 60 17 L 56 29 L 60 29 L 53 44" fill="none" stroke="#fde68a" strokeWidth={1} strokeLinecap="round" opacity={0.9} />
        <path d="M 60 17 L 56 29 L 60 29 L 53 44" fill="none" stroke="#fffef0" strokeWidth={0.4} strokeLinecap="round" opacity={0.9} />
      </g>
    )
  }
  if (habitat === 'neon_city') {
    // A cyberpunk skyline at night — dark towers with glowing neon windows over a purple horizon haze.
    const bld: [number, number, number, number][] = [
      [6, 44, 9, 26], [16, 37, 8, 33], [24, 50, 6, 20], [50, 50, 7, 20], [58, 35, 9, 35], [68, 44, 8, 26],
    ]
    const neon = ['#22d3ee', '#e879f9', '#f472b6', '#38bdf8']
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#191533" opacity={0.68} />
        <rect x={4} y={40} width={72} height={34} rx={10} fill="#241a44" opacity={0.5} />
        {/* Neon horizon haze. */}
        <ellipse cx={40} cy={62} rx={34} ry={8} fill="#7c3aed" opacity={0.3} />
        {/* Far stars. */}
        {([[12, 14], [68, 12], [40, 9]] as const).map(([x, y], k) => (
          <circle key={`st-${k}`} cx={x} cy={y} r={0.7} fill="#c4b5fd" opacity={0.7} />
        ))}
        {/* Towers with lit neon windows. */}
        {bld.map(([x, y, w, h], k) => (
          <g key={`b-${k}`}>
            <rect x={x} y={y} width={w} height={h} rx={0.5} fill="#0e0b22" opacity={0.92} />
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={x + 1.4 + (i % 2) * (w - 3.4)} y={y + 3 + Math.floor(i / 2) * 5} width={1.5} height={1.5} fill={neon[(k + i) % 4]} opacity={0.85} />
            ))}
          </g>
        ))}
        {/* Vertical + horizontal neon signs. */}
        <rect x={19} y={29} width={4.5} height={1.8} rx={0.5} fill="#e879f9" opacity={0.85} />
        <rect x={60} y={26} width={1.8} height={6} rx={0.5} fill="#22d3ee" opacity={0.85} />
      </g>
    )
  }
  if (habitat === 'volcano') {
    // Dark volcanic peaks with glowing lava crowns + streaks, a red horizon glow, and rising embers.
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#2b2230" opacity={0.62} />
        <rect x={4} y={44} width={72} height={30} rx={10} fill="#5a2418" opacity={0.42} />
        {/* Molten horizon glow. */}
        <ellipse cx={40} cy={61} rx={36} ry={10} fill="#ef4444" opacity={0.26} />
        {/* Two volcanoes on the sides — the figure sits in the valley between. */}
        {([{ x: 16, h: 27, w: 24 }, { x: 65, h: 22, w: 20 }] as const).map((v, k) => (
          <g key={`v-${k}`}>
            <path d={`M ${v.x - v.w / 2} 62 L ${v.x} ${62 - v.h} L ${v.x + v.w / 2} 62 Z`} fill="#191216" opacity={0.9} />
            <ellipse cx={v.x} cy={62 - v.h + 1} rx={3.2} ry={1.3} fill="#fb923c" opacity={0.95} />
            <ellipse cx={v.x} cy={62 - v.h + 1} rx={1.6} ry={0.7} fill="#fde68a" opacity={0.9} />
            <path d={`M ${v.x - 1.5} ${62 - v.h + 1} L ${v.x - 3} ${62 - v.h * 0.5} L ${v.x - 1.5} 60`} fill="none" stroke="#ef4444" strokeWidth={0.8} strokeLinecap="round" opacity={0.7} />
          </g>
        ))}
        {/* Rising embers. */}
        {Array.from({ length: 9 }, (_, k) => {
          const x = 12 + ((k * 9.4) % 58)
          return <circle key={`em-${k}`} cx={x} cy={28 + ((k * 17) % 26)} r={0.7} fill="#fb923c" opacity={0.55} />
        })}
      </g>
    )
  }
  if (habitat === 'cosmic_void') {
    // Deep space — a dense starfield, soft nebula clouds, a distant ringed planet + a little moon.
    const stars: [number, number, number][] = [
      [10, 12, 0.8], [22, 8, 0.6], [34, 14, 0.7], [46, 9, 0.6], [58, 13, 0.7], [70, 10, 0.8],
      [8, 30, 0.7], [72, 34, 0.9], [14, 48, 0.6], [68, 52, 0.8], [26, 60, 0.7], [52, 62, 0.6],
      [40, 30, 0.5], [30, 40, 0.6], [50, 44, 0.5],
    ]
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#0b1026" opacity={0.74} />
        {/* Nebula clouds. */}
        <ellipse cx={30} cy={30} rx={28} ry={12} fill="#6d28d9" opacity={0.18} transform="rotate(-20 30 30)" />
        <ellipse cx={52} cy={50} rx={22} ry={9} fill="#2563eb" opacity={0.16} transform="rotate(-20 52 50)" />
        {/* Starfield. */}
        {stars.map(([x, y, r], k) => (
          <circle key={`s-${k}`} cx={x} cy={y} r={r} fill="#e0e7ff" opacity={0.9} />
        ))}
        {/* Sparkle twinkles. */}
        {([[18, 20], [64, 42]] as const).map(([x, y], k) => (
          <g key={`sp-${k}`}>
            <circle cx={x} cy={y} r={0.6} fill="#ffffff" />
            <line x1={x - 2} y1={y} x2={x + 2} y2={y} stroke="#ffffff" strokeWidth={0.3} opacity={0.6} />
            <line x1={x} y1={y - 2} x2={x} y2={y + 2} stroke="#ffffff" strokeWidth={0.3} opacity={0.6} />
          </g>
        ))}
        {/* A distant ringed planet, top-right. */}
        <circle cx={64} cy={16} r={6} fill="#c084fc" opacity={0.85} />
        <circle cx={62} cy={14} r={2} fill="#ddd6fe" opacity={0.5} />
        <ellipse cx={64} cy={16} rx={10} ry={2.6} fill="none" stroke="#e9d5ff" strokeWidth={0.9} opacity={0.7} transform="rotate(-18 64 16)" />
        {/* A little moon, lower-left. */}
        <circle cx={13} cy={58} r={3} fill="#94a3b8" opacity={0.75} />
        <circle cx={12} cy={57} r={0.9} fill="#64748b" opacity={0.6} />
      </g>
    )
  }
  if (habitat === 'dojo') {
    // A wooden training dojo — a paper shoji screen wall, a rising-sun banner, a tatami floor.
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#d9b382" opacity={0.5} />
        {/* Shoji screen (paper panel + wood grid) across the upper wall. */}
        <rect x={8} y={12} width={64} height={30} rx={2} fill="#f5efe0" opacity={0.55} />
        {[20, 32, 48, 60].map((x, k) => (
          <line key={`v-${k}`} x1={x} y1={12} x2={x} y2={42} stroke="#a1794b" strokeWidth={0.6} opacity={0.5} />
        ))}
        {[22, 32].map((y, k) => (
          <line key={`h-${k}`} x1={8} y1={y} x2={72} y2={y} stroke="#a1794b" strokeWidth={0.6} opacity={0.5} />
        ))}
        {/* A rising-sun banner hung centre-top (the kamiza alcove), high above the figure. */}
        <rect x={35} y={9} width={10} height={13} rx={1} fill="#f8f4ea" opacity={0.72} />
        <circle cx={40} cy={15} r={3} fill="#dc2626" opacity={0.75} />
        {/* Tatami floor. */}
        <rect x={6} y={58} width={68} height={16} rx={4} fill="#c79a63" opacity={0.6} />
        {[18, 30, 50, 62].map((x, k) => (
          <line key={`t-${k}`} x1={x} y1={58} x2={x} y2={74} stroke="#8a6a3e" strokeWidth={0.5} opacity={0.5} />
        ))}
        <line x1={6} y1={64} x2={74} y2={64} stroke="#8a6a3e" strokeWidth={0.5} opacity={0.5} />
      </g>
    )
  }
  if (habitat === 'zen_garden') {
    // A raked zen garden — pale sand combed into curved lines, a few dark stones with ripple rings.
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#ece3cf" opacity={0.5} />
        <rect x={6} y={46} width={68} height={28} rx={6} fill="#ded2b6" opacity={0.6} />
        {[52, 58, 64, 70].map((y, k) => (
          <path key={`rk-${k}`} d={`M 8 ${y} Q 40 ${y - 4} 72 ${y}`} fill="none" stroke="#c3b389" strokeWidth={0.6} opacity={0.6} />
        ))}
        {([[14, 60, 4, 2.4], [66, 58, 5, 3], [24, 67, 3, 1.8]] as const).map(([x, y, rx, ry], k) => (
          <ellipse key={`stn-${k}`} cx={x} cy={y} rx={rx} ry={ry} fill="#6b7280" opacity={0.7} />
        ))}
        <ellipse cx={66} cy={58} rx={9} ry={4} fill="none" stroke="#c3b389" strokeWidth={0.5} opacity={0.5} />
      </g>
    )
  }
  if (habitat === 'sakura') {
    // A cherry-blossom scene — a blossom branch arcing over the top with drifting petals.
    const clusters: [number, number][] = [[10, 13], [22, 10], [34, 13], [46, 15], [58, 17], [68, 19], [28, 7], [52, 20]]
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#fce7f3" opacity={0.5} />
        <path d="M 4 14 Q 30 8 54 18 T 76 20" fill="none" stroke="#7c4a2d" strokeWidth={1.4} opacity={0.55} />
        {clusters.map(([x, y], k) => (
          <g key={`bl-${k}`}>
            {([[0, 0], [2, -1], [-2, -1], [1, 2], [-1, 2]] as const).map(([dx, dy], i) => (
              <circle key={i} cx={x + dx} cy={y + dy} r={1.3} fill={i === 0 ? '#f9a8d4' : '#fbcfe8'} opacity={0.85} />
            ))}
            <circle cx={x} cy={y} r={0.6} fill="#fde68a" opacity={0.8} />
          </g>
        ))}
        {([[16, 34], [62, 40], [28, 52], [56, 56], [40, 46]] as const).map(([x, y], k) => (
          <ellipse key={`pt-${k}`} cx={x} cy={y} rx={1.4} ry={0.8} fill="#f9a8d4" opacity={0.55} transform={`rotate(${k * 40} ${x} ${y})`} />
        ))}
      </g>
    )
  }
  if (habitat === 'arcade') {
    // A retro arcade — a dark room, a neon marquee, glowing cabinets on the sides, a checker floor.
    const cab: [number, number, number, number][] = [[8, 40, 10, 30], [19, 44, 9, 26], [52, 44, 9, 26], [63, 40, 10, 30]]
    const neon = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15']
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#160f2e" opacity={0.7} />
        {/* Checker floor. */}
        {Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? <rect key={`fl-${i}`} x={6 + i * 8.6} y={68} width={8.6} height={6} fill="#2a1f52" opacity={0.5} /> : null))}
        {/* Neon marquee. */}
        <rect x={28} y={12} width={24} height={6} rx={1.5} fill="none" stroke="#f472b6" strokeWidth={1} opacity={0.8} />
        <rect x={31} y={14} width={2} height={2} fill="#22d3ee" opacity={0.9} />
        <rect x={46} y={14} width={2} height={2} fill="#facc15" opacity={0.9} />
        {/* Arcade cabinets with glowing screens. */}
        {cab.map(([x, y, w, h], k) => (
          <g key={`cab-${k}`}>
            <rect x={x} y={y} width={w} height={h} rx={1} fill="#0e0a20" opacity={0.9} />
            <rect x={x + 1.5} y={y + 3} width={w - 3} height={6} rx={0.6} fill={neon[k % 4]} opacity={0.7} />
            <rect x={x + 2} y={y + 11} width={w - 4} height={2} rx={0.5} fill={neon[(k + 1) % 4]} opacity={0.6} />
          </g>
        ))}
      </g>
    )
  }
  if (habitat === 'underwater') {
    // Underwater depths — light rays from above, rising bubbles, kelp + fish silhouettes below.
    return (
      <g opacity={g} aria-hidden="true">
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#1e5b8a" opacity={0.5} />
        <rect x={4} y={44} width={72} height={30} rx={10} fill="#0e3a5c" opacity={0.5} />
        {[18, 34, 50].map((x, k) => (
          <path key={`ray-${k}`} d={`M ${x} 6 L ${x - 4} 42 L ${x + 6} 42 Z`} fill="#bae6fd" opacity={0.12} />
        ))}
        {([[12, 30, 1.4], [16, 22, 0.9], [66, 36, 1.6], [62, 26, 1], [70, 48, 1.2], [10, 50, 0.8]] as const).map(([x, y, r], k) => (
          <circle key={`bub-${k}`} cx={x} cy={y} r={r} fill="#e0f2fe" opacity={0.4} />
        ))}
        {[10, 20, 60, 70].map((x, k) => (
          <path key={`kelp-${k}`} d={`M ${x} 74 q ${k % 2 ? 3 : -3} -8 0 -16`} fill="none" stroke="#15803d" strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
        ))}
        {([[62, 56], [16, 60]] as const).map(([x, y], k) => (
          <g key={`fish-${k}`} opacity={0.5}>
            <ellipse cx={x} cy={y} rx={2.4} ry={1.3} fill="#0c4a6e" />
            <path d={`M ${x + (k ? 2 : -2)} ${y} l ${k ? 2 : -2} -1.4 l 0 2.8 Z`} fill="#0c4a6e" />
          </g>
        ))}
      </g>
    )
  }
  if (habitat === 'hot_spring') {
    // A cosy onsen at warm dusk — a steaming stone soaking pool, rising steam wisps on the sides,
    // back rocks, a glowing paper lantern in the corner, and a couple of yuzu floating on the water
    // (the capybara's favourite spot). Kept clear of the centred figure.
    return (
      <g opacity={g} aria-hidden="true">
        {/* Warm dusk sky wash. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#f6d6bf" opacity={0.5} />
        <rect x={4} y={6} width={72} height={26} rx={10} fill="#f2b89a" opacity={0.3} />
        {/* A glowing paper lantern hung in the top-right, off the figure's centre. */}
        <path d="M 66 6 l 0 5" stroke="#7c5a44" strokeWidth={0.6} />
        <ellipse cx={66} cy={16} rx={4.6} ry={5.4} fill="#e8623f" opacity={0.9} />
        <ellipse cx={66} cy={16} rx={2.6} ry={4.6} fill="#f9a86a" opacity={0.7} />
        {[-2.8, 0, 2.8].map((dy, k) => (
          <ellipse key={`rib-${k}`} cx={66} cy={16 + dy} rx={4.5} ry={0.5} fill="none" stroke="#b23d24" strokeWidth={0.4} opacity={0.6} />
        ))}
        {/* Back rocks along the pool's far rim. */}
        {([[12, 50, 7, 4], [24, 52, 6, 3.5], [58, 52, 7, 4], [70, 50, 6, 3.6]] as const).map(([x, y, rx, ry], k) => (
          <ellipse key={`rock-${k}`} cx={x} cy={y} rx={rx} ry={ry} fill="#7f766d" opacity={0.75} />
        ))}
        {/* The steaming soaking pool. */}
        <rect x={4} y={54} width={72} height={20} rx={10} fill="#4bb3c9" opacity={0.55} />
        <rect x={4} y={54} width={72} height={7} rx={8} fill="#8fd6e2" opacity={0.5} />
        {/* Two yuzu bobbing on the water, off to the sides. */}
        {([[16, 60], [64, 62]] as const).map(([x, y], k) => (
          <g key={`yuzu-${k}`}>
            <circle cx={x} cy={y} r={1.8} fill="#f4a72c" />
            <circle cx={x - 0.6} cy={y - 0.6} r={0.5} fill="#fbd07a" opacity={0.9} />
          </g>
        ))}
        {/* Rising steam wisps on the sides (clear of the centred figure). */}
        {([12, 24, 56, 68] as const).map((x, k) => (
          <path
            key={`steam-${k}`}
            d={`M ${x} 52 q ${k % 2 ? 4 : -4} -8 0 -16 q ${k % 2 ? -4 : 4} -6 0 -12`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.28}
          />
        ))}
      </g>
    )
  }
  if (habitat === 'campsite') {
    // A cosy night camp — a starry navy sky with a crescent moon, pine silhouettes, a terracotta
    // tent on the left and a crackling campfire on the right. Kept clear of the centred figure.
    const tent = '#cf6a4a'
    return (
      <g opacity={g} aria-hidden="true">
        {/* Night sky. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#1e2340" opacity={0.6} />
        <rect x={4} y={6} width={72} height={30} rx={10} fill="#2a2f52" opacity={0.4} />
        {/* Stars. */}
        {([[14, 14], [24, 10], [40, 9], [54, 12], [66, 15], [70, 26], [10, 24], [48, 16], [60, 20]] as const).map(([x, y], k) => (
          <circle key={`st-${k}`} cx={x} cy={y} r={k % 3 ? 0.7 : 1} fill="#fdf4d8" opacity={0.85} />
        ))}
        {/* A slim crescent moon top-right. */}
        <path d="M 66 12 a 4 4 0 1 0 2.6 6.4 a 3 3 0 1 1 -2.6 -6.4 z" fill="#fdf4d8" opacity={0.8} />
        {/* Pine silhouettes at the far edges. */}
        {([8, 72] as const).map((x, k) => (
          <path key={`pn-${k}`} d={`M ${x} 40 l 3 6 l -6 0 z M ${x} 45 l 4 7 l -8 0 z`} fill="#152036" opacity={0.7} />
        ))}
        {/* Ground band. */}
        <rect x={4} y={62} width={72} height={12} rx={8} fill="#20321f" opacity={0.6} />
        {/* Tent on the left. */}
        <path d="M 7 60 L 18 43 L 29 60 Z" fill={tent} />
        <path d="M 18 43 L 29 60 L 23 60 Z" fill="#a8492f" opacity={0.85} />
        <path d="M 18 47 L 14 60 L 22 60 Z" fill="#3a1f16" />
        <path d="M 18 43 l 0 -4 l 4 1.4 l -4 1.4 z" fill="#f6c945" />
        {/* Campfire on the right — glow, crossed logs, flames. */}
        <ellipse cx={61} cy={65} rx={7} ry={2.2} fill="#f59e0b" opacity={0.2} />
        <rect x={56} y={63.5} width={10} height={2} rx={1} fill="#6b4423" transform="rotate(14 61 64.5)" />
        <rect x={56} y={63.5} width={10} height={2} rx={1} fill="#7c5230" transform="rotate(-14 61 64.5)" />
        <path d="M 61 63 q -3.2 -2.4 -1.6 -6 q 0.4 2 2 2.6 q 1.4 -2.6 -0.2 -4.8 q 4 2 3 6.4 q -1 3 -3.2 5.8 z" fill="#f97316" />
        <path d="M 61 62.4 q -1.8 -1.6 -0.8 -3.8 q 0.4 1.4 1.4 1.6 q 0.8 -1.6 0 -3 q 2.2 1.4 1.6 4 q -0.8 1.6 -2.2 3.2 z" fill="#fde047" opacity={0.9} />
      </g>
    )
  }
  if (habitat === 'bamboo_grove') {
    // A serene bamboo grove — tall jointed stalks at the edges (nearer ones bolder, distant ones
    // paler), leaf sprays reaching in, and soft light through the canopy. Centre stays clear.
    const stalk = (x: number, w: number, fill: string, deep: string, op: number) => (
      <g key={`st-${x}`} opacity={op}>
        <rect x={x - w / 2} y={6} width={w} height={68} rx={w / 2} fill={fill} />
        {/* Joint nodes up the stalk. */}
        {[16, 27, 38, 49, 60, 70].map((y) => (
          <path key={`nd-${y}`} d={`M ${x - w / 2 - 0.3} ${y} l ${w + 0.6} 0`} stroke={deep} strokeWidth={0.7} strokeLinecap="round" />
        ))}
      </g>
    )
    return (
      <g opacity={g} aria-hidden="true">
        {/* A soft green-lit wash. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#e9f3dd" opacity={0.55} />
        {/* Soft light rays slanting through the canopy. */}
        {[30, 46].map((x, k) => (
          <path key={`ray-${k}`} d={`M ${x} 6 L ${x - 6} 46 L ${x + 4} 46 Z`} fill="#fbfdf2" opacity={0.25} />
        ))}
        {/* Distant paler stalks. */}
        {stalk(20, 2, '#a8cf91', '#8fb87a', 0.5)}
        {stalk(60, 2.2, '#a8cf91', '#8fb87a', 0.5)}
        {/* Near bold stalks hugging the edges. */}
        {stalk(9, 3.4, '#79b356', '#5c9440', 0.95)}
        {stalk(71, 3.8, '#79b356', '#5c9440', 0.95)}
        {stalk(15, 2.8, '#8cc26a', '#6da24e', 0.85)}
        {stalk(66, 2.6, '#8cc26a', '#6da24e', 0.85)}
        {/* Leaf sprays reaching in from the stalks. */}
        {([[11, 18, 1], [69, 24, -1], [16, 40, 1], [64, 46, -1], [10, 56, 1]] as const).map(([x, y, dir], k) => (
          <g key={`lv-${k}`}>
            <path d={`M ${x} ${y} q ${dir * 4} -1.5 ${dir * 7} 0.5 q ${dir * -3.5} 1.5 ${dir * -7} -0.5 z`} fill="#6da24e" opacity={0.8} />
            <path d={`M ${x} ${y + 2} q ${dir * 3.5} 0.5 ${dir * 6} 2.5 q ${dir * -3.5} 0.5 ${dir * -6} -2.5 z`} fill="#8cc26a" opacity={0.7} />
          </g>
        ))}
      </g>
    )
  }
  if (habitat === 'teahouse') {
    // A warm tea house — shoji panels at the edges, a tatami floor band, a low wooden table with
    // a steaming teapot + cup on the right, and a soft round paper lamp glowing top-left. The
    // indoor-cosy corner of the onsen set; centre stays clear for the figure.
    const shoji = (x: number) => (
      <g key={`sh-${x}`}>
        <rect x={x} y={8} width={12} height={58} rx={1.5} fill="#f6efe2" opacity={0.75} />
        {/* The wooden lattice grid. */}
        {[0, 1, 2].map((c) => (
          <path key={`v-${c}`} d={`M ${x + 3 + c * 3.5} 8.5 l 0 57`} stroke="#b08d62" strokeWidth={0.5} opacity={0.6} />
        ))}
        {[18, 30, 42, 54].map((y) => (
          <path key={`h-${y}`} d={`M ${x + 0.5} ${y} l 11 0`} stroke="#b08d62" strokeWidth={0.5} opacity={0.6} />
        ))}
      </g>
    )
    return (
      <g opacity={g} aria-hidden="true">
        {/* The warm lamplit room wash. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#f3e5ce" opacity={0.55} />
        {/* Shoji screen panels hugging both edges. */}
        {shoji(5)}
        {shoji(63)}
        {/* The tatami floor band with woven seam lines. */}
        <rect x={4} y={62} width={72} height={12} rx={8} fill="#cfc27f" opacity={0.75} />
        {[20, 40, 60].map((x, k) => (
          <path key={`tm-${k}`} d={`M ${x} 62.5 l ${k % 2 ? 2 : -2} 11`} stroke="#a89e5e" strokeWidth={0.6} opacity={0.7} />
        ))}
        {/* A soft round paper lamp glowing top-left (the hot spring's lantern hangs top-right —
            kept opposite so the two scenes read distinct). */}
        <path d="M 16 6 l 0 4" stroke="#7c5a44" strokeWidth={0.6} />
        <circle cx={16} cy={14} r={5} fill="#f4d9a0" opacity={0.4} />
        <circle cx={16} cy={14} r={3.4} fill="#f8e4b8" opacity={0.95} />
        {[-1.8, 0, 1.8].map((dx, k) => (
          <path key={`rib-${k}`} d={`M ${16 + dx} ${11} q ${dx * 0.3} 3 0 6`} fill="none" stroke="#dbb877" strokeWidth={0.4} opacity={0.7} />
        ))}
        {/* The low dark-wood table on the right, with a teapot + cup. */}
        <rect x={52} y={57} width={20} height={2.4} rx={1} fill="#7a4e2b" />
        {[54, 68.5].map((x, k) => (
          <rect key={`lg-${k}`} x={x} y={59.2} width={1.6} height={3.2} rx={0.6} fill="#61391d" />
        ))}
        {/* The rounded teapot — body, lid knob, spout, handle. */}
        <ellipse cx={58.5} cy={54.5} rx={3.4} ry={2.7} fill="#6d8a63" />
        <ellipse cx={58.5} cy={52} rx={1.7} ry={0.6} fill="#5a7451" />
        <circle cx={58.5} cy={51.4} r={0.6} fill="#4a6143" />
        <path d="M 55.4 53.4 q -2 0.2 -2.4 1.8 l 1.4 0.5 q 0.4 -1.4 1.4 -1.6 z" fill="#6d8a63" />
        <path d="M 61.6 53.6 q 2.4 0.4 2 2.4" fill="none" stroke="#5a7451" strokeWidth={0.8} strokeLinecap="round" />
        {/* A little tea cup beside it + rising steam. */}
        <path d="M 66 55.4 l 3 0 l -0.5 2.2 q -1 0.5 -2 0 z" fill="#e8e0d0" />
        <path d="M 67.5 53.8 q 1 -1.4 0.2 -2.8 M 59 49.6 q 1.2 -1.6 0.3 -3.2" fill="none" stroke="#ffffff" strokeWidth={0.7} strokeLinecap="round" opacity={0.5} />
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
            <circle key={k} cx={40 + Math.cos(a) * r} cy={38 + Math.sin(a) * (r - 3)} r={k % 3 ? 0.8 : 1.3} fill="#fdf3e0" opacity={0.9} />
          )
        })}
        {/* Drifting shooting stars raking the corners — a bright head with a fading tail. */}
        {[
          { x: 14, y: 14, dx: 8, dy: 4 },
          { x: 66, y: 20, dx: 7, dy: 5 },
          { x: 20, y: 50, dx: 9, dy: 3 },
        ].map((m, k) => (
          <g key={`meteor-${k}`}>
            <line x1={m.x} y1={m.y} x2={m.x - m.dx} y2={m.y - m.dy} stroke="#f3e3c2" strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
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
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#2e1f2c" opacity={0.4} />
        {/* Billowing warm nebula gas clouds pushed to the corners/edges, clear of the centre. */}
        {[
          { cx: 14, cy: 18, rx: 14, ry: 10, c: '#9a6b9c' },
          { cx: 66, cy: 22, rx: 13, ry: 9, c: '#bd6b6b' },
          { cx: 18, cy: 58, rx: 12, ry: 8, c: '#c4744f' },
          { cx: 64, cy: 60, rx: 13, ry: 9, c: '#8d6a78' },
        ].map((c, k) => (
          <ellipse key={`gas-${k}`} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={c.c} opacity={0.26} />
        ))}
        {/* A faint spiral wisp threading the upper edge, evoking a distant galaxy arm. */}
        <path
          d="M 10 16 Q 30 8 50 14 T 72 24"
          fill="none"
          stroke="#d8b9d2"
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
              fill={k % 3 ? '#fdf3e0' : '#fef9c3'}
              opacity={0.9}
            />
          )
        })}
      </g>
    )
  }
  if (habitat === 'ember_hollow') {
    // PATH-EXCLUSIVE tier-2 (Pitta / breath) — a cozy hearth cave: a dark warm panel with a soft
    // ember-orange glow low-centre. A simpler companion to the tier-3 ember_canyon.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A dark warm panel, faint so the figure reads in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#431407" opacity={0.28} />
        {/* A soft ember-orange glow banked low-centre — the hearth's warmth. */}
        <ellipse cx={40} cy={66} rx={26} ry={12} fill="#ea580c" opacity={0.3} />
        <ellipse cx={40} cy={68} rx={16} ry={7} fill="#f97316" opacity={0.32} />
      </g>
    )
  }
  if (habitat === 'fern_hollow') {
    // PATH-EXCLUSIVE tier-2 (Kapha / stillness) — a shaded green nook: a soft green panel with a
    // couple of fern fronds tucked in a bottom corner. A simpler companion to misty_grove.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A soft green shaded panel, faint so it recedes behind the figure. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#065f46" opacity={0.22} />
        {/* A couple of fern fronds tucked in the bottom-left corner, off-centre. */}
        {[0, 1].map((k) => (
          <path
            key={k}
            d={`M ${11 + k * 6} 72 Q ${8 + k * 6} 60 ${13 + k * 6} 52`}
            fill="none"
            stroke="#34d399"
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.55}
          />
        ))}
      </g>
    )
  }
  if (habitat === 'cloud_terrace') {
    // PATH-EXCLUSIVE tier-2 (Vata / heart) — an airy pale sky: a pale sky-blue panel with 2–3
    // soft white clouds up high. A simpler companion to the tier-3 open_sky.
    return (
      <g opacity={g} aria-hidden="true">
        {/* A pale sky-blue panel, faint so the figure reads clearly in front. */}
        <rect x={4} y={6} width={72} height={68} rx={10} fill="#e0f2fe" opacity={0.32} />
        {/* 2–3 soft white clouds pushed up high, off the figure's centre. */}
        {[
          { cx: 16, cy: 16, r: 4 },
          { cx: 62, cy: 13, r: 4.5 },
          { cx: 44, cy: 20, r: 3.2 },
        ].map((c, k) => (
          <g key={k}>
            <ellipse cx={c.cx} cy={c.cy} rx={c.r * 1.6} ry={c.r} fill="#f8fafc" opacity={0.7} />
            <ellipse cx={c.cx + c.r} cy={c.cy + 1} rx={c.r} ry={c.r * 0.7} fill="#f8fafc" opacity={0.7} />
          </g>
        ))}
      </g>
    )
  }
  return null
}

// A small worn accessory drawn on top of the figure (above its head, near y≈40-14). Each
// option is a distinct, flat little shape — the on-character payoff of spending coins.
// The viewBox-y of the creature's DEFAULT face (eye line) for a path + stage — the anchor worn
// accessories align to. Each dosha draws its face at a different height (the Pitta face sits low on
// its tall flame; the Kapha figure and Vata wisp sit higher) and each rises a little as the creature
// grows, so a fixed offset can't fit all three. Derived from each Form's own face() placement and
// pinned to measured positions (x is always 40). A non-default `form` cosmetic moves the face, so
// accessories then only approximate — the common (default) creature is what this keeps aligned.
export function faceEyeY(path: SpiritPath | null | undefined, stage: SpiritStage): number {
  const p = stageProgress(stage)
  if (path === 'breath') return 48.4 - 3.4 * p // the flame face, lower on the tall blaze
  if (path === 'heart') return 39 - 1 * p // the wisp face, nearly stage-stable
  return 39.7 - 3.4 * p // stillness figure + the pathless spark fallback
}

function Accessory({
  accessory,
  g,
  pal,
  path,
  eyeY,
}: {
  accessory: string
  g: number
  pal?: BodyPalette
  // The spirit's chosen path drives PER-PATH VARIANTS: the same owned accessory is drawn with a
  // dosha-specific silhouette (an ember-ring halo for fire, a leaf-circlet for earth, a breeze-ring
  // for air), so it looks made for THIS creature. Null (pathless spark) → the default silhouette.
  path?: SpiritPath | null
  // The creature's actual eye-line y (from faceEyeY) so worn items sit on the real head/eyes across
  // doshas + stages rather than a fixed band. topY (head-top reference) hangs a fixed distance above
  // it — matching the old constant on the Kapha figure while tracking the head on the others.
  eyeY: number
}) {
  // Head-top reference: a fixed span above the eye line (13 ≈ the old fixed topY of 24 with Kapha
  // eyes near 37, so Kapha head-worn items are unchanged while Pitta/Vata now track their heads).
  const topY = eyeY - 13
  if (accessory === 'halo') {
    // A floating ring: a soft outer bloom, the bright band itself, and a faint highlight along the
    // near edge so it reads as a glowing halo rather than a flat outline. Harmonised — the ring is
    // forged from the spirit's own light (its palette); a pathless spark keeps the classic gold.
    const m = pal
      ? { bloom: pal.glow, band: pal.accent, gleam: pal.core }
      : { bloom: '#fef9c3', band: '#fde68a', gleam: '#fffbeb' }
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Soft glow blooming around the ring. */}
        <ellipse
          cx={40}
          cy={topY}
          rx={9}
          ry={3}
          fill="none"
          stroke={m.bloom}
          strokeWidth={3.6}
          opacity={0.4}
        />
        {/* The bright band — the halo's defining shape. */}
        <ellipse
          cx={40}
          cy={topY}
          rx={9}
          ry={3}
          fill="none"
          stroke={m.band}
          strokeWidth={1.8}
        />
        {/* A brighter highlight along the front-lower arc for a touch of shine. */}
        <path
          d={`M 31.5 ${topY + 1.2} Q 40 ${topY + 3.6} 48.5 ${topY + 1.2}`}
          fill="none"
          stroke={m.gleam}
          strokeWidth={0.8}
          strokeLinecap="round"
          opacity={0.9}
        />
        {/* PER-PATH VARIANT — the halo takes on the spirit's element: flame-flicks for fire, a
            circlet of leaves for earth, drifting breeze-wisps for air. Pathless → just the ring. */}
        {path === 'breath' &&
          Array.from({ length: 5 }, (_, k) => {
            const a = -Math.PI + (k / 4) * Math.PI
            const bx = 40 + Math.cos(a) * 9
            const by = topY + Math.sin(a) * 3
            return (
              <path
                key={`halo-fire-${k}`}
                d={`M ${bx} ${by} C ${bx - 1.3} ${by - 2}, ${bx - 1} ${by - 4}, ${bx} ${by - 4.8} C ${bx + 1} ${by - 4}, ${bx + 1.3} ${by - 2}, ${bx} ${by} Z`}
                fill={m.band}
                opacity={0.85}
              />
            )
          })}
        {path === 'stillness' &&
          Array.from({ length: 5 }, (_, k) => {
            const a = -Math.PI + (k / 4) * Math.PI
            const bx = 40 + Math.cos(a) * 9
            const by = topY + Math.sin(a) * 3
            const deg = (a * 180) / Math.PI + 90
            return (
              <ellipse
                key={`halo-leaf-${k}`}
                cx={bx}
                cy={by - 1.6}
                rx={2.2}
                ry={1.1}
                fill={m.band}
                opacity={0.9}
                transform={`rotate(${deg} ${bx} ${by - 1.6})`}
              />
            )
          })}
        {path === 'heart' &&
          Array.from({ length: 4 }, (_, k) => {
            const a = -Math.PI + (k / 3) * Math.PI
            const bx = 40 + Math.cos(a) * 9
            const by = topY + Math.sin(a) * 3
            return (
              <g key={`halo-air-${k}`}>
                <path
                  d={`M ${bx - 2.4} ${by - 1} Q ${bx} ${by - 2.6} ${bx + 2.4} ${by - 1}`}
                  fill="none"
                  stroke={m.bloom}
                  strokeWidth={0.8}
                  strokeLinecap="round"
                  opacity={0.8}
                />
                <circle cx={bx + 2.8} cy={by - 1.4} r={0.6} fill={m.gleam} opacity={0.85} />
              </g>
            )
          })}
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
    // A cozy knitted scarf wrapped at the neck, dipping at the front, with two hanging tails, a knit
    // stripe, and a little fringe — a warm rust red so it reads as clothing (not a cold bar).
    const nx = 40
    const ny = 39
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* the wrap around the neck (a soft band that dips at the front) */}
        <path d={`M ${nx - 7} ${ny - 1.8} q 7 3.2 14 0 l 0 2.8 q -7 3.4 -14 0 z`} fill="#d95c52" />
        {/* a lighter knit stripe */}
        <path d={`M ${nx - 6} ${ny - 0.3} q 6 2.6 12 0`} fill="none" stroke="#f5b0a0" strokeWidth={0.8} strokeLinecap="round" opacity={0.8} />
        {/* two hanging tails down the front */}
        <path d={`M ${nx - 0.6} ${ny + 1.4} l -1.4 7.4 l 3.2 0 l -0.4 -7 z`} fill="#d95c52" />
        <path d={`M ${nx + 2.4} ${ny + 1.2} l 0.6 7 l 3 -0.4 l -1.2 -6.8 z`} fill="#c94a42" />
        {/* fringe at the tail ends */}
        {[-1.8, -0.6, 0.6].map((dx, k) => (
          <line key={k} x1={nx + dx} y1={ny + 8.6} x2={nx + dx} y2={ny + 9.9} stroke="#f5b0a0" strokeWidth={0.5} strokeLinecap="round" />
        ))}
        {[2.6, 3.8, 5].map((dx, k) => (
          <line key={`b${k}`} x1={nx + dx} y1={ny + 8} x2={nx + dx - 0.2} y2={ny + 9.3} stroke="#f5b0a0" strokeWidth={0.5} strokeLinecap="round" />
        ))}
      </g>
    )
  }
  if (accessory === 'star') {
    // A proper five-point star floating just above the head, with a soft aura + glint — cast in the
    // spirit's own light (its palette); a pathless spark keeps the classic gold. (Was a flat
    // pentagon: 5 points at one radius. Now 10 points alternating outer/inner make a real star.)
    const sx = 40
    const sy = topY - 5
    const m = pal ? { body: pal.glow, edge: pal.accent } : { body: '#fde68a', edge: '#fbbf24' }
    const pts = Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2
      const rr = k % 2 === 0 ? 4 : 1.7
      return `${(sx + Math.cos(a) * rr).toFixed(2)},${(sy + Math.sin(a) * rr).toFixed(2)}`
    })
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        <circle cx={sx} cy={sy} r={5.5} fill={m.body} opacity={0.2} />
        <polygon points={pts.join(' ')} fill={m.body} stroke={m.edge} strokeWidth={0.6} strokeLinejoin="round" />
        <circle cx={sx - 0.9} cy={sy - 0.9} r={0.75} fill="#ffffff" opacity={0.75} />
      </g>
    )
  }
  if (accessory === 'dark_star') {
    // A brooding five-point DARK star above the head — near-black fill with a glowing violet edge,
    // a soft violet aura, and a couple of little sparks. The edgy counterpart to the gold `star`
    // (and a proper 10-point star shape, not the pentagon the gold one draws).
    const sx = 40
    const sy = topY - 5
    const pts = Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2
      const rr = k % 2 === 0 ? 3.9 : 1.6
      return `${(sx + Math.cos(a) * rr).toFixed(2)},${(sy + Math.sin(a) * rr).toFixed(2)}`
    })
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A soft golden aura blooming behind the star. */}
        <circle cx={sx} cy={sy} r={6.5} fill="#d9a441" opacity={0.22} />
        {/* The dark star body with a glowing amber edge. */}
        <polygon
          points={pts.join(' ')}
          fill="#2e2316"
          stroke="#e3a83c"
          strokeWidth={0.9}
          strokeLinejoin="round"
        />
        {/* A faint inner glint + two little golden sparks. */}
        <circle cx={sx} cy={sy} r={0.7} fill="#fcd34d" opacity={0.85} />
        <circle cx={sx + 6} cy={sy - 4.5} r={0.6} fill="#e3a83c" opacity={0.85} />
        <circle cx={sx - 5.5} cy={sy - 1} r={0.5} fill="#fcd34d" opacity={0.75} />
      </g>
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
    const lensY = eyeY
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
    // A cosy slouchy knit beanie in warm clay: a soft dome pulled over the crown with vertical knit
    // ribs, a thick folded cuff, and a fluffy cream pompom on top.
    const wool = '#cd6a4f'
    const woolDeep = '#a94e34'
    const cuff = '#e07a5f'
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The soft slouchy dome. */}
        <path d={`M 31 ${topY + 5} Q 30.5 ${topY - 9} 40 ${topY - 9} Q 49.5 ${topY - 9} 49 ${topY + 5} Z`} fill={wool} />
        {/* Vertical knit ribs curving over the dome. */}
        {[-6, -3, 0, 3, 6].map((dx, k) => (
          <path key={`rib-${k}`} d={`M ${40 + dx} ${topY + 4} Q ${40 + dx * 0.7} ${topY - 4} ${40 + dx * 0.4} ${topY - 8}`} fill="none" stroke={woolDeep} strokeWidth={0.5} opacity={0.55} />
        ))}
        {/* The thick folded cuff at the brim. */}
        <path d={`M 30.4 ${topY + 2} Q 40 ${topY + 6} 49.6 ${topY + 2} L 49.6 ${topY + 5.5} Q 40 ${topY + 9} 30.4 ${topY + 5.5} Z`} fill={cuff} />
        {/* Ribs on the cuff. */}
        {[-7, -4.5, -2, 0.5, 3, 5.5].map((dx, k) => (
          <line key={`cr-${k}`} x1={40 + dx} y1={topY + 3.2} x2={40 + dx} y2={topY + 6.6} stroke={woolDeep} strokeWidth={0.5} opacity={0.5} />
        ))}
        {/* The fluffy cream pompom. */}
        <circle cx={40} cy={topY - 10} r={2.6} fill="#f5ede0" />
        {([[-1, -1], [1.2, -0.6], [0, 1.2], [-1.2, 0.8]] as const).map(([dx, dy], k) => (
          <circle key={`pf-${k}`} cx={40 + dx} cy={topY - 10 + dy} r={1} fill="#fbf5ea" opacity={0.7} />
        ))}
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
  // --- Path-exclusive TIER-2 accessories (per_path in the catalog) -----------------------
  // flame_tuft → breath (Pitta/fire), acorn_cap → stillness (Kapha/earth), wind_ribbon → heart
  // (Vata/air). The earlier, cheaper per-path worn item to chase before each dosha's tier-3
  // capstone. Fixed identity palettes — only ever shown on the matching dosha.
  if (accessory === 'flame_tuft') {
    // A small tuft of flame rising from the brow — three orange flame teardrops, tallest in the
    // centre, each with a brighter core.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {[
          { x: 36, h: 5 },
          { x: 40, h: 8 },
          { x: 44, h: 5 },
        ].map((f, k) => (
          <g key={k}>
            <path
              d={`M ${f.x - 1.7} ${topY + 1} Q ${f.x} ${topY + 1 - f.h} ${f.x + 1.7} ${topY + 1} Z`}
              fill={k === 1 ? '#f97316' : '#fb923c'}
            />
            <path
              d={`M ${f.x - 0.8} ${topY + 0.6} Q ${f.x} ${topY + 0.6 - f.h * 0.6} ${f.x + 0.8} ${topY + 0.6} Z`}
              fill="#fde68a"
            />
          </g>
        ))}
      </g>
    )
  }
  if (accessory === 'acorn_cap') {
    // A plump acorn perched on the head: a rounded tan nut body under a textured brown cap with a
    // cross-hatch weave and a little stem.
    const nut = '#d9a441'
    const nutDeep = '#b6801f'
    const cap = '#7c4a1e'
    const capDeep = '#5c3514'
    const acy = topY + 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The rounded tan nut body. */}
        <path d={`M 36 ${acy - 1} Q 36 ${acy + 6} 40 ${acy + 6} Q 44 ${acy + 6} 44 ${acy - 1} Z`} fill={nut} />
        <path d={`M 40 ${acy + 2} l 0 3.4`} stroke={nutDeep} strokeWidth={0.4} opacity={0.5} />
        {/* The brown domed cap. */}
        <path d={`M 34.5 ${acy - 0.5} Q 40 ${acy - 7} 45.5 ${acy - 0.5} Q 40 ${acy + 1.2} 34.5 ${acy - 0.5} Z`} fill={cap} />
        {/* Cross-hatch weave on the cap. */}
        {[-3, -1, 1, 3].map((dx, k) => (
          <path key={`v-${k}`} d={`M ${40 + dx} ${acy - 0.5} L ${40 + dx * 0.6} ${acy - 5.2}`} stroke={capDeep} strokeWidth={0.4} opacity={0.6} />
        ))}
        {[-4.4, -2.6].map((dy, k) => (
          <path key={`h-${k}`} d={`M 35.6 ${acy + dy} Q 40 ${acy + dy - 1.3} 44.4 ${acy + dy}`} fill="none" stroke={capDeep} strokeWidth={0.4} opacity={0.5} />
        ))}
        {/* The little stem. */}
        <path d={`M 40 ${acy - 6.2} l 0 -2.4`} stroke={capDeep} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    )
  }
  if (accessory === 'wind_ribbon') {
    // A light ribbon streaming to one side in the breeze: a small knot near the head with a curved
    // streamer trailing off, and a couple of soft wisps for lift.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The streamer curving off to one side. */}
        <path
          d={`M 44 ${topY} Q 52 ${topY - 3} 56 ${topY + 1} Q 51 ${topY + 1} 44 ${topY + 2} Z`}
          fill="#bae6fd"
        />
        {/* A paler highlight along the streamer. */}
        <path
          d={`M 45 ${topY + 0.6} Q 51 ${topY - 1.4} 55 ${topY + 0.8}`}
          fill="none"
          stroke="#e0f2fe"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
        {/* A small knot where the ribbon meets the head. */}
        <circle cx={44} cy={topY + 0.8} r={1.4} fill="#c4b5fd" />
        {/* A faint wisp trailing behind for a sense of breeze. */}
        <path
          d={`M 48 ${topY + 3} q 3 -1 5.6 0.4`}
          fill="none"
          stroke="#e0f2fe"
          strokeWidth={0.7}
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    )
  }
  if (accessory === 'star_crown') {
    // LEGENDARY (tier 4) — a regal golden crown: a jewelled circlet across the brow rising to five
    // upright points, each tipped with a bright five-point star, over a soft warm halo. Always gold
    // so it reads as the prestige endgame piece on any creature (not tinted into the body colour).
    const gold = '#fcd34d'
    const goldDeep = '#eab308'
    const goldLo = '#f0a83a'
    const gleam = '#fffbeb'
    const gems = ['#ef4444', '#60a5fa', '#a78bfa']
    const band = topY + 1
    const starPts = (cx: number, cy: number, s: number) =>
      Array.from({ length: 10 }, (_, i) => {
        const rad = i % 2 === 0 ? s : s * 0.44
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
        return `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`
      }).join(' ')
    const points = [
      { x: 32, h: 3.4 },
      { x: 36, h: 5.8 },
      { x: 40, h: 8.4 },
      { x: 44, h: 5.8 },
      { x: 48, h: 3.4 },
    ]
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Soft warm halo behind the crown. */}
        <ellipse cx={40} cy={band - 3} rx={12} ry={7} fill={gold} opacity={0.16} />
        {/* Upright points rising from the band, each capped with a gold star. */}
        {points.map((p, k) => {
          const tipY = band - p.h
          return (
            <g key={k}>
              <path d={`M ${p.x - 2.2} ${band} L ${p.x} ${tipY + 1.4} L ${p.x + 2.2} ${band} Z`} fill={k === 2 ? gold : goldLo} stroke={goldDeep} strokeWidth={0.3} />
              <polygon points={starPts(p.x, tipY, k === 2 ? 2.2 : 1.6)} fill={gold} stroke={goldDeep} strokeWidth={0.3} strokeLinejoin="round" />
              <circle cx={p.x} cy={tipY} r={0.5} fill={gleam} />
            </g>
          )
        })}
        {/* The jewelled circlet band across the brow. */}
        <path d={`M 30.5 ${band + 1.5} Q 40 ${band - 3.5} 49.5 ${band + 1.5} L 49.5 ${band + 3.2} Q 40 ${band - 1.8} 30.5 ${band + 3.2} Z`} fill={gold} stroke={goldDeep} strokeWidth={0.4} />
        <path d={`M 31.5 ${band + 1.6} Q 40 ${band - 2.6} 48.5 ${band + 1.6}`} fill="none" stroke={gleam} strokeWidth={0.5} opacity={0.7} />
        {/* Gems set into the band between the points. */}
        {[34, 40, 46].map((x, k) => (
          <g key={`gem-${k}`}>
            <circle cx={x} cy={band + 0.8} r={1} fill={gems[k]} />
            <circle cx={x - 0.3} cy={band + 0.5} r={0.3} fill="#ffffff" opacity={0.8} />
          </g>
        ))}
        {/* Sparkle glints. */}
        {([[35, band - 4], [45, band - 4]] as const).map(([x, y], k) => (
          <circle key={`sp-${k}`} cx={x} cy={y} r={0.4} fill={gleam} opacity={0.9} />
        ))}
      </g>
    )
  }
  // --- COOL / EDGY universal accessories -------------------------------------------------
  if (accessory === 'shades') {
    // Sleek sunglasses on the eye line: two angular dark lenses joined by a bridge, slim temple
    // arms swept to the sides, and a bright diagonal glint streaking across each lens. Sharper
    // and cooler than the round nerd_glasses.
    const lensY = eyeY
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The two angular lenses — dark, with a slightly lighter inner facet. */}
        {[33.6, 41.2].map((lx, k) => (
          <g key={k}>
            <path
              d={`M ${lx} ${lensY - 2.2} L ${lx + 5.2} ${lensY - 1.6} L ${lx + 4.4} ${lensY + 2.4}
                  L ${lx + 0.4} ${lensY + 2.8} Z`}
              fill="#111827"
            />
            <path
              d={`M ${lx + 0.8} ${lensY - 1.2} L ${lx + 4.2} ${lensY - 0.8} L ${lx + 3.6}
                  ${lensY + 1.4} L ${lx + 1.2} ${lensY + 1.6} Z`}
              fill="#1f2937"
            />
            {/* A bright diagonal glint streaking across the lens. */}
            <line
              x1={lx + 1}
              y1={lensY + 1.6}
              x2={lx + 4.2}
              y2={lensY - 1.4}
              stroke="#f8fafc"
              strokeWidth={0.7}
              strokeLinecap="round"
              opacity={0.9}
            />
          </g>
        ))}
        {/* The bridge joining the two lenses across the nose. */}
        <line x1={38.8} y1={lensY - 1.6} x2={41.2} y2={lensY - 1.6} stroke="#111827" strokeWidth={1.1} />
        {/* Slim temple arms sweeping out to the sides. */}
        <line x1={33.6} y1={lensY - 2} x2={30.4} y2={lensY - 2.8} stroke="#111827" strokeWidth={1} strokeLinecap="round" />
        <line x1={46.4} y1={lensY - 1.6} x2={49.6} y2={lensY - 2.6} stroke="#111827" strokeWidth={1} strokeLinecap="round" />
      </g>
    )
  }
  if (accessory === 'spiked_collar') {
    // A punk studded collar around the neck: a thick dark band with silver pyramid studs and a
    // metal O-ring hanging at the centre-front. Edgy. Sits just below the eye line (the neck).
    const bandY = eyeY + 8
    const studs = Array.from({ length: 7 }, (_, k) => {
      const t = k / 6 // 0..1 across the band
      const sx = 32 + t * 16
      const dip = Math.sin(t * Math.PI) * 1.4 // follows the band's downward curve
      return { sx, sy: bandY + dip, k }
    })
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The thick dark band + a lighter sheen line. */}
        <path d={`M 31.5 ${bandY - 1.5} Q 40 ${bandY + 3} 48.5 ${bandY - 1.5}`} fill="none" stroke="#1f2937" strokeWidth={3.4} strokeLinecap="round" />
        <path d={`M 31.5 ${bandY - 2} Q 40 ${bandY + 2.4} 48.5 ${bandY - 2}`} fill="none" stroke="#374151" strokeWidth={1} strokeLinecap="round" opacity={0.7} />
        {/* Silver pyramid studs (diamonds) sitting on the band, with a lit facet each. */}
        {studs.map((s) => (
          <g key={s.k}>
            <path d={`M ${s.sx} ${s.sy - 2} L ${s.sx + 1.5} ${s.sy} L ${s.sx} ${s.sy + 2} L ${s.sx - 1.5} ${s.sy} Z`} fill={s.k % 2 === 0 ? '#e5e7eb' : '#cbd5e1'} stroke="#94a3b8" strokeWidth={0.2} />
            <path d={`M ${s.sx} ${s.sy - 2} L ${s.sx + 1.5} ${s.sy} L ${s.sx} ${s.sy} Z`} fill="#f8fafc" opacity={0.7} />
          </g>
        ))}
        {/* A metal O-ring hanging at the centre-front. */}
        <rect x={39.2} y={bandY + 1.4} width={1.6} height={1.6} rx={0.4} fill="#9ca3af" />
        <circle cx={40} cy={bandY + 4} r={1.8} fill="none" stroke="#cbd5e1" strokeWidth={0.9} />
      </g>
    )
  }
  if (accessory === 'backwards_cap') {
    // A snapback baseball cap worn backwards: a rounded crown dome in deep red, the snapback strap
    // and a little adjuster button showing at the FRONT (the back of the cap faces us), and the
    // curved brim poking out behind to one side. Cool/casual.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The curved brim poking out behind, off to one side. */}
        <path
          d={`M 47 ${topY + 1} Q 53 ${topY - 1} 53.5 ${topY + 2.6} Q 51 ${topY + 3.4} 47 ${topY + 2.6} Z`}
          fill="#b91c1c"
        />
        {/* The rounded crown dome over the head. */}
        <path
          d={`M 31 ${topY + 3} Q 31 ${topY - 9} 40 ${topY - 9} Q 49 ${topY - 9} 49 ${topY + 3} Z`}
          fill="#dc2626"
        />
        {/* A panel seam up the crown for a stitched feel. */}
        <path d={`M 40 ${topY + 2} Q 39.4 ${topY - 6} 40 ${topY - 9}`} fill="none" stroke="#b91c1c" strokeWidth={0.6} opacity={0.85} />
        {/* The snapback strap band across the front (the cap's back, facing us). */}
        <rect x={33} y={topY + 0.6} width={14} height={3} rx={1} fill="#991b1b" />
        {/* The snapback holes + the little adjuster button at the centre. */}
        <circle cx={36} cy={topY + 2.1} r={0.5} fill="#450a0a" />
        <circle cx={44} cy={topY + 2.1} r={0.5} fill="#450a0a" />
        <circle cx={40} cy={topY - 9} r={1.1} fill="#b91c1c" />
        <circle cx={39.6} cy={topY - 9.4} r={0.4} fill="#fca5a5" opacity={0.9} />
      </g>
    )
  }
  // --- CUTESY / GIRLY universal accessories ----------------------------------------------
  if (accessory === 'bow') {
    // A big cute ribbon bow centred on top of the head: two loops (left + right) in pink with a
    // deeper inner shade, a center knot, and two short ribbon tails hanging down. Bigger and
    // centred than the small side ribbon.
    const by = topY - 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The two short ribbon tails hanging down behind the knot. */}
        <path d={`M 39 ${by + 0.5} L 37 ${by + 6} L 39.4 ${by + 5} Z`} fill="#ec4899" />
        <path d={`M 41 ${by + 0.5} L 43 ${by + 6} L 40.6 ${by + 5} Z`} fill="#ec4899" />
        {/* The left loop — outer pink with a deeper inner shade. */}
        <path d={`M 40 ${by} Q 31 ${by - 4.5} 31.5 ${by + 0.5} Q 31 ${by + 5} 40 ${by + 1.5} Z`} fill="#f9a8d4" />
        <path d={`M 40 ${by} Q 34 ${by - 2.4} 34 ${by + 0.5} Q 34 ${by + 3} 40 ${by + 1.2} Z`} fill="#ec4899" opacity={0.55} />
        {/* The right loop — mirror of the left. */}
        <path d={`M 40 ${by} Q 49 ${by - 4.5} 48.5 ${by + 0.5} Q 49 ${by + 5} 40 ${by + 1.5} Z`} fill="#f9a8d4" />
        <path d={`M 40 ${by} Q 46 ${by - 2.4} 46 ${by + 0.5} Q 46 ${by + 3} 40 ${by + 1.2} Z`} fill="#ec4899" opacity={0.55} />
        {/* The center knot cinching the loops. */}
        <rect x={38} y={by - 1.6} width={4} height={4.6} rx={1.4} fill="#be185d" />
        <circle cx={39.2} cy={by - 0.4} r={0.5} fill="#fbcfe8" opacity={0.9} />
      </g>
    )
  }
  if (accessory === 'tiara') {
    // A princess tiara on the brow: a gold band rising to three points — a tall central peak with a
    // pink gem flanked by two smaller points with blue gems — plus sparkle glints. Always gold so it
    // reads as jewellery on any creature.
    const gold = '#fcd34d'
    const gleam = '#fde68a'
    const spark = '#fffbeb'
    const ty = topY + 2
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The band, dipping at the sides and rising to three points. */}
        <path
          d={`M 32 ${ty + 1.5} Q 35 ${ty - 0.5} 36 ${ty - 2.6} Q 38 ${ty - 1} 40 ${ty - 2.2} Q 42 ${ty - 1} 44 ${ty - 2.6} Q 45 ${ty - 0.5} 48 ${ty + 1.5}`}
          fill="none"
          stroke={gold}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* A lighter inner gleam along the band. */}
        <path
          d={`M 33 ${ty + 1.2} Q 36.5 ${ty - 0.6} 40 ${ty - 1.6} Q 43.5 ${ty - 0.6} 47 ${ty + 1.2}`}
          fill="none"
          stroke={gleam}
          strokeWidth={0.6}
          strokeLinecap="round"
          opacity={0.9}
        />
        {/* Blue gems on the two side points, and the bigger pink gem at the central peak. */}
        <circle cx={36} cy={ty - 3} r={1.1} fill="#60a5fa" />
        <circle cx={44} cy={ty - 3} r={1.1} fill="#60a5fa" />
        <circle cx={40} cy={ty - 3} r={1.7} fill="#f472b6" />
        <circle cx={39.4} cy={ty - 3.6} r={0.5} fill="#fce7f3" opacity={0.95} />
        {/* Sparkle glints. */}
        {([[34, ty - 1], [46, ty - 1], [40, ty - 5.2]] as const).map(([x, y], k) => (
          <circle key={`sp-${k}`} cx={x} cy={y} r={0.4} fill={spark} opacity={0.9} />
        ))}
      </g>
    )
  }
  if (accessory === 'heart_clip') {
    // A heart hair-clip to one side: a small pink heart on a little metal clip bar, with a tiny
    // white highlight. Cutesy.
    const hx = 46
    const hy = topY - 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The little clip bar the heart is pinned to. */}
        <rect x={hx - 2.6} y={hy + 1.6} width={5.6} height={1.6} rx={0.8} fill="#9ca3af" />
        <circle cx={hx - 2.4} cy={hy + 2.4} r={0.5} fill="#6b7280" />
        {/* The heart — pink fill with a deeper edge and a tiny highlight. */}
        <path
          d={`M ${hx} ${hy + 2} C ${hx - 2.4} ${hy - 1} ${hx - 3} ${hy - 3.4} ${hx} ${hy - 1.6}
              C ${hx + 3} ${hy - 3.4} ${hx + 2.4} ${hy - 1} ${hx} ${hy + 2} Z`}
          fill="#f472b6"
          stroke="#ec4899"
          strokeWidth={0.6}
        />
        <circle cx={hx - 1} cy={hy - 1.4} r={0.6} fill="#fce7f3" opacity={0.95} />
      </g>
    )
  }
  // --- ADORED THINGS (worn darlings) -----------------------------------------------------
  if (accessory === 'wired_earbuds') {
    // The iconic white WIRED earbuds: two buds tucked at the sides of the head, thin white cords
    // dropping down to a Y-junction with a little inline remote, then a single cord trailing off.
    const cord = '#eaeef3'
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The dangling cords: one from each bud, meeting at a junction, then a single lead down. */}
        <path d={`M 32 ${topY + 9} Q 34 ${topY + 20} 39.6 ${topY + 26}`} fill="none" stroke={cord} strokeWidth={1.2} strokeLinecap="round" />
        <path d={`M 48 ${topY + 9} Q 46 ${topY + 20} 40.4 ${topY + 26}`} fill="none" stroke={cord} strokeWidth={1.2} strokeLinecap="round" />
        <path d={`M 40 ${topY + 26} L 40.4 ${topY + 34}`} fill="none" stroke={cord} strokeWidth={1.2} strokeLinecap="round" />
        {/* A small inline remote/mic on the joined cord. */}
        <rect x={39} y={topY + 28} width={2.6} height={3.4} rx={0.8} fill="#e2e8f0" stroke="#c5cfdb" strokeWidth={0.3} />
        {/* The two earbuds tucked at the head's sides. */}
        {[31.8, 48.2].map((ex, k) => (
          <g key={`bud-${k}`}>
            <ellipse cx={ex} cy={topY + 7} rx={2.2} ry={2.6} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.4} />
            <circle cx={ex} cy={topY + 6.6} r={1} fill="#9aa7b8" />
            <rect x={ex - 0.7} y={topY + 8.6} width={1.4} height={2} rx={0.6} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.3} />
            <circle cx={ex - 0.7} cy={topY + 5.6} r={0.5} fill="#ffffff" opacity={0.9} />
          </g>
        ))}
      </g>
    )
  }
  if (accessory === 'cat_ears') {
    // A kawaii CAT-EARS headband: a slim band over the crown with two triangular ears — dark outer
    // fur with a soft pink inner — and a tiny bow where the band meets one ear.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The band arcing over the crown. */}
        <path d={`M 33 ${topY + 3} Q 40 ${topY - 4} 47 ${topY + 3}`} fill="none" stroke="#4b4453" strokeWidth={2} strokeLinecap="round" />
        {/* Two ears — outer fur + inner pink. */}
        {[[34.5, -1], [45.5, 1]].map(([bx, dir], k) => (
          <g key={`ear-${k}`}>
            <path d={`M ${bx - 2.4} ${topY + 1.5} L ${bx + dir * 0.6} ${topY - 6.5} L ${bx + 2.4} ${topY + 1.5} Z`} fill="#4b4453" />
            <path d={`M ${bx - 1.1} ${topY + 0.6} L ${bx + dir * 0.4} ${topY - 4} L ${bx + 1.3} ${topY + 0.6} Z`} fill="#fb7185" />
          </g>
        ))}
        {/* A tiny bow at the base of the right ear. */}
        <path d={`M 45.5 ${topY + 2.2} l -2 -1.2 l 0 2.4 z`} fill="#f472b6" />
        <path d={`M 45.5 ${topY + 2.2} l 2 -1.2 l 0 2.4 z`} fill="#f472b6" />
        <circle cx={45.5} cy={topY + 2.2} r={0.7} fill="#ec4899" />
      </g>
    )
  }
  if (accessory === 'bucket_hat') {
    // A trendy denim BUCKET HAT: a rounded crown dome, a downturned brim, a topstitch line and a
    // little woven tag on the brim.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The crown dome. */}
        <path d={`M 33.5 ${topY + 5} Q 33 ${topY - 6} 40 ${topY - 6} Q 47 ${topY - 6} 46.5 ${topY + 5} Z`} fill="#7c9cc4" />
        {/* A topstitch band near the crown base. */}
        <path d={`M 34 ${topY + 2.5} Q 40 ${topY + 4} 46 ${topY + 2.5}`} fill="none" stroke="#9db6d6" strokeWidth={0.5} strokeDasharray="1 1" />
        {/* The downturned brim. */}
        <path d={`M 29.5 ${topY + 5} Q 40 ${topY + 11} 50.5 ${topY + 5} Q 40 ${topY + 8} 29.5 ${topY + 5} Z`} fill="#6a89b3" />
        <path d={`M 30.5 ${topY + 5.6} Q 40 ${topY + 10.4} 49.5 ${topY + 5.6}`} fill="none" stroke="#5b789f" strokeWidth={0.5} strokeDasharray="1 1" />
        {/* A little tag on the brim. */}
        <rect x={44} y={topY + 5.4} width={2.4} height={1.6} rx={0.4} fill="#e2e8f0" />
      </g>
    )
  }
  if (accessory === 'beret') {
    // A soft artist's BERET tilted on the crown, with a little stalk on top and a felt highlight.
    const felt = '#a23e5c'
    const feltDeep = '#7f2c44'
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The soft round beret, tilted, sitting on the crown. */}
        <path d={`M 32 ${topY + 3} Q 33 ${topY - 5} 41 ${topY - 5} Q 49 ${topY - 4} 48 ${topY + 2} Q 40 ${topY + 4} 32 ${topY + 3} Z`} fill={felt} />
        {/* A darker under-band rim. */}
        <path d={`M 33 ${topY + 2.4} Q 40 ${topY + 4.2} 47.5 ${topY + 2.2}`} fill="none" stroke={feltDeep} strokeWidth={1} strokeLinecap="round" opacity={0.7} />
        {/* The little stalk on top + a soft highlight. */}
        <circle cx={41} cy={topY - 5.4} r={0.9} fill={feltDeep} />
        <path d={`M 35 ${topY - 2} Q 39 ${topY - 3.5} 43 ${topY - 2.6}`} fill="none" stroke="#c96a83" strokeWidth={0.7} strokeLinecap="round" opacity={0.6} />
      </g>
    )
  }
  if (accessory === 'flower_crown') {
    // A cottagecore FLOWER CROWN: a leafy vine arcing over the head strung with five little
    // five-petal blooms in soft pastels, with a couple of leaves tucked between.
    const leaf = '#6fbf73'
    const spots: [number, number][] = [
      [32, topY + 4], [35, topY - 1], [40, topY - 3.4], [45, topY - 1], [48, topY + 4],
    ]
    const petalCols = ['#fbcfe8', '#fda4af', '#fde68a', '#c4b5fd', '#fbcfe8']
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The vine band. */}
        <path d={`M 31 ${topY + 4} Q 40 ${topY - 5} 49 ${topY + 4}`} fill="none" stroke={leaf} strokeWidth={1.4} strokeLinecap="round" />
        {/* Leaves tucked between flowers. */}
        {[[34, topY + 1], [46, topY + 1]].map(([x, y], k) => (
          <path key={`lf-${k}`} d={`M ${x} ${y} q 2 -1 3 1 q -2 1 -3 -1 z`} fill={leaf} opacity={0.9} />
        ))}
        {/* The flowers — five petals + an amber centre each. */}
        {spots.map(([x, y], k) => (
          <g key={`fl-${k}`}>
            {[0, 1, 2, 3, 4].map((p) => {
              const a = ((p * 72 - 90) * Math.PI) / 180
              return <circle key={p} cx={x + Math.cos(a) * 1.5} cy={y + Math.sin(a) * 1.5} r={1} fill={petalCols[k]} />
            })}
            <circle cx={x} cy={y} r={0.9} fill="#f6a623" />
          </g>
        ))}
      </g>
    )
  }
  // --- ONSEN & EARTH (the cosy hot-spring set) ---------------------------------------------
  if (accessory === 'onsen_towel') {
    // The folded white onsen towel resting flat on the crown — the capybara-soak look: two soft
    // stacked layers with fold creases, a classic pale-blue border stripe, and a wisp of steam.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The lower folded layer, slightly wider. */}
        <rect x={34.2} y={topY + 0.4} width={11.6} height={2.8} rx={1.3} fill="#f4f1ea" transform={`rotate(-4 40 ${topY + 1.8})`} />
        {/* The top folded layer. */}
        <rect x={35.2} y={topY - 2} width={9.6} height={3} rx={1.4} fill="#fbf9f4" transform={`rotate(-4 40 ${topY - 0.5})`} />
        {/* Fold creases across the top layer. */}
        {[38, 41.6].map((x, k) => (
          <path key={`cr-${k}`} d={`M ${x} ${topY - 1.6} l -0.3 2.2`} stroke="#d9d2c5" strokeWidth={0.4} strokeLinecap="round" transform={`rotate(-4 40 ${topY - 0.5})`} />
        ))}
        {/* The classic pale-blue border stripe on the lower layer. */}
        <path d={`M 35 ${topY + 2.5} l 9.8 0`} stroke="#7fb5d1" strokeWidth={0.6} strokeLinecap="round" transform={`rotate(-4 40 ${topY + 1.8})`} />
        {/* A soft wisp of steam rising off the towel. */}
        <path d={`M 44 ${topY - 3.5} q 1.4 -1.6 0.4 -3.2`} fill="none" stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" opacity={0.5} />
      </g>
    )
  }
  if (accessory === 'yuzu') {
    // A little yuzu balanced on the crown (like the capybara's) — a warm citrus ball with a
    // dimpled base, a bright highlight, a stem dot and one glossy leaf.
    const yy = topY - 1
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        <circle cx={40} cy={yy} r={2.8} fill="#f7a91f" />
        <circle cx={39} cy={yy - 1} r={0.85} fill="#fbd07a" opacity={0.9} />
        <ellipse cx={40} cy={yy + 2.3} rx={1.1} ry={0.5} fill="#d98917" opacity={0.6} />
        <circle cx={40} cy={yy - 2.6} r={0.45} fill="#8a5a12" />
        <path d={`M 40.4 ${yy - 3} q 2 -1.2 3 0 q -1.6 0.8 -3 0 z`} fill="#4ade80" />
      </g>
    )
  }
  return null
}

// A small friend that keeps the spirit company — drawn at the bottom-left of the 80×80
// viewBox, in front of the habitat but well clear of the centred figure, so it never fights
// the spirit. Static like every other cosmetic (the outer layer carries any animation).
function Companion({
  companion,
  g,
  pal,
  path,
}: {
  companion: string
  g: number
  pal?: BodyPalette
  // Drives per-path variants (e.g. the firefly reads as a rising ember for fire, a drifting seed
  // for earth, a breeze-borne wisp for air). Null (pathless spark) → the default look.
  path?: SpiritPath | null
}) {
  // The little friend sits on the ground band, off to the left of the figure.
  const baseX = 16
  const baseY = 62
  if (companion === 'firefly') {
    // Layered glowing dots — cast in the spirit's own light (its palette). The trailing detail is a
    // PER-PATH VARIANT: embers RISE for fire, a little seed-leaf sits beside it for earth, a breeze
    // wisp trails sideways for air. A pathless spark keeps the classic warm firefly + drifting spark.
    const m = pal
      ? { halo: pal.glow, aura: pal.accent, core: pal.glow, pin: pal.core }
      : { halo: '#fde68a', aura: '#fcd34d', core: '#fef08a', pin: '#fffbeb' }
    const spark = pal ? pal.glow : '#fde68a'
    return (
      <g opacity={g} aria-hidden="true">
        {[
          { x: baseX - 2, y: baseY - 6 },
          { x: baseX + 6, y: baseY - 12 },
        ].map((d, k) => (
          <g key={k}>
            <circle cx={d.x} cy={d.y} r={4.4} fill={m.halo} opacity={0.16} />
            <circle cx={d.x} cy={d.y} r={3} fill={m.aura} opacity={0.42} />
            <circle cx={d.x} cy={d.y} r={1.6} fill={m.core} opacity={0.95} />
            <circle cx={d.x - 0.4} cy={d.y - 0.4} r={0.7} fill={m.pin} opacity={0.95} />
            {/* Per-path trailing detail. */}
            {path === 'breath' && (
              <circle cx={d.x + 1.2} cy={d.y - 3} r={0.6} fill={spark} opacity={0.6} />
            )}
            {path === 'stillness' && (
              <ellipse
                cx={d.x + 2.4}
                cy={d.y + 2.2}
                rx={1.4}
                ry={0.7}
                fill={spark}
                opacity={0.6}
                transform={`rotate(35 ${d.x + 2.4} ${d.y + 2.2})`}
              />
            )}
            {path === 'heart' && (
              <path
                d={`M ${d.x - 2} ${d.y + 2.4} q 2 -1.4 4 0`}
                fill="none"
                stroke={spark}
                strokeWidth={0.7}
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
            {!path && <circle cx={d.x - 2.6} cy={d.y + 2.4} r={0.7} fill={spark} opacity={0.5} />}
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
  // --- Premium companions (higher-tier universal picks) ----------------------------------
  if (companion === 'phoenix') {
    // A small glowing firebird — warm body, upswept flame-wings, a crest, and a long trailing tail
    // of ember feathers with drifting sparks. Fixed warm palette so it always reads as fire; a soft
    // halo gives it a radiant glow.
    const cx = baseX
    const cy = baseY - 5
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        <circle cx={cx} cy={cy} r={9} fill="#fb923c" opacity={0.12} />
        {/* Long ember tail sweeping down-right, with a few drifting sparks. */}
        <path d={`M ${cx + 1} ${cy + 1} q 8 3 12 10 q -6 -2 -9 -1 q 3 -3 -3 -9 z`} fill="#f97316" opacity={0.85} />
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={cx + 8 + k * 2} cy={cy + 9 + k * 1.5} r={0.7 - k * 0.15} fill="#fdba74" opacity={0.7} />
        ))}
        {/* Upswept flame wings. */}
        <path d={`M ${cx} ${cy} q -7 -6 -9 -12 q 6 2 10 7 z`} fill="#ef4444" opacity={0.9} />
        <path d={`M ${cx} ${cy} q 6 -6 10 -8 q -2 6 -6 9 z`} fill="#f97316" opacity={0.9} />
        {/* Body + head. */}
        <ellipse cx={cx} cy={cy + 1} rx={3.4} ry={4} fill="#fb923c" />
        <ellipse cx={cx - 0.6} cy={cy + 2} rx={2} ry={2.6} fill="#fed7aa" opacity={0.8} />
        <circle cx={cx} cy={cy - 3.4} r={2.4} fill="#f97316" />
        {/* Crest flame. */}
        <path d={`M ${cx} ${cy - 5.6} q -1 -2.4 0.6 -3.6 q 0.4 2 1.4 2.6 q -1 0.6 -2 1 z`} fill="#fbbf24" />
        {/* Beak + eye. */}
        <path d={`M ${cx + 2} ${cy - 3.6} l 2.4 0.6 l -2.2 0.9 z`} fill="#fcd34d" />
        <circle cx={cx + 0.7} cy={cy - 3.8} r={0.5} fill="#0f172a" />
        <circle cx={cx + 0.55} cy={cy - 4} r={0.2} fill="#fff" />
      </g>
    )
  }
  if (companion === 'koi') {
    // A serene white koi with soft orange patches, flowing tail + fins, nose to the right — drifts
    // beside the spirit.
    const cx = baseX
    const cy = baseY - 3
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Flowing double-lobe tail fin at the left. */}
        <path d={`M ${cx - 4} ${cy} q -4 -2.5 -6.5 -1.5 q 2.5 1.5 2.5 1.5 q -2.5 0 -2.5 1.5 q 2.5 1 6.5 -1.5 z`} fill="#fecdd3" opacity={0.9} />
        {/* Body — a smooth koi silhouette, nose at right tapering to the tail. */}
        <path d={`M ${cx - 4} ${cy} q 3 -3.4 7 -3.4 q 4 0 4.2 3.4 q -0.2 3.4 -4.2 3.4 q -4 0 -7 -3.4 z`} fill="#f8fafc" />
        {/* Dorsal + pectoral fins. */}
        <path d={`M ${cx + 1} ${cy - 3} q 0.6 -1.8 2.2 -2 q -0.2 1.4 -0.6 2.3 z`} fill="#fecdd3" opacity={0.9} />
        <path d={`M ${cx + 2} ${cy + 1.6} q 1 1.6 0.4 2.8 q -1.2 -0.8 -1.6 -2.2 z`} fill="#fecdd3" opacity={0.8} />
        {/* Two soft orange patches, kept within the body. */}
        <ellipse cx={cx + 3.4} cy={cy - 0.8} rx={1.7} ry={1.3} fill="#fb923c" />
        <ellipse cx={cx - 0.6} cy={cy + 0.6} rx={1.3} ry={1} fill="#f97316" opacity={0.9} />
        {/* Eye (+ glint) + a soft barbel near the nose. */}
        <circle cx={cx + 5.4} cy={cy - 0.3} r={0.55} fill="#0f172a" />
        <circle cx={cx + 5.25} cy={cy - 0.5} r={0.2} fill="#fff" />
        <path d={`M ${cx + 6} ${cy + 0.6} q 1.2 0.8 2.2 0.3`} fill="none" stroke="#fca5a5" strokeWidth={0.4} strokeLinecap="round" opacity={0.7} />
      </g>
    )
  }
  if (companion === 'jellyfish') {
    // A translucent glowing jellyfish — a soft bell with trailing wavy tendrils, cast in the spirit's
    // light (palette-tinted) with a bright rim. Ethereal + airy; floats a touch higher.
    const cx = baseX
    const cy = baseY - 8
    const bell = pal ? pal.glow : '#a5b4fc'
    const rim = pal ? pal.core : '#e0e7ff'
    const tend = pal ? pal.accent : '#818cf8'
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        <circle cx={cx} cy={cy} r={8} fill={bell} opacity={0.12} />
        {/* Trailing tendrils. */}
        {[-2.5, -0.8, 0.8, 2.5].map((dx, k) => (
          <path key={k} d={`M ${cx + dx} ${cy + 2.5} q ${k % 2 ? 1.5 : -1.5} 4 0 8`} fill="none" stroke={tend} strokeWidth={0.7} strokeLinecap="round" opacity={0.55} />
        ))}
        {/* The bell dome. */}
        <path d={`M ${cx - 5} ${cy + 2.5} q 0 -8 5 -8 q 5 0 5 8 q -5 -2.4 -10 0 z`} fill={bell} opacity={0.7} />
        {/* Inner glow + rim highlight. */}
        <path d={`M ${cx - 4.4} ${cy + 2} q 0 -6.6 4.4 -6.6 q 4.4 0 4.4 6.6 q -4.4 -2 -8.8 0 z`} fill={rim} opacity={0.35} />
        <ellipse cx={cx - 1.4} cy={cy - 3} rx={1.4} ry={2} fill={rim} opacity={0.7} />
      </g>
    )
  }
  if (companion === 'luna_moth') {
    // An elegant pale-green luna moth: two forewings + two long-tailed hindwings, a slim body, and
    // feathery antennae. A faint glow; fixed luna palette so it always reads pale-green.
    const cx = baseX
    const cy = baseY - 6
    const wing = '#a7f3d0'
    const wing2 = '#6ee7b7'
    const edge = '#5eead4'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        <circle cx={cx} cy={cy} r={8} fill={wing} opacity={0.1} />
        {[-1, 1].map((dir) => (
          <g key={dir}>
            {/* Forewing. */}
            <path d={`M ${cx} ${cy - 1} q ${dir * 7} -5 ${dir * 6} 1 q ${dir * -3} 2 ${dir * -6} 0 z`} fill={wing} stroke={edge} strokeWidth={0.3} />
            {/* Long-tailed hindwing. */}
            <path d={`M ${cx} ${cy + 0.5} q ${dir * 5} 2 ${dir * 4} 5 q ${dir * -1} 3 ${dir * -2} 5 q ${dir * -2} -4 ${dir * -2} -10 z`} fill={wing2} stroke={edge} strokeWidth={0.3} />
            {/* Eyespot. */}
            <circle cx={cx + dir * 3.4} cy={cy - 1.4} r={0.7} fill={edge} opacity={0.7} />
          </g>
        ))}
        {/* Body. */}
        <ellipse cx={cx} cy={cy} rx={1} ry={3.4} fill="#ecfeff" />
        <circle cx={cx} cy={cy - 3.4} r={1.1} fill="#f0fdfa" />
        {/* Feathery antennae. */}
        {[-1, 1].map((dir) => (
          <path key={dir} d={`M ${cx} ${cy - 4} q ${dir * 1.5} -1.5 ${dir * 2.5} -1`} fill="none" stroke="#34d399" strokeWidth={0.4} strokeLinecap="round" />
        ))}
      </g>
    )
  }
  // --- ADORED THINGS (universal darlings) ------------------------------------------------
  // Beloved little friends people already adore, with fixed identity palettes so each always
  // reads on-brand (like koi/phoenix/dragon): a fuzzy duckling, a smiley axolotl, a bubble-tea
  // cup, and the unbothered capybara with a yuzu on its head.
  if (companion === 'duckling') {
    // A round fuzzy yellow duckling facing the spirit: plump body, a folded wing, a fluffy crown
    // tuft, an orange bill + webbed feet, and a bright eye with a glint.
    const cx = baseX
    const cy = baseY - 3
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Webbed feet on the ground. */}
        {[-2.2, 2.2].map((dx, k) => (
          <path key={`foot-${k}`} d={`M ${cx + dx} ${cy + 4} l -1.8 2.2 l 3.6 0 z`} fill="#fb923c" />
        ))}
        {/* Plump body. */}
        <ellipse cx={cx} cy={cy} rx={5.6} ry={5} fill="#ffd93d" />
        {/* A paler downy belly. */}
        <ellipse cx={cx - 0.4} cy={cy + 1.6} rx={3.6} ry={2.8} fill="#fff0b3" opacity={0.85} />
        {/* A folded wing tucked on the near side. */}
        <path d={`M ${cx + 1} ${cy - 1} q 4 0.6 4.6 4 q -3 0.4 -4.8 -1.2 z`} fill="#f6c915" />
        {/* Head up and to the right, facing the spirit. */}
        <circle cx={cx + 3.4} cy={cy - 6} r={3.7} fill="#ffd93d" />
        {/* Fluffy crown tufts. */}
        {[-1.4, 0.2, 1.6].map((dx, k) => (
          <path key={`tuft-${k}`} d={`M ${cx + 3.4 + dx} ${cy - 9} q ${dx < 0 ? -1 : 1} -1.8 0.2 -2.6`} fill="none" stroke="#ffe066" strokeWidth={1.1} strokeLinecap="round" />
        ))}
        {/* Orange bill pointing toward the spirit. */}
        <path d={`M ${cx + 6.6} ${cy - 5.6} l 3.2 0.6 q 0.6 0.8 0 1.6 l -3 0.6 z`} fill="#fb923c" />
        <path d={`M ${cx + 6.8} ${cy - 4.4} l 2.6 0.5`} stroke="#ea7a1f" strokeWidth={0.4} />
        {/* Eye + glint + a soft cheek. */}
        <circle cx={cx + 4} cy={cy - 6.4} r={0.8} fill="#20160a" />
        <circle cx={cx + 3.7} cy={cy - 6.7} r={0.28} fill="#fff" />
        <circle cx={cx + 5.4} cy={cy - 4.8} r={0.9} fill="#fca5a5" opacity={0.45} />
      </g>
    )
  }
  if (companion === 'axolotl') {
    // A beaming pale-pink axolotl: a chubby head-body, a paddle tail, three feathery external gills
    // sweeping back on each side, dot eyes and the iconic wide upturned smile, with rosy cheeks.
    const cx = baseX
    const cy = baseY - 4
    const frill = '#fb6f92'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Paddle tail trailing left. */}
        <path d={`M ${cx - 5} ${cy + 1} q -5 -1 -7 1.5 q 2.5 0.6 3 1 q -2 0.8 -2.6 2.4 q 4 -0.6 6.6 -2.4 z`} fill="#fbbdd6" />
        {/* The chubby body/head — axolotls are mostly a big friendly head. */}
        <ellipse cx={cx} cy={cy} rx={6.6} ry={5.2} fill="#f9a8d4" />
        {/* Feathery gills: three per side, a stalk + a frilly tip. */}
        {[-1, 1].map((dir) => (
          <g key={`gill-${dir}`}>
            {[-0.5, 0.35, 1.15].map((t, k) => {
              const gx = cx + dir * 5.2
              const gy = cy - 3.6
              const ang = -70 + t * 55
              const rad = (ang * Math.PI) / 180
              const tx = gx + dir * Math.cos(rad) * 5
              const ty = gy - Math.sin(rad) * 5
              return (
                <g key={k}>
                  <path d={`M ${gx} ${gy} Q ${gx + dir * 1} ${gy - 2.5} ${tx} ${ty}`} fill="none" stroke="#f487ac" strokeWidth={1.2} strokeLinecap="round" />
                  <circle cx={tx} cy={ty} r={1.5} fill={frill} opacity={0.9} />
                  <circle cx={tx + dir * 0.9} cy={ty + 0.6} r={1} fill={frill} opacity={0.7} />
                </g>
              )
            })}
          </g>
        ))}
        {/* Dot eyes + glints. */}
        {[-2.4, 2.4].map((dx, k) => (
          <g key={`eye-${k}`}>
            <circle cx={cx + dx} cy={cy - 1.4} r={0.95} fill="#2a2233" />
            <circle cx={cx + dx - 0.3} cy={cy - 1.7} r={0.3} fill="#fff" />
          </g>
        ))}
        {/* Rosy cheeks. */}
        {[-4, 4].map((dx, k) => (
          <circle key={`cheek-${k}`} cx={cx + dx} cy={cy + 1.2} r={1.3} fill="#fb7185" opacity={0.5} />
        ))}
        {/* The iconic wide upturned smile. */}
        <path d={`M ${cx - 2.6} ${cy + 1.6} q 2.6 2.6 5.2 0`} fill="none" stroke="#b0466a" strokeWidth={0.9} strokeLinecap="round" />
      </g>
    )
  }
  if (companion === 'boba') {
    // A cheerful bubble-tea cup floating beside the spirit: a clear tapered cup of milk tea, a
    // domed lid, a fat straw poking through, dark tapioca pearls settled at the bottom, and a
    // little face so it reads as a character.
    const cx = baseX
    const cy = baseY - 3
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* The tapered cup body (wider at the top). */}
        <path
          d={`M ${cx - 4.6} ${cy - 7} L ${cx + 4.6} ${cy - 7} L ${cx + 3.4} ${cy + 5} Q ${cx} ${cy + 6.4} ${cx - 3.4} ${cy + 5} Z`}
          fill="#f3e9db"
        />
        {/* The milk-tea fill inside. */}
        <path
          d={`M ${cx - 4} ${cy - 3} L ${cx + 4} ${cy - 3} L ${cx + 3.2} ${cy + 4.6} Q ${cx} ${cy + 5.8} ${cx - 3.2} ${cy + 4.6} Z`}
          fill="#d8b48c"
        />
        {/* Tapioca pearls settled at the bottom. */}
        {([[-1.6, 4], [0.4, 4.4], [2, 3.8], [-0.6, 3.2], [1.4, 2.6]] as const).map(([dx, dy], k) => (
          <circle key={`pearl-${k}`} cx={cx + dx} cy={cy + dy} r={1} fill="#2b2320" />
        ))}
        {/* A glossy highlight down the cup. */}
        <path d={`M ${cx - 3} ${cy - 5.5} l -0.5 8`} stroke="#fffaf0" strokeWidth={0.9} strokeLinecap="round" opacity={0.5} />
        {/* The domed lid + rim. */}
        <path d={`M ${cx - 5} ${cy - 7} q 5 -3 10 0 z`} fill="#efe4d3" />
        <rect x={cx - 5} y={cy - 7.4} width={10} height={1.4} rx={0.7} fill="#e3d5bf" />
        {/* A fat straw poking up through the lid. */}
        <rect x={cx + 0.6} y={cy - 15} width={2.4} height={9} rx={1.1} fill="#ef6f9e" transform={`rotate(9 ${cx + 1.8} ${cy - 10})`} />
        <rect x={cx + 0.6} y={cy - 15} width={2.4} height={2.4} rx={1.1} fill="#f78fb4" transform={`rotate(9 ${cx + 1.8} ${cy - 10})`} />
        {/* A little face on the cup. */}
        {[-1.8, 1.8].map((dx, k) => (
          <circle key={`bface-${k}`} cx={cx + dx} cy={cy - 1} r={0.7} fill="#5b4a3a" />
        ))}
        <path d={`M ${cx - 1.4} ${cy + 0.6} q 1.4 1.2 2.8 0`} fill="none" stroke="#5b4a3a" strokeWidth={0.7} strokeLinecap="round" />
      </g>
    )
  }
  if (companion === 'capybara') {
    // The unbothered capybara: a chunky brown loaf with a blocky head, tiny ears, a squared muzzle
    // and heavy-lidded sleepy eyes — with a little yuzu (citrus) balanced on its head and a couple
    // of soft steam wisps, the beloved hot-spring look. The calm mascot of the collection.
    const cx = baseX
    const cy = baseY - 3
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Soft steam wisps rising behind (the onsen vibe). */}
        {[-3, 5].map((dx, k) => (
          <path key={`steam-${k}`} d={`M ${cx + dx} ${cy - 10} q ${k ? 2 : -2} -3 0 -5 q ${k ? -2 : 2} -2 0 -4`} fill="none" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" opacity={0.3} />
        ))}
        {/* Stubby legs. */}
        {[-4.5, 3.5].map((dx, k) => (
          <rect key={`leg-${k}`} x={cx + dx} y={cy + 3} width={2.8} height={3.4} rx={1.2} fill="#7d5a3c" />
        ))}
        {/* The loaf body. */}
        <ellipse cx={cx - 0.5} cy={cy} rx={9.6} ry={6.2} fill="#9b7653" />
        {/* A darker lower belly for weight. */}
        <ellipse cx={cx - 0.5} cy={cy + 1.8} rx={8} ry={3.8} fill="#83603f" opacity={0.45} />
        {/* The head hump on the right, facing the spirit. */}
        <ellipse cx={cx + 6} cy={cy - 4} rx={5.4} ry={4.8} fill="#a07a52" />
        {/* Tiny rounded ears. */}
        {[[cx + 3.4, cy - 8.4], [cx + 8, cy - 8.2]].map(([ex, ey], k) => (
          <g key={`ear-${k}`}>
            <ellipse cx={ex} cy={ey} rx={1.7} ry={2} fill="#83603f" />
            <ellipse cx={ex} cy={ey + 0.3} rx={0.8} ry={1} fill="#5f4530" />
          </g>
        ))}
        {/* Squared muzzle + nose. */}
        <ellipse cx={cx + 10.4} cy={cy - 2.6} rx={2.7} ry={2.3} fill="#b18a60" />
        <ellipse cx={cx + 11.6} cy={cy - 3} rx={1} ry={0.8} fill="#4a3626" />
        {/* Heavy-lidded, blissfully sleepy eyes (two short down-arcs). */}
        {[[cx + 4.4, cy - 4.6], [cx + 8.4, cy - 4.6]].map(([ex, ey], k) => (
          <path key={`eye-${k}`} d={`M ${ex - 1.2} ${ey} q 1.2 1.2 2.4 0`} fill="none" stroke="#4a3626" strokeWidth={0.85} strokeLinecap="round" />
        ))}
        {/* The yuzu balanced on the head — the signature touch. */}
        <circle cx={cx + 6} cy={cy - 11} r={2.4} fill="#f4a72c" />
        <circle cx={cx + 5.2} cy={cy - 11.8} r={0.7} fill="#fbd07a" opacity={0.9} />
        <ellipse cx={cx + 6} cy={cy - 8.9} rx={1} ry={0.5} fill="#d98917" opacity={0.6} />
        <path d={`M ${cx + 6.4} ${cy - 13.1} q 1.8 -1 2.6 0.2 q -1.4 0.6 -2.6 0.2 z`} fill="#4ade80" />
      </g>
    )
  }
  if (companion === 'mushroom') {
    // A cheerful red toadstool: a spotted red cap over a cream stem-body with a little face.
    const cx = baseX
    const cy = baseY - 2
    const cap = '#e5484d'
    const capDeep = '#c13b3f'
    const stem = '#f3e9d2'
    const ink = '#5b4a3a'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* The cream stem-body. */}
        <path d={`M ${cx - 3} ${cy + 5} Q ${cx - 3.4} ${cy - 2} ${cx} ${cy - 2} Q ${cx + 3.4} ${cy - 2} ${cx + 3} ${cy + 5} Q ${cx} ${cy + 6} ${cx - 3} ${cy + 5} Z`} fill={stem} />
        {/* A little face on the stem. */}
        {[-1.4, 1.4].map((dx, k) => (
          <circle key={`e-${k}`} cx={cx + dx} cy={cy + 1.4} r={0.7} fill={ink} />
        ))}
        {[-2.2, 2.2].map((dx, k) => (
          <circle key={`ch-${k}`} cx={cx + dx} cy={cy + 2.4} r={0.8} fill="#fca5a5" opacity={0.5} />
        ))}
        <path d={`M ${cx - 1.2} ${cy + 3} q 1.2 1 2.4 0`} fill="none" stroke={ink} strokeWidth={0.6} strokeLinecap="round" />
        {/* The red cap dome. */}
        <path d={`M ${cx - 6} ${cy - 1.5} Q ${cx} ${cy - 9} ${cx + 6} ${cy - 1.5} Q ${cx} ${cy - 3} ${cx - 6} ${cy - 1.5} Z`} fill={cap} />
        <path d={`M ${cx - 6} ${cy - 1.5} Q ${cx} ${cy - 3} ${cx + 6} ${cy - 1.5}`} fill="none" stroke={capDeep} strokeWidth={0.5} opacity={0.6} />
        {/* White spots on the cap. */}
        {([[-3, -2.6, 1], [0.6, -4, 1.3], [3.2, -2.4, 0.9], [-1, -3, 0.7]] as const).map(([dx, dy, r], k) => (
          <circle key={`sp-${k}`} cx={cx + dx} cy={cy + dy} r={r} fill="#fdf2f8" opacity={0.95} />
        ))}
      </g>
    )
  }
  if (companion === 'hedgehog') {
    // A round hedgehog: a dome of brown spikes fanning over the back, a cream face + pointy snout
    // poking out to the front-right, a dot eye and a rosy cheek.
    const cx = baseX
    const cy = baseY - 2
    const spike = '#8a6f52'
    const spikeDeep = '#6f5638'
    const face = '#f0d9b8'
    const ink = '#3f2f22'
    const spikes = Array.from({ length: 10 }, (_, k) => {
      const t = k / 9
      const ang = Math.PI * (0.62 + t * 0.62)
      const bx = cx - 0.5 + Math.cos(ang) * 5.2
      const by = cy - 1 - Math.sin(ang) * 4.6
      const tx = cx - 0.5 + Math.cos(ang) * 8.4
      const ty = cy - 1 - Math.sin(ang) * 7.6
      const px = -Math.sin(ang) * 1.5
      const py = -Math.cos(ang) * 1.5
      return { bx, by, tx, ty, px, py, k }
    })
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Feet. */}
        {[-2.5, 1].map((dx, k) => (
          <ellipse key={`ft-${k}`} cx={cx + dx} cy={cy + 4} rx={1.2} ry={0.9} fill={face} />
        ))}
        {/* The spiky back — triangles fanning outward. */}
        {spikes.map((s) => (
          <path key={`sk-${s.k}`} d={`M ${s.bx + s.px} ${s.by + s.py} L ${s.tx} ${s.ty} L ${s.bx - s.px} ${s.by - s.py} Z`} fill={s.k % 2 ? spikeDeep : spike} />
        ))}
        {/* The rounded body. */}
        <ellipse cx={cx - 0.5} cy={cy} rx={5.6} ry={4.6} fill={spike} />
        {/* Cream face + pointy snout to the front-right. */}
        <ellipse cx={cx + 4} cy={cy + 0.5} rx={3.4} ry={3} fill={face} />
        <path d={`M ${cx + 6.6} ${cy + 0.4} l 2.4 0.6 l -2.2 1 z`} fill={face} />
        <circle cx={cx + 8.8} cy={cy + 1} r={0.7} fill={ink} />
        {/* Eye + glint, cheek + tiny smile. */}
        <circle cx={cx + 4.4} cy={cy - 0.4} r={0.8} fill={ink} />
        <circle cx={cx + 4.1} cy={cy - 0.7} r={0.25} fill="#fff" />
        <circle cx={cx + 3} cy={cy + 1.4} r={0.9} fill="#fca5a5" opacity={0.45} />
        <path d={`M ${cx + 5.4} ${cy + 2} q 1 0.8 2 0.2`} fill="none" stroke={ink} strokeWidth={0.5} strokeLinecap="round" />
      </g>
    )
  }
  if (companion === 'penguin') {
    // A round tuxedo penguin: a dark body with a white belly + face, an orange beak + feet, little
    // flippers, dot eyes and rosy cheeks.
    const cx = baseX
    const cy = baseY - 3
    const body = '#2b2f3a'
    const belly = '#f8fafc'
    const beak = '#fb923c'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Orange feet. */}
        {[-2, 2].map((dx, k) => (
          <path key={`ft-${k}`} d={`M ${cx + dx - 1.4} ${cy + 4.8} q 1.4 1.4 2.8 0 z`} fill={beak} />
        ))}
        {/* Dark body. */}
        <ellipse cx={cx} cy={cy} rx={5.4} ry={6} fill={body} />
        {/* White belly + face. */}
        <ellipse cx={cx} cy={cy + 0.8} rx={3.4} ry={4.6} fill={belly} />
        <ellipse cx={cx} cy={cy - 3} rx={3.2} ry={2.6} fill={belly} />
        {/* Flippers. */}
        {[-1, 1].map((dir) => (
          <path key={`fl-${dir}`} d={`M ${cx + dir * 5} ${cy - 1} q ${dir * 2.5} 2 ${dir * 1.5} 4.5 q ${dir * -1.5} -1 ${dir * -1.5} -4 z`} fill={body} />
        ))}
        {/* Beak. */}
        <path d={`M ${cx - 1.4} ${cy - 2.4} L ${cx + 1.4} ${cy - 2.4} L ${cx} ${cy - 0.8} Z`} fill={beak} />
        {/* Dot eyes + glints. */}
        {[-1.6, 1.6].map((dx, k) => (
          <g key={`ey-${k}`}>
            <circle cx={cx + dx} cy={cy - 3.6} r={0.8} fill="#1a1d24" />
            <circle cx={cx + dx - 0.3} cy={cy - 3.9} r={0.25} fill="#fff" />
          </g>
        ))}
        {/* Rosy cheeks. */}
        {[-2.9, 2.9].map((dx, k) => (
          <circle key={`ch-${k}`} cx={cx + dx} cy={cy - 2.2} r={0.9} fill="#fca5a5" opacity={0.5} />
        ))}
      </g>
    )
  }
  if (companion === 'shiba') {
    // A smug little Shiba Inu (the doge): a cream sitting body with a tan saddle + crown, pointy
    // ears, a white muzzle, a content squint and the shiba smirk, with a fluffy curled tail.
    const cx = baseX
    const cy = baseY - 2
    const cream = '#f0dcc0'
    const tan = '#d99a5b'
    const ink = '#3f2f22'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Fluffy curled tail over the back-left. */}
        <path d={`M ${cx - 5} ${cy - 1} q -5 -2 -4 -6 q 1 -3 4 -2 q -2 1.5 -1 3.5 q 1 2 1 4.5 z`} fill={cream} stroke={tan} strokeWidth={0.5} />
        {/* Front paws. */}
        {[-2.5, 1.5].map((dx, k) => (
          <ellipse key={`pw-${k}`} cx={cx + dx} cy={cy + 4.2} rx={1.7} ry={1.3} fill={cream} />
        ))}
        {/* Sitting body with a tan saddle. */}
        <ellipse cx={cx} cy={cy} rx={6} ry={5.2} fill={cream} />
        <path d={`M ${cx - 5} ${cy - 2} q 5 -3.5 10 0 q -1 3 -5 3 q -4 0 -5 -3 z`} fill={tan} />
        {/* Head facing the spirit, with a tan crown + pointy ears. */}
        <circle cx={cx + 3.5} cy={cy - 6} r={4.2} fill={cream} />
        <path d={`M ${cx + 0.5} ${cy - 8.5} q 3 -2.5 6 0 q -3 1.5 -6 0 z`} fill={tan} />
        {[[cx + 0.8, -1], [cx + 6.2, 1]].map(([ex, dir], k) => (
          <g key={`ear-${k}`}>
            <path d={`M ${ex - 1.6} ${cy - 8} L ${ex + dir * 0.4} ${cy - 12.5} L ${ex + 1.6} ${cy - 8} Z`} fill={tan} />
            <path d={`M ${ex - 0.7} ${cy - 8.4} L ${ex + dir * 0.2} ${cy - 10.8} L ${ex + 0.7} ${cy - 8.4} Z`} fill="#f7e2c4" />
          </g>
        ))}
        {/* White muzzle + nose. */}
        <ellipse cx={cx + 4.4} cy={cy - 4.4} rx={2.6} ry={2} fill="#fff8ef" />
        <ellipse cx={cx + 6.2} cy={cy - 5} rx={0.8} ry={0.6} fill={ink} />
        {/* Smug squint eyes (upward arcs) + the shiba smirk. */}
        {[[cx + 2.4, cy - 6.2], [cx + 5.4, cy - 6.2]].map(([ex, ey], k) => (
          <path key={`eye-${k}`} d={`M ${ex - 1} ${ey} q 1 -1.1 2 0`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" />
        ))}
        <path d={`M ${cx + 4.4} ${cy - 3.6} q 1 0.9 2 0`} fill="none" stroke={ink} strokeWidth={0.7} strokeLinecap="round" />
        <circle cx={cx + 2.6} cy={cy - 4} r={0.9} fill="#fca5a5" opacity={0.4} />
      </g>
    )
  }
  if (companion === 'otter') {
    // A river otter sitting up and hugging its lucky pebble to its chest with both paws — round
    // ears, a pale muzzle + belly, whiskers, a thick tail curling at the base. Pure cosy.
    const cx = baseX
    const cy = baseY - 3
    const fur = '#8d6748'
    const furDeep = '#6f5238'
    const cream = '#e8d7bd'
    const ink = '#3f2f22'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* The thick tail curling out at the base. */}
        <path d={`M ${cx + 3.5} ${cy + 4} q 5 1.5 6.5 -1.5 q -2.5 -1 -4.5 -0.5 q -1 1 -2 2 z`} fill={fur} />
        {/* The upright body. */}
        <ellipse cx={cx} cy={cy + 1} rx={4.6} ry={5.4} fill={fur} />
        {/* The pale belly. */}
        <ellipse cx={cx} cy={cy + 2} rx={2.9} ry={3.8} fill={cream} opacity={0.95} />
        {/* The head — round, with two small round ears. */}
        <circle cx={cx} cy={cy - 5.4} r={3.9} fill={fur} />
        {[[cx - 3.1, cy - 8], [cx + 3.1, cy - 8]].map(([ex, ey], k) => (
          <g key={`ear-${k}`}>
            <circle cx={ex} cy={ey} r={1.2} fill={fur} />
            <circle cx={ex} cy={ey + 0.2} r={0.6} fill={furDeep} />
          </g>
        ))}
        {/* The pale muzzle + nose + a tiny content smile. */}
        <ellipse cx={cx} cy={cy - 4} rx={2.3} ry={1.8} fill={cream} />
        <ellipse cx={cx} cy={cy - 4.9} rx={0.75} ry={0.55} fill={ink} />
        <path d={`M ${cx - 0.9} ${cy - 3.6} q 0.9 0.9 1.8 0`} fill="none" stroke={ink} strokeWidth={0.5} strokeLinecap="round" />
        {/* Whiskers. */}
        {[-1, 1].map((dir) => (
          <path key={`wh-${dir}`} d={`M ${cx + dir * 1.8} ${cy - 4.4} q ${dir * 1.8} -0.2 ${dir * 2.8} 0.3 M ${cx + dir * 1.8} ${cy - 3.9} q ${dir * 1.8} 0.4 ${dir * 2.6} 0.9`} fill="none" stroke="#c9b490" strokeWidth={0.35} strokeLinecap="round" />
        ))}
        {/* Happy closed eyes + cheeks. */}
        {[-1.7, 1.7].map((dx, k) => (
          <path key={`eye-${k}`} d={`M ${cx + dx - 0.8} ${cy - 6} q 0.8 -0.9 1.6 0`} fill="none" stroke={ink} strokeWidth={0.7} strokeLinecap="round" />
        ))}
        {[-3, 3].map((dx, k) => (
          <circle key={`ch-${k}`} cx={cx + dx} cy={cy - 4.6} r={0.8} fill="#fca5a5" opacity={0.45} />
        ))}
        {/* The lucky pebble hugged to the chest, paws wrapped over it. */}
        <ellipse cx={cx} cy={cy + 0.4} rx={2.2} ry={1.8} fill="#9aa1a8" />
        <path d={`M ${cx - 1.6} ${cy - 0.4} q 0.7 -0.5 1.3 -0.1`} fill="none" stroke="#c7ccd1" strokeWidth={0.45} strokeLinecap="round" />
        {[-1, 1].map((dir) => (
          <ellipse key={`paw-${dir}`} cx={cx + dir * 1.9} cy={cy + 0.2} rx={1.1} ry={1.4} fill={fur} transform={`rotate(${dir * 20} ${cx + dir * 1.9} ${cy + 0.2})`} />
        ))}
      </g>
    )
  }
  if (companion === 'red_panda') {
    // A red panda curled fast asleep inside its own big ringed tail — rust body, cream face with
    // white ear-tips + cheek patches, closed sleepy eyes, the striped tail wrapped around front.
    const cx = baseX
    const cy = baseY - 3
    const rust = '#c2532d'
    const rustDeep = '#9c3f20'
    const cream = '#f5e9dc'
    const ink = '#3a2418'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* The curled body — one plump rounded mass. */}
        <ellipse cx={cx} cy={cy} rx={7} ry={5.2} fill={rust} />
        <ellipse cx={cx - 1} cy={cy + 1} rx={5} ry={3.4} fill={rustDeep} opacity={0.35} />
        {/* The big striped tail wrapping around the front — a thick curve with cream rings. */}
        <path d={`M ${cx + 5.5} ${cy - 2.5} q 4.5 2.5 2.5 6 q -3 3 -9 2.5 q -4 -0.4 -5.5 -2.5`} fill="none" stroke={rust} strokeWidth={3.6} strokeLinecap="round" />
        {[[cx + 6.7, cy + 0.4, 24], [cx + 4.4, cy + 4.1, 60], [cx + 0.2, cy + 5.6, 84], [cx - 4, cy + 5.3, 100]].map(([bx, by, deg], k) => (
          <path key={`ring-${k}`} d={`M ${bx} ${by - 1.8} L ${bx} ${by + 1.8}`} stroke={cream} strokeWidth={1.1} strokeLinecap="round" opacity={0.9} transform={`rotate(${deg} ${bx} ${by})`} />
        ))}
        {/* The head resting on the tail — rust crown, cream face. */}
        <circle cx={cx - 3.6} cy={cy - 3.6} r={3.8} fill={rust} />
        <ellipse cx={cx - 4} cy={cy - 2.8} rx={2.9} ry={2.3} fill={cream} />
        {/* White-tipped ears. */}
        {[[cx - 6.6, cy - 6.2, -1], [cx - 1.4, cy - 6.6, 1]].map(([ex, ey, dir], k) => (
          <g key={`ear-${k}`}>
            <path d={`M ${ex - 1.5} ${ey + 1.2} L ${ex + dir * 0.3} ${ey - 1.9} L ${ex + 1.5} ${ey + 1.2} Z`} fill={rust} />
            <path d={`M ${ex - 0.7} ${ey + 0.4} L ${ex + dir * 0.15} ${ey - 1} L ${ex + 0.7} ${ey + 0.4} Z`} fill={cream} />
          </g>
        ))}
        {/* Sleeping face — closed eye arcs, a small nose, a puffed cheek. */}
        {[[cx - 5.3, cy - 3.4], [cx - 2.7, cy - 3.4]].map(([ex, ey], k) => (
          <path key={`eye-${k}`} d={`M ${ex - 0.8} ${ey} q 0.8 0.8 1.6 0`} fill="none" stroke={ink} strokeWidth={0.6} strokeLinecap="round" />
        ))}
        <ellipse cx={cx - 4} cy={cy - 1.9} rx={0.6} ry={0.45} fill={ink} />
        <circle cx={cx - 6.2} cy={cy - 2} r={0.8} fill="#fca5a5" opacity={0.5} />
        {/* A drowsy "z" drifting up. */}
        <path d={`M ${cx - 7.8} ${cy - 7.6} l 1.6 0 l -1.6 1.5 l 1.6 0`} fill="none" stroke={rustDeep} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      </g>
    )
  }
  if (companion === 'tanuki') {
    // A round tanuki (raccoon dog) sitting up: warm brown fur, a big pale belly, the classic dark
    // eye-mask with bright eyes peeking through, round dark-tipped ears — and its lucky leaf
    // resting on its head. Cheeky and cosy.
    const cx = baseX
    const cy = baseY - 3
    const fur = '#a8815c'
    const furDeep = '#7d5e40'
    const mask = '#40342a'
    const belly = '#e3cfa8'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Stubby feet. */}
        {[-2.6, 2.6].map((dx, k) => (
          <ellipse key={`ft-${k}`} cx={cx + dx} cy={cy + 5} rx={1.7} ry={1.1} fill={furDeep} />
        ))}
        {/* The round body. */}
        <ellipse cx={cx} cy={cy + 1} rx={5.6} ry={5.2} fill={fur} />
        {/* The big pale belly. */}
        <ellipse cx={cx} cy={cy + 1.8} rx={3.6} ry={3.4} fill={belly} />
        {/* Little paws resting on the belly. */}
        {[-1.7, 1.7].map((dx, k) => (
          <ellipse key={`pw-${k}`} cx={cx + dx} cy={cy + 0.2} rx={1.1} ry={0.8} fill={furDeep} />
        ))}
        {/* The head. */}
        <circle cx={cx} cy={cy - 5.2} r={4.1} fill={fur} />
        {/* Round dark-tipped ears. */}
        {[[cx - 3.2, cy - 8.2], [cx + 3.2, cy - 8.2]].map(([ex, ey], k) => (
          <g key={`ear-${k}`}>
            <circle cx={ex} cy={ey} r={1.5} fill={fur} />
            <circle cx={ex} cy={ey - 0.3} r={0.8} fill={mask} />
          </g>
        ))}
        {/* The dark eye-mask patches with bright eyes peeking through. */}
        {[-1.9, 1.9].map((dx, k) => (
          <g key={`mask-${k}`}>
            <ellipse cx={cx + dx} cy={cy - 5.6} rx={1.7} ry={1.3} fill={mask} transform={`rotate(${dx < 0 ? -12 : 12} ${cx + dx} ${cy - 5.6})`} />
            <circle cx={cx + dx} cy={cy - 5.6} r={0.6} fill="#f8f4ec" />
            <circle cx={cx + dx + 0.1} cy={cy - 5.5} r={0.3} fill="#1f1a14" />
          </g>
        ))}
        {/* Pale muzzle, nose + a cheeky smile. */}
        <ellipse cx={cx} cy={cy - 3.9} rx={1.7} ry={1.3} fill={belly} />
        <ellipse cx={cx} cy={cy - 4.5} rx={0.65} ry={0.5} fill={mask} />
        <path d={`M ${cx - 0.8} ${cy - 3.5} q 0.8 0.8 1.6 0`} fill="none" stroke={mask} strokeWidth={0.5} strokeLinecap="round" />
        {/* The lucky leaf resting flat on its head, stem up. */}
        <path d={`M ${cx - 2.2} ${cy - 9} q 2.2 -1.6 4.4 0 q -2.2 1.6 -4.4 0 z`} fill="#4a9e5c" />
        <path d={`M ${cx} ${cy - 9} l 0.4 -1.6`} stroke="#3c7f4a" strokeWidth={0.5} strokeLinecap="round" />
      </g>
    )
  }
  if (companion === 'snow_monkey') {
    // A snow monkey mid-soak: a fluffy taupe fur ball with a rosy face, eyes closed in bliss,
    // hands tucked in — steam curling off its wet fur and a couple of snow dustings on top.
    const cx = baseX
    const cy = baseY - 3
    const fur = '#b9a89a'
    const furDeep = '#93826f'
    const face = '#e77e6e'
    const ink = '#4a2620'
    return (
      <g opacity={0.96 * g} aria-hidden="true">
        {/* Steam curling off the fur. */}
        {[-3, 3.6].map((dx, k) => (
          <path key={`st-${k}`} d={`M ${cx + dx} ${cy - 9.5} q ${k ? 1.6 : -1.6} -2 0 -3.8`} fill="none" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.45} />
        ))}
        {/* The fluffy body — a plump fur ball. */}
        <ellipse cx={cx} cy={cy + 0.5} rx={5.8} ry={5.6} fill={fur} />
        {/* Fluff tufts along the sides. */}
        {([[-5.4, -1, -30], [5.4, -1, 30], [-4.6, 2.6, -60], [4.6, 2.6, 60]] as const).map(([dx, dy, deg], k) => (
          <ellipse key={`tuft-${k}`} cx={cx + dx} cy={cy + dy} rx={1.6} ry={0.8} fill={fur} transform={`rotate(${deg} ${cx + dx} ${cy + dy})`} />
        ))}
        {/* Arms hugged in over the chest. */}
        {[-1, 1].map((dir) => (
          <path key={`arm-${dir}`} d={`M ${cx + dir * 4} ${cy - 0.5} q ${dir * -2} 1.8 ${dir * -3.4} 1.2`} fill="none" stroke={furDeep} strokeWidth={1.5} strokeLinecap="round" />
        ))}
        {/* The head — fur crown over the rosy face. */}
        <circle cx={cx} cy={cy - 5.6} r={4} fill={fur} />
        {/* Snow dustings on the crown. */}
        {[[cx - 1.8, cy - 9], [cx + 1.2, cy - 9.4]].map(([sx, sy], k) => (
          <circle key={`snow-${k}`} cx={sx} cy={sy} r={0.7} fill="#ffffff" opacity={0.85} />
        ))}
        {/* The rosy bare face. */}
        <ellipse cx={cx} cy={cy - 5} rx={2.7} ry={2.4} fill={face} />
        {/* Blissful closed eyes, tiny nostrils, a deep content smile. */}
        {[-1.2, 1.2].map((dx, k) => (
          <path key={`eye-${k}`} d={`M ${cx + dx - 0.7} ${cy - 5.6} q 0.7 0.8 1.4 0`} fill="none" stroke={ink} strokeWidth={0.55} strokeLinecap="round" />
        ))}
        {[-0.4, 0.4].map((dx, k) => (
          <circle key={`no-${k}`} cx={cx + dx} cy={cy - 4.3} r={0.22} fill={ink} />
        ))}
        <path d={`M ${cx - 1} ${cy - 3.6} q 1 1 2 0`} fill="none" stroke={ink} strokeWidth={0.5} strokeLinecap="round" />
        {/* Rosy ears poking from the fur. */}
        {[-3.4, 3.4].map((dx, k) => (
          <circle key={`ear-${k}`} cx={cx + dx} cy={cy - 5.8} r={1} fill={face} opacity={0.9} />
        ))}
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
  // --- Path-exclusive TIER-2 companions (per_path in the catalog) ------------------------
  // emberling → breath (Pitta/fire), mosskit → stillness (Kapha/earth), butterfly → heart
  // (Vata/air). The earlier, smaller per-path friend to chase before each dosha's tier-3 capstone
  // (kitsune / tortoise / crane). Fixed identity palettes — only ever shown on the matching dosha.
  if (companion === 'emberling') {
    // A tiny ember sprite: a small rounded glowing flame-body with two dot eyes and a little flame
    // tuft flickering on top — warm and cheerful.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A soft warm glow behind the sprite. */}
        <circle cx={baseX} cy={baseY - 4} r={7} fill="#fb923c" opacity={0.18} />
        {/* The rounded flame-body. */}
        <ellipse cx={baseX} cy={baseY - 3} rx={4} ry={4.6} fill="#f97316" />
        {/* A brighter inner core. */}
        <ellipse cx={baseX} cy={baseY - 2} rx={2.2} ry={2.8} fill="#fb923c" opacity={0.9} />
        {/* A little flame tuft flickering off the top. */}
        <path
          d={`M ${baseX} ${baseY - 8} q 2 -2.4 0.6 -4.6 q 2.4 1.6 1 4.2 z`}
          fill="#fb923c"
        />
        <path
          d={`M ${baseX - 1.4} ${baseY - 7.4} q -1 -1.6 0.2 -3.2 q 1.4 1.4 0.6 3.2 z`}
          fill="#fde68a"
          opacity={0.9}
        />
        {/* Two dot eyes and a soft belly highlight. */}
        <circle cx={baseX - 1.6} cy={baseY - 3.6} r={0.7} fill="#7c2d12" />
        <circle cx={baseX + 1.6} cy={baseY - 3.6} r={0.7} fill="#7c2d12" />
        <ellipse cx={baseX} cy={baseY - 0.8} rx={1.6} ry={1} fill="#fff7ed" opacity={0.8} />
      </g>
    )
  }
  if (companion === 'mosskit') {
    // A small mossy pebble critter: a rounded grey-green stone body with dot eyes and a tiny leaf
    // sprig poking from the top — grounded and calm.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* The rounded stone body. */}
        <ellipse cx={baseX} cy={baseY - 2.5} rx={5.4} ry={4.2} fill="#78716c" />
        {/* A patch of moss draped over the top. */}
        <path
          d={`M ${baseX - 5} ${baseY - 3.5}
              Q ${baseX} ${baseY - 9} ${baseX + 5} ${baseY - 3.5}
              Q ${baseX} ${baseY - 6.2} ${baseX - 5} ${baseY - 3.5} Z`}
          fill="#10b981"
        />
        <circle cx={baseX - 2.4} cy={baseY - 4.6} r={1} fill="#34d399" opacity={0.9} />
        <circle cx={baseX + 2} cy={baseY - 4.8} r={0.9} fill="#34d399" opacity={0.9} />
        {/* A tiny leaf sprig on a short stem poking up from the moss. */}
        <path
          d={`M ${baseX + 0.4} ${baseY - 6.2} l 0.2 -3`}
          fill="none"
          stroke="#047857"
          strokeWidth={0.7}
          strokeLinecap="round"
        />
        <ellipse
          cx={baseX + 1.8}
          cy={baseY - 9}
          rx={1.6}
          ry={0.8}
          fill="#34d399"
          transform={`rotate(-30 ${baseX + 1.8} ${baseY - 9})`}
        />
        <ellipse
          cx={baseX - 0.8}
          cy={baseY - 8.6}
          rx={1.4}
          ry={0.7}
          fill="#10b981"
          transform={`rotate(30 ${baseX - 0.8} ${baseY - 8.6})`}
        />
        {/* Two dot eyes on the stone. */}
        <circle cx={baseX - 1.8} cy={baseY - 1.8} r={0.7} fill="#292524" />
        <circle cx={baseX + 1.8} cy={baseY - 1.8} r={0.7} fill="#292524" />
      </g>
    )
  }
  if (companion === 'butterfly') {
    // A small resting butterfly: a slim body with two rounded wings (upper larger) on each side and
    // tiny antennae — soft and airy.
    const bodyY = baseY - 5
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* Left wings — a larger upper and a smaller lower. */}
        <ellipse cx={baseX - 3.4} cy={bodyY - 1.4} rx={3.4} ry={2.6} fill="#a78bfa"
          transform={`rotate(-18 ${baseX - 3.4} ${bodyY - 1.4})`} />
        <ellipse cx={baseX - 2.8} cy={bodyY + 2.2} rx={2.2} ry={1.8} fill="#c4b5fd"
          transform={`rotate(18 ${baseX - 2.8} ${bodyY + 2.2})`} />
        {/* Right wings — mirror. */}
        <ellipse cx={baseX + 3.4} cy={bodyY - 1.4} rx={3.4} ry={2.6} fill="#a78bfa"
          transform={`rotate(18 ${baseX + 3.4} ${bodyY - 1.4})`} />
        <ellipse cx={baseX + 2.8} cy={bodyY + 2.2} rx={2.2} ry={1.8} fill="#c4b5fd"
          transform={`rotate(-18 ${baseX + 2.8} ${bodyY + 2.2})`} />
        {/* Soft pale highlights on the upper wings. */}
        <circle cx={baseX - 3.6} cy={bodyY - 1.8} r={0.9} fill="#ddd6fe" opacity={0.85} />
        <circle cx={baseX + 3.6} cy={bodyY - 1.8} r={0.9} fill="#ddd6fe" opacity={0.85} />
        {/* The slim body. */}
        <ellipse cx={baseX} cy={bodyY} rx={0.9} ry={3.4} fill="#7c3aed" />
        {/* Tiny antennae curling up from the head. */}
        <path
          d={`M ${baseX - 0.4} ${bodyY - 3.2} q -1.4 -1.8 -2.4 -2.2
              M ${baseX + 0.4} ${bodyY - 3.2} q 1.4 -1.8 2.4 -2.2`}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={0.6}
          strokeLinecap="round"
        />
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
        {/* A determined little face on the right bell (mid-rep!) with an effort sweat-drop —
            like the boba/mushroom, a face turns the prop into a wee companion. */}
        {[-0.85, 0.85].map((dx, k) => (
          <circle key={`de-${k}`} cx={baseX + 5.75 + dx} cy={cy - 1.2} r={0.5} fill="#f1f5f9" />
        ))}
        <path d={`M ${baseX + 4.9} ${cy + 0.6} l 1.7 0`} stroke="#f1f5f9" strokeWidth={0.55} strokeLinecap="round" />
        <path d={`M ${baseX + 8.6} ${cy - 4.6} q 0.7 1 0 1.7 q -0.7 -0.7 0 -1.7 z`} fill="#7dd3fc" opacity={0.9} />
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
        {/* A cosy sleepy face on the mug — content closed eyes, a small smile, warm cheeks. */}
        {[-1.6, 1.6].map((dx, k) => (
          <path key={`me-${k}`} d={`M ${baseX + dx - 0.8} ${cy - 2.4} q 0.8 0.8 1.6 0`} fill="none" stroke="#7c2d12" strokeWidth={0.55} strokeLinecap="round" />
        ))}
        <path d={`M ${baseX - 0.8} ${cy - 0.9} q 0.8 0.7 1.6 0`} fill="none" stroke="#7c2d12" strokeWidth={0.5} strokeLinecap="round" />
        {[-2.9, 2.9].map((dx, k) => (
          <circle key={`mc-${k}`} cx={baseX + dx} cy={cy - 1.2} r={0.7} fill="#fca5a5" opacity={0.55} />
        ))}
        {/* Two curling wisps of steam rising above the cup — one carrying a little heart. */}
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
        <path
          d={`M ${baseX + 3.6} ${cy - 14} c -0.9 -1.1 -1.2 -2 0 -1.4 c 1.2 -0.6 0.9 0.3 0 1.4 z`}
          fill="#fda4af"
          opacity={0.85}
        />
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
        {/* The clay spine/cover ridge down the middle. */}
        <path d={`M ${baseX} ${cy - 3} l 0 6`} stroke="#c4744f" strokeWidth={1.4} strokeLinecap="round" />
        {/* A few faint text lines toward each page's outer edge (the inner band stays clear for
            the face below). */}
        {[0, 1.6, 3.2].map((dy, k) => (
          <g key={`line-${k}`}>
            <path d={`M ${baseX - 6.5} ${cy - 0.5 + dy} l 2.4 0`} stroke="#94a3b8" strokeWidth={0.4} />
            <path d={`M ${baseX + 4.1} ${cy - 0.5 + dy} l 2.4 0`} stroke="#94a3b8" strokeWidth={0.4} />
          </g>
        ))}
        {/* A thin red ribbon bookmark trailing below the spine. */}
        <path d={`M ${baseX} ${cy + 3} l 0 4 l -1 -1.4 l 1 0.4 l 1 -1.8 z`} fill="#ef4444" />
        {/* A serene little face on the cleared inner band of the pages (a closed eye each side of
            the spine, a smile beneath) — the tome reads along, a wee companion, not a dropped prop. */}
        <path d={`M ${baseX - 3.2} ${cy + 0.4} q 0.9 0.9 1.8 0`} fill="none" stroke="#64748b" strokeWidth={0.55} strokeLinecap="round" />
        <path d={`M ${baseX + 1.4} ${cy + 0.4} q 0.9 0.9 1.8 0`} fill="none" stroke="#64748b" strokeWidth={0.55} strokeLinecap="round" />
        <path d={`M ${baseX - 0.9} ${cy + 1.9} q 0.9 0.8 1.8 0`} fill="none" stroke="#c4744f" strokeWidth={0.55} strokeLinecap="round" />
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
        {/* Twin thumbsticks — spread a touch and given glints so they double as bright eyes,
            with a happy smile between them (the gamepad grins back, like the boba/mushroom). */}
        <circle cx={baseX - 1.9} cy={cy + 1.6} r={1.15} fill="#0f172a" />
        <circle cx={baseX + 1.9} cy={cy + 1.6} r={1.15} fill="#0f172a" />
        <circle cx={baseX - 2.2} cy={cy + 1.2} r={0.35} fill="#f8fafc" />
        <circle cx={baseX + 1.6} cy={cy + 1.2} r={0.35} fill="#f8fafc" />
        <path d={`M ${baseX - 0.8} ${cy + 2.6} q 0.8 0.8 1.6 0`} fill="none" stroke="#94a3b8" strokeWidth={0.55} strokeLinecap="round" />
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
        {/* Two speaker cones — their bright centres double as wide eyes (pupil + glint each), and
            a little grin sits between them: the boombox sings along, not just a black box. */}
        <circle cx={baseX - 3.4} cy={cy + 1} r={2.4} fill="#4b5563" />
        <circle cx={baseX + 3.4} cy={cy + 1} r={2.4} fill="#4b5563" />
        <circle cx={baseX - 3.4} cy={cy + 1} r={1.2} fill="#e5e7eb" />
        <circle cx={baseX + 3.4} cy={cy + 1} r={1.2} fill="#e5e7eb" />
        <circle cx={baseX - 3.4} cy={cy + 1.1} r={0.6} fill="#111827" />
        <circle cx={baseX + 3.4} cy={cy + 1.1} r={0.6} fill="#111827" />
        <circle cx={baseX - 3.7} cy={cy + 0.7} r={0.25} fill="#f8fafc" />
        <circle cx={baseX + 3.1} cy={cy + 0.7} r={0.25} fill="#f8fafc" />
        <path d={`M ${baseX - 0.9} ${cy + 2} q 0.9 1 1.8 0`} fill="none" stroke="#9ca3af" strokeWidth={0.6} strokeLinecap="round" />
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
  if (mount === 'hoverboard') {
    // A sleek dark hoverboard with a neon edge + thruster underglow — the spirit rides it (cool/futuristic).
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        <ellipse cx={cx} cy={cy + 5} rx={17} ry={3.4} fill="#22d3ee" opacity={0.38} />
        <ellipse cx={cx} cy={cy + 4} rx={11} ry={2} fill="#e879f9" opacity={0.35} />
        <path
          d={`M ${cx - 17} ${cy} Q ${cx - 18} ${cy + 2.4} ${cx - 14} ${cy + 3} L ${cx + 14} ${cy + 3} Q ${cx + 18} ${cy + 2.4} ${cx + 17} ${cy} Q ${cx} ${cy - 2.6} ${cx - 17} ${cy} Z`}
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
        <path d={`M ${cx - 13} ${cy - 0.6} Q ${cx} ${cy - 2.3} ${cx + 13} ${cy - 0.6}`} fill="none" stroke="#475569" strokeWidth={0.8} opacity={0.7} />
        <path d={`M ${cx - 15} ${cy + 1.9} L ${cx + 15} ${cy + 1.9}`} fill="none" stroke="#22d3ee" strokeWidth={1} strokeLinecap="round" opacity={0.85} />
        {[-9, 9].map((dx, k) => (
          <circle key={`th-${k}`} cx={cx + dx} cy={cy + 3.4} r={1.2} fill="#e879f9" opacity={0.8} />
        ))}
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
        {/* A floating faceted crystal the spirit perches on — a warm rose-amethyst gem with a flat
            upper facet, bright cut faces, a soft glow halo and a few rising sparkles. */}
        <ellipse cx={cx} cy={cy + 1} rx={15} ry={7} fill="#d8b9d2" opacity={0.35 * g} />
        <path
          d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy - 6} L ${cx + 13} ${cy - 2}
              L ${cx + 8} ${cy + 5} L ${cx} ${cy + 8} L ${cx - 8} ${cy + 5} z`}
          fill="#a878a8"
          stroke="#7d5a86"
          strokeWidth={1}
        />
        <path
          d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy - 6} L ${cx + 13} ${cy - 2}
              L ${cx} ${cy + 1} z`}
          fill="#d8b9d2"
        />
        <path d={`M ${cx} ${cy - 6} L ${cx} ${cy + 8}`} stroke="#efe0ec" strokeWidth={0.7} />
        <path d={`M ${cx - 13} ${cy - 2} L ${cx} ${cy + 1}`} stroke="#c39fcc" strokeWidth={0.7} />
        <path d={`M ${cx + 13} ${cy - 2} L ${cx} ${cy + 1}`} stroke="#c39fcc" strokeWidth={0.7} />
        <path d={`M ${cx - 8} ${cy + 5} L ${cx} ${cy + 1}`} stroke="#9a6b9c" strokeWidth={0.6} />
        <path d={`M ${cx + 8} ${cy + 5} L ${cx} ${cy + 1}`} stroke="#9a6b9c" strokeWidth={0.6} />
        <path d={`M ${cx - 4} ${cy - 4} l 4 -1`} stroke="#fdf6ea" strokeWidth={1} strokeLinecap="round" />
        {[-9, 0, 9].map((dx, k) => (
          <path
            key={`spark-${k}`}
            d={`M ${cx + dx} ${cy - 9 - (k % 2) * 2} l 0 -2 M ${cx + dx - 1} ${cy - 10 - (k % 2) * 2} l 2 0`}
            stroke="#efe0ec"
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
  if (mount === 'ember_log') {
    // PATH-EXCLUSIVE tier-2 (Pitta / breath) — a dark smoldering log with a few glowing ember
    // cracks. A simpler companion to the tier-3 emberstone.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A cast shadow, then the dark charred log the spirit rests on. */}
        <ellipse cx={cx} cy={cy + 4} rx={17} ry={3.5} fill="#431407" opacity={0.5} />
        <rect x={cx - 17} y={cy - 3} width={34} height={8} rx={4} fill="#3f2a1d" />
        <ellipse cx={cx - 17} cy={cy + 1} rx={2.4} ry={4} fill="#292018" />
        {/* A few glowing ember cracks along the top of the log. */}
        {[-9, 0, 8].map((dx, k) => (
          <path
            key={k}
            d={`M ${cx + dx} ${cy - 2} l 3 3`}
            stroke={k % 2 ? '#f97316' : '#fbbf24'}
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.9 * g}
          />
        ))}
      </g>
    )
  }
  if (mount === 'mossy_rock') {
    // PATH-EXCLUSIVE tier-2 (Kapha / stillness) — a rounded grey stone capped with green moss.
    // A simpler companion to the tier-3 boulder.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A cast shadow, then a rounded grey stone the spirit settles on. */}
        <ellipse cx={cx} cy={cy + 4} rx={15} ry={3} fill="#57534e" opacity={0.45} />
        <path
          d={`M ${cx - 15} ${cy + 4} q -1 -9 8 -9 q 7 -2 14 0 q 9 0 8 9 z`}
          fill="#a8a29e"
          stroke="#78716c"
          strokeWidth={1}
        />
        {/* A cap of green moss over the top of the stone. */}
        <path d={`M ${cx - 13} ${cy - 3} q 13 -5 26 0 q -6 3 -13 3 q -8 0 -13 -3 z`} fill="#16a34a" />
        <ellipse cx={cx - 5} cy={cy - 3} rx={3} ry={1.5} fill="#4ade80" opacity={0.9} />
      </g>
    )
  }
  if (mount === 'drift_leaf') {
    // PATH-EXCLUSIVE tier-2 (Vata / heart) — a large soft green leaf to rest on. A simpler
    // companion to the tier-3 feather.
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A cast shadow, then a broad green leaf with a central vein. */}
        <ellipse cx={cx} cy={cy + 4} rx={16} ry={3} fill="#166534" opacity={0.4} />
        <path
          d={`M ${cx - 18} ${cy} q 18 -9 36 0 q -18 9 -36 0 z`}
          fill="#4ade80"
          stroke="#22c55e"
          strokeWidth={0.8}
        />
        <path
          d={`M ${cx - 16} ${cy} q 16 -2 32 0`}
          stroke="#15803d"
          strokeWidth={0.9}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    )
  }
  return null
}

// Weather cosmetics that read as FALLING — animated with a seamless downward drift (see the
// SpiritArt weather render). The others (mist bands, aurora curtains, floating fireflies/embers,
// heat shimmer, gale swirls) stay static, since "falling" motion wouldn't suit them.
const FALLING_WEATHER = new Set([
  'rain',
  'snow',
  'leaffall',
  'petals',
  'pollenfall',
  'dewdrift',
  'featherfall',
  'confetti',
  'meteor_shower',
  'heartfall',
])
// Per-type fall speed (a full viewBox height per cycle): rain quick, snow/leaves/feathers slow.
const FALLING_DUR: Record<string, string> = {
  rain: '3.4s',
  snow: '5.5s',
  leaffall: '6s',
  petals: '5.5s',
  pollenfall: '6s',
  dewdrift: '5s',
  featherfall: '6.5s',
  confetti: '4.6s',
  meteor_shower: '2.4s', // meteors streak fast
  heartfall: '5.8s', // hearts drift gently
}
// In-place motion for the NON-falling weathers → a CSS class on a wrapper group: fireflies/embers
// twinkle (opacity pulse), mist/gale drift sideways, aurora/heat shimmer (brightness pulse). All are
// reduced-motion-gated (below). Weathers not listed here (and not falling) stay static.
const WEATHER_MOTION: Record<string, string> = {
  fireflies: 'spirit-weather-twinkle',
  ember_drift: 'spirit-weather-twinkle',
  bubbles: 'spirit-weather-twinkle',
  // Steam breathes: the wisps fade in/out on the twinkle pulse (rising motion would need a
  // reverse of the falling machinery — the soft opacity swell reads steamy on its own).
  steam: 'spirit-weather-twinkle',
  mist: 'spirit-weather-drift',
  galeswirl: 'spirit-weather-drift',
  aurora_storm: 'spirit-weather-shimmer',
  heat_shimmer: 'spirit-weather-shimmer',
}

function Weather({ weather, g, pal }: { weather: string; g: number; pal?: BodyPalette }) {
  // An ambient overlay drifting OVER the whole 80×80 scene — the FRONT-MOST layer (drawn after
  // the creature + accessory). Kept light and low-opacity so the figure always reads through it:
  // a scatter of small particles across the field, never a solid sheet. Procedural like the rest
  // of the art (anchored coords, condition factor `g`, aria-hidden, no asset imports).
  //
  // HARMONISED: the UNIVERSAL weather types (petals / mist / rain / snow / fireflies) pick up the
  // spirit's palette so the drift reads in its colour field; the path-exclusive + legendary types
  // (ember_drift, pollenfall, galeswirl, aurora_storm) already carry their own themed colours and
  // are left as-is. A pathless spark (no `pal`) keeps every default colour.
  if (weather === 'petals') {
    // Soft petals drifting down across the scene — tinted to the spirit's own hue.
    const petal = pal ? pal.glow : '#fbcfe8'
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
              fill={petal}
              opacity={0.7}
              transform={`rotate(${(k * 40) % 360} ${x} ${y})`}
            />
          )
        })}
      </g>
    )
  }
  if (weather === 'mist') {
    // A few pale horizontal wisps of mist banding softly across the scene — tinted to the spirit.
    const wisp = pal ? pal.core : '#e2e8f0'
    return (
      <g opacity={0.7 * g} aria-hidden="true">
        {[18, 34, 50, 64].map((y, k) => (
          <ellipse
            key={k}
            cx={k % 2 ? 50 : 32}
            cy={y}
            rx={26}
            ry={2.6}
            fill={wisp}
            opacity={0.32}
          />
        ))}
      </g>
    )
  }
  if (weather === 'rain') {
    // A few thin, soft slanted rain streaks — kept subtle (fewer, fainter, slower than before) so
    // it reads as a gentle drizzle over the scene, never a distracting downpour.
    const streak = pal ? pal.glow : '#93c5fd'
    return (
      <g opacity={0.5 * g} aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => {
          const x = 6 + ((k * 29) % 68)
          const y = 6 + ((k * 27) % 56)
          return (
            <line
              key={k}
              x1={x}
              y1={y}
              x2={x - 1.6}
              y2={y + 4}
              stroke={streak}
              strokeWidth={0.55}
              strokeLinecap="round"
              opacity={0.42}
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
    // Soft snowflakes drifting down — gentle dots of varied size, tinted to the spirit's pale hue.
    const flake = pal ? pal.core : '#f8fafc'
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 12 }, (_, k) => {
          const x = 6 + ((k * 17) % 68)
          const y = 6 + ((k * 29) % 60)
          const r = 0.8 + (k % 3) * 0.4
          return <circle key={k} cx={x} cy={y} r={r} fill={flake} opacity={0.85} />
        })}
      </g>
    )
  }
  if (weather === 'fireflies') {
    // Fireflies drifting over the scene — each a soft halo around a bright core, cast in the
    // spirit's own light.
    const m = pal
      ? { halo: pal.glow, core: pal.glow, gleam: pal.core }
      : { halo: '#fde68a', core: '#fef08a', gleam: '#fffbeb' }
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => {
          const x = 10 + ((k * 21) % 60)
          const y = 10 + ((k * 26) % 52)
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={3} fill={m.halo} opacity={0.18} />
              <circle cx={x} cy={y} r={1.2} fill={m.core} opacity={0.9} />
              <circle cx={x - 0.3} cy={y - 0.3} r={0.5} fill={m.gleam} opacity={0.95} />
            </g>
          )
        })}
      </g>
    )
  }
  if (weather === 'bubbles') {
    // Floating soap bubbles — translucent rings with a little shine (twinkle in place).
    const ring = pal ? pal.core : '#bae6fd'
    return (
      <g opacity={0.85 * g} aria-hidden="true">
        {Array.from({ length: 9 }, (_, k) => {
          const x = 8 + ((k * 23) % 64)
          const y = 8 + ((k * 31) % 58)
          const r = 1 + (k % 3) * 0.7
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={r} fill="none" stroke={ring} strokeWidth={0.6} opacity={0.5} />
              <circle cx={x - r * 0.32} cy={y - r * 0.32} r={r * 0.28} fill="#ffffff" opacity={0.6} />
            </g>
          )
        })}
      </g>
    )
  }
  if (weather === 'confetti') {
    // Colourful confetti raining down — little tilted rectangles in a party palette (falls).
    const cols = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#4ade80', '#fb923c']
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 14 }, (_, k) => {
          const x = 6 + ((k * 19) % 68)
          const y = 6 + ((k * 23) % 62)
          return <rect key={k} x={x} y={y} width={2} height={1.2} rx={0.2} fill={cols[k % 6]} opacity={0.85} transform={`rotate(${(k * 47) % 360} ${x} ${y})`} />
        })}
      </g>
    )
  }
  if (weather === 'heartfall') {
    // Little hearts drifting gently down across the scene — a soft rose scatter (falls).
    const heart = '#f6607f'
    return (
      <g opacity={0.82 * g} aria-hidden="true">
        {Array.from({ length: 10 }, (_, k) => {
          const x = 8 + ((k * 21) % 64)
          const y = 7 + ((k * 27) % 60)
          const s = k % 3 === 0 ? 1.2 : 1
          return (
            <path
              key={k}
              d={`M ${x} ${y + 1.4 * s} C ${x - 1.8 * s} ${y - 0.8 * s} ${x - 2.2 * s} ${y - 2.6 * s} ${x} ${y - 1.2 * s} C ${x + 2.2 * s} ${y - 2.6 * s} ${x + 1.8 * s} ${y - 0.8 * s} ${x} ${y + 1.4 * s} Z`}
              fill={heart}
              opacity={0.7}
            />
          )
        })}
      </g>
    )
  }
  if (weather === 'steam') {
    // Hot-spring steam (yukemuri) — soft wisps curling up across the scene with a few faint
    // pearls of condensation. Palette-tinted toward the spirit's pale hue; the twinkle motion
    // makes the wisps breathe in and out.
    const wisp = pal ? pal.core : '#eef3f5'
    return (
      <g opacity={0.8 * g} aria-hidden="true">
        {Array.from({ length: 6 }, (_, k) => {
          const x = 9 + ((k * 24) % 62)
          const y = 18 + ((k * 29) % 48)
          const dir = k % 2 ? 1 : -1
          return (
            <path
              key={`wisp-${k}`}
              d={`M ${x} ${y + 6} q ${dir * 3} -3 ${dir * 0.6} -6 q ${dir * -2.6} -3 ${dir * 0.6} -6`}
              fill="none"
              stroke={wisp}
              strokeWidth={k % 3 === 0 ? 1.6 : 1.1}
              strokeLinecap="round"
              opacity={0.5}
            />
          )
        })}
        {([[14, 60, 1.2], [66, 30, 1], [36, 14, 0.9], [58, 62, 1.1]] as const).map(([x, y, r], k) => (
          <circle key={`pearl-${k}`} cx={x} cy={y} r={r} fill={wisp} opacity={0.35} />
        ))}
      </g>
    )
  }
  if (weather === 'meteor_shower') {
    // Shooting stars streaking down — a diagonal light-streak with a bright head (falls fast).
    const streak = pal ? pal.core : '#e0e7ff'
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => {
          const x = 12 + ((k * 27) % 56)
          const y = 6 + ((k * 19) % 50)
          return (
            <g key={k}>
              <line x1={x} y1={y} x2={x - 5} y2={y + 8} stroke={streak} strokeWidth={0.8} strokeLinecap="round" opacity={0.5} />
              <circle cx={x} cy={y} r={0.9} fill="#ffffff" opacity={0.9} />
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
            stroke={k % 2 ? '#ccfbf1' : '#fbe7e3'}
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
  // PATH-EXCLUSIVE tier-2 (Pitta / breath) — a few wavy warm shimmer lines rising over the scene,
  // fixed FIRE colours (only ever shown on the matching dosha). Simpler than the tier-3 ember_drift.
  if (weather === 'heat_shimmer') {
    return (
      <g opacity={0.7 * g} aria-hidden="true">
        {Array.from({ length: 4 }, (_, k) => {
          const x = 14 + ((k * 19) % 52)
          const y = 20 + ((k * 23) % 40)
          return (
            <path
              key={k}
              d={`M ${x} ${y} q 3 -5 0 -10 q -3 -5 0 -10`}
              stroke="#fdba74"
              strokeWidth={0.9}
              fill="none"
              strokeLinecap="round"
              opacity={0.7}
            />
          )
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE tier-2 (Kapha / stillness) — small pale teal-green dew motes drifting down on
  // fixed DEW colours (only ever shown on the matching dosha). Simpler than the tier-3 pollenfall.
  if (weather === 'dewdrift') {
    return (
      <g opacity={0.8 * g} aria-hidden="true">
        {Array.from({ length: 10 }, (_, k) => {
          const x = 7 + ((k * 21) % 66)
          const y = 8 + ((k * 27) % 58)
          const r = 0.7 + (k % 3) * 0.3
          return <circle key={k} cx={x} cy={y} r={r} fill="#99f6e4" opacity={0.8} />
        })}
      </g>
    )
  }
  // PATH-EXCLUSIVE tier-2 (Vata / heart) — small soft pale feathers drifting on fixed AIR colours
  // (only ever shown on the matching dosha). Simpler than the tier-3 galeswirl.
  if (weather === 'featherfall') {
    return (
      <g opacity={0.75 * g} aria-hidden="true">
        {Array.from({ length: 6 }, (_, k) => {
          const x = 9 + ((k * 23) % 58)
          const y = 10 + ((k * 29) % 54)
          return (
            <path
              key={k}
              d={`M ${x} ${y} q 5 -3 9 -1 q -4 3 -9 1 z`}
              fill="#f0f9ff"
              stroke="#dbeafe"
              strokeWidth={0.5}
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
  if (ground === 'spring_stones') {
    // Smooth steaming stones at the water's edge (pairs with the hot spring): a shallow teal
    // water band, big wet rounded stones with a sheen each, and soft steam wisps rising.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        {/* The shallow warm water glinting between the stones. */}
        <rect x={2} y={top + 0.5} width={76} height={5.5} rx={2.5} fill="#9fd6de" opacity={0.45} />
        <path d={`M 8 ${top + 2} q 4 -0.8 8 0 M 30 ${top + 3} q 4 -0.8 8 0 M 56 ${top + 2.2} q 4 -0.8 8 0`} fill="none" stroke="#d8f1f4" strokeWidth={0.5} strokeLinecap="round" opacity={0.8} />
        {/* Smooth wet stones, each with a soft sheen arc. */}
        {([[10, top + 2.4, 4.4, 2.6], [22, top + 3.2, 5.2, 2.9], [40, top + 3.4, 6, 3], [57, top + 2.8, 5, 2.7], [70, top + 2.4, 3.8, 2.3]] as const).map(([x, y, rx, ry], k) => (
          <g key={`stone-${k}`}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={k % 2 ? '#7b838c' : '#8d949c'} />
            <path d={`M ${x - rx * 0.5} ${y - ry * 0.45} q ${rx * 0.4} -${ry * 0.4} ${rx * 0.85} -${ry * 0.1}`} fill="none" stroke="#c3c9cf" strokeWidth={0.55} strokeLinecap="round" opacity={0.85} />
          </g>
        ))}
        {/* Soft steam wisps rising from between the stones. */}
        {([16, 48, 64] as const).map((x, k) => (
          <path key={`steam-${k}`} d={`M ${x} ${top + 0.5} q ${k % 2 ? 1.6 : -1.6} -2.4 0 -4.6`} fill="none" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.4} />
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
  if (ground === 'lava_rock') {
    // A cracked dark-rock floor veined with glowing lava seams.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#2a2320" opacity={0.85} />
        {Array.from({ length: 10 }, (_, k) => (
          <path key={`rk-${k}`} d={`M ${5 + k * 7.4} ${top + 5} l 2 -3 l 3 0 l 2 3 Z`} fill="#3a322d" opacity={0.8} />
        ))}
        {Array.from({ length: 6 }, (_, k) => (
          <line key={`lv-${k}`} x1={8 + k * 12} y1={top + 4} x2={14 + k * 12} y2={top + 2} stroke="#fb923c" strokeWidth={0.9} strokeLinecap="round" opacity={0.75} />
        ))}
      </g>
    )
  }
  if (ground === 'neon_grid') {
    // A synthwave perspective grid — glowing lines receding to the centre.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top - 1} width={76} height={7} rx={2} fill="#160f2e" opacity={0.7} />
        {[top + 0.5, top + 2.5, top + 4.5].map((y, k) => (
          <line key={`hg-${k}`} x1={3} y1={y} x2={77} y2={y} stroke="#22d3ee" strokeWidth={0.5} opacity={0.6 - k * 0.12} />
        ))}
        {Array.from({ length: 9 }, (_, k) => {
          const x = 4 + k * 9
          return <line key={`vg-${k}`} x1={x} y1={top + 5.5} x2={40 + (x - 40) * 0.2} y2={top - 0.5} stroke="#e879f9" strokeWidth={0.4} opacity={0.5} />
        })}
      </g>
    )
  }
  if (ground === 'snow_bank') {
    // A soft snow bank with a faint drift line + a few sparkles.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <path d={`M 2 ${top + 6} L 2 ${top + 2} Q 20 ${top - 1} 40 ${top + 1} T 78 ${top + 1} L 78 ${top + 6} Z`} fill="#eef4fb" opacity={0.85} />
        <path d={`M 2 ${top + 4} Q 30 ${top + 1} 78 ${top + 3}`} fill="none" stroke="#cbd8e8" strokeWidth={0.6} opacity={0.6} />
        {[10, 28, 50, 68].map((x, k) => (
          <circle key={`sk-${k}`} cx={x} cy={top + 2 + (k % 2)} r={0.5} fill="#ffffff" opacity={0.8} />
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
        <rect x={2} y={top + 2} width={76} height={4} rx={2} fill="#e3cbdf" opacity={0.4} />
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
  if (ground === 'ember_sand') {
    // PATH-EXCLUSIVE tier-2 (Pitta / breath) — a warm sand strip with a few glowing ember flecks.
    // A simpler companion to the tier-3 emberbed.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#c2612c" opacity={0.5} />
        {Array.from({ length: 7 }, (_, k) => {
          const x = 8 + k * 10
          const y = top + 2 + (k % 2)
          return <circle key={k} cx={x} cy={y} r={0.9} fill={k % 2 ? '#fb923c' : '#fbbf24'} opacity={0.9} />
        })}
      </g>
    )
  }
  if (ground === 'mossbed') {
    // PATH-EXCLUSIVE tier-2 (Kapha / stillness) — a soft green moss strip with tiny tufts. A
    // simpler companion to the tier-3 stonegarden.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top} width={76} height={6} rx={2} fill="#16a34a" opacity={0.45} />
        {Array.from({ length: 9 }, (_, k) => (
          <ellipse key={k} cx={7 + k * 8.4} cy={top} rx={2.2} ry={1.3} fill="#4ade80" opacity={0.8} />
        ))}
      </g>
    )
  }
  if (ground === 'cloudtuft') {
    // PATH-EXCLUSIVE tier-2 (Vata / heart) — a wispy pale cloud strip. A simpler companion to the
    // tier-3 cloudfloor.
    return (
      <g opacity={0.9 * g} aria-hidden="true">
        <rect x={2} y={top + 2} width={76} height={4} rx={2} fill="#dbeafe" opacity={0.5} />
        {[12, 28, 44, 60, 72].map((x, k) => (
          <ellipse key={k} cx={x} cy={top + 1} rx={5 + (k % 2)} ry={2.6} fill="#f8fafc" opacity={0.85} />
        ))}
      </g>
    )
  }
  return null
}

// The FACE cosmetic (`cosmetics.face`) — a chosen expression that OVERRIDES the creature's own
// default face (each dosha keeps its own look when this is absent). Dosha-agnostic: drawn at the
// face centre `ex`/`ey` a dosha's `face()` would use, scaled by `sc`, inked in `pal.deep` so it
// recolours with the body. Eyes go in a `.spirit-eyes` group so they blink with the rest. Returns
// the face content (eyes + mouth + cheeks); the caller wraps it in the keyed `<g>`. Catalog keys:
// kawaii / wink / lashes / tongue / frog.
function drawFaceVariant(
  v: string,
  ex: number,
  ey: number,
  spread: number,
  sc: number,
  pal: BodyPalette,
  g: number,
  thriving: boolean,
) {
  const ink = pal.deep
  const cheeks = (
    <>
      <circle cx={ex - spread * 1.25} cy={ey + 1.7 * sc} r={0.85 * sc} fill={pal.accent} opacity={(thriving ? 0.34 : 0.24) * g} />
      <circle cx={ex + spread * 1.25} cy={ey + 1.7 * sc} r={0.85 * sc} fill={pal.accent} opacity={(thriving ? 0.34 : 0.24) * g} />
    </>
  )
  if (v === 'frogface') {
    // Big bulging frog eyes riding high, and a wide flat grin.
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <g key={dir}>
              <circle cx={ex + dir * spread * 1.15} cy={ey - 1.3 * sc} r={1.8 * sc} fill="#ffffff" stroke={ink} strokeWidth={0.5} opacity={0.95 * g} />
              <circle cx={ex + dir * spread * 1.15} cy={ey - 1.0 * sc} r={0.85 * sc} fill={ink} opacity={0.9 * g} />
            </g>
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 3 * sc} ${ey + 1.4 * sc} q ${3 * sc} ${2 * sc} ${6 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.85 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'tongue') {
    // Happy squinting eyes and an open mouth with a little tongue poking out.
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <path key={dir} d={`M ${ex + dir * spread - 1.1 * sc} ${ey} q ${1.1 * sc} ${-1.4 * sc} ${2.2 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.85 * g} />
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 1.5 * sc} ${ey + 1.6 * sc} q ${1.5 * sc} ${2.1 * sc} ${3 * sc} 0 z`} fill={ink} opacity={0.72 * g} />
        <path d={`M ${ex - 0.7 * sc} ${ey + 2.5 * sc} q ${0.7 * sc} ${1.6 * sc} ${1.4 * sc} 0 z`} fill="#fb7185" opacity={0.95 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'lashes') {
    // Rounded eyes with a glint and a few outward lashes, plus a sweet smile.
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <g key={dir}>
              <ellipse cx={ex + dir * spread} cy={ey} rx={0.85 * sc} ry={1.15 * sc} fill={ink} opacity={0.9 * g} />
              <circle cx={ex + dir * spread - 0.3 * sc} cy={ey - 0.4 * sc} r={0.35 * sc} fill="#ffffff" opacity={0.9 * g} />
              {[0, 1, 2].map((l) => (
                <path key={l} d={`M ${ex + dir * spread + dir * 0.7 * sc} ${ey - 0.9 * sc + l * 0.8 * sc} l ${dir * 1.1 * sc} ${(-0.5 + l * 0.3) * sc}`} stroke={ink} strokeWidth={0.45} strokeLinecap="round" opacity={0.85 * g} />
              ))}
            </g>
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 1.3 * sc} ${ey + 2 * sc} q ${1.3 * sc} ${1.1 * sc} ${2.6 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.8 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'wink') {
    // One eye winking shut (an arc), the other open with a glint, and a cheerful smile.
    return (
      <>
        <g className="spirit-eyes">
          <path d={`M ${ex - spread - 1.1 * sc} ${ey} q ${1.1 * sc} ${-1.5 * sc} ${2.2 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.85 * g} />
          <circle cx={ex + spread} cy={ey} r={1.05 * sc} fill={ink} opacity={0.9 * g} />
          <circle cx={ex + spread - 0.3 * sc} cy={ey - 0.35 * sc} r={0.42 * sc} fill="#ffffff" opacity={0.9 * g} />
        </g>
        <path className="spirit-mouth" d={`M ${ex - 1.3 * sc} ${ey + 2 * sc} q ${1.3 * sc} ${1.4 * sc} ${2.6 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.8 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'starry') {
    // Star-struck: a four-point sparkle for each eye + a big open smile.
    const star = (sx: number, sy: number, rr: number) =>
      `M ${sx} ${sy - rr} L ${sx + rr * 0.3} ${sy - rr * 0.3} L ${sx + rr} ${sy}` +
      ` L ${sx + rr * 0.3} ${sy + rr * 0.3} L ${sx} ${sy + rr} L ${sx - rr * 0.3} ${sy + rr * 0.3}` +
      ` L ${sx - rr} ${sy} L ${sx - rr * 0.3} ${sy - rr * 0.3} Z`
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <path key={dir} d={star(ex + dir * spread, ey, 1.7 * sc)} fill={pal.accent} opacity={0.95 * g} />
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 1.7 * sc} ${ey + 1.9 * sc} q ${1.7 * sc} ${1.9 * sc} ${3.4 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.85 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'sleepy') {
    // Half-lidded relaxed eyes, a small soft mouth, and a little floating "z".
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <path key={dir} d={`M ${ex + dir * spread - 1.2 * sc} ${ey - 0.2 * sc} q ${1.2 * sc} ${0.85 * sc} ${2.4 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.85} strokeLinecap="round" opacity={0.72 * g} />
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 0.9 * sc} ${ey + 2 * sc} q ${0.9 * sc} ${0.7 * sc} ${1.8 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.65 * g} />
        <path d={`M ${ex + spread + 1.4 * sc} ${ey - 2.4 * sc} h ${1.5 * sc} l ${-1.5 * sc} ${1.5 * sc} h ${1.5 * sc}`} fill="none" stroke={ink} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.55 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'surprised') {
    // Wide round O_O eyes and a small round open mouth.
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <g key={dir}>
              <circle cx={ex + dir * spread} cy={ey} r={1.5 * sc} fill="#ffffff" stroke={ink} strokeWidth={0.5} opacity={0.95 * g} />
              <circle cx={ex + dir * spread} cy={ey} r={0.72 * sc} fill={ink} opacity={0.9 * g} />
            </g>
          ))}
        </g>
        <ellipse className="spirit-mouth" cx={ex} cy={ey + 2.3 * sc} rx={0.85 * sc} ry={1.1 * sc} fill={ink} opacity={0.68 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'hearts') {
    // Love-struck: a heart for each eye + a warm smile.
    const heart = (hx: number, hy: number, s: number) =>
      `M ${hx} ${hy + s} C ${hx - s * 1.3} ${hy}, ${hx - s * 0.7} ${hy - s * 0.9}, ${hx} ${hy - s * 0.15}` +
      ` C ${hx + s * 0.7} ${hy - s * 0.9}, ${hx + s * 1.3} ${hy}, ${hx} ${hy + s} Z`
    return (
      <>
        <g className="spirit-eyes">
          {[-1, 1].map((dir) => (
            <path key={dir} d={heart(ex + dir * spread, ey - 0.2 * sc, 1.4 * sc)} fill="#fb7185" opacity={0.95 * g} />
          ))}
        </g>
        <path className="spirit-mouth" d={`M ${ex - 1.5 * sc} ${ey + 2 * sc} q ${1.5 * sc} ${1.5 * sc} ${3 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.85} strokeLinecap="round" opacity={0.82 * g} />
        {cheeks}
      </>
    )
  }
  if (v === 'cool') {
    // Sunglasses: two dark rounded lenses joined by a bridge (no blink — glasses hold), + a smirk.
    return (
      <>
        <rect x={ex - spread - 1.6 * sc} y={ey - 1 * sc} width={3 * sc} height={2 * sc} rx={0.7 * sc} fill={ink} opacity={0.9 * g} />
        <rect x={ex + spread - 1.4 * sc} y={ey - 1 * sc} width={3 * sc} height={2 * sc} rx={0.7 * sc} fill={ink} opacity={0.9 * g} />
        <line x1={ex - spread + 1.4 * sc} y1={ey - 0.5 * sc} x2={ex + spread - 1.4 * sc} y2={ey - 0.5 * sc} stroke={ink} strokeWidth={0.6} opacity={0.9 * g} />
        <line x1={ex - spread - 0.9 * sc} y1={ey - 0.2 * sc} x2={ex - spread + 0.1 * sc} y2={ey + 0.6 * sc} stroke="#ffffff" strokeWidth={0.4} opacity={0.55 * g} />
        <path className="spirit-mouth" d={`M ${ex - 1.2 * sc} ${ey + 2.2 * sc} q ${1.4 * sc} ${1 * sc} ${2.6 * sc} ${-0.3 * sc}`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.8 * g} />
        {cheeks}
      </>
    )
  }
  // kawaii — two happy upward-arc eyes (^ ^) and a soft cat-like :3 mouth.
  return (
    <>
      <g className="spirit-eyes">
        {[-1, 1].map((dir) => (
          <path key={dir} d={`M ${ex + dir * spread - 1.1 * sc} ${ey + 0.5 * sc} q ${1.1 * sc} ${-1.7 * sc} ${2.2 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.85 * g} />
        ))}
      </g>
      <path className="spirit-mouth" d={`M ${ex - 1.5 * sc} ${ey + 1.9 * sc} q ${0.75 * sc} ${1 * sc} ${1.5 * sc} 0 q ${0.75 * sc} ${1 * sc} ${1.5 * sc} 0`} fill="none" stroke={ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.8 * g} />
      {cheeks}
    </>
  )
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
  face: faceVariant,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
  face?: string
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
  // Mood → expression. A well-tended (thriving) spirit wears a brighter, warmer face; otherwise a
  // calm, content one. Kept gentle so it never reads as sad — just more or less radiant.
  const thriving = g >= 0.9
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
    form === 'prism' ||
    form === 'sprout' ||
    form === 'wheel'
      ? form
      : 'seated'
  // The serene Kapha face — two soft closed-lid eye arcs, faint warm cheeks, and a small content
  // smile, all in pal.deep/accent, from wisp onward. Every Kapha body wears it on its brightest
  // element so each form reads as a calm little being, not an object (each dosha keeps its own face
  // language: Pitta beams, Vata gazes bright-eyed, Kapha rests). `ex`/`ey` is the element centre;
  // `spread` the eye separation; `sc` an optional size scale.
  const face = (ex: number, ey: number, spread: number, sc = 1, key = 'face') =>
    // Every shape wears a face at EVERY stage, from the spark onward (`i >= 1` spans all stages —
    // stageIndex is 1-based, spark = 1): a chosen/previewed face COSMETIC (or the pet heart-eyes)
    // when one is set, otherwise the creature's own default expression. (Earlier the default face was
    // gated to wisp, so a young spark — and every shape previewed on it — read as a blank object.)
    faceVariant || i >= 1 ? (
      <g key={key}>
        {faceVariant ? (
          drawFaceVariant(faceVariant, ex, ey, spread, sc, pal, g, thriving)
        ) : (
          <>
            <g className="spirit-eyes">
              {[-1, 1].map((dir) => (
                <path
                  key={`eye-${dir}`}
                  d={`M ${ex + dir * spread - 1.2 * sc} ${ey} q ${1.2 * sc} ${1.15 * sc} ${2.4 * sc} 0`}
                  fill="none"
                  stroke={pal.deep}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  opacity={0.85 * g}
                />
              ))}
            </g>
            <circle cx={ex - spread * 0.95} cy={ey + 1.7 * sc} r={0.9 * sc} fill={pal.accent} opacity={(thriving ? 0.34 : 0.24) * g} />
            <circle cx={ex + spread * 0.95} cy={ey + 1.7 * sc} r={0.9 * sc} fill={pal.accent} opacity={(thriving ? 0.34 : 0.24) * g} />
            <path
              className="spirit-mouth"
              d={`M ${ex - 1.35 * sc} ${ey + 2.4 * sc} q ${1.35 * sc} ${(thriving ? 1.35 : 0.9) * sc} ${2.7 * sc} 0`}
              fill="none"
              stroke={pal.deep}
              strokeWidth={0.85}
              strokeLinecap="round"
              opacity={0.72 * g}
            />
          </>
        )}
      </g>
    ) : null
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
      {bodyForm === 'seated' &&
        (() => {
          // A serene little MEDITATOR: a wide crossed-legs base with two knee bumps, a rounded body
          // resting on it, hands cupped in the lap (dhyana mudra), and a round head with a calm face.
          // (Was a plain ellipse with splayed tentacle-arms — this reads clearly as a seated person.)
          const headR = (i >= 2 ? 4.8 : 5.8) * scale
          const headCy = cy - bodyH * 0.5 + headR * 0.4
          const torsoCy = cy + bodyH * 0.06
          const torsoRx = bodyW * 0.47
          const torsoRy = bodyH * 0.42
          const legCy = cy + bodyH * 0.42
          const legRx = bodyW * 0.74
          const legRy = bodyH * 0.2
          return (
            // The whole figure sways gently from its base — a slow meditative rock.
            <g className="spirit-tilt" style={{ animationDuration: '5.4s' }}>
              {/* Crossed-legs base — a wide low mound. */}
              <ellipse cx={40} cy={legCy} rx={legRx} ry={legRy} fill={pal.glow} opacity={(0.7 + 0.22 * p) * g} />
              {/* Two knee bumps poking out at the front sides (from wisp). */}
              {i >= 2 &&
                [-1, 1].map((d) => (
                  <ellipse
                    key={`knee-${d}`}
                    cx={40 + d * legRx * 0.58}
                    cy={legCy - legRy * 0.1}
                    rx={legRx * 0.3}
                    ry={legRy * 0.82}
                    fill={pal.glow}
                    opacity={(0.72 + 0.2 * p) * g}
                  />
                ))}
              {/* The rounded torso sitting on the legs. */}
              <ellipse cx={40} cy={torsoCy} rx={torsoRx} ry={torsoRy} fill={pal.glow} opacity={(0.74 + 0.22 * p) * g} />
              {/* Hands cupped in the lap (dhyana mudra) — a small bright oval, from wisp. */}
              {i >= 2 && (
                <ellipse cx={40} cy={torsoCy + torsoRy * 0.6} rx={torsoRx * 0.5} ry={torsoRy * 0.18} fill={pal.core} opacity={(0.82 + 0.14 * p) * g} />
              )}
              {/* The head. */}
              <circle cx={40} cy={headCy} r={headR} fill={pal.core} opacity={(0.86 + 0.14 * p) * g} />
              {/* The serene face — closed-lid eyes, faint cheeks, a soft smile. */}
              {face(40, headCy + 0.7, 2.1 * scale, scale)}
              {/* Radiant gains a small ushnisha crown-point — the final flourish. */}
              {i >= 5 && <circle cx={40} cy={headCy - headR - 1} r={1.8} fill={pal.accent} opacity={0.9 * g} />}
            </g>
          )
        })()}

      {/* `cluster` — a calm huddle of overlapping orbs/stones, more + larger up the stages. The
          larger orbs read as `glow`, two highlights as `core`, one or two as `accent`; a white core
          highlight crowns the brightest. Laid out in a rounded blob over the lotus base. */}
      {bodyForm === 'cluster' &&
        (() => {
          // A clump of TRANSLUCENT soap BUBBLES — overlapping see-through orbs, each with a bright rim
          // + a little crescent shine, so the overlaps show through (the "transposition" the owner
          // asked for). The face rides the front-centre bubble.
          const R = (8 + p * 2.6) * scale // overall body radius
          const ringCount = 8 + Math.min(5, i - 1) // more bubbles for a fuller froth
          const orbs = [
            { x: 40, y: cy - R * 0.05, r: R * 0.6, fill: pal.glow },
            ...Array.from({ length: ringCount }, (_, k) => {
              const a = (k / ringCount) * Math.PI * 2 + 0.5
              // Two loose radii → bubbles at different depths overlap more.
              const ring = R * (k % 2 ? 0.72 : 0.46)
              return {
                x: 40 + Math.cos(a) * ring,
                y: cy + Math.sin(a) * ring * 0.82,
                r: R * (0.34 + (k % 3) * 0.08),
                fill: k % 3 === 0 ? pal.accent : k % 2 ? pal.core : pal.glow,
              }
            }),
          ]
          return (
            // Each bubble JIGGLES on its own phase (staggered); the centre one PULSES under the face.
            <g>
              {orbs.map((o, k) => (
                <g
                  key={k}
                  className={k === 0 ? 'spirit-pulse' : 'spirit-jiggle'}
                  style={
                    k === 0
                      ? undefined
                      : { animationDelay: `${(k * 0.3).toFixed(2)}s`, animationDuration: `${(2.4 + (k % 3) * 0.5).toFixed(1)}s` }
                  }
                >
                  {/* Translucent bubble body — overlaps show through. */}
                  <circle cx={o.x} cy={o.y} r={o.r} fill={o.fill} opacity={(0.4 + 0.12 * p) * g} />
                  {/* A bright surface-tension rim. */}
                  <circle cx={o.x} cy={o.y} r={o.r} fill="none" stroke={pal.core} strokeWidth={0.6} opacity={(0.5 + 0.2 * p) * g} />
                  {/* A little crescent shine hugging the upper-left (reads it as a bubble). */}
                  <path
                    d={`M ${o.x - o.r * 0.55} ${o.y - o.r * 0.18} Q ${o.x - o.r * 0.58} ${o.y - o.r * 0.56} ${o.x - o.r * 0.18} ${o.y - o.r * 0.64}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={0.7}
                    strokeLinecap="round"
                    opacity={0.6 * g}
                  />
                </g>
              ))}
              {/* The serene face on the front-centre bubble. */}
              {face(40, cy + R * 0.05, R * 0.4, scale)}
            </g>
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
            const isTop = k === count - 1
            const rx = (10 - 5.5 * t) * scale
            // The crown stone is ROUNDER — a little head that clearly wears the face, rather than a
            // flat pebble reading as a stray disc perched on top; and a soft earthy tone (not the
            // bright core) so it belongs to the stack.
            const ry = isTop ? rx * 0.84 : (3.4 - 1.1 * t) * scale
            const sy = y - ry
            y = sy - ry * 0.9 // next stone sits just above, with a slight overlap
            return { k, rx, ry, cy: sy, fill: isTop ? pal.glow : fills[Math.min(k, fills.length - 1)] }
          })
          return (
            // The whole balanced stack teeters gently from its base, while the lower stones also
            // wobble on their own — a delicately-balanced cairn that's alive.
            <g className="spirit-sway-soft">
              {stones.map((s) => {
                const isCrown = s.k === count - 1 // the crown stone wears the face — keep it steady
                return (
                  <ellipse
                    key={s.k}
                    className={isCrown ? undefined : 'spirit-jiggle'}
                    style={
                      isCrown
                        ? undefined
                        : { animationDelay: `${(s.k * 0.45).toFixed(2)}s`, animationDuration: `${(3.2 + s.k * 0.4).toFixed(1)}s` }
                    }
                    cx={40}
                    cy={s.cy}
                    rx={s.rx}
                    ry={s.ry}
                    fill={s.fill}
                    opacity={(0.78 + 0.18 * p) * g}
                  />
                )
              })}
              {/* Little stone ARMS with fists resting down the sides (the coal rock-buddy recipe) —
                  reaching from the shoulder stone so the stack reads as a wee stone person, not a
                  pile. Stroked in accent (NOT pal.deep @0.9 — that pair is the face-test's eye
                  fingerprint), fists filled in deep. */}
              {(() => {
                const sh = stones[Math.max(0, stones.length - 2)]
                return [-1, 1].map((dir) => (
                  <g key={`arm-${dir}`}>
                    <path
                      d={`M ${40 + dir * sh.rx * 0.55} ${sh.cy - sh.ry * 0.1} q ${dir * 3.2 * scale} 1 ${dir * 4.2 * scale} ${3.4 * scale}`}
                      fill="none"
                      stroke={pal.accent}
                      strokeWidth={2.1 * scale}
                      strokeLinecap="round"
                      opacity={(0.8 + 0.16 * p) * g}
                    />
                    <circle
                      cx={40 + dir * (sh.rx * 0.55 + 4.4 * scale)}
                      cy={sh.cy - sh.ry * 0.1 + 3.7 * scale}
                      r={1.55 * scale}
                      fill={pal.deep}
                      opacity={(0.82 + 0.16 * p) * g}
                    />
                  </g>
                ))
              })()}
              {/* The serene face, on the small crown stone at the top of the stack. */}
              {face(40, stones[stones.length - 1].cy, stones[stones.length - 1].rx * 0.42, scale * 0.8)}
            </g>
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
              {/* The whole electron SHELL (orbits + electrons) slowly spins around the nucleus, so the
                  electrons go around; the nucleus + face stay still at the centre. */}
              <g className="spirit-spin-cw" style={{ ['--spin-cx' as string]: '40px', ['--spin-cy' as string]: `${cy}px` }}>
              {angles.map((deg, k) => (
                <g key={k} transform={`rotate(${deg} 40 ${cy})`}>
                  <ellipse
                    cx={40}
                    cy={cy}
                    rx={orx}
                    ry={ory}
                    fill="none"
                    stroke={pal.deep}
                    strokeWidth={1.2}
                    opacity={0.85 * g}
                  />
                  {/* An electron dot riding the orbit (on the +x side of the ellipse). It also
                      TWINKLES on its own phase, so each electron pulses independently of the spin. */}
                  <circle
                    className="spirit-twinkle"
                    style={{ animationDelay: `${(k * 0.5).toFixed(2)}s`, animationDuration: `${(1.8 + k * 0.35).toFixed(1)}s` }}
                    cx={40 + orx}
                    cy={cy}
                    r={1}
                    fill={pal.glow}
                    opacity={0.9 * g}
                  />
                </g>
              ))}
              </g>
              {/* The bright nucleus — it pulses like a beating heart. */}
              <circle className="spirit-pulse" cx={40} cy={cy} r={4 * scale} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
              {/* The serene face, on the nucleus. */}
              {face(40, cy + 0.6, 1.8 * scale, scale * 0.9)}
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
              {/* The petals gently BREATHE (open + close a touch) around the still centre. */}
              <g className="spirit-breathe">
                {Array.from({ length: petals }, (_, k) => {
                  const a = (k / petals) * Math.PI * 2 - Math.PI / 2 // start at the top
                  const px = 40 + Math.cos(a) * reach
                  const py = cy + Math.sin(a) * reach
                  return (
                    <ellipse
                      key={k}
                      // Opacity-only shimmer (safe alongside the rotate transform attr) → each petal
                      // glows on its own phase while the whole flower slowly breathes.
                      className="spirit-shimmer"
                      style={{ animationDelay: `${(k * 0.31).toFixed(2)}s`, animationDuration: `${(2.4 + (k % 3) * 0.5).toFixed(1)}s` }}
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
              </g>
              {/* The bright flower centre — gently pulsing. */}
              <circle className="spirit-pulse" cx={40} cy={cy} r={3.2 * scale} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
              {/* The serene face, on the flower centre. */}
              {face(40, cy + 0.5, 1.5 * scale, scale * 0.85)}
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
              {/* Each ripple ring BREATHES on its OWN staggered phase — expanding + contracting like
                  water radiating outward from the centre (a rotation would be invisible on full
                  circles). The centre dot + face stay still. */}
              {rings.map((r, k) => (
                <circle
                  key={k}
                  className="spirit-breathe"
                  style={{ animationDelay: `${(k * 0.7).toFixed(2)}s`, animationDuration: `${(3.4 + k * 0.5).toFixed(1)}s` }}
                  cx={40}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={k % 2 === 0 ? pal.accent : pal.glow}
                  strokeWidth={1.4}
                  opacity={(0.55 + 0.25 * p) * g}
                />
              ))}
              {/* A soft centre dot at the still point — breathing gently. */}
              <circle className="spirit-pulse" cx={40} cy={cy} r={2.4 * scale} fill={pal.core} opacity={(0.8 + 0.15 * p) * g} />
              {/* The serene face, just inside the innermost ring — the ensō reads as the face's
                  calm outline rather than an empty ring. */}
              {face(40, cy + 0.2, 2.2 * scale, scale * 0.9)}
            </>
          )
        })()}

      {/* `prism` — a faceted gem: a hexagon OUTLINE polygon with internal facet lines from each
          vertex to the centre. An earthy mineral; slightly larger at higher stages. Centred on
          (40, cy). */}
      {bodyForm === 'prism' &&
        (() => {
          // A cut GEM (a brilliant-cut jewel): a flat table on top, slanted crown facets down to the
          // widest girdle, then a pointed pavilion below — a proper faceted jewel, not a flat hexagon
          // outline. The serene face sits on the front crown.
          const r = (9 + p * 2.5) * scale
          const tw = r * 0.5 // table half-width
          const tableY = cy - r * 0.74
          const girdleY = cy - r * 0.04
          const pointY = cy + r * 1.06
          const body = `M ${40 - tw} ${tableY} L ${40 + tw} ${tableY} L ${40 + r} ${girdleY} L ${40} ${pointY} L ${40 - r} ${girdleY} Z`
          // Each facet line SHIMMERS on its own phase — light dancing across the cut gem.
          const facet = (x1: number, y1: number, x2: number, y2: number, o: number, idx = 0) => (
            <line
              className="spirit-shimmer"
              style={{ animationDelay: `${(idx * 0.28).toFixed(2)}s`, animationDuration: `${(2 + (idx % 3) * 0.5).toFixed(1)}s` }}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={pal.accent}
              strokeWidth={0.75}
              opacity={o * g}
            />
          )
          return (
            // The whole gem rocks slowly from its base, turning to catch the light, while the facet
            // lines shimmer independently on top.
            <g className="spirit-tilt" style={{ animationDuration: '5s' }}>
              {/* A solid-ish translucent gem body (was very faint, which left the bright table cap
                  reading as a separate ball perched on top). */}
              <path d={body} fill={pal.glow} fillOpacity={0.72 * g} stroke={pal.deep} strokeWidth={1.4} strokeLinejoin="round" opacity={(0.86 + 0.12 * p) * g} />
              {/* Girdle + crown + pavilion facet lines (faint, so the face still reads). */}
              {facet(40 - r, girdleY, 40 + r, girdleY, 0.34, 0)}
              {facet(40 - tw, tableY, 40 - r, girdleY, 0.36, 1)}
              {facet(40 + tw, tableY, 40 + r, girdleY, 0.36, 2)}
              {facet(40 - tw, tableY, 40, girdleY, 0.26, 3)}
              {facet(40 + tw, tableY, 40, girdleY, 0.26, 4)}
              {facet(40 - r, girdleY, 40, pointY, 0.28, 5)}
              {facet(40 + r, girdleY, 40, pointY, 0.28, 6)}
              {/* A faint brighter sheen on the table facet (kept subtle + low-opacity so it reads as a
                  lit top facet of the jewel, NOT a bright blob sitting on top). */}
              <path d={`M ${40 - tw * 0.72} ${tableY + 1} L ${40 + tw * 0.72} ${tableY + 1} L ${40 + tw * 0.4} ${tableY + (girdleY - tableY) * 0.42} L ${40 - tw * 0.4} ${tableY + (girdleY - tableY) * 0.42} Z`} fill={pal.core} opacity={0.28 * g} />
              {/* The face on the front crown (hidden behind shades below, but kept so a face COSMETIC
                  still shows + the eyes/mouth power blink + sing). */}
              {face(40, cy - r * 0.02, 2.3 * scale, scale * 0.82)}
              {/* ── "Shard": a cool gem with CROSSED ARMS + SHADES (an edgy, aloof little character). ── */}
              {!faceVariant &&
                (() => {
                  const es = 2.3 * scale
                  const eyeY = cy - r * 0.02 - 0.9 * scale
                  const lensW = 2.7 * scale
                  const lensH = 2 * scale
                  const armY = girdleY + (pointY - girdleY) * 0.26
                  const armR = r * 0.6
                  return (
                    <>
                      {/* Crossed arms over the lower gem (jade limbs with bright fists). */}
                      {([1, -1] as const).map((from, k) => (
                        <g key={`shard-arm-${k}`}>
                          <path
                            d={`M ${40 + from * armR} ${armY + 2.6} Q 40 ${armY} ${40 - from * armR * 0.5} ${armY - 0.3}`}
                            fill="none"
                            stroke={pal.glow}
                            strokeWidth={2.6 * scale}
                            strokeLinecap="round"
                            opacity={0.92 * g}
                          />
                          <path
                            d={`M ${40 + from * armR} ${armY + 2.6} Q 40 ${armY} ${40 - from * armR * 0.5} ${armY - 0.3}`}
                            fill="none"
                            stroke={pal.deep}
                            strokeWidth={0.6}
                            strokeLinecap="round"
                            opacity={0.4 * g}
                          />
                          <circle cx={40 + from * armR} cy={armY + 2.6} r={1.7 * scale} fill={pal.core} stroke={pal.deep} strokeWidth={0.4} opacity={0.96 * g} />
                        </g>
                      ))}
                      {/* Cool SHADES (wayfarer lenses + bridge + a glint on each). */}
                      {[-1, 1].map((s) => (
                        <rect
                          key={`shard-lens-${s}`}
                          x={40 + s * es - lensW * 0.5}
                          y={eyeY - lensH * 0.5}
                          width={lensW}
                          height={lensH}
                          rx={0.7}
                          fill="#181820"
                          stroke="#000"
                          strokeWidth={0.3}
                          opacity={0.95 * g}
                          transform={`rotate(${s * -7} ${40 + s * es} ${eyeY})`}
                        />
                      ))}
                      <path d={`M ${40 - es + lensW * 0.42} ${eyeY - lensH * 0.26} L ${40 + es - lensW * 0.42} ${eyeY - lensH * 0.26}`} stroke="#181820" strokeWidth={0.9} strokeLinecap="round" opacity={0.95 * g} />
                      {[-1, 1].map((s) => (
                        <line key={`shard-glint-${s}`} x1={40 + s * es - lensW * 0.3} y1={eyeY - lensH * 0.22} x2={40 + s * es - lensW * 0.02} y2={eyeY + lensH * 0.14} stroke="#ffffff" strokeWidth={0.5} strokeLinecap="round" opacity={0.55 * g} />
                      ))}
                    </>
                  )
                })()}
              {/* A bright GLEAM that periodically sweeps across the gem — the jewel SHINING. A vertical
                  bar drifting left→right (opacity 0 except the brief sweep, so nothing shows at rest /
                  under reduced motion). */}
              <rect
                className="spirit-shine"
                x={40 - 1.7}
                y={tableY - 0.5}
                width={3.4}
                height={(pointY - tableY) * 0.74}
                rx={1.7}
                fill="#ffffff"
                opacity={0}
              />
            </g>
          )
        })()}

      {/* `sprout` — the one ORGANIC Kapha body: an earthy seedling. A slim vertical `deep` stem
          rising from the lotus base, with `2 + floor(i/2)` leaf ellipses angled ALTERNATELY off the
          stem (glow / accent), crowned by a small `core` bud. A growing sprout, distinct from every
          stone/gem form. Centred on x=40, rising from the base toward the head height. */}
      {bodyForm === 'sprout' &&
        (() => {
          // A lively little SEEDLING: a curved stem rising from a soil mound, proper pointed LEAVES
          // (veined + fluttering) stepping up it, a dewdrop clinging on, and a colour-tipped BUD that
          // breathes + wears the face. (Was a bare stem with plain ellipse leaves — too flat.)
          const baseY = cy + bodyH * 0.5
          const topY = cy - bodyH * 0.6
          const midY = (baseY + topY) / 2
          const nLeaves = 2 + Math.min(2, Math.floor(i / 2)) // 2 → 4
          // A pointed leaf BLADE (almond) with a midrib, centred at (lx,ly), rotated deg.
          const leaf = (lx: number, ly: number, L: number, W: number, deg: number, fill: string, key: string) => (
            <g key={key} transform={`rotate(${deg} ${lx} ${ly})`}>
              <path
                d={`M ${lx} ${ly - L * 0.5} Q ${lx + W} ${ly - L * 0.04} ${lx} ${ly + L * 0.5} Q ${lx - W} ${ly - L * 0.04} ${lx} ${ly - L * 0.5} Z`}
                fill={fill}
                stroke={pal.deep}
                strokeWidth={0.5}
                strokeLinejoin="round"
                opacity={(0.8 + 0.16 * p) * g}
              />
              <path d={`M ${lx} ${ly - L * 0.42} L ${lx} ${ly + L * 0.42}`} fill="none" stroke={pal.deep} strokeWidth={0.4} opacity={0.42 * g} />
            </g>
          )
          return (
            // The seedling sways gently from its base (spirit-tilt), like it's growing on the breeze.
            <g className="spirit-tilt">
              {/* A little soil mound at the base. */}
              <ellipse cx={40} cy={baseY} rx={5.5 * scale} ry={1.8 * scale} fill={pal.deep} opacity={(0.38 + 0.15 * p) * g} />
              {/* The curved stem. */}
              <path
                d={`M 40 ${baseY} C ${40 + 2.6} ${midY + 3} ${40 - 2.6} ${midY - 3} 40 ${topY + 2}`}
                fill="none"
                stroke={pal.deep}
                strokeWidth={1.7 * scale}
                strokeLinecap="round"
                opacity={(0.78 + 0.16 * p) * g}
              />
              {/* Leaves stepping up the stem, alternating sides — each flutters on its own phase. */}
              {Array.from({ length: nLeaves }, (_, k) => {
                const side = k % 2 === 0 ? -1 : 1
                const t = (k + 1) / (nLeaves + 1.5)
                const ly = baseY + (topY - baseY) * t
                const lx = 40 + side * 3.4 * scale
                return (
                  <g
                    key={`sl-${k}`}
                    className="spirit-shimmer"
                    style={{ animationDelay: `${(k * 0.4).toFixed(2)}s`, animationDuration: `${(2.6 + (k % 2) * 0.5).toFixed(1)}s` }}
                  >
                    {leaf(lx, ly, (7 + p * 2) * scale, (2.9 + p) * scale, side * 42, k % 2 ? pal.accent : pal.glow, `leaf-${k}`)}
                  </g>
                )
              })}
              {/* A dewdrop clinging to a lower leaf. */}
              {i >= 3 && <ellipse cx={40 - 5 * scale} cy={baseY + (topY - baseY) * 0.34} rx={0.9} ry={1.3} fill={pal.core} opacity={0.6 * g} />}
              {/* The crowning BUD — a rounded teardrop with a colour tip, breathing, wearing the face. */}
              <g className="spirit-breathe">
                <path
                  d={`M 40 ${topY - 4 * scale}
                      C ${40 + 2.7 * scale} ${topY - 3.4 * scale} ${40 + 2.7 * scale} ${topY + 1.6 * scale} 40 ${topY + 2 * scale}
                      C ${40 - 2.7 * scale} ${topY + 1.6 * scale} ${40 - 2.7 * scale} ${topY - 3.4 * scale} 40 ${topY - 4 * scale} Z`}
                  fill={pal.glow}
                  stroke={pal.deep}
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                  opacity={(0.82 + 0.14 * p) * g}
                />
                {/* A colour tip peeking from the bud. */}
                <ellipse cx={40} cy={topY - 2.6 * scale} rx={1.7 * scale} ry={1.4 * scale} fill={pal.accent} opacity={(0.72 + 0.16 * p) * g} />
              </g>
              {/* The serene face, on the bud's rounded lower half. */}
              {face(40, topY - 0.2 * scale, 1.4 * scale, scale * 0.78)}
            </g>
          )
        })()}

      {/* `wheel` — a dharma wheel / meditative mandala: concentric ring OUTLINES like `enso`
          (2 → 3 by stage) PLUS `6 + i` thin radial `accent` spokes from the centre outward, each
          tipped with a small `glow` dot, around a bright `core` hub. Fuller + more RADIAL than
          `enso`. Centred on (40, cy). */}
      {bodyForm === 'wheel' &&
        (() => {
          const rings =
            i >= 4
              ? [6 * scale, 11 * scale, 15 * scale] // ascendant+ gains the outer ring (matches enso)
              : [6 * scale, 11 * scale]
          const outer = rings[rings.length - 1]
          const spokes = 6 + i // 7 → 11 spokes up the ladder
          return (
            <>
              {/* The wheel's RINGS + SPOKES slowly TURN as one (spirit-spin-ccw); the hub + face stay
                  still at the centre. */}
              <g className="spirit-spin-ccw" style={{ ['--spin-cx' as string]: '40px', ['--spin-cy' as string]: `${cy}px` }}>
              {rings.map((r, k) => (
                <circle
                  key={`wheel-ring-${k}`}
                  cx={40}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={k % 2 === 0 ? pal.accent : pal.glow}
                  strokeWidth={1.3}
                  opacity={(0.55 + 0.25 * p) * g}
                />
              ))}
              {/* Radial spokes from the hub out to the outer ring, each tipped with a glow dot. */}
              {Array.from({ length: spokes }, (_, k) => {
                const a = (k / spokes) * Math.PI * 2 - Math.PI / 2 // start at the top
                const ex = 40 + Math.cos(a) * outer
                const ey = cy + Math.sin(a) * outer
                return (
                  <g key={`wheel-spoke-${k}`}>
                    <line
                      x1={40}
                      y1={cy}
                      x2={ex}
                      y2={ey}
                      stroke={pal.accent}
                      strokeWidth={0.7}
                      opacity={(0.45 + 0.2 * p) * g}
                    />
                    <circle cx={ex} cy={ey} r={1 * scale} fill={pal.glow} opacity={(0.7 + 0.15 * p) * g} />
                  </g>
                )
              })}
              </g>
              {/* The bright hub at the still centre — pulsing gently. */}
              <circle className="spirit-pulse" cx={40} cy={cy} r={2.6 * scale} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
              {/* The serene face, on the hub. */}
              {face(40, cy + 0.4, 1.4 * scale, scale * 0.8)}
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
  face: faceVariant,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
  face?: string
}) {
  const pal = palProp ?? PATH_PALETTE.breath
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  const baseY = 56
  // Mood → expression: a thriving Pitta grins wider and its cheeks warm; otherwise a friendly smile.
  const thriving = g >= 0.9

  // A clean, layered FLAME — three nested flame silhouettes (a searing `accent` outer, a warm `glow`
  // mid, a white-hot `core` heart) narrowing to a gently curled tip, grounded on a few warm embers
  // with a calm face. (Redesign: the old spread "tongues + teal pool" read sloppy; this is one
  // cohesive, all-warm fire.) The `form` (shape) cosmetic now swaps the WHOLE silhouette for a
  // DISTINCT fire OBJECT (campfire / torch / fireball / sun / coals / lantern) — like Kapha's swapped
  // bodies, not a recoloured flame. The bare default + `twin` keep the layered blaze. Each object
  // still GROWS up the stage ladder (i / p), stays in the 80×80 frame, and recolours via pal.*.
  // Only `breath` keys matter; the other doshas ignore them.
  const isTwin = form === 'twin'
  // The DISTINCT fire-object forms render their own silhouettes below; everything else (default +
  // twin) is the plain layered blaze.
  const isObjectForm =
    form === 'campfire' ||
    form === 'torch' ||
    form === 'fireball' ||
    form === 'sun' ||
    form === 'coals' ||
    form === 'lantern'

  // Flame size grows with the stage. Kept only a touch taller than wide so it reads as a plump,
  // full fire — never a long stretched candle.
  const H = 15 + p * 12
  const W = 9 + p * 4
  const tipCurl = 1.7 // a slight tip-lean for life

  // A clean flame silhouette centred on (fx, fbY): a rounded belly narrowing to a curled point.
  // `round` swaps the point for a soft billow.
  const flame = (fx: number, fbY: number, fh: number, fw: number, curl: number, round: boolean) => {
    const tipX = fx + curl
    const tipY = fbY - fh
    if (round) {
      return `M ${fx} ${fbY}
        C ${fx - fw} ${fbY} ${fx - fw} ${fbY - fh * 0.58} ${fx - fw * 0.62} ${fbY - fh * 0.82}
        C ${fx - fw * 0.32} ${fbY - fh * 1.02} ${fx + fw * 0.32} ${fbY - fh * 1.02} ${fx + fw * 0.62} ${fbY - fh * 0.82}
        C ${fx + fw} ${fbY - fh * 0.58} ${fx + fw} ${fbY} ${fx} ${fbY} Z`
    }
    return `M ${fx} ${fbY}
      C ${fx - fw * 1.05} ${fbY} ${fx - fw * 1.05} ${fbY - fh * 0.52} ${fx - fw * 0.5} ${fbY - fh * 0.74}
      C ${fx - fw * 0.18} ${fbY - fh * 0.94} ${tipX - 2.4} ${tipY + 3.4} ${tipX} ${tipY}
      C ${tipX + 2.4} ${tipY + 3.4} ${fx + fw * 0.18} ${fbY - fh * 0.94} ${fx + fw * 0.5} ${fbY - fh * 0.74}
      C ${fx + fw * 1.05} ${fbY - fh * 0.52} ${fx + fw * 1.05} ${fbY} ${fx} ${fbY} Z`
  }

  // A stack of three nested flames (outer / mid / white-hot heart) at a given centre + size.
  const layeredFlame = (fx: number, fbY: number, fh: number, fw: number, curl: number, key?: string) => {
    // A deterministic per-flame phase (from its position) so a twin / campfire's flames each flicker
    // on their OWN rhythm rather than all pulsing in lockstep.
    const phase = (((fx * 2.3 + fbY) % 10) + 10) % 10
    return (
    <g
      key={key}
      className="pitta-flame"
      style={{ animationDelay: `${(phase * 0.09).toFixed(2)}s`, animationDuration: `${(1.25 + (phase % 3) * 0.18).toFixed(2)}s` }}
    >
      <path d={flame(fx, fbY, fh, fw, curl, false)} fill={pal.accent} opacity={(0.82 + 0.16 * p) * g} />
      <path
        d={flame(fx, fbY - 1, fh * 0.7, fw * 0.62, curl * 0.6, false)}
        fill={pal.glow}
        opacity={(0.9 + 0.1 * p) * g}
      />
      <path
        d={flame(fx, fbY - 1.5, fh * 0.4, fw * 0.36, 0, false)}
        fill={pal.core}
        opacity={(0.92 + 0.08 * p) * g}
      />
    </g>
    )
  }

  // The lively Pitta face — two friendly upward smile-arc eyes, warm cheeks, and a cheerful grin,
  // on the main glowing element, from wisp onward. `ex`/`ey` is the element centre; `spread` how far
  // apart, `sc` an optional size scale. Shared by every object form so the faces read consistently.
  const face = (ex: number, ey: number, spread: number, sc = 1, key = 'face') =>
    // Every shape wears a face at EVERY stage, from the spark onward (`i >= 1` spans all stages —
    // stageIndex is 1-based, spark = 1): a chosen/previewed face COSMETIC (or the pet heart-eyes)
    // when one is set, otherwise the creature's own default expression. (Earlier the default face was
    // gated to wisp, so a young spark — and every shape previewed on it — read as a blank object.)
    faceVariant || i >= 1 ? (
      <g key={key}>
        {faceVariant ? (
          drawFaceVariant(faceVariant, ex, ey, spread, sc, pal, g, thriving)
        ) : (
          <>
            <g className="spirit-eyes">
              {[-1, 1].map((dir) => (
                <path
                  key={`eye-${dir}`}
                  d={`M ${ex + dir * spread - 1.3 * sc} ${ey} q ${1.3 * sc} ${-1.5 * sc} ${2.6 * sc} 0`}
                  fill="none"
                  stroke="#7c2d12"
                  strokeWidth={1}
                  strokeLinecap="round"
                  opacity={0.85 * g}
                />
              ))}
            </g>
            <circle cx={ex - spread * 1.13} cy={ey + 1.7 * sc} r={1 * sc} fill={pal.accent} opacity={(thriving ? 0.38 : 0.28) * g} />
            <circle cx={ex + spread * 1.13} cy={ey + 1.7 * sc} r={1 * sc} fill={pal.accent} opacity={(thriving ? 0.38 : 0.28) * g} />
            <path
              className="spirit-mouth"
              d={`M ${ex - 1.8 * sc} ${ey + 2.4 * sc} q ${1.8 * sc} ${(thriving ? 2.4 : 1.7) * sc} ${3.6 * sc} 0`}
              fill="none"
              stroke="#7c2d12"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.8 * g}
            />
          </>
        )}
      </g>
    ) : null

  // A few sparks drifting up off a point — shared by the flame-bearing object forms (and the
  // default blaze) from fledgling onward. `sx`/`topY` is the spark fountain's origin + reach.
  const sparks = (sx: number, topY: number, reach: number, key = 'sparks') =>
    i >= 3 ? (
      <g key={key}>
        {Array.from({ length: i - 1 }, (_, k) => {
          const a = (k / Math.max(1, i - 1)) * Math.PI - Math.PI / 2
          return (
            <circle
              key={`spark-${k}`}
              // Each spark lifts off + fades on its own phase — floating embers rising off the fire.
              className="spirit-ember"
              style={{ animationDelay: `${(k * 0.45).toFixed(2)}s`, animationDuration: `${(2.4 + (k % 3) * 0.5).toFixed(1)}s` }}
              cx={sx + Math.cos(a) * reach}
              cy={topY + Math.sin(a) * 3}
              r={0.9 + p * 0.5}
              fill={pal.glow}
              opacity={0.7 * g}
            />
          )
        })}
      </g>
    ) : null

  // Rising SMOKE — a couple of thin grey wisps curling up off a fire, each drifting up + fading on
  // its own phase (`.spirit-smoke`). `topY` is where the smoke starts (just above the flame tip).
  const smoke = (sx: number, topY: number, n = 2, key = 'smoke') => (
    <g key={key}>
      {Array.from({ length: n }, (_, k) => {
        const off = (k - (n - 1) / 2) * 2.4
        const x0 = sx + off
        return (
          <path
            key={`${key}-${k}`}
            className="spirit-smoke"
            style={{ animationDelay: `${(k * 1.3).toFixed(2)}s`, animationDuration: `${(3.6 + k * 0.7).toFixed(1)}s` }}
            d={`M ${x0} ${topY} q -2.2 -2.6 0 -5 q 2.2 -2.4 0 -5`}
            fill="none"
            stroke="#9b938a"
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.5 * g}
          />
        )
      })}
    </g>
  )

  // ── DISTINCT fire OBJECTS (the `form` cosmetic) ──────────────────────────────────────────────
  // Each REPLACES the bare blaze with its own silhouette, grows with the stage, stays in frame, and
  // wears the default flame's friendly eyes on its main glowing element (coals may stay sleepy).

  if (isObjectForm) {
    // CAMPFIRE — crossed logs with a small layered flame rising from their centre. Logs thicken/add
    // up the stages; the flame is the smaller blaze atop them, with 0–2 side licks for life.
    if (form === 'campfire') {
      const fh = (12 + p * 9) * 0.92 // a touch shorter than the bare blaze — it sits on the logs
      const fw = 7 + p * 3
      const logY = baseY + 1.5
      const logLen = 15 + p * 4
      const logTh = 4.6 + p * 0.8 // chunkier logs read clearly as timber, not thin bars
      const logCount = i >= 4 ? 3 : 2 // two crossed logs early, a third by ascendant
      const sideLicks = Math.min(2, i - 2) // a lick each side from fledgling
      const WOOD = '#c79a63' // pale cut-wood end grain (palette-independent so a log reads as a log)
      // One log: a bark-brown cylinder with a pale CUT END showing tree rings, so it reads as timber.
      const drawLog = (deg: number, k: number, endSide: number) => (
        <g key={`log-${k}`} transform={`rotate(${deg} ${cx} ${logY})`}>
          {/* Bark barrel. */}
          <rect x={cx - logLen / 2} y={logY - logTh / 2} width={logLen} height={logTh} rx={logTh / 2} fill={pal.deep} opacity={(0.9 + 0.08 * p) * g} />
          {/* A lighter bark highlight running along the top. */}
          <rect x={cx - logLen / 2 + 1.4} y={logY - logTh / 2 + 0.7} width={logLen - 2.8} height={1} rx={0.5} fill={WOOD} opacity={0.28 * g} />
          {/* The sawn END FACE — a pale wood ellipse with two tree rings + a pith dot. */}
          <ellipse cx={cx + (endSide * logLen) / 2} cy={logY} rx={1.5} ry={logTh / 2 - 0.2} fill={WOOD} opacity={(0.9 + 0.06 * p) * g} />
          <ellipse cx={cx + (endSide * logLen) / 2} cy={logY} rx={0.85} ry={logTh * 0.28} fill="none" stroke={pal.deep} strokeWidth={0.35} opacity={0.55 * g} />
          <circle cx={cx + (endSide * logLen) / 2} cy={logY} r={0.4} fill={pal.deep} opacity={0.6 * g} />
        </g>
      )
      return (
        <g>
          {/* Crossed LOGS at the base — cut ends facing OUT (left log's end on the left, etc.). */}
          {[
            { deg: 24, end: 1 },
            { deg: -24, end: -1 },
            { deg: 3, end: 1 },
          ]
            .slice(0, logCount)
            .map((l, k) => drawLog(l.deg, k, l.end))}
          {/* A couple of glowing embers nestled in the logs' crook, pulsing softly. */}
          {[-1, 1].map((s, k) => (
            <ellipse
              key={`cf-ember-${s}`}
              className="spirit-pulse"
              style={{ animationDelay: `${(k * 0.6).toFixed(2)}s` }}
              cx={cx + s * 3}
              cy={logY - 1.4}
              rx={1.8}
              ry={1.1}
              fill={pal.accent}
              opacity={(0.62 + 0.2 * p) * g}
            />
          ))}
          {/* Side licks flanking the main flame — each flickers on its own phase. */}
          {Array.from({ length: sideLicks }, (_, k) => {
            const s = k === 0 ? -1 : 1
            return (
              <g
                key={`cf-lick-${k}`}
                className="pitta-flame"
                style={{ animationDelay: `${(0.3 + k * 0.5).toFixed(2)}s`, animationDuration: `${(1.5 + k * 0.3).toFixed(1)}s` }}
              >
                <path
                  d={flame(cx + s * (fw * 0.9), baseY - 3.5, fh * 0.5, fw * 0.4, s * 3, false)}
                  fill={pal.accent}
                  opacity={(0.55 + 0.2 * p) * g}
                />
              </g>
            )
          })}
          {/* The campfire FLAME rising from the logs' centre — sways in the breeze (with its face) on
              top of the flicker. */}
          <g className="spirit-tilt" style={{ animationDuration: '4s' }}>
            {layeredFlame(cx, baseY - 3.5, fh, fw, tipCurl, 'campfire-flame')}
            {face(cx, baseY - 3.5 - fh * 0.42, fw * 0.37)}
          </g>
          {sparks(cx, baseY - 3.5 - fh + 2, fw + 2, 'campfire-sparks')}
          {smoke(cx, baseY - 3.5 - fh + 1, 2, 'campfire-smoke')}
        </g>
      )
    }

    // TORCH — a hand-torch: a wooden HANDLE topped by a fat rag-wrapped HEAD (cloth bound with cord,
    // soaked in pitch) that's alight. The bound head + cord bindings are what read it as a torch, not
    // just a flame on a stick.
    if (form === 'torch') {
      const headY = baseY - (13 + p * 6) // where the wrapped head sits atop the handle
      const handleBot = baseY + 1
      const fh = 11 + p * 8
      const fw = 6.5 + p * 3
      const flameBaseY = headY - 3
      const hw = 2.1 // handle half-width
      const headHw = hw * 2.1 // the rag bundle is clearly wider than the handle
      const headH = 7 + p * 1.5
      const WOOD = '#c79a63' // rope / cord tone for the bindings
      return (
        <g>
          {/* The wooden HANDLE — a tapered rod (a touch narrower at the foot). */}
          <path
            d={`M ${cx - hw} ${headY + 1} L ${cx + hw} ${headY + 1} L ${cx + hw * 0.72} ${handleBot} L ${cx - hw * 0.72} ${handleBot} Z`}
            fill={pal.deep}
            opacity={(0.86 + 0.1 * p) * g}
          />
          {/* The rag-wrapped HEAD — a fat bound bundle at the top, wider than the handle. */}
          <rect
            x={cx - headHw}
            y={headY - headH * 0.5}
            width={headHw * 2}
            height={headH}
            rx={2.2}
            fill={pal.deep}
            opacity={(0.9 + 0.08 * p) * g}
          />
          {/* Cord bindings cinching the rag bundle — the tell that it's a wrapped torch head. */}
          {[0, 1, 2].map((b) => {
            const yy = headY - headH * 0.5 + headH * (0.26 + b * 0.24)
            return (
              <line
                key={`bind-${b}`}
                x1={cx - headHw + 0.4}
                y1={yy}
                x2={cx + headHw - 0.4}
                y2={yy + 0.8}
                stroke={WOOD}
                strokeWidth={0.9}
                strokeLinecap="round"
                opacity={0.7 * g}
              />
            )
          })}
          {/* A hot glow soaking the top of the bundle where it's alight. */}
          <ellipse cx={cx} cy={headY - headH * 0.5 + 0.5} rx={headHw * 0.8} ry={1.8} fill={pal.accent} opacity={(0.5 + 0.2 * p) * g} />
          {/* The torch FLAME on the bound head. */}
          {layeredFlame(cx, flameBaseY, fh, fw, tipCurl, 'torch-flame')}
          {face(cx, flameBaseY - fh * 0.4, fw * 0.3)}
          {sparks(cx, flameBaseY - fh + 2, fw + 2, 'torch-sparks')}
          {smoke(cx, flameBaseY - fh + 1, 2, 'torch-smoke')}
        </g>
      )
    }

    // FIREBALL ("Comet") — a round blazing head with a swept tail trailing behind it (leaning to one
    // side), a fire shooting-star. The tail lengthens up the stages.
    if (form === 'fireball') {
      // A COMET (Pitta/fire): a bright fiery head wrapped in a soft glowing COMA, with a broad
      // billowing fire-tail streaming behind it. (Distinct from the Vata `meteor`, which is a small
      // cool bright mote with THIN sharp light-streaks.)
      const headR = 5.5 + p * 4
      const hx = cx + 4 // the head leans forward (right), the tail sweeps back-left
      const hy = baseY - 12 - p * 6
      const tailLen = 18 + p * 18
      const tailW = headR * 1.05
      // The tail tapers from the head back toward the lower-left.
      const tx = hx - tailLen
      const ty = hy + tailLen * 0.5
      return (
        // The whole comet DRIFTS as it flies (a gentle bob), while its coma pulses + tail shimmers.
        <g className="spirit-bob" style={{ animationDuration: '3.6s' }}>
          {/* The broad blazing TAIL — a long accent→glow billow sweeping back from the head. */}
          <path
            d={`M ${hx} ${hy - tailW}
                Q ${hx - tailLen * 0.5} ${hy - tailW * 0.35} ${tx} ${ty}
                Q ${hx - tailLen * 0.5} ${hy + tailW} ${hx} ${hy + tailW}
                Q ${hx + headR * 0.4} ${hy} ${hx} ${hy - tailW} Z`}
            fill={pal.accent}
            opacity={(0.6 + 0.18 * p) * g}
          />
          <path
            d={`M ${hx} ${hy - tailW * 0.6}
                Q ${hx - tailLen * 0.45} ${hy} ${tx + tailLen * 0.32} ${ty - tailLen * 0.12}
                Q ${hx - tailLen * 0.4} ${hy + tailW * 0.55} ${hx} ${hy + tailW * 0.6}
                Q ${hx + headR * 0.3} ${hy} ${hx} ${hy - tailW * 0.6} Z`}
            fill={pal.glow}
            opacity={(0.72 + 0.16 * p) * g}
          />
          {/* A few bright gas STREAKS threading down the tail — each shimmers so the tail feels alive. */}
          {Array.from({ length: 3 }, (_, k) => {
            const off = (k - 1) * tailW * 0.42
            return (
              <path
                key={`streak-${k}`}
                className="spirit-shimmer"
                style={{ animationDelay: `${(k * 0.4).toFixed(2)}s`, animationDuration: `${(1.6 + k * 0.4).toFixed(1)}s` }}
                d={`M ${hx - headR * 0.2} ${hy + off * 0.4} Q ${hx - tailLen * 0.5} ${hy + off} ${tx + 2} ${ty + off * 0.2}`}
                fill="none"
                stroke={pal.core}
                strokeWidth={0.9}
                strokeLinecap="round"
                opacity={(0.55 + 0.2 * p) * g}
              />
            )
          })}
          {/* The soft glowing COMA haloing the head (a comet's fuzzy envelope) — it breathes. */}
          <circle className="spirit-pulse" cx={hx} cy={hy} r={headR * 1.5} fill={pal.glow} opacity={0.2 * g} />
          <circle className="spirit-pulse" style={{ animationDelay: '0.7s' }} cx={hx} cy={hy} r={headR * 1.2} fill={pal.glow} opacity={0.22 * g} />
          {/* The bright fiery HEAD — glow body, hot core, a friendly face. */}
          <circle cx={hx} cy={hy} r={headR} fill={pal.glow} opacity={(0.94 + 0.05 * p) * g} />
          <circle cx={hx - headR * 0.28} cy={hy - headR * 0.28} r={headR * 0.5} fill={pal.core} opacity={(0.92 + 0.06 * p) * g} />
          {face(hx, hy - headR * 0.05, headR * 0.34)}
          {sparks(hx, hy - headR - 1, headR + 1, 'fireball-sparks')}
        </g>
      )
    }

    // SUN — a glowing DISC ringed with flame RAYS. A central glow disc (core highlight + eyes), with
    // 6+i triangular flame rays radiating all around, alternating longer/shorter.
    if (form === 'sun') {
      const discR = 6 + p * 4.5
      const cyD = baseY - 14 - p * 4 // lift the disc so the rays clear the frame floor
      const rayCount = 6 + i
      const longRay = 5 + p * 4
      const shortRay = longRay * 0.6
      return (
        <g>
          {/* Triangular flame RAYS all around the disc — the whole ray-crown slowly ROTATES as one
              (spirit-spin-cw), while the disc + face stay still. */}
          <g className="spirit-spin-cw" style={{ ['--spin-cx' as string]: `${cx}px`, ['--spin-cy' as string]: `${cyD}px` }}>
            {Array.from({ length: rayCount }, (_, k) => {
              const a = (k / rayCount) * Math.PI * 2 - Math.PI / 2
              const len = k % 2 ? shortRay : longRay
              const baseHalf = discR * 0.32
              const bx = cx + Math.cos(a) * discR
              const by = cyD + Math.sin(a) * discR
              const tipX = cx + Math.cos(a) * (discR + len)
              const tipY = cyD + Math.sin(a) * (discR + len)
              // Two base points perpendicular to the ray.
              const px = Math.cos(a + Math.PI / 2) * baseHalf
              const py = Math.sin(a + Math.PI / 2) * baseHalf
              return (
                <path
                  key={`ray-${k}`}
                  // Each ray flickers on its own phase (opacity-only, safe under the crown's rotation).
                  className="spirit-shimmer"
                  style={{ animationDelay: `${(k * 0.24).toFixed(2)}s`, animationDuration: `${(1.9 + (k % 3) * 0.4).toFixed(1)}s` }}
                  d={`M ${bx + px} ${by + py} L ${tipX} ${tipY} L ${bx - px} ${by - py} Z`}
                  fill={pal.accent}
                  opacity={(0.7 + 0.16 * p) * g}
                />
              )
            })}
          </g>
          {/* The central glowing DISC, a pulsing hot core, and a friendly face. */}
          <circle cx={cx} cy={cyD} r={discR} fill={pal.glow} opacity={(0.92 + 0.06 * p) * g} />
          <circle className="spirit-pulse" cx={cx} cy={cyD - discR * 0.2} r={discR * 0.55} fill={pal.core} opacity={(0.88 + 0.08 * p) * g} />
          {/* ── "Sunny": two little arms thrown up in a cheerful cheer (in front of the spinning rays). ── */}
          {[-1, 1].map((s) => (
            <g key={`sunny-arm-${s}`}>
              <path
                d={`M ${cx + s * discR * 0.62} ${cyD + discR * 0.42} Q ${cx + s * discR * 1.2} ${cyD + discR * 0.1} ${cx + s * discR * 1.35} ${cyD - discR * 0.55}`}
                fill="none"
                stroke={pal.glow}
                strokeWidth={2.2 + p * 0.7}
                strokeLinecap="round"
                opacity={0.92 * g}
              />
              <circle cx={cx + s * discR * 1.35} cy={cyD - discR * 0.55} r={1.7 + p * 0.4} fill={pal.core} opacity={0.96 * g} />
            </g>
          ))}
          {face(cx, cyD, discR * 0.34)}
        </g>
      )
    }

    // COALS — a low BED of glowing embers, NO tall flame: a heap of rounded coal stones (deep /
    // accent) low at the base with hot glow / core tops, plus a few tiny flame flickers. The
    // "resting" form. Wears a sleepy pair of eyes on the brightest central coal from wisp onward.
    if (form === 'coals') {
      // A black ROCK CREATURE (a coal "geodude"): a chunky FACETED boulder — near-black so it reads as
      // coal in any palette — with little rock arms + fists, glowing lava CRACKS veining its seams (the
      // palette supplies the glow), and a friendly face over a warm patch. Dark + faceted + arms = a
      // rock, not a bright ember. Resting form: no tall flame.
      const BLACK = '#221f1c'
      const BLACK_HI = '#2e2a26' // a lit facet
      const BLACK_LO = '#161311' // a shadowed facet
      const INK = '#0d0b09'
      const rr = 14 + p * 5 // rock half-width
      const ry = rr * 0.72 // half-height (wider than tall)
      const rcx = cx
      const rcy = baseY - ry - 2 // sits on the base
      const px = (ox: number) => rcx + ox * rr
      const py = (oy: number) => rcy + oy * ry
      // The boulder silhouette — an irregular faceted polygon (normalised offsets, 0 = centre).
      const OFF: [number, number][] = [
        [-1, 0.23], [-0.84, -0.46], [-0.53, -0.85], [-0.11, -1], [0.37, -0.92], [0.79, -0.54],
        [1, 0], [0.84, 0.62], [0.42, 0.92], [-0.11, 1], [-0.58, 0.85], [-0.95, 0.54],
      ]
      const boulder = 'M ' + OFF.map(([ox, oy]) => `${px(ox).toFixed(1)} ${py(oy).toFixed(1)}`).join(' L ') + ' Z'
      // A slightly-bowed mid seam splitting a lit top facet from a shadowed bottom facet.
      const SM: [number, number] = [0, 0.06]
      const topFacet = `M ${px(-1)} ${py(0.23)} L ${px(-0.84)} ${py(-0.46)} L ${px(-0.53)} ${py(-0.85)} L ${px(-0.11)} ${py(-1)} L ${px(0.37)} ${py(-0.92)} L ${px(0.79)} ${py(-0.54)} L ${px(1)} ${py(0)} L ${px(SM[0])} ${py(SM[1])} Z`
      const botFacet = `M ${px(-1)} ${py(0.23)} L ${px(SM[0])} ${py(SM[1])} L ${px(1)} ${py(0)} L ${px(0.84)} ${py(0.62)} L ${px(0.42)} ${py(0.92)} L ${px(-0.11)} ${py(1)} L ${px(-0.58)} ${py(0.85)} L ${px(-0.95)} ${py(0.54)} Z`
      // Glowing lava cracks (normalised polylines) — routed around the FACE (centre) to the edges +
      // bottom so they read as rock veins without crossing the eyes/mouth.
      const cracks: [number, number][][] = [
        [[-0.95, 0.5], [-0.72, 0.18], [-0.56, -0.22]], // left flank
        [[0.95, 0.42], [0.72, 0.12], [0.55, -0.26]], // right flank
        [[-0.46, 0.72], [0, 0.64], [0.46, 0.74]], // along the bottom
        [[-0.16, -0.58], [0.06, -0.82]], // up near the bumps
      ]
      const faceY = rcy - ry * 0.06
      return (
        <g>
          {/* Contact shadow + a warm glow pooling under the rock. */}
          <ellipse cx={rcx} cy={rcy + ry + 3} rx={rr * 1.05} ry={3 + p} fill="#000" opacity={0.1 * g} />
          <ellipse cx={rcx} cy={rcy + ry + 1.5} rx={rr} ry={3.4 + p} fill={pal.accent} opacity={(0.22 + 0.12 * p) * g} />
          {/* Little rock ARMS with chunky fists (behind the body). */}
          {([-1, 1] as const).map((s) => (
            <g key={`arm-${s}`}>
              <path d={`M ${rcx + s * rr * 0.82} ${rcy + ry * 0.3} q ${s * rr * 0.28} ${1} ${s * rr * 0.42} ${rr * 0.34}`} fill="none" stroke={BLACK} strokeWidth={2.4 + p * 0.6} strokeLinecap="round" />
              <path
                d={`M ${rcx + s * rr * 1.12} ${rcy + ry * 0.42} l ${s * rr * 0.24} ${-rr * 0.1} l ${s * rr * 0.14} ${rr * 0.18} l ${s * -rr * 0.06} ${rr * 0.24} l ${s * -rr * 0.24} ${rr * 0.06} l ${s * -rr * 0.14} ${-rr * 0.2} Z`}
                fill={BLACK}
                stroke={INK}
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
            </g>
          ))}
          {/* The chunky faceted BOULDER + a lit and a shadowed facet plane. */}
          <path d={boulder} fill={BLACK} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" opacity={0.99 * g} />
          <path d={topFacet} fill={BLACK_HI} opacity={0.9} />
          <path d={botFacet} fill={BLACK_LO} opacity={0.92} />
          {/* Angular rock BUMPS poking off the top. */}
          <path d={`M ${px(-0.53)} ${py(-0.85)} L ${px(-0.42)} ${py(-1.18)} L ${px(-0.2)} ${py(-0.95)} Z`} fill={BLACK} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
          <path d={`M ${px(0.2)} ${py(-0.98)} L ${px(0.36)} ${py(-1.28)} L ${px(0.52)} ${py(-0.9)} Z`} fill={BLACK} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
          {/* Glowing lava CRACKS veining the seams — each pulses on its own phase. */}
          {cracks.map((pts, k) => (
            <polyline
              key={`crack-${k}`}
              className="spirit-pulse"
              style={{ animationDelay: `${(k * 0.4).toFixed(2)}s`, animationDuration: `${(2 + (k % 3) * 0.5).toFixed(1)}s` }}
              points={pts.map(([ox, oy]) => `${px(ox).toFixed(1)},${py(oy).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={k % 2 ? pal.glow : pal.accent}
              strokeWidth={1.2 + p * 0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={(0.72 + 0.16 * p) * g}
            />
          ))}
          {/* A warm glow patch so the face reads against the black, rocky brow ridges, + the face. */}
          <ellipse cx={rcx} cy={faceY + 0.5} rx={rr * 0.5} ry={ry * 0.44} fill={pal.glow} opacity={0.4 * g} />
          <path d={`M ${rcx - rr * 0.34} ${faceY - ry * 0.24} l ${rr * 0.24} ${-1}`} fill="none" stroke={INK} strokeWidth={1 + p * 0.2} strokeLinecap="round" />
          <path d={`M ${rcx + rr * 0.1} ${faceY - ry * 0.28} l ${rr * 0.24} ${1}`} fill="none" stroke={INK} strokeWidth={1 + p * 0.2} strokeLinecap="round" />
          {face(rcx, faceY, 2.3 + p * 0.5, 0.78)}
          {sparks(rcx, rcy - ry - 2, rr * 0.5, 'coals-sparks')}
          {/* Lazy smoke curling up off the hot rock. */}
          {smoke(rcx + rr * 0.2, rcy - ry, 2, 'coals-smoke')}
        </g>
      )
    }

    // LANTERN — a flame cradled in a LANTERN frame: a pal.deep rounded cage (top loop/handle, two
    // side posts, a base plate) enclosing a small layered flame.
    if (form === 'lantern') {
      // A RUSTIC iron lantern: a wire ring-bail handle, a peaked roof with a vent knob, a flared
      // frame with a mid-rail, and a chunky footed base — a weathered camp lantern, not a sleek box.
      const frameW = 11 + p * 4
      const bodyTop = baseY - (15 + p * 5) // top of the glass chamber
      const bodyBot = baseY + 0.5
      const topW = frameW * 0.4 // half-width at the chamber top
      const flareW = frameW * 0.52 // wider at the bottom (the classic lantern flare)
      const roofPeak = bodyTop - (4.5 + p) // the roof apex
      const fh = (bodyBot - bodyTop) * 0.74
      const fw = frameW * 0.4
      const flameBaseY = bodyBot - 3
      const iron = pal.deep
      const midY = bodyTop + (bodyBot - bodyTop) * 0.5
      const midHalf = topW + (flareW - topW) * 0.5
      return (
        // The whole lantern hangs off its bail and SWINGS gently (pendulum from the top handle),
        // while the flame flickers inside.
        <g className="spirit-swing" style={{ animationDuration: '4.4s' }}>
          {/* Wire ring-bail HANDLE hooked over the roof. */}
          <circle cx={cx} cy={roofPeak - 2.8} r={2.7} fill="none" stroke={iron} strokeWidth={1.15} opacity={(0.85 + 0.1 * p) * g} />
          {/* Peaked metal ROOF + a little vent knob on top. */}
          <path
            d={`M ${cx - topW - 1.8} ${bodyTop} L ${cx} ${roofPeak} L ${cx + topW + 1.8} ${bodyTop} Z`}
            fill={iron}
            opacity={(0.9 + 0.08 * p) * g}
          />
          <rect x={cx - 1.3} y={roofPeak - 1.7} width={2.6} height={2} rx={0.7} fill={iron} opacity={(0.9 + 0.08 * p) * g} />
          {/* Top rail under the roof. */}
          <rect x={cx - topW - 0.6} y={bodyTop - 0.3} width={topW * 2 + 1.2} height={1.9} rx={0.9} fill={iron} opacity={(0.9 + 0.08 * p) * g} />
          {/* The two FLARED corner posts (wider at the foot). */}
          <path d={`M ${cx - topW} ${bodyTop + 1} L ${cx - flareW} ${bodyBot}`} fill="none" stroke={iron} strokeWidth={1.7} strokeLinecap="round" opacity={(0.85 + 0.1 * p) * g} />
          <path d={`M ${cx + topW} ${bodyTop + 1} L ${cx + flareW} ${bodyBot}`} fill="none" stroke={iron} strokeWidth={1.7} strokeLinecap="round" opacity={(0.85 + 0.1 * p) * g} />
          {/* A mid RAIL wire ringing the chamber (the rustic banded look). */}
          <line x1={cx - midHalf} y1={midY} x2={cx + midHalf} y2={midY} stroke={iron} strokeWidth={1} strokeLinecap="round" opacity={(0.72 + 0.12 * p) * g} />
          {/* A soft warm glow filling the chamber, so it reads as lit from within. */}
          <ellipse cx={cx} cy={flameBaseY - fh * 0.45} rx={frameW * 0.38} ry={fh * 0.62} fill={pal.accent} opacity={(0.22 + 0.12 * p) * g} />
          {/* The cradled FLAME-being inside the chamber — flickers like candlelight in the lantern. */}
          {layeredFlame(cx, flameBaseY, fh, fw, tipCurl * 0.6, 'lantern-flame')}
          {face(cx, flameBaseY - fh * 0.42, fw * 0.42)}
          {/* Chunky BASE plate + a wider footed rim. */}
          <rect x={cx - flareW - 0.6} y={bodyBot - 0.4} width={flareW * 2 + 1.2} height={2.4} rx={1} fill={iron} opacity={(0.9 + 0.08 * p) * g} />
          <rect x={cx - flareW - 1.6} y={bodyBot + 1.6} width={flareW * 2 + 3.2} height={1.8} rx={0.9} fill={iron} opacity={(0.9 + 0.08 * p) * g} />
        </g>
      )
    }
  }

  // ── DEFAULT (no form) + `twin` — the clean layered blaze ─────────────────────────────────────
  // gentle, friendly face on the warm mid-flame from wisp onward
  const eyeY = baseY - H * 0.4
  // Twin params: two clearly SEPARATE flames with a real GAP between them, each on its own little
  // ember and leaning strongly INWARD toward the other — a couple, not the blaze's single forked
  // flame. (The old offset was too small, so it read almost like one flame.)
  const twinOff = 5.6 + p * 2.8
  const twinSpec = [
    { side: -1, h: H * 0.92, w: W * 0.68, curl: 3.6, fsc: 0.72 }, // taller, leans right (inward)
    { side: 1, h: H * 0.66, w: W * 0.58, curl: -3.6, fsc: 0.62 }, // shorter, leans left (inward)
  ]
  return (
    <g>
      {/* Warm ember coals the flame stands on — replaces the old cool teal pool so Pitta reads as
          one unified fire. A single coal at wisp, a small bed by radiant. */}
      {i >= 2 &&
        Array.from({ length: Math.min(3, i - 1) }, (_, k) => {
          const n = Math.min(3, i - 1)
          const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1
          return (
            <ellipse
              key={`coal-${k}`}
              cx={cx + t * (W * 0.85)}
              cy={baseY + 2.6}
              rx={2.5 - Math.abs(t) * 0.7}
              ry={1.5}
              fill={pal.accent}
              opacity={(0.5 + 0.2 * p) * g}
            />
          )
        })}
      {/* The flame itself. `twin` = two sibling flames (a bigger + a smaller) leaning toward each
          other, a cheeky little pair; the default is one clean layered flame that SWAYS in the breeze
          (the whole flame-being + its face lean side to side from the base) on top of the flicker. */}
      {isTwin ? (
        <>
          {/* Each flame stands on its OWN little ember, so the pair reads as two separate fires. */}
          {twinSpec.map((t) => (
            <ellipse
              key={`twin-base-${t.side}`}
              cx={cx + t.side * twinOff}
              cy={baseY + 2.2}
              rx={t.w * 0.6}
              ry={1.4}
              fill={pal.accent}
              opacity={(0.5 + 0.2 * p) * g}
            />
          ))}
          {twinSpec.map((t) => layeredFlame(cx + t.side * twinOff, baseY, t.h, t.w, t.curl, `twin-${t.side}`))}
          {/* Each twin head wears its own face, sized to that sibling, so the pair reads as two beings. */}
          {twinSpec.map((t) =>
            face(cx + t.side * twinOff, baseY - t.h * 0.42, t.w * 0.3, t.fsc, `twin-face-${t.side}`),
          )}
          {/* A little glowing heart floating between them — the bond of the twin flames. */}
          {i >= 3 &&
            (() => {
              const hy = baseY - H * 0.5
              const hr = 1.5 + p * 0.7
              return (
                <path
                  className="spirit-pulse"
                  d={`M ${cx} ${hy + hr} C ${cx - hr * 1.3} ${hy - hr * 0.4} ${cx - hr * 0.5} ${hy - hr * 1.3} ${cx} ${hy - hr * 0.3}
                      C ${cx + hr * 0.5} ${hy - hr * 1.3} ${cx + hr * 1.3} ${hy - hr * 0.4} ${cx} ${hy + hr} Z`}
                  fill={pal.core}
                  opacity={(0.75 + 0.15 * p) * g}
                />
              )
            })()}
        </>
      ) : (
        <g className="spirit-tilt" style={{ animationDuration: '4.4s' }}>
          {layeredFlame(cx, baseY, H, W, tipCurl)}
          {/* Lively face on the warm mid-flame — smiling eyes, warm cheeks, a cheerful grin. */}
          {face(cx, eyeY, W * 0.3)}
        </g>
      )}
      {/* A few embers rising + fading off the tip from fledgling onward, each on its own phase. */}
      {i >= 3 &&
        Array.from({ length: i - 1 }, (_, k) => {
          const a = (k / Math.max(1, i - 1)) * Math.PI - Math.PI / 2
          return (
            <circle
              key={`spark-${k}`}
              className="spirit-ember"
              style={{ animationDelay: `${(k * 0.45).toFixed(2)}s`, animationDuration: `${(2.4 + (k % 3) * 0.5).toFixed(1)}s` }}
              cx={cx + Math.cos(a) * (W + 2)}
              cy={baseY - H + 2 + Math.sin(a) * 3}
              r={0.9 + p * 0.5}
              fill={pal.glow}
              opacity={0.7 * g}
            />
          )
        })}
      {/* A wisp or two of smoke curling up off the flame tip (default blaze only). */}
      {!isTwin && smoke(cx, baseY - H + 1, 2, 'blaze-smoke')}
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
  face: faceVariant,
}: {
  stage: SpiritStage
  g: number
  pal?: BodyPalette
  form?: string
  face?: string
}) {
  const pal = palProp ?? PATH_PALETTE.heart
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  const cy = 38
  // The `form` (shape) cosmetic now swaps the WHOLE silhouette for a DISTINCT air/ether OBJECT
  // (cloud / feather / leaf / constellation / dandelion / whirlwind) — like Kapha's swapped bodies,
  // not a parametric tweak of the bare wisp. Each object REPLACES the wisp, still GROWS up the stage
  // ladder (i / p), stays in the 80×80 frame, and recolours via pal.*. The bare default + `meteor`
  // keep the trailing-current wisp. Only `heart` keys matter; the other doshas ignore them.
  // `meteor` is a shooting star — the body leads, with ONE very-long tail swept strongly to one side
  // (two from ascendant+) trailing off behind it. Drawn in its own block below; default false leaves
  // the bare trailing legs untouched.
  const isMeteor = form === 'meteor'
  // The DISTINCT air/ether-object forms render their own silhouettes below (each early-returns);
  // everything else (default + meteor) is the bare trailing-current wisp.
  const isObjectForm =
    form === 'cloud' ||
    form === 'plume' ||
    form === 'leaflet' ||
    form === 'constellation' ||
    form === 'dandelion' ||
    form === 'whirlwind'

  // Mood → expression: a thriving Vata smiles a touch wider; otherwise a soft, curious look.
  const thriving = g >= 0.9
  // The gentle, curious Vata face — two soft rounded eyes each with a bright catch-light glint (the
  // single biggest aliveness/cuteness cue), faint cheeks, and a small smile — as the default face, on
  // every shape at every stage. `ex`/`ey` is the centre, `spread` how far apart, `r` the eye radius. Shared by the object
  // forms that read best with a face on their main body (cloud lump, leaf blade, dandelion core).
  const face = (ex: number, ey: number, spread: number, r = 0.9 + p * 0.4, key = 'face') =>
    // Every shape wears a face at EVERY stage, from the spark onward (`i >= 1` spans all stages —
    // stageIndex is 1-based, spark = 1): a chosen/previewed face COSMETIC (or the pet heart-eyes)
    // when one is set, otherwise the creature's own default expression. (Earlier the default face was
    // gated to wisp, so a young spark — and every shape previewed on it — read as a blank object.)
    faceVariant || i >= 1 ? (
      <g key={key}>
        {faceVariant ? (
          drawFaceVariant(faceVariant, ex, ey, spread, r, pal, g, thriving)
        ) : (
          <>
            <g className="spirit-eyes">
              {[-1, 1].map((dir) => (
                <g key={`eye-${dir}`}>
                  <circle cx={ex + dir * spread} cy={ey} r={r} fill={pal.deep} opacity={0.9 * g} />
                  <circle cx={ex + dir * spread - r * 0.3} cy={ey - r * 0.35} r={r * 0.4} fill="#ffffff" opacity={0.9 * g} />
                </g>
              ))}
            </g>
            <circle cx={ex - spread * 1.5} cy={ey + 1.1 * r} r={0.7 * r} fill={pal.accent} opacity={(thriving ? 0.36 : 0.26) * g} />
            <circle cx={ex + spread * 1.5} cy={ey + 1.1 * r} r={0.7 * r} fill={pal.accent} opacity={(thriving ? 0.36 : 0.26) * g} />
            <path
              className="spirit-mouth"
              d={`M ${ex - 1.1 * r} ${ey + 1.5 * r} q ${1.1 * r} ${(thriving ? 1.1 : 0.8) * r} ${2.2 * r} 0`}
              fill="none"
              stroke={pal.deep}
              strokeWidth={0.8}
              strokeLinecap="round"
              opacity={0.78 * g}
            />
          </>
        )}
      </g>
    ) : null

  // ── DISTINCT air/ether OBJECTS (the `form` cosmetic) ─────────────────────────────────────────
  // Each REPLACES the bare wisp with its own silhouette, grows with the stage, stays in frame, and
  // recolours via pal.* (deep periwinkle base / glow sky body / accent lavender breeze / core light).
  if (isObjectForm) {
    // CLOUD — a puffy drifting cloud: a row of overlapping rounded pal.glow bumps forming a lump,
    // a pal.core highlight along the top, a gentle face, and a couple of soft trailing wisps below.
    // More bumps up the stages (3 → 5).
    if (form === 'cloud') {
      const bumps = 3 + Math.min(2, i - 1) // 3..5 across the ladder
      const baseY = cy + 2
      const spanW = 14 + p * 9 // half-width of the cloud lump
      const bumpR = 6 + p * 2.5
      // Bump centres spread across the span, the middle ones riding a touch higher (a cloud crown).
      const bumpAt = (k: number) => {
        const t = bumps === 1 ? 0 : (k / (bumps - 1)) * 2 - 1 // -1..1
        const bx = cx + t * spanW
        const lift = (1 - Math.abs(t)) * (4 + p * 2) // middle bumps sit higher
        return { bx, by: baseY - lift, r: bumpR * (1 - Math.abs(t) * 0.25) }
      }
      return (
        <g className="spirit-bob">
          {/* Soft trailing wisps/drips below the lump — a couple of stroked curls of falling breeze. */}
          {Array.from({ length: 2 + Math.min(2, i - 2) }, (_, k) => {
            const t = (k / 2) * 2 - 1
            const sx = cx + t * spanW * 0.55
            const sy = baseY + bumpR * 0.6
            const len = 7 + p * 6
            return (
              <path
                key={`drip-${k}`}
                d={`M ${sx} ${sy} q ${-3 - t} ${len * 0.55} ${t * 2} ${len}`}
                fill="none"
                stroke={pal.accent}
                strokeWidth={1.6 + p * 0.7}
                strokeLinecap="round"
                opacity={(0.4 + 0.25 * p) * g}
              />
            )
          })}
          {/* The cloud lump — overlapping rounded pal.glow bumps reading as one puffy silhouette. */}
          {Array.from({ length: bumps }, (_, k) => {
            const { bx, by, r } = bumpAt(k)
            return (
              <circle
                key={`bump-${k}`}
                // Each puff drifts on its own phase → the cloud gently churns (while the whole lump bobs).
                className="spirit-jiggle"
                style={{ animationDelay: `${(k * 0.5).toFixed(2)}s`, animationDuration: `${(3.4 + (k % 3) * 0.6).toFixed(1)}s` }}
                cx={bx}
                cy={by}
                r={r}
                fill={pal.glow}
                opacity={(0.7 + 0.2 * p) * g}
              />
            )
          })}
          {/* A flat-ish soft underside so the lump reads as a cloud, not a mound of orbs. */}
          <ellipse cx={cx} cy={baseY + bumpR * 0.45} rx={spanW + bumpR * 0.4} ry={bumpR * 0.7} fill={pal.glow} opacity={(0.6 + 0.2 * p) * g} />
          {/* pal.core highlight crowning the top of the lump. */}
          {Array.from({ length: bumps }, (_, k) => {
            const { bx, by, r } = bumpAt(k)
            return (
              <circle
                key={`crown-${k}`}
                cx={bx}
                cy={by - r * 0.45}
                r={r * 0.5}
                fill={pal.core}
                opacity={0.6 * g}
              />
            )
          })}
          {face(cx, baseY - 1, 4 + p * 1.5)}
          <circle cx={cx - 4} cy={baseY - 4} r={1 + p * 0.4} fill="#ffffff" opacity={0.7 * g} />
        </g>
      )
    }

    // FEATHER (key `plume`) — a floating plume: a central curved quill/spine (pal.deep stroke) with
    // pal.glow / pal.accent barb strokes angled off both sides along its length, tilted ~20° as if
    // drifting. Longer / fuller up the stages.
    if (form === 'plume') {
      // A real FEATHER: a solid lanceolate VANE wrapping a central shaft (rachis), fine barbs combing
      // off the shaft toward the tip, and a bare quill (calamus) at the base. The vane silhouette +
      // shaft + quill are what read it as a feather (the old version was just loose barb strokes).
      const len = 26 + p * 12
      const tilt = -20 // drifting lean (degrees)
      const topY = cy - len * 0.5 // the feather TIP
      const botY = cy + len * 0.5 // the quill base (bottom)
      const vaneBot = botY - len * 0.2 // the vane ends here; a bare quill continues below
      const maxW = 5.6 + p * 2.7 // vane half-width at its widest
      const wideY = topY + len * 0.34
      const shaftBow = 2.6 + p * 1.4
      const bx = (t: number) => cx + Math.sin(t * Math.PI) * shaftBow // shaft x, gently bowed
      // The vane silhouette: right edge tip → widest → vane bottom, then left edge back to the tip.
      const vane = `M ${cx} ${topY}
        C ${cx + maxW * 0.5} ${topY + len * 0.1} ${cx + maxW} ${wideY - len * 0.04} ${cx + maxW * 0.94} ${wideY + len * 0.05}
        C ${cx + maxW * 0.74} ${wideY + len * 0.26} ${cx + maxW * 0.32} ${vaneBot - 1} ${cx} ${vaneBot}
        C ${cx - maxW * 0.32} ${vaneBot - 1} ${cx - maxW * 0.74} ${wideY + len * 0.26} ${cx - maxW * 0.94} ${wideY + len * 0.05}
        C ${cx - maxW} ${wideY - len * 0.04} ${cx - maxW * 0.5} ${topY + len * 0.1} ${cx} ${topY} Z`
      const barbCount = 8 + Math.min(6, i * 2)
      // The whole feather FLOATS (bob) as it sways on the breeze (tilt).
      return (
        <g className="spirit-bob" style={{ animationDuration: '4s' }}>
        <g className="spirit-tilt">
          <g transform={`rotate(${tilt} ${cx} ${cy})`}>
          {/* The solid VANE — the feathery blade, with a crisp deep edge so the silhouette reads. */}
          <path d={vane} fill={pal.glow} stroke={pal.deep} strokeWidth={0.8 + p * 0.3} strokeLinejoin="round" opacity={(0.82 + 0.16 * p) * g} />
          {/* A soft core sheen down one side of the vane. */}
          <path d={vane} fill="none" stroke={pal.core} strokeWidth={0.6} opacity={0.28 * g} transform="translate(-1 0.5)" />
          {/* Fine BARBS combing off the shaft toward the tip — each pair shimmers down the feather. */}
          {Array.from({ length: barbCount }, (_, k) => {
            const tt = (k + 0.6) / (barbCount + 0.2) // 0 tip .. 1 quill
            const sy = topY + tt * (vaneBot - topY)
            const sx = bx(tt)
            const w = maxW * Math.sin(Math.min(1, tt) * Math.PI) * 0.86
            if (w < 1) return null
            return (
              <g
                key={`barb-${k}`}
                className="spirit-shimmer"
                style={{ animationDelay: `${(k * 0.15).toFixed(2)}s`, animationDuration: `${(2.2 + (k % 4) * 0.35).toFixed(1)}s` }}
              >
                {[-1, 1].map((side) => (
                  <path
                    key={side}
                    d={`M ${sx} ${sy} Q ${sx + side * w * 0.5} ${sy - w * 0.08} ${sx + side * w} ${sy - w * 0.42}`}
                    fill="none"
                    stroke={pal.deep}
                    strokeWidth={0.55 + p * 0.2}
                    strokeLinecap="round"
                    opacity={(0.42 + 0.2 * p) * g}
                  />
                ))}
              </g>
            )
          })}
          {/* The central SHAFT (rachis) running the length + the bare QUILL at the base. */}
          <path
            d={`M ${bx(0)} ${topY + 1} C ${bx(0.4)} ${wideY} ${bx(0.85)} ${vaneBot} ${cx} ${botY}`}
            fill="none"
            stroke={pal.deep}
            strokeWidth={1.3 + p * 0.5}
            strokeLinecap="round"
            opacity={(0.8 + 0.16 * p) * g}
          />
          <circle cx={cx} cy={botY} r={1.4 + p * 0.4} fill={pal.deep} opacity={0.85 * g} />
          {/* A little face on the upper vane, near the tip. */}
          {face(cx, topY + len * 0.24, 2.5 + p * 1, 0.8 + p * 0.28, 'plume-face')}
          </g>
        </g>
        </g>
      )
    }

    // LEAF (key `leaflet`) — a leaf on the breeze: a pointed almond blade (two arcs meeting at a top
    // and bottom point, pal.glow fill), a pal.deep central vein + a few side veins, a small stem,
    // tilted on the breeze. Bigger / more veins up the stages.
    if (form === 'leaflet') {
      const half = 8 + p * 4 // blade half-width
      const len = 22 + p * 11 // blade length (tip-to-tip)
      const topY = cy - len * 0.5
      const botY = cy + len * 0.5
      const tilt = -18
      const sideVeins = 2 + Math.min(2, i - 1) // pairs of side veins grow up the ladder
      // The whole leaf FLOATS (bob) as it sways on the breeze (tilt); the inner group keeps its tilt.
      return (
        <g className="spirit-bob" style={{ animationDuration: '3.7s' }}>
        <g className="spirit-tilt">
          <g transform={`rotate(${tilt} ${cx} ${cy})`}>
          {/* The blade — an almond: two arcs from the bottom point up to the top point. A pal.deep
              edge stroke keeps the leaf silhouette crisp even when the pale glow fill would otherwise
              blend into the page (and tells it apart from the feather's airy barbs). */}
          <path
            d={`M ${cx} ${botY}
                Q ${cx - half} ${cy} ${cx} ${topY}
                Q ${cx + half} ${cy} ${cx} ${botY} Z`}
            fill={pal.glow}
            stroke={pal.deep}
            strokeWidth={1.1 + p * 0.4}
            strokeLinejoin="round"
            opacity={(0.8 + 0.18 * p) * g}
          />
          {/* A core highlight down the upper half of the blade. */}
          <ellipse cx={cx - half * 0.25} cy={cy - len * 0.12} rx={half * 0.4} ry={len * 0.22} fill={pal.core} opacity={0.45 * g} />
          {/* The central vein — a pal.deep stroke down the midrib. */}
          <path d={`M ${cx} ${topY} L ${cx} ${botY}`} fill="none" stroke={pal.deep} strokeWidth={1.4 + p * 0.5} strokeLinecap="round" opacity={(0.75 + 0.2 * p) * g} />
          {/* Side veins angling off the midrib on both sides. */}
          {Array.from({ length: sideVeins }, (_, k) => {
            const t = (k + 1) / (sideVeins + 1) // down the blade
            const vy = topY + (botY - topY) * t
            const reach = half * (0.7 - t * 0.3)
            return (
              <g key={`vein-${k}`}>
                {[-1, 1].map((side) => (
                  <path
                    key={`vein-${k}-${side}`}
                    d={`M ${cx} ${vy} q ${side * reach * 0.6} ${reach * 0.4} ${side * reach} ${reach * 0.7}`}
                    fill="none"
                    stroke={pal.deep}
                    strokeWidth={0.9 + p * 0.3}
                    strokeLinecap="round"
                    opacity={(0.5 + 0.2 * p) * g}
                  />
                ))}
              </g>
            )
          })}
          {/* A small stem off the bottom point. */}
          <path d={`M ${cx} ${botY} q ${2} ${4 + p * 2} ${4} ${6 + p * 3}`} fill="none" stroke={pal.deep} strokeWidth={1.4 + p * 0.5} strokeLinecap="round" opacity={(0.7 + 0.2 * p) * g} />
          {face(cx, cy + len * 0.08, 2.6 + p * 1.2, 0.8 + p * 0.3)}
          </g>
        </g>
        </g>
      )
    }

    // CONSTELLATION — a cluster of ether-stars: 4+i small star points (pal.core / pal.glow dots +
    // a few 4-point sparkles) joined by faint pal.accent connector lines into a loose constellation.
    // More stars up the stages. The LEAD star (k=0, near the scatter's centre) is drawn a touch
    // larger and wears the face, so the constellation reads as a creature, not scattered points.
    if (form === 'constellation') {
      const count = 4 + i // 5..9 stars
      const spread = 13 + p * 8
      // Deterministic pseudo-scatter so the constellation is stable per render (no Math.random).
      const star = (k: number) => {
        const a = k * 2.39996 // golden angle, a pleasing scatter
        const r = spread * Math.sqrt((k + 0.5) / count)
        return { sx: cx + Math.cos(a) * r, sy: cy + Math.sin(a) * r }
      }
      const pts = Array.from({ length: count }, (_, k) => star(k))
      return (
        // The whole constellation drifts softly across the sky, while its stars twinkle + its threads
        // shimmer on their own phases.
        <g className="spirit-sway-soft" style={{ animationDuration: '6.5s' }}>
          {/* Faint connector lines linking each star to the next — the constellation's threads. */}
          {pts.map((pt, k) => {
            if (k === 0) return null
            const prev = pts[k - 1]
            return (
              <line
                key={`link-${k}`}
                className="spirit-shimmer"
                style={{ animationDelay: `${(k * 0.5).toFixed(2)}s`, animationDuration: `${(2.6 + (k % 3) * 0.5).toFixed(1)}s` }}
                x1={prev.sx}
                y1={prev.sy}
                x2={pt.sx}
                y2={pt.sy}
                stroke={pal.accent}
                strokeWidth={0.8}
                opacity={0.4 * g}
              />
            )
          })}
          {/* The star points — dots, with a few drawn as 4-point sparkles for sparkle. The lead
              star (k=0) is a touch larger: it carries the face below. */}
          {pts.map((pt, k) => {
            const r = 1.3 + p * 0.7 + (k % 3 === 0 ? 0.8 : 0) + (k === 0 ? 1.1 : 0)
            const sparkle = k % 3 === 0
            return (
              <g
                key={`star-${k}`}
                className={k === 0 ? undefined : 'spirit-twinkle'}
                style={k === 0 ? undefined : { animationDelay: `${(k * 0.41).toFixed(2)}s` }}
              >
                {sparkle && (
                  <path
                    d={`M ${pt.sx} ${pt.sy - r * 2.4} L ${pt.sx + r * 0.5} ${pt.sy - r * 0.5}
                        L ${pt.sx + r * 2.4} ${pt.sy} L ${pt.sx + r * 0.5} ${pt.sy + r * 0.5}
                        L ${pt.sx} ${pt.sy + r * 2.4} L ${pt.sx - r * 0.5} ${pt.sy + r * 0.5}
                        L ${pt.sx - r * 2.4} ${pt.sy} L ${pt.sx - r * 0.5} ${pt.sy - r * 0.5} Z`}
                    fill={pal.glow}
                    opacity={(0.6 + 0.25 * p) * g}
                  />
                )}
                <circle cx={pt.sx} cy={pt.sy} r={r} fill={k % 2 === 0 ? pal.core : pal.glow} opacity={(0.85 + 0.1 * p) * g} />
              </g>
            )
          })}
          {/* The gentle face, on the lead star. */}
          {face(pts[0].sx, pts[0].sy + 0.3, 1.3 + p * 0.5, 0.55 + p * 0.2)}
        </g>
      )
    }

    // DANDELION — a seed-puff: a small pal.deep core with many thin pal.accent radiating stalks each
    // tipped with a fuzzy pal.glow / pal.core seed-tuft (a soft small circle), forming a round puff,
    // with 2–3 seeds detaching and floating off to one side. Fuller up the stages.
    if (form === 'dandelion') {
      // A dandelion BLOOM — many thin ray petals radiating from a centre disc (a proper little
      // flower), with a face on the disc, and a seed or two lifting off on the breeze (the airy Vata
      // touch). (Was a fuzzy seed-head puff — the owner wanted it read more clearly as a flower.)
      const petals = 15 + i * 2
      const outer = 11 + p * 5
      const inner = 3 + p * 1.2
      const detached = 1 + (i >= 4 ? 1 : 0)
      return (
        // The whole bloom nods gently on its stem, while the petals shimmer + seeds drift off.
        <g className="spirit-sway-soft" style={{ animationDuration: '5.8s' }}>
          {/* Radiating ray petals — thin tapered slivers, alternating long/short for a fuller bloom. */}
          {Array.from({ length: petals }, (_, k) => {
            const a = (k / petals) * Math.PI * 2
            const long = k % 2 === 0
            const tip = long ? outer : outer * 0.82
            const mid = (inner + tip) / 2
            const mx = cx + Math.cos(a) * mid
            const my = cy + Math.sin(a) * mid
            return (
              <ellipse
                key={`petal-${k}`}
                // A shimmer chases around the bloom (opacity-only, safe with the rotate transform attr).
                className="spirit-shimmer"
                style={{ animationDelay: `${(k * 0.12).toFixed(2)}s`, animationDuration: `${(2.3 + (k % 3) * 0.4).toFixed(1)}s` }}
                cx={mx}
                cy={my}
                rx={(tip - inner) / 2}
                ry={1.2 + p * 0.35}
                fill={long ? pal.glow : pal.accent}
                opacity={(0.6 + 0.2 * p) * g}
                transform={`rotate(${(a * 180) / Math.PI} ${mx} ${my})`}
              />
            )
          })}
          {/* The flower's centre disc (a soft rim), where the face sits — pulsing softly. */}
          <circle className="spirit-pulse" cx={cx} cy={cy} r={inner + 1.4} fill={pal.core} opacity={(0.86 + 0.12 * p) * g} />
          <circle cx={cx} cy={cy} r={inner + 1.4} fill="none" stroke={pal.deep} strokeWidth={0.7} opacity={0.4 * g} />
          {face(cx, cy + 0.2, 1.7 + p * 0.6, 0.82 + p * 0.25)}
          {/* A seed or two lifting off on the breeze (down-right) — little parachute tufts. */}
          {Array.from({ length: detached }, (_, k) => {
            const dx = cx + outer + 5 + k * 6
            const dy = cy + 4 + k * (6 + p * 2)
            return (
              <g key={`seed-${k}`} className="spirit-drift" style={{ animationDelay: `${(k * 1.4).toFixed(1)}s` }}>
                <line x1={dx - 3} y1={dy - 3} x2={dx} y2={dy} stroke={pal.accent} strokeWidth={0.7} opacity={0.4 * g} />
                {[0, 1, 2].map((s) => {
                  const sa = (s / 3) * Math.PI * 2 - Math.PI / 2
                  return (
                    <line
                      key={s}
                      x1={dx}
                      y1={dy}
                      x2={dx + Math.cos(sa) * 2.2}
                      y2={dy + Math.sin(sa) * 2.2}
                      stroke={pal.glow}
                      strokeWidth={0.6}
                      strokeLinecap="round"
                      opacity={(0.5 + 0.2 * p) * g}
                    />
                  )
                })}
              </g>
            )
          })}
        </g>
      )
    }

    // WHIRLWIND — a little funnel: a vertical whirlwind, WIDER at the top narrowing toward the
    // bottom, drawn as stacked curved pal.glow / pal.accent swirl bands, with a few debris motes
    // spinning around it. Taller / fuller up the stages. Wears the face high on the wide top of
    // the funnel (the classic friendly-tornado read), so it's a creature, not just weather.
    if (form === 'whirlwind') {
      const bands = 4 + Math.min(3, i) // 5..7 stacked bands
      const topY = cy - 16 - p * 6
      const botY = cy + 16 + p * 6
      const topW = 13 + p * 6 // half-width at the wide top
      return (
        // The whole funnel wobbles side to side from its tip (a lurching little tornado) on top of the
        // spinning bands + jittering debris.
        <g className="spirit-sway-soft" style={{ animationDuration: '4.6s' }}>
          {/* Stacked swirl bands — each a curved stroke, narrowing from the wide top to the point. */}
          {Array.from({ length: bands }, (_, k) => {
            const t = k / (bands - 1) // 0 (top) .. 1 (bottom)
            const by = topY + (botY - topY) * t
            const w = topW * (1 - t * 0.82) // narrows toward the bottom
            // Side-sway that rotates down the stack, so the bands trace a SPINNING funnel (a spiral),
            // not flat stacked rings.
            const bcx = cx + Math.sin(t * Math.PI * 2.4) * topW * 0.3
            return (
              <path
                key={`band-${k}`}
                className="spirit-sway-x"
                style={{ animationDelay: `${(-t * 1.9).toFixed(2)}s` }}
                d={`M ${bcx - w} ${by} Q ${bcx} ${by + 3 + p} ${bcx + w} ${by} Q ${bcx} ${by - 3 - p} ${bcx - w} ${by}`}
                fill="none"
                stroke={k % 2 === 0 ? pal.glow : pal.accent}
                strokeWidth={1.7 + p * 0.7}
                strokeLinecap="round"
                opacity={(0.52 + 0.25 * p) * g}
              />
            )
          })}
          {/* A faint core seam corkscrewing down the funnel. */}
          <path d={`M ${cx} ${topY} Q ${cx + 5} ${cy - 6} ${cx - 3} ${cy} Q ${cx - 5} ${cy + 6} ${cx} ${botY}`} fill="none" stroke={pal.deep} strokeWidth={1 + p * 0.4} strokeLinecap="round" opacity={0.4 * g} />
          {/* The gentle face, high on the funnel's wide top band (the classic friendly-tornado read). */}
          {face(cx, topY + 4.5, 3.6 + p, 0.98 + p * 0.3)}
          {/* Debris motes spinning around the funnel. */}
          {Array.from({ length: 3 + i }, (_, k) => {
            const t = k / (3 + i)
            const a = t * Math.PI * 4
            const by = topY + (botY - topY) * t
            const w = topW * (1 - t * 0.82) + 3
            return (
              <circle
                key={`debris-${k}`}
                // Each mote jitters on its own phase → the debris whips about while the bands spiral.
                className="spirit-jiggle"
                style={{ animationDelay: `${(k * 0.37).toFixed(2)}s`, animationDuration: `${(1.6 + (k % 4) * 0.3).toFixed(1)}s` }}
                cx={cx + Math.cos(a) * w}
                cy={by}
                r={1 + p * 0.5}
                fill={k % 2 === 0 ? pal.core : pal.accent}
                opacity={(0.55 + 0.2 * p) * g}
              />
            )
          })}
        </g>
      )
    }
  }

  // ── The bare wisp + `meteor` (trailing-current silhouette) ───────────────────────────────────
  // Absent / unknown / meteor → the identity wisp. `meteor` swaps the trailing fan for one/two long
  // swept tails; everything else trails the bare currents. Pixel-identical to before for a bare Vata.
  let wispCount = i
  let wispLenMul = 1
  if (isMeteor) {
    // A shooting star: ONE very-long swept tail at low stages, TWO from ascendant+. The tails are
    // drawn in their own swept block below (this just sets the count); the body leads.
    wispCount = i >= 4 ? 2 : 1
    wispLenMul = 2.2
  }
  // The wisp grows fuller and its trailing currents longer up the ladder.
  const bodyR = 5 + p * 5
  // Trailing breeze currents curling off the body — count set by stage (or the meteor's tails).
  const wisps = wispCount
  // The trailing currents fall from ~y=44 (body bottom); cap the length so even meteor's long
  // (×2.2) radiant tail keeps its tip inside the 80-tall frame.
  const wispLen = Math.min(34, (10 + p * 14) * wispLenMul)
  const strokeThin = 1
  return (
    <g>
      {/* Trailing air-currents — soft curling ribbons of breeze drifting off the body, the airy
          defining feature. Outer currents curl wider; more + longer each stage gives the
          "more developed" read. They flow down-and-out, so the creature reads as gliding. With
          `form === 'meteor'` the body leads and these become one/two long swept tails (a shooting
          star) instead of the trailing fan. */}
      {Array.from({ length: wisps }, (_, k) => {
        if (isMeteor) {
          // A shooting STAR (airy Vata) — a THIN, SHARP light-streak trailing a small bright mote,
          // sparkling as it falls. Deliberately fine + pointed (not the Pitta comet's broad fiery
          // billow): a slim tapering sliver + a hot hairline core + a scatter of sparkle motes.
          const lane = wisps === 1 ? 0 : (k / (wisps - 1)) * 2 - 1 // -1..1 across the two tails
          // Start just below-left of the body (behind the direction of travel).
          const startX = cx - bodyR * 0.3 + lane * 1.6
          const startY = cy + bodyR * 0.4 + lane * 1.6
          // The tail streams hard to the lower-LEFT: a large horizontal lean over the full length.
          const sweep = 0.92 // strongly horizontal (most of the length goes sideways)
          const endX = startX - wispLen * sweep
          const endY = startY + wispLen * (1 - sweep) + Math.abs(lane) * 3
          // Bow the streak so it curves like a falling star rather than a straight spoke.
          const midX = startX - wispLen * sweep * 0.45
          const midY = startY + wispLen * (1 - sweep) * 0.3 - 2 - lane * 2
          // A SLIM tapering streak — much thinner than the comet's tail — with a hot hairline core.
          const hw = bodyR * 0.3 * (1 - Math.abs(lane) * 0.25) // half-width at the head (slim)
          const streak = (w: number) =>
            `M ${startX} ${startY - w}
             Q ${midX} ${midY - w * 0.4} ${endX} ${endY}
             Q ${midX} ${midY + w * 0.8} ${startX} ${startY + w} Z`
          // Sparkle motes fading down the trail (the airy shooting-star tell).
          const motes = [0.34, 0.58, 0.8].map((tt) => ({
            x: startX + (endX - startX) * tt + (midX - (startX + endX) / 2) * (1 - Math.abs(2 * tt - 1)),
            y: startY + (endY - startY) * tt + (midY - (startY + endY) / 2) * (1 - Math.abs(2 * tt - 1)),
            r: (0.9 - tt * 0.5) * (1 + p * 0.4),
            tt,
          }))
          return (
            <g
              key={`meteor-${k}`}
              // The streak flickers as it falls (each of the two tails on its own phase).
              className="spirit-shimmer"
              style={{ animationDelay: `${(k * 0.6).toFixed(2)}s`, animationDuration: `${(1.7 + k * 0.4).toFixed(1)}s` }}
            >
              <path d={streak(hw)} fill={pal.accent} opacity={(0.4 + 0.24 * p) * g} />
              <path d={streak(hw * 0.42)} fill={pal.core} opacity={(0.6 + 0.22 * p) * g} />
              {motes.map((m, mi) => (
                <circle key={`mote-${mi}`} cx={m.x} cy={m.y} r={m.r} fill={pal.core} opacity={(0.7 - m.tt * 0.4) * g} />
              ))}
            </g>
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
            // Each trailing current shimmers on its own phase → the breeze ribbons drift independently.
            className="spirit-shimmer"
            style={{ animationDelay: `${(k * 0.43).toFixed(2)}s`, animationDuration: `${(2.5 + (k % 3) * 0.5).toFixed(1)}s` }}
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
      {/* Meteor: the leading head is a bright SPARKLE-STAR (a 4-point twinkle behind a tight glow) —
          an airy shooting star, NOT the comet's fuzzy fireball ball. */}
      {isMeteor &&
        (() => {
          const sr = bodyR * 1.7 // sparkle radius
          const star = `M ${cx} ${cy - sr} L ${cx + sr * 0.2} ${cy - sr * 0.2} L ${cx + sr} ${cy}
                        L ${cx + sr * 0.2} ${cy + sr * 0.2} L ${cx} ${cy + sr} L ${cx - sr * 0.2} ${cy + sr * 0.2}
                        L ${cx - sr} ${cy} L ${cx - sr * 0.2} ${cy - sr * 0.2} Z`
          return (
            <>
              {/* A tight soft halo (sharp, not a big fireball) that pulses. */}
              <circle className="spirit-pulse" cx={cx} cy={cy} r={bodyR * 1.05} fill={pal.glow} opacity={(0.24 + 0.12 * p) * g} />
              {/* The 4-point sparkle behind the mote — twinkling like a shooting star. */}
              <path className="spirit-twinkle" style={{ animationDuration: '1.6s' }} d={star} fill={pal.core} opacity={(0.4 + 0.16 * p) * g} />
            </>
          )
        })()}
      {/* The flowing wisp body — a soft teardrop of breeze, lighter than air. A rounded,
          upward-tapering silhouette (graceful, never blocky), brightest at the core. The whole body
          (with its core + face) FLOATS on a gentle bob, so the airy creature drifts even at rest. */}
      <g className="spirit-bob" style={{ animationDuration: '3.4s' }}>
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
          className="spirit-pulse"
          cx={cx}
          cy={cy - bodyR * 0.1}
          rx={bodyR * 0.5}
          ry={bodyR * 0.6}
          fill={pal.core}
          opacity={(0.85 + 0.15 * p) * g}
        />
        <circle cx={cx - bodyR * 0.25} cy={cy - bodyR * 0.35} r={1.5 + p} fill="#ffffff" opacity={0.8 * g} />
        {/* Gentle, curious face — glint eyes, faint cheeks, a small smile — on the wisp, from wisp
            onward. */}
        {face(cx, cy + 0.4, bodyR * 0.34)}
      </g>
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
 * The PATHLESS EGG (ADR-0023, redrawn) — a neutral, un-themed egg shown before the user chooses
 * a creature: a warm speckled shell with a spark glowing INSIDE and a first hairline crack, so
 * the default state reads as "something waiting to hatch" (the choose flow IS the hatch — see
 * spirit.choose.hatch.*). No path palette, no creature features; drawn at every stage the same
 * calm way (a pathless spirit is, by design, always early — the choice comes first).
 */
function SparkForm({ g }: { g: number }) {
  // Warm amber family (matches the old spark, tied to no dosha). The halo carries the condition
  // glow; the shell stays solidly opaque (not scaled by glow) so the egg is never hard to see.
  const halo = '#fbbf24'
  const shell = '#fef3c7'
  const rim = '#d97706'
  return (
    <g>
      {/* The soft halo behind — the light of the spark inside, breathing with the daily glow. */}
      <circle cx={40} cy={43} r={20} fill={halo} opacity={Math.min(0.4, 0.18 * g)} />
      <circle cx={40} cy={43} r={13} fill={halo} opacity={Math.min(0.55, 0.3 * g)} />
      {/* A grounding shadow so the egg rests rather than floats. */}
      <ellipse cx={40} cy={56.8} rx={10} ry={2.1} fill={rim} opacity={0.16} />
      {/* The shell — egg-shaped (narrow crown, round base), cream with a warm defined rim. */}
      <path
        d={`M 40 30
            C 47 30 50 38 50 45
            C 50 52.5 45.5 56.5 40 56.5
            C 34.5 56.5 30 52.5 30 45
            C 30 38 33 30 40 30 Z`}
        fill={shell}
        stroke={rim}
        strokeWidth={1.5}
        opacity={0.97}
      />
      {/* The spark, now INSIDE: a warm glow showing through the shell's middle. */}
      <circle cx={40} cy={45} r={5.5} fill={halo} opacity={0.5} />
      <circle cx={40} cy={45} r={3} fill="#f59e0b" opacity={0.6} />
      {/* Speckles — a quiet, deterministic scatter so the shell reads organic, not flat. */}
      <circle cx={34.8} cy={40.5} r={0.9} fill="#f59e0b" opacity={0.45} />
      <circle cx={45.2} cy={48.5} r={1} fill="#f59e0b" opacity={0.4} />
      <circle cx={37} cy={51.5} r={0.8} fill="#f59e0b" opacity={0.45} />
      <circle cx={44.4} cy={37.5} r={0.7} fill="#f59e0b" opacity={0.4} />
      {/* The first hairline crack near the crown — it's beginning; choosing finishes the hatch. */}
      <path
        d="M 43.6 32.6 l -1.7 2.1 l 1.9 1.5 l -1.5 1.9"
        fill="none"
        stroke={rim}
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      {/* Sheen highlight, upper left. */}
      <ellipse
        cx={35.8}
        cy={36.4}
        rx={2.4}
        ry={3.4}
        fill="#ffffff"
        opacity={0.8}
        transform="rotate(-16 35.8 36.4)"
      />
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
  (props: { stage: SpiritStage; g: number; pal?: BodyPalette; form?: string; face?: string }) => JSX.Element
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

// A tiny emote glyph (heart / sparkle / note / zzz) drawn at (cx, cy) — used for the idle emotes
// that drift off the creature and the little particles that burst out when you pet it.
function emoteGlyph(kind: string, cx: number, cy: number) {
  if (kind === 'heart') {
    const s = 2.6
    return (
      <path
        d={`M ${cx} ${cy + s} C ${cx - s * 1.3} ${cy}, ${cx - s * 0.7} ${cy - s * 0.9}, ${cx} ${cy - s * 0.15} C ${cx + s * 0.7} ${cy - s * 0.9}, ${cx + s * 1.3} ${cy}, ${cx} ${cy + s} Z`}
        fill="#fb7185"
      />
    )
  }
  if (kind === 'sparkle') {
    const r = 2.8
    return (
      <path
        d={`M ${cx} ${cy - r} L ${cx + r * 0.3} ${cy - r * 0.3} L ${cx + r} ${cy} L ${cx + r * 0.3} ${cy + r * 0.3} L ${cx} ${cy + r} L ${cx - r * 0.3} ${cy + r * 0.3} L ${cx - r} ${cy} L ${cx - r * 0.3} ${cy - r * 0.3} Z`}
        fill="#fcd34d"
      />
    )
  }
  if (kind === 'note') {
    return (
      <g>
        <ellipse cx={cx - 1.2} cy={cy + 1.9} rx={1.5} ry={1.1} fill="#a78bfa" transform={`rotate(-20 ${cx - 1.2} ${cy + 1.9})`} />
        <path d={`M ${cx + 0.25} ${cy + 2.1} L ${cx + 0.25} ${cy - 2.6}`} stroke="#a78bfa" strokeWidth={0.7} strokeLinecap="round" />
        <path d={`M ${cx + 0.25} ${cy - 2.6} q 2 0.3 1.7 2`} fill="none" stroke="#a78bfa" strokeWidth={0.7} strokeLinecap="round" />
      </g>
    )
  }
  // zzz — a small sleepy "z"
  return (
    <path
      d={`M ${cx - 1.7} ${cy - 1.7} h 3.4 l -3.4 3.4 h 3.4`}
      fill="none"
      stroke="#94a3b8"
      strokeWidth={0.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

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
  const { t } = useT() // subscribe: the aria label below re-renders on locale switch
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
  // A pathless spirit has no creature label yet — describe it as the unhatched spirit egg
  // (no stage prefix: "Spark spirit egg" reads oddly; the egg is simply pre-stage).
  const label =
    (path
      ? t('spirit.art.pathLabel', {
          stage: t(STAGE_COPY[stage].nameKey),
          dosha: t(`spirit.dosha.${PATH_DOSHA_KEY[path]}.name`),
        })
      : t('spirit.art.egg')) + (previewing ? t('spirit.art.preview') : '')
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

  // ── "Living spirit" delight: idle emotes + pet-to-react. Active only on a moving, non-pacer,
  // non-preview render (so the static collection, the breathe pacer, and cosmetic-preview states
  // stay calm). `thriving` gates the ambient sparkles. ─────────────────────────────────────────
  const interactive = alive && !inPacerMode && !previewing
  const thriving = tier === 'thriving'
  const [emote, setEmote] = useState<{ id: number; kind: string } | null>(null)
  const [bursts, setBursts] = useState<{ id: number; parts: { dx: number; kind: string; x: number; y: number }[] }[]>([])
  // "Singing" delight: occasionally the creature opens its mouth (the `.spirit-mouth` animates via the
  // `--singing` class) and a little stream of music notes rises FROM the mouth. `x`/`y` is the mouth
  // centre in viewBox coords, read off the live `.spirit-mouth` element when the bout starts.
  const [singing, setSinging] = useState<{ id: number; x: number; y: number; notes: { dx: number; delay: number }[] } | null>(null)
  const singId = useRef(0)
  const petAt = useRef(0)
  const burstId = useRef(0)
  // Petting builds a COMBO (rapid pets escalate the reaction) and flips the face to delighted
  // heart-eyes for a beat. `reactFace`, when set, overrides the equipped face cosmetic on the figure.
  const petCombo = useRef(0)
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reactFace, setReactFace] = useState<string | null>(null)
  // Cursor gaze — the creature leans a touch toward the pointer, so it feels like it's watching you.
  // Applied imperatively to a wrapper group (no re-render per move); eased back on leave.
  const gazeRef = useRef<SVGGElement | null>(null)

  // Idle emotes — every ~7-15s the creature puffs a little heart / sparkle / note (or a sleepy zzz
  // when low), so it reads as having a mood of its own. Cleared on unmount / when it stops moving.
  useEffect(() => {
    if (!interactive) {
      setEmote(null)
      return
    }
    const pool =
      tier === 'thriving'
        ? ['heart', 'sparkle', 'note', 'sparkle', 'heart']
        : tier === 'content'
          ? ['sparkle', 'note', 'heart']
          : ['zzz', 'note', 'zzz']
    let showTimer: ReturnType<typeof setTimeout>
    let hideTimer: ReturnType<typeof setTimeout>
    let n = 0
    const schedule = () => {
      showTimer = setTimeout(
        () => {
          n += 1
          setEmote({ id: n, kind: pool[Math.floor(Math.random() * pool.length)] })
          hideTimer = setTimeout(() => setEmote(null), 2300)
          schedule()
        },
        7000 + Math.random() * 8000,
      )
    }
    schedule()
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [interactive, tier])

  // Singing bouts — every ~15-27s the creature "sings/whistles": its mouth animates (the `--singing`
  // class drives the `.spirit-mouth`) and a little stream of music notes rises FROM the mouth. The note
  // origin is the LIVE mouth centre (`.spirit-mouth`, mapped from its local bbox into viewBox coords via
  // getCTM), so the notes really come out of the mouth wherever the face happens to sit on the form.
  useEffect(() => {
    if (!interactive) {
      setSinging(null)
      return
    }
    let onTimer: ReturnType<typeof setTimeout>
    let offTimer: ReturnType<typeof setTimeout>
    const schedule = () => {
      onTimer = setTimeout(
        () => {
          let x = 40 // fall back to the face-ish centre if the mouth can't be measured
          let y = 40
          const svg = creatureRef.current?.ownerSVGElement
          const mouth = creatureRef.current?.querySelector('.spirit-mouth') as SVGGraphicsElement | null
          if (svg && mouth) {
            try {
              const b = mouth.getBBox()
              // Map the mouth's local bbox centre into the SVG's viewBox coords (the space the note
              // glyphs render in): local → screen (`getScreenCTM`) → back through the svg's own
              // screen CTM. (A plain `getCTM()` lands in the pixel VIEWPORT, off by the viewBox scale.)
              const mScreen = mouth.getScreenCTM()
              const sScreen = svg.getScreenCTM()
              if (mScreen && sScreen) {
                const pt = svg.createSVGPoint()
                pt.x = b.x + b.width / 2
                pt.y = b.y + b.height / 2
                const v = pt.matrixTransform(mScreen).matrixTransform(sScreen.inverse())
                x = v.x
                y = v.y
              }
            } catch {
              // getBBox / CTM can throw on a not-yet-laid-out node — keep the fallback anchor.
            }
          }
          singId.current += 1
          const notes = Array.from({ length: 4 }, (_, k) => ({ dx: (k - 1.5) * 4.5, delay: k * 0.3 }))
          setSinging({ id: singId.current, x, y, notes })
          offTimer = setTimeout(() => setSinging(null), 2800)
          schedule()
        },
        15000 + Math.random() * 12000,
      )
    }
    schedule()
    return () => {
      clearTimeout(onTimer)
      clearTimeout(offTimer)
    }
  }, [interactive])

  // Pet-to-react — a tap/click gives a happy squash-and-stretch bounce, flips the face to heart-eyes,
  // plays a soft boop, and bursts hearts + sparkles up off the creature. Rapid pets build a COMBO
  // that escalates the reaction (a bigger bounce, more hearts, a higher-pitched boop). Decorative.
  const petSpirit = () => {
    if (!interactive) return
    const now = Date.now()
    if (now - petAt.current < 170) return // hard rate-limit against a mash
    petCombo.current = now - petAt.current < 900 ? petCombo.current + 1 : 1
    petAt.current = now
    const combo = petCombo.current
    const big = combo >= 4

    // Heart-eyes reaction face, held a touch longer on a combo.
    setReactFace('hearts')
    if (reactTimer.current) clearTimeout(reactTimer.current)
    reactTimer.current = setTimeout(() => setReactFace(null), big ? 1400 : 1000)

    // A soft boop that climbs in pitch as the combo grows.
    playBoop(big ? 0.55 : 0.42, Math.min(combo - 1, 8))

    // Squash-and-stretch bounce — bigger on a combo.
    const el = creatureRef.current
    if (el && typeof el.animate === 'function') {
      const sx1 = big ? 1.17 : 1.1
      const sy1 = big ? 0.83 : 0.9
      const sx2 = big ? 0.9 : 0.94
      const sy2 = big ? 1.12 : 1.07
      el.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: `scale(${sx1}, ${sy1})`, offset: 0.25 },
          { transform: `scale(${sx2}, ${sy2})`, offset: 0.5 },
          { transform: 'scale(1.02, 0.99)', offset: 0.75 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: big ? 620 : 520, easing: 'ease-out' },
      )
    }

    // Heart/sparkle burst — more + wider on a combo.
    burstId.current += 1
    const id = burstId.current
    const count = big ? 9 : 5
    const parts = Array.from({ length: count }, (_, k) => ({
      dx: (k - (count - 1) / 2) * (big ? 7 : 6),
      kind: big ? (k % 3 === 0 ? 'sparkle' : 'heart') : k % 2 === 0 ? 'heart' : 'sparkle',
      x: 40 + (Math.random() * 10 - 5),
      y: 30 + (Math.random() * 7 - 3),
    }))
    setBursts((bs) => [...bs, { id, parts }])
    setTimeout(() => setBursts((bs) => bs.filter((b) => b.id !== id)), 1000)
  }

  // Idle mini-behaviours — every ~8-16s the creature does a distinct little ACTION, a one-shot on the
  // creature layer over the idle float, so it reads as a pet doing its own thing. A whole repertoire
  // now (hop, double-hop, wiggle, stretch, peck, nod, curious head-tilt, excited triple-bounce,
  // waddle, pounce, shiver) picked at random without repeating the last one. Gated by `interactive`
  // (so it stops under reduced motion / pacer / preview); cleaned up on unmount. (Origin is the feet
  // — see .spirit-creature--alive — so hops/pounces/tilts plant naturally.)
  useEffect(() => {
    if (!interactive) return
    const el = creatureRef.current
    if (!el || typeof el.animate !== 'function') return
    const moves: { frames: Keyframe[]; dur: number; easing?: string }[] = [
      // hop — a single spring up, squash on landing
      {
        frames: [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-11px)', offset: 0.3 },
          { transform: 'translateY(0) scaleY(0.9)', offset: 0.55 },
          { transform: 'translateY(-4px)', offset: 0.74 },
          { transform: 'translateY(0)' },
        ],
        dur: 800,
      },
      // double-hop
      {
        frames: [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-9px)', offset: 0.2 },
          { transform: 'translateY(0) scaleY(0.92)', offset: 0.38 },
          { transform: 'translateY(-9px)', offset: 0.6 },
          { transform: 'translateY(0) scaleY(0.94)', offset: 0.78 },
          { transform: 'translateY(0)' },
        ],
        dur: 1000,
      },
      // wiggle — a happy side-to-side rock
      {
        frames: [
          { transform: 'rotate(0)' },
          { transform: 'rotate(9deg)', offset: 0.2 },
          { transform: 'rotate(-8deg)', offset: 0.45 },
          { transform: 'rotate(5deg)', offset: 0.7 },
          { transform: 'rotate(0)' },
        ],
        dur: 720,
      },
      // stretch — a slow squash-and-stretch
      {
        frames: [
          { transform: 'scaleY(1) scaleX(1)' },
          { transform: 'scaleY(1.14) scaleX(0.94)', offset: 0.4 },
          { transform: 'scaleY(0.96) scaleX(1.03)', offset: 0.7 },
          { transform: 'scaleY(1) scaleX(1)' },
        ],
        dur: 900,
      },
      // peck — two quick forward-down dips, like pecking at the ground
      {
        frames: [
          { transform: 'rotate(0) translateY(0)' },
          { transform: 'rotate(15deg) translateY(3px)', offset: 0.16 },
          { transform: 'rotate(0) translateY(0)', offset: 0.34 },
          { transform: 'rotate(15deg) translateY(3px)', offset: 0.5 },
          { transform: 'rotate(0) translateY(0)', offset: 0.68 },
          { transform: 'rotate(0) translateY(0)' },
        ],
        dur: 850,
        easing: 'ease-out',
      },
      // nod — a small, agreeable "yes" bob
      {
        frames: [
          { transform: 'translateY(0)' },
          { transform: 'translateY(3px) scaleY(0.97)', offset: 0.25 },
          { transform: 'translateY(0)', offset: 0.5 },
          { transform: 'translateY(2.5px) scaleY(0.98)', offset: 0.72 },
          { transform: 'translateY(0)' },
        ],
        dur: 720,
      },
      // curious tilt — leans its head to one side and holds a beat
      {
        frames: [
          { transform: 'rotate(0)' },
          { transform: 'rotate(-14deg)', offset: 0.28 },
          { transform: 'rotate(-12deg)', offset: 0.62 },
          { transform: 'rotate(0)' },
        ],
        dur: 1150,
      },
      // excited bounce — three quick happy hops in a row
      {
        frames: [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-7px)', offset: 0.15 },
          { transform: 'translateY(0) scaleY(0.94)', offset: 0.27 },
          { transform: 'translateY(-7px)', offset: 0.42 },
          { transform: 'translateY(0) scaleY(0.94)', offset: 0.54 },
          { transform: 'translateY(-7px)', offset: 0.69 },
          { transform: 'translateY(0) scaleY(0.94)', offset: 0.81 },
          { transform: 'translateY(0)' },
        ],
        dur: 1150,
      },
      // waddle — a gentle side-to-side shuffle (leans as it steps)
      {
        frames: [
          { transform: 'translateX(0) rotate(0)' },
          { transform: 'translateX(-3px) rotate(-6deg)', offset: 0.25 },
          { transform: 'translateX(3px) rotate(6deg)', offset: 0.75 },
          { transform: 'translateX(0) rotate(0)' },
        ],
        dur: 1150,
      },
      // pounce — crouch, then a big springy leap and a soft landing
      {
        frames: [
          { transform: 'translateY(0) scaleY(1)' },
          { transform: 'translateY(3px) scaleY(0.85)', offset: 0.22 },
          { transform: 'translateY(-14px) scaleY(1.08)', offset: 0.52 },
          { transform: 'translateY(0) scaleY(0.9)', offset: 0.74 },
          { transform: 'translateY(0) scaleY(1)' },
        ],
        dur: 900,
      },
      // shiver — a quick little shake-off
      {
        frames: [
          { transform: 'rotate(0)' },
          { transform: 'rotate(5deg)', offset: 0.12 },
          { transform: 'rotate(-5deg)', offset: 0.26 },
          { transform: 'rotate(4deg)', offset: 0.4 },
          { transform: 'rotate(-4deg)', offset: 0.54 },
          { transform: 'rotate(3deg)', offset: 0.68 },
          { transform: 'rotate(-2deg)', offset: 0.82 },
          { transform: 'rotate(0)' },
        ],
        dur: 680,
        easing: 'linear',
      },
    ]
    let timer: ReturnType<typeof setTimeout>
    let lastIdx = -1
    const schedule = () => {
      timer = setTimeout(
        () => {
          // Pick a move, but never the same one twice in a row, so the repertoire reads as variety.
          let idx = Math.floor(Math.random() * moves.length)
          if (idx === lastIdx) idx = (idx + 1) % moves.length
          lastIdx = idx
          const m = moves[idx]
          try {
            el.animate(m.frames, { duration: m.dur, easing: m.easing ?? 'ease-in-out' })
          } catch {
            // animation unsupported — skip
          }
          schedule()
        },
        8000 + Math.random() * 8000,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [interactive])

  // Clear the heart-eyes reaction timer on unmount so it never fires into an unmounted tree.
  useEffect(() => () => {
    if (reactTimer.current) clearTimeout(reactTimer.current)
  }, [])
  // Lean the creature toward the pointer (imperative — cheap, no re-render). Clamped + subtle.
  const gazeToward = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = gazeRef.current
    if (!interactive || !el) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2))
    const dy = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2))
    el.style.transform = `translate(${dx * 2.6}px, ${dy * 1.5}px) rotate(${dx * 3}deg)`
  }
  const gazeReset = () => {
    if (gazeRef.current) gazeRef.current.style.transform = ''
  }
  const shadowClass = 'spirit-shadow' + (alive && !inPacerMode ? ' spirit-shadow--alive' : '')

  return (
    <svg
      className={'spirit-svg' + (interactive ? ' spirit-svg--interactive' : '')}
      style={svgStyle}
      data-condition={tier}
      viewBox="0 0 80 80"
      role="img"
      aria-label={label}
      aria-live="polite"
      onPointerDown={interactive ? petSpirit : undefined}
      onPointerMove={interactive ? gazeToward : undefined}
      onPointerLeave={interactive ? gazeReset : undefined}
    >
      {/* ── STATIC background layer ── habitat backdrop + aura. Neither floats: they stay put so
          the background does not drift with the creature (ADR-0023). The aura glows up/down on
          its own `spirit-aura-glow` keyframe, independent of the creature's float. For a pathless
          spark the SparkForm carries its own halo, so no separate aura layer is drawn. */}
      {habitat && (
        <>
          <Habitat habitat={habitat} g={g} />
          {/* A faint palette wash over the backdrop so the scene reads in the spirit's colour. */}
          <SceneWash pal={pal} g={g} x={4} y={6} width={72} height={68} rx={10} strength={0.1} />
        </>
      )}
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
          <BelongingGlow cx={12} cy={68} r={9} pal={pal} g={g} />
          <Companion companion={companion} g={g} pal={pal} path={path} />
        </g>
      )}
      {/* The mount sits centered and low in the static background band, UNDER the creature, so
          the figure appears to rest on / ride it without floating away with it or being hidden. */}
      {mount && (
        <>
          <BelongingGlow cx={40} cy={70} r={12} pal={pal} g={g} />
          <Mount mount={mount} g={g} />
        </>
      )}
      {/* The ground is a FOREGROUND base strip along the very bottom — drawn in FRONT of the
          habitat/mount so it reads as the floor the figure rests on (but still behind the
          creature, which stands on it). */}
      {ground && (
        <>
          <Ground ground={ground} g={g} />
          {/* A faint palette wash over the floor strip so it reads in the spirit's colour. */}
          <SceneWash pal={pal} g={g} x={4} y={64} width={72} height={14} rx={6} strength={0.12} />
        </>
      )}
      {/* A soft contact shadow that shrinks + softens as the creature bobs up (synced to the
          float), grounding the figure. Only for a bare-ish creature — a `ground`/`mount` scene
          already provides its own footing, so we skip it there to avoid a doubled shadow. */}
      {path && !ground && !mount && (
        <ellipse
          className={shadowClass}
          cx={40}
          cy={60}
          rx={11 * sizeScale}
          ry={2.3 * sizeScale}
          fill="#1e293b"
          opacity={0.13}
          aria-hidden="true"
        />
      )}
      {/* ── SIGNATURE RADIANCE (ADR-0028) ── when the full signature set is equipped, an extra
          subtle halo + sparkle ring blooms behind the figure (over the background, under the
          creature). */}
      {setRadiant && path && <SetRadiance path={path} g={g} alive={alive} />}
      {/* ── FLOATING creature layer ── only this group moves (and only when alive): idle float,
          pacer sync, or the celebration one-shot. The figure is always legible; the accessory
          perches on top. */}
      <g
        ref={creatureRef}
        className={creatureClass + (singing ? ' spirit-creature--singing' : '')}
        style={creatureStyle}
      >
        {/* The gaze wrapper leans the figure toward the pointer (imperative transform, eased via
            CSS). Nested inside the float group so the two compose. */}
        <g ref={gazeRef} className="spirit-gaze">
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
                // `reactFace` (heart-eyes on pet) briefly overrides the equipped face cosmetic.
                return <Form stage={stage} g={g} pal={pal} form={cosmetics?.form} face={reactFace ?? cosmetics?.face} />
              })()
            ) : (
              <SparkForm g={g} />
            )}
            {accessory && (
              <>
                <BelongingGlow cx={40} cy={faceEyeY(path, stage) - 13} r={11} pal={pal} g={g} />
                <Accessory accessory={accessory} g={g} pal={pal} path={path} eyeY={faceEyeY(path, stage)} />
              </>
            )}
          </g>
        </g>
      </g>
      {/* The weather is the FRONT-MOST overlay — drawn after everything (incl. the accessory) so
          its light particles drift OVER the whole scene. Kept subtle so it never obscures the
          figure. The FALLING types animate with a seamless downward drift: two field copies stacked
          a viewBox-height apart translate down one full height on a loop, so as the lower copy exits
          the bottom the upper takes its place — no visible reset. Gated by reduced-motion. */}
      {weather &&
        (() => {
          if (FALLING_WEATHER.has(weather) && !reducedMotion) {
            return (
              <g
                className="spirit-weather-fall"
                style={{ '--wf-dur': FALLING_DUR[weather] ?? '3.6s' } as CSSProperties}
                aria-hidden="true"
              >
                <Weather weather={weather} g={g} pal={pal} />
                <g transform="translate(0 -80)">
                  <Weather weather={weather} g={g} pal={pal} />
                </g>
              </g>
            )
          }
          const motion = WEATHER_MOTION[weather]
          if (motion && !reducedMotion) {
            return (
              <g className={motion} aria-hidden="true">
                <Weather weather={weather} g={g} pal={pal} />
              </g>
            )
          }
          return <Weather weather={weather} g={g} pal={pal} />
        })()}

      {/* ── DELIGHT overlay (front-most) — ambient sparkles on a thriving creature, an occasional
          idle emote drifting off it, and the pet burst. All decorative + gated by `interactive`
          (which is off under reduced motion / pacer / preview). ─────────────────────────────── */}
      {interactive && thriving &&
        [
          { x: 22, y: 27, r: 1.5, d: '0s' },
          { x: 58, y: 24, r: 1.7, d: '0.9s' },
          { x: 30, y: 15, r: 1.2, d: '1.6s' },
          { x: 55, y: 41, r: 1.4, d: '2.2s' },
        ].map((s, k) => (
          <path
            key={`spk-${k}`}
            className="spirit-sparkle"
            style={{ animationDelay: s.d }}
            d={`M ${s.x} ${s.y - s.r} L ${s.x + s.r * 0.3} ${s.y - s.r * 0.3} L ${s.x + s.r} ${s.y} L ${s.x + s.r * 0.3} ${s.y + s.r * 0.3} L ${s.x} ${s.y + s.r} L ${s.x - s.r * 0.3} ${s.y + s.r * 0.3} L ${s.x - s.r} ${s.y} L ${s.x - s.r * 0.3} ${s.y - s.r * 0.3} Z`}
            fill="#fcd34d"
            aria-hidden="true"
          />
        ))}
      {interactive && emote && (
        <g key={emote.id} className="spirit-emote" aria-hidden="true">
          {emoteGlyph(emote.kind, 51, 20)}
        </g>
      )}
      {/* Singing: a stream of music notes rising FROM the creature's mouth (`singing.x/y` is the live
          mouth centre), staggered so they keep coming for the length of the bout. */}
      {interactive &&
        singing &&
        singing.notes.map((nt, k) => (
          <g
            key={`${singing.id}-${k}`}
            className="spirit-sing-note"
            style={{ ['--dx' as string]: `${nt.dx}px`, animationDelay: `${nt.delay}s` }}
            aria-hidden="true"
          >
            {emoteGlyph('note', singing.x, singing.y)}
          </g>
        ))}
      {bursts.map((b) =>
        b.parts.map((p, k) => (
          <g
            key={`${b.id}-${k}`}
            className="spirit-burst-particle"
            style={{ ['--dx' as string]: `${p.dx}px` }}
            aria-hidden="true"
          >
            {emoteGlyph(p.kind, p.x, p.y)}
          </g>
        )),
      )}
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
  const { t } = useT() // subscribe: all the copy below re-renders on locale switch
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
      .catch((err) => setError(messageForError(err, t('spirit.error'))))
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
      <section className="spirit-home" aria-label={t('spirit.home.aria')}>
        <RetryableError message={error} onRetry={load} retrying={retrying} />
      </section>
    )
  }

  // Loading: only when we're fetching our own and have nothing yet. When the parent passes a
  // not-yet-loaded `null`, we wait quietly (the dashboard renders other content meanwhile).
  if (!spirit) {
    if (loading && spiritProp === undefined) {
      return (
        <section className="spirit-home" aria-label={t('spirit.home.aria')}>
          <Loading label={t('spirit.loading')} />
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
            <p className="spirit-stage">{t('spirit.home.firstBreath.title')}</p>
            <p className="spirit-note muted">{t('spirit.home.firstBreath.note')}</p>
            <p className="spirit-choose-prompt">
              <Link to="/spirit/choose" className="spirit-choose-cta">
                {t('spirit.home.firstBreath.cta')}
                <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="spirit-stage">{t('spirit.home.choose.title')}</p>
            <p className="spirit-note muted">{t('spirit.home.choose.note')}</p>
            <p className="spirit-choose-prompt">
              <Link to="/spirit/choose" className="spirit-choose-cta">
                {t('spirit.home.choose.cta')}
                <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </p>
          </>
        )
      ) : (
        // A chosen creature: its stage, the recent-practice balance read-out + at most one optional
        // round-out suggestion, and the bond level. Always encouraging, never a warning (ADR-0032).
        <>
          <p className="spirit-stage">{t(copy.nameKey)}</p>
          <p className="spirit-note muted">{t(copy.noteKey)}</p>
          <NeedsReadout needs={needs} />
          <CareNudge needs={needs} path={path} />
          <p className="spirit-bond muted">{t('spirit.hero.bond', { level: bond.level })}</p>
        </>
      )}
    </section>
  )
}
