import { useEffect, useState } from 'react'
import { spiritService } from '../services/spirit'
import { Loading, RetryableError } from './StateViews'
import { messageForError } from '../lib/errors'
import type { SpiritStage, SpiritState } from '../types'

/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022; build-order step 2).
 *
 * A single living companion you awaken once and grow through practice, rendered as a
 * procedural SVG that gains structure from `spark` → `wisp` → `fledgling` → `ascendant` →
 * `radiant`. This step is deliberately STATIC and PATH-AGNOSTIC:
 *
 *  - No animation (idle float / breathing sync / celebration land in step 4). `daily_glow`
 *    is applied as a *static* brightness — a steadier opacity on the aura — not motion.
 *  - No path branching (step 3). Whatever `path` the backend reports, the form is the same
 *    luminous mote that gains glow-structure each stage — not yet a buddha / wind / bloom.
 *
 * Flat vector style consistent with SanctuaryPlant (hardcoded hex fills inside the SVG, a
 * 0 0 80 80 viewBox). The bond/level is surfaced quietly below the art — a calm read-out,
 * never a shouted XP bar (the app's low-pressure stance).
 *
 * Like SanctuaryScene, this can be handed a `spirit` by the parent (DashboardPage fetches it
 * once and passes it down) or fetch its own as a standalone fallback. Loading / error /
 * empty (first awakening) states follow the app's conventions.
 */

// A calm, friendly label per stage — used for the screen-reader description and the quiet
// caption under the art. A brand-new user is at `spark`; we frame that as the first awakening.
const STAGE_COPY: Record<SpiritStage, { name: string; note: string }> = {
  spark: { name: 'Spark', note: 'Your spirit is just awakening.' },
  wisp: { name: 'Wisp', note: 'Your spirit is taking shape.' },
  fledgling: { name: 'Fledgling', note: 'Your spirit is finding its form.' },
  ascendant: { name: 'Ascendant', note: 'Your spirit is growing brighter.' },
  radiant: { name: 'Radiant', note: 'Your spirit shines fully.' },
}

// The aura/core colours brighten and warm as the spirit matures — a cool teal mote at the
// spark, a luminous gold by radiant. Path-agnostic for now (step 3 recolours per path).
const STAGE_PALETTE: Record<SpiritStage, { core: string; halo: string; ring: string }> = {
  spark: { core: '#a5f3fc', halo: '#67e8f9', ring: '#22d3ee' },
  wisp: { core: '#bae6fd', halo: '#7dd3fc', ring: '#38bdf8' },
  fledgling: { core: '#c7d2fe', halo: '#a5b4fc', ring: '#818cf8' },
  ascendant: { core: '#ddd6fe', halo: '#c4b5fd', ring: '#a78bfa' },
  radiant: { core: '#fef9c3', halo: '#fde68a', ring: '#fbbf24' },
}

// The core grows a little, and the spirit gains more defining motes/rays, each stage. A pure
// lookup keeps the art a deterministic function of stage (no animation, no randomness).
const STAGE_CORE_R: Record<SpiritStage, number> = {
  spark: 6,
  wisp: 8,
  fledgling: 10,
  ascendant: 12,
  radiant: 14,
}

const STAGE_ORDER: SpiritStage[] = ['spark', 'wisp', 'fledgling', 'ascendant', 'radiant']

// How far through the ladder this stage sits, 0..1 — drives how much structure is drawn.
function stageProgress(stage: SpiritStage): number {
  const i = STAGE_ORDER.indexOf(stage)
  return i / (STAGE_ORDER.length - 1)
}

/**
 * The procedural spirit art. A glowing core, a soft halo whose opacity is driven by the
 * (static) daily glow, and stage-dependent orbiting motes + rays that make later stages read
 * as more defined and elaborate. `glow` is clamped to a sane [0.4, 1] band (the backend
 * floors it, but we defend against odd values).
 */
function SpiritArt({ stage, glow }: { stage: SpiritStage; glow: number }) {
  const pal = STAGE_PALETTE[stage]
  const r = STAGE_CORE_R[stage]
  const p = stageProgress(stage)
  // Static brightness: lapsing dims the aura toward the resting floor; practice brightens it.
  // Visual only — never below the floor, never animated (motion is step 4).
  const g = Math.max(0.4, Math.min(1, glow))
  const cx = 40
  const cy = 38

  // Orbiting motes appear and multiply as the spirit matures (1 at wisp → 5 at radiant); the
  // spark is a lone mote with none. Placed deterministically around the core.
  const moteCount = Math.round(p * 5)
  const motes = Array.from({ length: moteCount }, (_, i) => {
    const a = (i / Math.max(1, moteCount)) * Math.PI * 2 - Math.PI / 2
    const dist = r + 9
    return {
      x: cx + Math.cos(a) * dist,
      y: cy + Math.sin(a) * dist * 0.85,
      mr: 1.6 + p * 1.2,
    }
  })

  // Radiant gains a corona of short rays — the "final form" reads as the brightest, fullest.
  const rays = stage === 'radiant'
  const label = `${STAGE_COPY[stage].name} spirit`

  return (
    <svg className="spirit-svg" viewBox="0 0 80 80" role="img" aria-label={label}>
      {/* Outer halo — its opacity is the daily-glow read-out (static). */}
      <circle cx={cx} cy={cy} r={r + 14} fill={pal.halo} opacity={0.18 * g} />
      <circle cx={cx} cy={cy} r={r + 8} fill={pal.halo} opacity={0.3 * g} />

      {/* A faint aura ring that firms up with maturity — early stages are diffuse, later ones
          gain a clearer edge, so the spirit grows more *defined* up the ladder. */}
      {p > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 6}
          fill="none"
          stroke={pal.ring}
          strokeWidth={0.6 + p}
          opacity={(0.25 + 0.35 * p) * g}
        />
      )}

      {/* Radiant corona — short rays around the core. */}
      {rays &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          const x1 = cx + Math.cos(a) * (r + 4)
          const y1 = cy + Math.sin(a) * (r + 4)
          const x2 = cx + Math.cos(a) * (r + 11)
          const y2 = cy + Math.sin(a) * (r + 11)
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={pal.ring}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.7 * g}
            />
          )
        })}

      {/* Orbiting motes — more of them, larger, as the spirit matures. */}
      {motes.map((m, i) => (
        <circle key={i} cx={m.x} cy={m.y} r={m.mr} fill={pal.core} opacity={0.85 * g} />
      ))}

      {/* The glowing core — a soft outer body and a bright inner heart. */}
      <circle cx={cx} cy={cy} r={r} fill={pal.halo} opacity={0.55 + 0.35 * g} />
      <circle cx={cx} cy={cy} r={r * 0.6} fill={pal.core} opacity={0.7 + 0.3 * g} />
      {/* A small bright highlight gives the core a sense of light from within. */}
      <circle cx={cx - r * 0.25} cy={cy - r * 0.3} r={r * 0.22} fill="#ffffff" opacity={0.75 * g} />
    </svg>
  )
}

export default function Spirit({
  spirit: spiritProp,
}: {
  spirit?: SpiritState | null
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

  const { stage, daily_glow, bond } = spirit
  const copy = STAGE_COPY[stage]
  // The "empty" / first-awakening state IS the spark — the backend always returns an active
  // spirit, and a brand-new user is at stage `spark`, which we frame as the spirit awakening.

  return (
    <section className="spirit-home" aria-label="Your spirit">
      <div className="spirit-art">
        <SpiritArt stage={stage} glow={daily_glow} />
      </div>
      {/* Quiet, calm read-out — the stage name, a gentle note, and the bond level. No XP bar,
          no shouted numbers; consistent with the app's low-pressure stance. */}
      <p className="spirit-stage">{copy.name}</p>
      <p className="spirit-note muted">{copy.note}</p>
      <p className="spirit-bond muted">Bond level {bond.level}</p>
    </section>
  )
}
