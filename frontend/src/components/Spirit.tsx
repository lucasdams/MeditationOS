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
  { name: string; element: string; vibe: string; practice: string; balance: string; glyph: string }
> = {
  stillness: {
    name: 'Kapha',
    element: 'Earth + Water',
    vibe: 'Grounded, calm, and steady.',
    practice: 'breathwork',
    balance: 'energizing',
    glyph: '🪷',
  },
  breath: {
    name: 'Pitta',
    element: 'Fire + Water',
    vibe: 'Sharp, intense, and energetic.',
    practice: 'gratitude & journaling',
    balance: 'cooling',
    glyph: '🔥',
  },
  heart: {
    name: 'Vata',
    element: 'Air + Ether',
    vibe: 'Light, mobile, and expressive.',
    practice: 'meditation',
    balance: 'grounding',
    glyph: '🍃',
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
const PATH_PALETTE: Record<SpiritPath, { core: string; glow: string; accent: string; deep: string }> = {
  stillness: { core: '#fef3c7', glow: '#fcd34d', accent: '#f59e0b', deep: '#b45309' },
  // Pitta — fire + water: a white-hot ember core (`core`), an orange flame body (`glow`), a
  // searing red-orange flame edge (`accent`), and a cool teal water-base (`deep`).
  breath: { core: '#fff7ed', glow: '#fb923c', accent: '#ef4444', deep: '#0d9488' },
  // Vata — air + ether: a pale luminous core (`core`), a soft sky-blue body (`glow`), a lavender
  // breeze accent (`accent`), and a deeper periwinkle base for wisps/leaves (`deep`).
  heart: { core: '#f5f7ff', glow: '#bae6fd', accent: '#c4b5fd', deep: '#818cf8' },
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
        {/* Ground band only, kept low at the very bottom — well clear of the figure. */}
        <rect x={6} y={56} width={68} height={18} rx={6} fill="#bbf7d0" opacity={0.55} />
        <rect x={6} y={63} width={68} height={11} rx={6} fill="#86efac" opacity={0.6} />
        {/* A few simple grass blades along the ground. */}
        {Array.from({ length: 7 }, (_, k) => (
          <rect key={k} x={12 + k * 8} y={58} width={1.4} height={6} rx={0.7} fill="#4ade80" opacity={0.6} />
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
        {/* A scattering of stars hugging the outer edge, and a crescent moon in the corner. */}
        {Array.from({ length: 9 }, (_, k) => {
          const a = (k / 9) * Math.PI * 2
          return (
            <circle key={k} cx={40 + Math.cos(a) * 31} cy={38 + Math.sin(a) * 28} r={0.9} fill="#e0e7ff" opacity={0.9} />
          )
        })}
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
  return null
}

// A small worn accessory drawn on top of the figure (above its head, near y≈40-14). Each
// option is a distinct, flat little shape — the on-character payoff of spending coins.
function Accessory({ accessory, g }: { accessory: string; g: number }) {
  // The figures sit roughly centred on x=40; their "head" tops out around y≈26-30. We perch
  // accessories just above that band so they read as worn rather than floating.
  const topY = 24
  if (accessory === 'halo') {
    return (
      <ellipse
        cx={40}
        cy={topY}
        rx={9}
        ry={3}
        fill="none"
        stroke="#fde68a"
        strokeWidth={1.8}
        opacity={0.95 * g}
        aria-hidden="true"
      />
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
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A small blossom tucked by the head. */}
        {Array.from({ length: 5 }, (_, k) => {
          const a = (k / 5) * Math.PI * 2
          return (
            <circle
              key={k}
              cx={48 + Math.cos(a) * 2.4}
              cy={topY + 1 + Math.sin(a) * 2.4}
              r={1.6}
              fill="#f9a8d4"
            />
          )
        })}
        <circle cx={48} cy={topY + 1} r={1.3} fill="#fbbf24" />
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
        {/* A couple of soft glowing dots hovering low and left. */}
        {[
          { x: baseX - 2, y: baseY - 6 },
          { x: baseX + 6, y: baseY - 12 },
        ].map((d, k) => (
          <g key={k}>
            <circle cx={d.x} cy={d.y} r={3} fill="#fde68a" opacity={0.4} />
            <circle cx={d.x} cy={d.y} r={1.3} fill="#fef08a" opacity={0.95} />
          </g>
        ))}
      </g>
    )
  }
  if (companion === 'bird') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A small perched bird — round body, head, beak, tail. */}
        <ellipse cx={baseX} cy={baseY - 4} rx={4} ry={3.2} fill="#60a5fa" />
        <circle cx={baseX + 3} cy={baseY - 7} r={2.2} fill="#3b82f6" />
        <path d={`M ${baseX + 5} ${baseY - 7} l 2.4 0.8 l -2.4 0.8 z`} fill="#f59e0b" />
        <path d={`M ${baseX - 4} ${baseY - 4} l -3 1.6 l 3 1 z`} fill="#2563eb" />
        <circle cx={baseX + 3.6} cy={baseY - 7.4} r={0.5} fill="#0f172a" />
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
        {/* A soft cloud the spirit floats on — overlapping white/sky puffs with a flat base. */}
        <ellipse cx={cx} cy={cy + 2} rx={18} ry={5} fill="#f1f5f9" />
        <circle cx={cx - 9} cy={cy} r={6} fill="#e0f2fe" />
        <circle cx={cx + 9} cy={cy} r={6} fill="#e0f2fe" />
        <circle cx={cx - 2} cy={cy - 3} r={7.5} fill="#ffffff" />
        <circle cx={cx + 5} cy={cy - 1} r={6.5} fill="#ffffff" />
      </g>
    )
  }
  if (mount === 'lotus') {
    return (
      <g opacity={0.95 * g} aria-hidden="true">
        {/* A lotus the spirit rests on — a green pad with calm pink petals fanned around it. */}
        <ellipse cx={cx} cy={cy + 3} rx={16} ry={4.5} fill="#86efac" />
        {[-12, -6, 0, 6, 12].map((dx, k) => (
          <path
            key={k}
            d={`M ${cx + dx} ${cy + 1} q ${dx * 0.4} -8 0 -11 q ${-dx * 0.4} 3 0 11 z`}
            fill="#fbcfe8"
            stroke="#f9a8d4"
            strokeWidth={0.5}
          />
        ))}
        <ellipse cx={cx} cy={cy} rx={4} ry={2.5} fill="#fce7f3" />
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
  return null
}

/**
 * `stillness` — a serene seated mini-Buddha. Spark: a tiny glowing seated mote. It gains a
 * head, body, folded legs, then a halo and a lotus base as it matures, ending a radiant
 * figure haloed in gold. Warm amber/gold palette.
 */
function StillnessForm({ stage, g }: { stage: SpiritStage; g: number }) {
  const pal = PATH_PALETTE.stillness
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  // Grows up the ladder; everything is centred on x=40.
  const scale = 0.7 + p * 0.55
  const cy = 44
  const bodyW = 16 * scale
  const bodyH = 18 * scale
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
function PittaForm({ stage, g }: { stage: SpiritStage; g: number }) {
  const pal = PATH_PALETTE.breath
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  // The blaze grows taller and the body fuller up the ladder.
  const baseY = 52
  const bodyR = 6 + p * 5
  const bodyCy = baseY - bodyR * 0.6
  // Flame tongues licking up off the body — one at spark, up to five at radiant.
  const tongues = i
  const flameTop = baseY - (16 + p * 18) // how high the tallest tongue reaches
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
      {/* Flame tongues — sharp, pointed teardrops curling up off the ember body. Outer tongues
          are searing red (`accent`), the central one the hot orange body colour. More + taller
          each stage, giving the "more developed" read. */}
      {Array.from({ length: tongues }, (_, k) => {
        // Spread tongues across the top of the body; the centre one rises highest.
        const t = tongues === 1 ? 0 : (k / (tongues - 1)) * 2 - 1 // -1..1
        const tx = cx + t * (bodyR * 0.8)
        const sway = t * 3 // outer tongues lean outward
        const tipY = flameTop + Math.abs(t) * (6 + p * 3) // centre tallest
        const w = (2.6 + p * 1.6) * (1 - Math.abs(t) * 0.25)
        const baseTy = bodyCy - bodyR * 0.2
        return (
          <path
            key={k}
            d={`M ${tx - w} ${baseTy}
                Q ${tx - w * 0.4 + sway} ${(baseTy + tipY) / 2} ${tx + sway} ${tipY}
                Q ${tx + w * 0.4 + sway} ${(baseTy + tipY) / 2} ${tx + w} ${baseTy} Z`}
            fill={k === Math.floor(tongues / 2) ? pal.glow : pal.accent}
            opacity={(0.7 + 0.25 * p) * g}
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
function VataForm({ stage, g }: { stage: SpiritStage; g: number }) {
  const pal = PATH_PALETTE.heart
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  const cy = 38
  // The wisp grows fuller and its trailing currents longer up the ladder.
  const bodyR = 5 + p * 5
  // Trailing breeze currents curling off the body — one at spark, up to five at radiant.
  const wisps = i
  const wispLen = 10 + p * 14
  return (
    <g>
      {/* Trailing air-currents — soft curling ribbons of breeze drifting off the body, the airy
          defining feature. Outer currents curl wider; more + longer each stage gives the
          "more developed" read. They flow down-and-out, so the creature reads as gliding. */}
      {Array.from({ length: wisps }, (_, k) => {
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
            strokeWidth={(2.4 + p * 1.4) * (1 - Math.abs(t) * 0.3)}
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
  (props: { stage: SpiritStage; g: number }) => JSX.Element
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
}) {
  const g = clampGlow(glow)
  const aura = cosmetics?.aura
  const accessory = cosmetics?.accessory
  const habitat = cosmetics?.habitat
  const companion = cosmetics?.companion
  const mount = cosmetics?.mount
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
  // calmer when a need is depleted — condition expressed as motion, still floored by `clampGlow`.
  // It lives on the SVG so both the (static) aura layer and the (floating) creature share it.
  const svgStyle: CSSProperties = { ['--spirit-glow' as string]: g }

  // The float / glow / pace only run when alive (not reduced-motion). The OUTER svg is now a
  // STATIC layer — it never floats. The creature layer floats (or paces); the aura layer glows.
  const alive = !reducedMotion
  // The creature group: idle float when alive & not pacing; a pacer transform when pacing.
  const creatureClass =
    'spirit-creature' +
    (alive && !inPacerMode ? ' spirit-creature--alive' : '') +
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
      {/* ── FLOATING creature layer ── only this group moves: idle float, pacer sync, or the
          celebration one-shot. The figure is always legible; the accessory perches on top. */}
      <g ref={creatureRef} className={creatureClass} style={creatureStyle}>
        {path ? (
          (() => {
            const Form = PATH_FORM[path]
            return <Form stage={stage} g={g} />
          })()
        ) : (
          <SparkForm g={g} />
        )}
        {accessory && <Accessory accessory={accessory} g={g} />}
      </g>
    </svg>
  )
}

export default function Spirit({
  spirit: spiritProp,
  paceScale,
  celebrate = false,
  compact = false,
}: {
  spirit?: SpiritState | null
  // Live pacer scale for BreathePage sync (the breathe-circle's `scaleAt` value). Omit on home.
  paceScale?: number
  // One-shot session-complete celebration (from the RewardOverlay flow). Omit on home.
  celebrate?: boolean
  // Smaller, chrome-free render for BreathePage (just the art, no stage/bond read-out).
  compact?: boolean
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
      .catch((err) => setError(messageForError(err, 'Could not reach your spirit.')))
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
        // companion is the first step. The picker lives on its own focused page.
        <>
          <p className="spirit-stage">Choose your companion</p>
          <p className="spirit-note muted">
            Your spirit is waiting to take form — pick the one whose nature fits you.
          </p>
          <p className="spirit-choose-prompt">
            <Link to="/spirit/choose" className="spirit-choose-cta">
              Choose your companion →
            </Link>
          </p>
        </>
      ) : (
        // A chosen creature: its stage, a tidy needs read-out + a single kind care nudge, bond.
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
