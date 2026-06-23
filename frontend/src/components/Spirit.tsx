import { useEffect, useState } from 'react'
import { spiritService } from '../services/spirit'
import { Loading, RetryableError } from './StateViews'
import { messageForError } from '../lib/errors'
import type { SpiritPath, SpiritStage, SpiritState } from '../types'

/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022; build-order step 3).
 *
 * A single living companion you awaken once and grow through practice, rendered as a
 * procedural SVG that gains structure from `spark` → `wisp` → `fledgling` → `ascendant` →
 * `radiant`. Step 3 adds PATH BRANCHING: the spirit grows down one of three path-specific
 * forms, chosen by the committed `path` (falling back to the suggested `path_lean` before it
 * commits at stage 2):
 *
 *  - `stillness` → a serene seated mini-Buddha with a calm aura (meditation-dominant).
 *  - `breath`    → an airy wind spirit of flowing/swirling currents (breathing-dominant).
 *  - `heart`     → a blooming spirit of petals and leaves (gratitude + journaling dominant).
 *
 * Each form is drawn distinctly across the five stages, in the flat vector style of
 * SanctuaryPlant (hardcoded hex fills, a 0 0 80 80 viewBox), with its own palette. This step
 * is still STATIC — no animation (idle float / breathing sync / celebration land in step 4);
 * `daily_glow` is applied as a *static* brightness on the aura, not motion.
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

// A friendly name per path, for the screen-reader label and the quiet pre-commit lean hint.
const PATH_COPY: Record<SpiritPath, string> = {
  stillness: 'stillness',
  breath: 'breath',
  heart: 'heart',
}

// A distinct palette per path: stillness is a serene warm gold/amber; breath is a cool airy
// blue/white; heart is a soft pink-and-green bloom. `core` is the bright heart, `glow` the
// aura, `accent` the path's defining feature (halo / current / petal).
const PATH_PALETTE: Record<SpiritPath, { core: string; glow: string; accent: string; deep: string }> = {
  stillness: { core: '#fef3c7', glow: '#fcd34d', accent: '#f59e0b', deep: '#b45309' },
  breath: { core: '#e0f2fe', glow: '#7dd3fc', accent: '#38bdf8', deep: '#0ea5e9' },
  heart: { core: '#fce7f3', glow: '#f9a8d4', accent: '#ec4899', deep: '#4ade80' },
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

// Clamp the daily glow into the floored [0.4, 1] band (the backend floors it; defend anyway).
function clampGlow(glow: number): number {
  return Math.max(0.4, Math.min(1, glow))
}

// A soft outer aura shared by every path — its opacity carries the static daily-glow read-out.
// The aura warms/cools to the path's glow colour and grows a touch with maturity.
function Aura({ path, p, g }: { path: SpiritPath; p: number; g: number }) {
  const pal = PATH_PALETTE[path]
  const r = 24 + p * 8
  return (
    <>
      <circle cx={40} cy={40} r={r} fill={pal.glow} opacity={0.14 * g} />
      <circle cx={40} cy={40} r={r - 8} fill={pal.glow} opacity={0.22 * g} />
    </>
  )
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
      <Aura path="stillness" p={p} g={g} />
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
 * `breath` — an airy wind spirit. Spark: a single curl. It gains more flowing, swirling
 * current-strokes as it matures, ending a full set of cool-blue currents spiralling around a
 * bright core. Cool blue/white palette.
 */
function BreathForm({ stage, g }: { stage: SpiritStage; g: number }) {
  const pal = PATH_PALETTE.breath
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  // The number of flowing current-strokes grows with the stage (1 at spark → 5 at radiant).
  const curls = i
  const cx = 40
  const cy = 40
  const coreR = 5 + p * 4
  return (
    <g>
      <Aura path="breath" p={p} g={g} />
      {/* Flowing wind currents — sweeping S-curves orbiting the core, more of them each stage. */}
      {Array.from({ length: curls }, (_, k) => {
        const a = (k / curls) * Math.PI * 2 - Math.PI / 2
        const reach = coreR + 8 + p * 6
        const ox = Math.cos(a)
        const oy = Math.sin(a)
        // A swirling stroke: starts near the core, sweeps out and curls back.
        const sx = cx + ox * coreR
        const sy = cy + oy * coreR
        const mx = cx + ox * reach - oy * (5 + p * 4)
        const my = cy + oy * reach + ox * (5 + p * 4)
        const ex = cx + ox * (reach + 4) + oy * (6 + p * 5)
        const ey = cy + oy * (reach + 4) - ox * (6 + p * 5)
        return (
          <path
            key={k}
            d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
            fill="none"
            stroke={k % 2 === 0 ? pal.accent : pal.deep}
            strokeWidth={1.4 + p}
            strokeLinecap="round"
            opacity={(0.55 + 0.3 * p) * g}
          />
        )
      })}
      {/* The breezy core — a soft body and a bright inner heart. */}
      <circle cx={cx} cy={cy} r={coreR} fill={pal.glow} opacity={(0.55 + 0.3 * p) * g} />
      <circle cx={cx} cy={cy} r={coreR * 0.6} fill={pal.core} opacity={(0.8 + 0.2 * p) * g} />
      <circle cx={cx - coreR * 0.3} cy={cy - coreR * 0.3} r={coreR * 0.22} fill="#ffffff" opacity={0.8 * g} />
      {/* Radiant: a few drifting motes carried on the wind — the fullest, airiest form. */}
      {i >= 5 &&
        Array.from({ length: 4 }, (_, k) => {
          const a = (k / 4) * Math.PI * 2
          return (
            <circle
              key={`m${k}`}
              cx={cx + Math.cos(a) * (coreR + 13)}
              cy={cy + Math.sin(a) * (coreR + 13)}
              r={1.6}
              fill={pal.core}
              opacity={0.8 * g}
            />
          )
        })}
    </g>
  )
}

/**
 * `heart` — a blooming spirit. Spark: a closed bud. It opens into petals around a glowing
 * centre, gains leaves, then a full bloom as it matures. Soft pink petals with green leaves.
 */
function HeartForm({ stage, g }: { stage: SpiritStage; g: number }) {
  const pal = PATH_PALETTE.heart
  const i = stageIndex(stage)
  const p = stageProgress(stage)
  const cx = 40
  const cy = 40
  // Petals open up as the bloom matures: a closed bud (0) at spark, more petals each stage.
  const petals = i <= 1 ? 0 : 3 + (i - 2) * 2 // 0, 5, 7, 9, 11
  const petalLen = 8 + p * 6
  const coreR = 4 + p * 3
  return (
    <g>
      <Aura path="heart" p={p} g={g} />
      {/* Leaves flank the stem from fledgling onward — the green defining feature. */}
      {i >= 3 &&
        [-1, 1].map((dir) => (
          <ellipse
            key={dir}
            cx={cx + dir * (8 + p * 3)}
            cy={cy + 12}
            rx={5 + p * 2}
            ry={2.4 + p}
            fill={pal.deep}
            opacity={0.6 * g}
            transform={`rotate(${dir * 35} ${cx + dir * (8 + p * 3)} ${cy + 12})`}
          />
        ))}
      {/* A short stem grounding the bloom. */}
      {i >= 2 && (
        <rect x={cx - 0.9} y={cy + 2} width={1.8} height={13} fill={pal.deep} opacity={0.6 * g} />
      )}
      {/* Petals radiating from the centre — none at the bud, multiplying as the bloom opens. */}
      {petals > 0 ? (
        Array.from({ length: petals }, (_, k) => {
          const a = (k / petals) * Math.PI * 2 - Math.PI / 2
          const px = cx + Math.cos(a) * (coreR + petalLen * 0.5)
          const py = cy + Math.sin(a) * (coreR + petalLen * 0.5)
          return (
            <ellipse
              key={k}
              cx={px}
              cy={py}
              rx={petalLen * 0.5}
              ry={petalLen * 0.28}
              fill={k % 2 === 0 ? pal.glow : pal.accent}
              opacity={(0.65 + 0.25 * p) * g}
              transform={`rotate(${(a * 180) / Math.PI} ${px} ${py})`}
            />
          )
        })
      ) : (
        // Spark: a closed bud — a teardrop of soft petal colour.
        <path
          d={`M ${cx} ${cy - 8} Q ${cx + 5} ${cy} ${cx} ${cy + 6} Q ${cx - 5} ${cy} ${cx} ${cy - 8} Z`}
          fill={pal.glow}
          opacity={0.8 * g}
        />
      )}
      {/* The glowing flower centre. */}
      <circle cx={cx} cy={cy} r={coreR} fill={pal.core} opacity={(0.85 + 0.15 * p) * g} />
      <circle cx={cx - coreR * 0.3} cy={cy - coreR * 0.3} r={coreR * 0.3} fill="#ffffff" opacity={0.75 * g} />
      {/* Radiant: a dusting of pollen motes around the full bloom. */}
      {i >= 5 &&
        Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2
          return (
            <circle
              key={`p${k}`}
              cx={cx + Math.cos(a) * (coreR + petalLen)}
              cy={cy + Math.sin(a) * (coreR + petalLen)}
              r={1.3}
              fill={pal.accent}
              opacity={0.8 * g}
            />
          )
        })}
    </g>
  )
}

const PATH_FORM: Record<SpiritPath, (props: { stage: SpiritStage; g: number }) => JSX.Element> = {
  stillness: StillnessForm,
  breath: BreathForm,
  heart: HeartForm,
}

/**
 * The procedural spirit art, branched by path. The form is chosen by the committed `path`,
 * falling back to the suggested `path_lean` before commit — so an early spark already leans
 * toward its likely form. `glow` is clamped to the floored [0.4, 1] band (static — no motion).
 */
function SpiritArt({
  stage,
  path,
  glow,
}: {
  stage: SpiritStage
  path: SpiritPath
  glow: number
}) {
  const g = clampGlow(glow)
  const Form = PATH_FORM[path]
  const label = `${STAGE_COPY[stage].name} ${PATH_COPY[path]} spirit`
  return (
    <svg className="spirit-svg" viewBox="0 0 80 80" role="img" aria-label={label}>
      <Form stage={stage} g={g} />
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

  const { stage, daily_glow, bond, path, path_lean } = spirit
  const copy = STAGE_COPY[stage]
  // Choose the form by the committed path, falling back to the suggested lean before it
  // commits at stage 2. A defensive default keeps the art rendering if the field is missing.
  const form: SpiritPath = path ?? path_lean ?? 'stillness'
  // The "empty" / first-awakening state IS the spark — the backend always returns an active
  // spirit, and a brand-new user is at stage `spark`, which we frame as the spirit awakening.

  return (
    <section className="spirit-home" aria-label="Your spirit">
      <div className="spirit-art">
        <SpiritArt stage={stage} path={form} glow={daily_glow} />
      </div>
      {/* Quiet, calm read-out — the stage name, a gentle note, and the bond level. No XP bar,
          no shouted numbers; consistent with the app's low-pressure stance. */}
      <p className="spirit-stage">{copy.name}</p>
      <p className="spirit-note muted">{copy.note}</p>
      {/* Before the path commits, a quiet "leaning toward …" hint — a gentle nudge, never a
          shout. Once committed, the form speaks for itself, so the hint drops away. */}
      {path === null && (
        <p className="spirit-lean muted">Leaning toward {PATH_COPY[form]}</p>
      )}
      <p className="spirit-bond muted">Bond level {bond.level}</p>
    </section>
  )
}
