// Procedural SVG render of a Sanctuary item. Each item is drawn from a chosen `variant`
// (a base form — a tree species, a dog breed, a wall color) plus a set of purchased
// `customizations` ({slot: option}), each of which makes a *real* visual change (fruit on
// a tree, a hat on a pet, lilies on a pond, smoke from a chimney). The backend owns what
// was bought; this owns rendering. viewBox is 0 0 80 80, in the existing flat style.

import { memo } from 'react'
import { itemLabel, variantLabel } from '../lib/sanctuaryArt'

const GROUND = 70

type Cust = Record<string, string>

// The `grown` slot is a sequential growth ladder (backend GROWTH_STAGES): each option keys a
// stage that renders visibly larger and lusher than the last. Stage 0 is the un-grown base;
// stages 1–5 are grown → flourishing → mature → ancient → venerable. The first rung is keyed
// literally "grown" for backward-compat, so a legacy {"grown":"grown"} row maps to stage 1.
// The fifth rung (venerable, ADR-0021) is a pure addition above the original four.
const GROWTH_STAGES = ['grown', 'flourishing', 'mature', 'ancient', 'venerable'] as const

function growthStage(cust: Cust): number {
  const i = GROWTH_STAGES.indexOf(cust.grown as (typeof GROWTH_STAGES)[number])
  return i < 0 ? 0 : i + 1 // 0 = un-grown base; 1..5 = the ladder rungs
}

// Each renderer scales by `stage` (0 = un-grown base; 1..5 = the ladder rungs), growing
// visibly larger and lusher each step while staying inside the 0 0 80 80 viewBox. `cust.form`
// (ADR-0021) is the late-game evolution fork — a named final form the renderer reads to draw
// a distinct silhouette, routed through the same `cust` map as every other slot.
type DrawProps = { variant: string | null; cust: Cust; stage: number }

const has = (cust: Cust, slot: string, option: string) => cust[slot] === option

// --- shared bits ------------------------------------------------------------------------

function Lights({ y, x, w }: { y: number; x: number; w: number }) {
  // A string of warm dots along the eave.
  const n = Math.max(3, Math.round(w / 6))
  const colors = ['#fbbf24', '#fb7185', '#34d399', '#60a5fa']
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const cx = x + ((i + 0.5) / n) * w
        return <circle key={i} cx={cx} cy={y} r={1.3} fill={colors[i % colors.length]} />
      })}
    </g>
  )
}

function Garden({ y }: { y: number }) {
  // A little flower bed along the ground.
  return (
    <g>
      <rect x={18} y={y} width={48} height={3} fill="#4ade80" opacity={0.5} />
      <circle cx={20} cy={y} r={2.2} fill="#f472b6" />
      <circle cx={26} cy={y + 1} r={2} fill="#fbbf24" />
      <circle cx={58} cy={y + 1} r={2} fill="#a78bfa" />
      <circle cx={63} cy={y} r={2.2} fill="#f87171" />
    </g>
  )
}

function Smoke({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#cbd5e1" opacity={0.8}>
      <circle cx={x} cy={y} r={2.2} />
      <circle cx={x + 2.5} cy={y - 4} r={2.8} />
      <circle cx={x} cy={y - 9} r={3.2} />
    </g>
  )
}

// --- nature -----------------------------------------------------------------------------

const TREE_LEAF: Record<string, string> = {
  oak: '#22c55e',
  pine: '#15803d',
  cherry: '#86efac',
  willow: '#65a30d',
}

function Tree({ variant, cust, stage }: DrawProps) {
  const v = variant ?? 'oak'
  const form = cust.form
  // Trunk grows a touch with each stage; the canopy grows more, so a mature tree reads as a
  // big leafy crown over a sturdy trunk. Base scale stays 1 (un-grown), then climbs by stage.
  // The `mighty` evolved form (ADR-0021) reads as an even broader, thicker giant.
  const k = 0.9 + 0.22 * stage + (form === 'mighty' ? 0.25 : 0)
  const trunkH = (26 + 4 * stage) * Math.min(k, 1.25)
  const trunkW = 5 + stage + (form === 'mighty' ? 2 : form === 'hollow_ancient' ? 3 : 0)
  const trunkY = GROUND - trunkH
  const r = (14 + 4.4 * stage) * (form === 'mighty' ? 1.15 : form === 'hollow_ancient' ? 0.82 : 1)
  const cy = trunkY - r * 0.3
  // The hollow-ancient form keeps its dark knot-hollow; blossoming swaps in a pink crown.
  const leaf =
    form === 'blossoming' ? '#f9a8d4' : form === 'hollow_ancient' ? '#4d7c0f' : TREE_LEAF[v] ?? '#22c55e'
  const isPine = v === 'pine' && !form // a forked tree adopts the form silhouette over the species
  const isWillow = v === 'willow' && !form
  return (
    <g>
      <rect x={40 - trunkW / 2} y={trunkY} width={trunkW} height={trunkH} rx={2} fill="#8b5a2b" />
      {/* the hollow-ancient form bears a dark knot-hollow in its broad trunk */}
      {form === 'hollow_ancient' && (
        <ellipse cx={40} cy={trunkY + trunkH * 0.55} rx={trunkW * 0.32} ry={trunkH * 0.22} fill="#2b1c10" />
      )}
      {/* a few roots/bark ridges appear on the oldest stages (and the gnarled forms) */}
      {(stage >= 3 || form === 'hollow_ancient' || form === 'mighty') && (
        <g stroke="#6f4420" strokeWidth={1} fill="none" strokeLinecap="round">
          <path d={`M${40 - trunkW / 2} ${GROUND} q-3 -2 -5 0`} />
          <path d={`M${40 + trunkW / 2} ${GROUND} q3 -2 5 0`} />
        </g>
      )}
      {has(cust, 'swing', 'swing') && (
        <g stroke="#7c5210" strokeWidth={1} fill="none">
          <line x1={46} y1={cy + r * 0.4} x2={49} y2={GROUND - 4} />
          <line x1={52} y1={cy + r * 0.4} x2={54} y2={GROUND - 4} />
          <rect x={47} y={GROUND - 5} width={9} height={2.2} fill="#a16207" stroke="none" />
        </g>
      )}
      {isPine ? (
        <g fill={leaf}>
          <polygon points={`40,${cy - r} ${40 - r * 0.8},${cy + r * 0.2} ${40 + r * 0.8},${cy + r * 0.2}`} />
          <polygon points={`40,${cy - r * 1.6} ${40 - r * 0.6},${cy - r * 0.3} ${40 + r * 0.6},${cy - r * 0.3}`} />
          {/* taller pines gain an extra upper tier as they mature */}
          {stage >= 2 && (
            <polygon points={`40,${cy - r * 2.1} ${40 - r * 0.45},${cy - r * 1.0} ${40 + r * 0.45},${cy - r * 1.0}`} />
          )}
        </g>
      ) : (
        <g fill={leaf}>
          <circle cx={40 - r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40 + r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40} cy={cy} r={r} />
          {/* extra canopy lobes fill in as the crown matures — fuller, lusher each stage */}
          {stage >= 2 && <circle cx={40 - r * 0.7} cy={cy - r * 0.5} r={r * 0.55} />}
          {stage >= 2 && <circle cx={40 + r * 0.7} cy={cy - r * 0.5} r={r * 0.55} />}
          {stage >= 4 && <circle cx={40} cy={cy - r * 0.9} r={r * 0.6} />}
          {/* venerable (stage 5) spreads two more low side-lobes for a vast, old crown */}
          {stage >= 5 && <circle cx={40 - r} cy={cy + r * 0.3} r={r * 0.5} />}
          {stage >= 5 && <circle cx={40 + r} cy={cy + r * 0.3} r={r * 0.5} />}
        </g>
      )}
      {/* the blossoming evolved form dusts the whole crown with pink blossom */}
      {form === 'blossoming' &&
        [
          [-9, -2],
          [9, -2],
          [0, -9],
          [-5, 6],
          [5, 6],
          [-4, -5],
          [4, -5],
        ].map(([dx, dy], i) => (
          <circle key={i} cx={40 + dx} cy={cy + dy} r={1.8} fill="#fce7f3" />
        ))}
      {isWillow && (
        <g stroke={leaf} strokeWidth={1.2} opacity={0.8}>
          {[-10, -4, 4, 10].map((dx) => (
            <path key={dx} d={`M${40 + dx} ${cy + r * 0.5} q2 8 0 14`} fill="none" />
          ))}
        </g>
      )}
      {/* foliage customization */}
      {has(cust, 'foliage', 'fruit') &&
        [
          [-7, 2],
          [8, 0],
          [0, -6],
          [5, 6],
        ].map(([dx, dy], i) => <circle key={i} cx={40 + dx} cy={cy + dy} r={2.2} fill="#ef4444" />)}
      {has(cust, 'foliage', 'blossom') &&
        [
          [-8, 0],
          [7, -2],
          [1, -7],
          [4, 6],
          [-4, 6],
        ].map(([dx, dy], i) => <circle key={i} cx={40 + dx} cy={cy + dy} r={2} fill="#f9a8d4" />)}
      {has(cust, 'foliage', 'autumn') &&
        [
          [-8, 1],
          [8, -1],
          [0, -6],
          [5, 6],
          [-5, 5],
        ].map(([dx, dy], i) => (
          <circle key={i} cx={40 + dx} cy={cy + dy} r={2.4} fill={i % 2 ? '#f97316' : '#eab308'} />
        ))}
      {has(cust, 'birdhouse', 'birdhouse') && (
        <g>
          <rect x={47} y={cy + 2} width={7} height={7} fill="#a16207" />
          <polygon points={`46,${cy + 2} 55,${cy + 2} 50.5,${cy - 2}`} fill="#7c3f25" />
          <circle cx={50.5} cy={cy + 5.5} r={1.4} fill="#1c1c1e" />
        </g>
      )}
      {/* critter slot (ADR-0021): a small friend perched in the branches */}
      {has(cust, 'critter', 'songbird') && (
        <g transform={`translate(${40 - r * 0.5} ${cy + 1})`}>
          <ellipse cx={0} cy={0} rx={2.6} ry={2} fill="#38bdf8" />
          <circle cx={2} cy={-1.4} r={1.4} fill="#38bdf8" />
          <polygon points="3.2,-1.4 5,-1 3.2,-0.4" fill="#f59e0b" />
          <circle cx={2.2} cy={-1.6} r={0.4} fill="#1c1c1e" />
        </g>
      )}
      {has(cust, 'critter', 'squirrel') && (
        <g transform={`translate(${40 + r * 0.4} ${cy + 4})`}>
          <ellipse cx={0} cy={0} rx={2.6} ry={1.8} fill="#b45309" />
          <circle cx={2.4} cy={-1.6} r={1.6} fill="#b45309" />
          <path d="M-2 1 q-4 -1 -2 -5 q2 1 2 4z" fill="#92400e" />
          <circle cx={2.8} cy={-1.9} r={0.4} fill="#1c1c1e" />
        </g>
      )}
    </g>
  )
}

const FLOWER_PETAL: Record<string, string> = {
  rose: '#fb7185',
  tulip: '#f472b6',
  sunflower: '#facc15',
  daisy: '#f8fafc',
}

function Flower({ variant, cust, stage }: DrawProps) {
  const v = variant ?? 'rose'
  const form = cust.form
  const k = 1 + 0.13 * stage
  const stemH = (28 + 3 * stage) * Math.min(k, 1.35)
  const top = GROUND - stemH
  // The luminous evolved form (ADR-0021) glows; cultivated reads as a deeper, richer petal.
  const petal =
    form === 'luminous' ? '#fef08a' : form === 'cultivated' ? '#db2777' : FLOWER_PETAL[v] ?? '#f472b6'
  const center = form === 'luminous' ? '#fde68a' : v === 'sunflower' ? '#92400e' : '#fbbf24'
  const petalR = (v === 'tulip' ? 5 : 5.5) * (has(cust, 'bloom', 'double') ? 1.25 : 1) * (1 + 0.06 * stage)
  // Side leaves multiply as the plant matures, and from `mature` a small companion bud sprouts
  // alongside — a fuller, lusher clump each stage; venerable (stage 5) adds one more leaf.
  const leafYs = [
    0.4,
    ...(stage >= 1 ? [0.62] : []),
    ...(stage >= 3 ? [0.8] : []),
    ...(stage >= 5 ? [0.92] : []),
  ]
  return (
    <g>
      {/* luminous form: a soft halo behind the bloom */}
      {form === 'luminous' && <circle cx={40} cy={top} r={11} fill="#fef9c3" opacity={0.4} />}
      <rect x={39} y={top} width={2} height={stemH} rx={1} fill="#16a34a" />
      {leafYs.map((f, i) => (
        <ellipse
          key={i}
          cx={i % 2 ? 46 : 34}
          cy={top + stemH * f}
          rx={6}
          ry={3}
          fill={i % 2 ? '#22c55e' : '#4ade80'}
        />
      ))}
      {/* wildflower form: a scatter of tiny companion blooms around the main stem */}
      {form === 'wildflower' &&
        [
          [30, 0.5],
          [50, 0.62],
          [33, 0.78],
        ].map(([cx, f], i) => (
          <g key={i}>
            <rect x={cx - 0.6} y={top + stemH * f} width={1.2} height={stemH * (1 - f)} fill="#16a34a" />
            <circle cx={cx} cy={top + stemH * f} r={2.4} fill={i % 2 ? '#a78bfa' : '#f472b6'} />
            <circle cx={cx} cy={top + stemH * f} r={1} fill="#fbbf24" />
          </g>
        ))}
      {stage >= 3 && (
        <g>
          <rect x={45} y={top + 6} width={1.6} height={stemH * 0.4} rx={1} fill="#16a34a" />
          <circle cx={46} cy={top + 6} r={3} fill={petal} />
          <circle cx={46} cy={top + 6} r={1.4} fill={center} />
        </g>
      )}
      {v === 'tulip' ? (
        <g fill={petal}>
          <path d={`M40 ${top - 8} q-7 2 -6 9 q6 -3 6 -3 q0 0 6 3 q1 -7 -6 -9z`} />
        </g>
      ) : (
        <g fill={petal}>
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const a = (deg * Math.PI) / 180
            return (
              <circle key={deg} cx={40 + Math.cos(a) * 6.5} cy={top + Math.sin(a) * 6.5} r={petalR} />
            )
          })}
        </g>
      )}
      <circle cx={40} cy={top} r={4} fill={center} />
      {has(cust, 'butterfly', 'butterfly') && (
        <g transform={`translate(54 ${top - 6})`}>
          <ellipse cx={-2} cy={0} rx={2.6} ry={3.4} fill="#a78bfa" />
          <ellipse cx={2} cy={0} rx={2.6} ry={3.4} fill="#c4b5fd" />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#1c1c1e" strokeWidth={0.8} />
        </g>
      )}
      {/* pollinator slot (ADR-0021): a bee or a dragonfly hovering at the bloom */}
      {has(cust, 'pollinator', 'bee') && (
        <g transform={`translate(53 ${top - 4})`}>
          <ellipse cx={0} cy={0} rx={2.6} ry={2} fill="#fbbf24" />
          <line x1={-1.2} y1={-1.6} x2={-1.2} y2={1.6} stroke="#1c1c1e" strokeWidth={0.7} />
          <line x1={1} y1={-1.6} x2={1} y2={1.6} stroke="#1c1c1e" strokeWidth={0.7} />
          <ellipse cx={-0.5} cy={-2.4} rx={2} ry={1.2} fill="#e0f2fe" opacity={0.8} />
        </g>
      )}
      {has(cust, 'pollinator', 'dragonfly') && (
        <g transform={`translate(53 ${top - 5})`}>
          <rect x={-0.6} y={-3} width={1.2} height={7} rx={0.6} fill="#0ea5e9" />
          <ellipse cx={-3} cy={-1} rx={3} ry={1.2} fill="#bae6fd" opacity={0.85} />
          <ellipse cx={3} cy={-1} rx={3} ry={1.2} fill="#bae6fd" opacity={0.85} />
        </g>
      )}
    </g>
  )
}

function Pond({ cust, stage }: DrawProps) {
  const form = cust.form
  const k = 0.82 + 0.11 * stage + (stage >= 5 ? 0.05 : 0)
  const rx = 20 * k
  const ry = 7.5 * k
  // The mountain-tarn form is a crisp, cold deep blue; the lotus-pool a warmer green water.
  const water = form === 'mountain_tarn' ? '#0369a1' : form === 'lotus_pool' ? '#0e7490' : '#38bdf8'
  const rim = form === 'mountain_tarn' ? '#64748b' : '#94a3b8'
  return (
    <g>
      {/* mountain-tarn form: a small rocky rim cairn at the water's edge */}
      {form === 'mountain_tarn' && (
        <g fill="#94a3b8">
          <ellipse cx={40 - rx * 0.8} cy={66 - ry} rx={3} ry={2} />
          <ellipse cx={40 - rx * 0.8} cy={66 - ry - 2.4} rx={2} ry={1.4} />
        </g>
      )}
      <ellipse cx={40} cy={66} rx={rx + 2} ry={ry + 0.6} fill="none" stroke={rim} strokeWidth={2} />
      <ellipse cx={40} cy={66} rx={rx} ry={ry} fill={water} />
      {/* the water deepens with concentric ripples on the larger stages */}
      {stage >= 2 && <ellipse cx={40} cy={66} rx={rx * 0.62} ry={ry * 0.6} fill="none" stroke="#7dd3fc" strokeWidth={1} opacity={0.7} />}
      {stage >= 4 && <ellipse cx={40} cy={66} rx={rx * 0.35} ry={ry * 0.34} fill="none" stroke="#bae6fd" strokeWidth={0.8} opacity={0.7} />}
      {/* lotus-pool form: pink lotus blooms floating on the surface */}
      {form === 'lotus_pool' &&
        [
          [30, 66],
          [48, 68],
          [40, 64],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={3} ry={1.4} fill="#15803d" />
            <circle cx={cx} cy={cy - 0.6} r={1.6} fill="#f9a8d4" />
            <circle cx={cx} cy={cy - 0.6} r={0.7} fill="#fbcfe8" />
          </g>
        ))}
      {has(cust, 'lilies', 'lilies') && (
        <g>
          <ellipse cx={32} cy={65} rx={4} ry={2} fill="#22c55e" />
          <ellipse cx={48} cy={67} rx={4} ry={2} fill="#16a34a" />
          <circle cx={32} cy={64} r={1.6} fill="#f9a8d4" />
        </g>
      )}
      {has(cust, 'koi', 'koi') && (
        <g>
          <ellipse cx={44} cy={66} rx={4} ry={2} fill="#fb923c" />
          <polygon points="48,66 51,64 51,68" fill="#f97316" />
          <ellipse cx={34} cy={68} rx={3} ry={1.4} fill="#f8fafc" />
        </g>
      )}
      {has(cust, 'bridge', 'bridge') && (
        <g stroke="#a16207" strokeWidth={2} fill="none">
          <path d="M22 64 q18 -10 36 0" />
          <line x1={26} y1={62} x2={26} y2={67} />
          <line x1={54} y1={62} x2={54} y2={67} />
        </g>
      )}
      {/* waterfowl slot (ADR-0021): a duck or a swan gliding on the pond */}
      {has(cust, 'waterfowl', 'duck') && (
        <g>
          <ellipse cx={44} cy={64} rx={4.5} ry={2.6} fill="#facc15" />
          <circle cx={48} cy={61.5} r={2.2} fill="#facc15" />
          <polygon points="50,61.5 53,61 50,60.5" fill="#f97316" />
          <circle cx={48.6} cy={61.2} r={0.5} fill="#1c1c1e" />
        </g>
      )}
      {has(cust, 'waterfowl', 'swan') && (
        <g>
          <ellipse cx={42} cy={64} rx={5.5} ry={3} fill="#f8fafc" />
          <path d="M47 64 q3 -2 1 -6 q-1 -2 -2 -1" stroke="#f8fafc" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <circle cx={46.2} cy={57} r={1.4} fill="#f8fafc" />
          <polygon points="47.4,56.6 50,56.4 47.6,55.6" fill="#f97316" />
          <circle cx={46.6} cy={56.6} r={0.4} fill="#1c1c1e" />
        </g>
      )}
    </g>
  )
}

// --- structures -------------------------------------------------------------------------

const WALL_COLORS: Record<string, string> = {
  straw: '#d4a373',
  wood: '#a67c52',
  cream: '#eaddc7',
  stone: '#cbd5e1',
  red: '#b91c1c',
  gray: '#9ca3af',
  white: '#f1f5f9',
  teal: '#5eead4',
}

function Building({
  variant,
  cust,
  stage,
  defaultColor,
  roof,
  baseW,
}: DrawProps & { defaultColor: string; roof: string; baseX?: number; baseW: number }) {
  const color = (variant && WALL_COLORS[variant]) || defaultColor
  // The footprint widens a little and the walls climb with each stage, so a "mature" home
  // reads as a taller, broader cottage — an added upper window appears from `flourishing`.
  const k = 0.92 + 0.1 * stage
  const wallH = (22 + 2 * stage) * Math.min(k, 1.2)
  const wallY = GROUND - wallH
  const w = baseW * (0.92 + 0.05 * stage)
  const x = 40 - w / 2
  const cx = 40
  const litWindow = has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd'
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 3} />}
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      <polygon points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${wallY - 16}`} fill={roof} />
      {/* door */}
      <rect x={cx - 3} y={GROUND - 11} width={6} height={11} fill={roof} />
      {/* window */}
      <rect x={x + 4} y={wallY + 5} width={6} height={6} fill={litWindow} />
      {/* a second ground-floor window appears once the home has grown a bit wider */}
      {stage >= 2 && <rect x={x + w - 10} y={wallY + 5} width={6} height={6} fill={litWindow} />}
      {/* an upper-storey window in the gable on the maturest stages */}
      {stage >= 3 && <rect x={cx - 2.5} y={wallY - 11} width={5} height={5} fill={litWindow} />}
      {has(cust, 'chimney_smoke', 'smoke') && (
        <g>
          <rect x={x + w - 7} y={wallY - 12} width={4} height={8} fill={roof} />
          <Smoke x={x + w - 5} y={wallY - 14} />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={wallY - 1} x={x} w={w} />}
    </g>
  )
}

const CAR_COLORS: Record<string, string> = { red: '#ef4444', blue: '#3b82f6', yellow: '#eab308' }

function Car({ variant, cust, stage }: DrawProps) {
  const color = (variant && CAR_COLORS[variant]) || '#ef4444'
  const k = 0.9 + 0.08 * stage
  const w = 36 * k
  const x = 40 - w / 2
  const bodyY = 58
  return (
    <g>
      <path d={`M${x + 8} ${bodyY} q4 -9 12 -9 q8 0 10 9 z`} fill={color} />
      <path d={`M${x + 11} ${bodyY - 1} q3 -5 8 -5 q5 0 7 5 z`} fill="#bfdbfe" />
      <rect x={x} y={bodyY} width={w} height={8} rx={3} fill={color} />
      {/* a roof rack with a little luggage appears as the car is "kitted out" over stages */}
      {stage >= 2 && (
        <g>
          <rect x={x + 11} y={bodyY - 11} width={14} height={1.6} rx={0.8} fill="#475569" />
          {stage >= 3 && <rect x={x + 13} y={bodyY - 14} width={9} height={3.4} rx={1} fill="#a16207" />}
        </g>
      )}
      <circle cx={x + w * 0.25} cy={66} r={3.5} fill="#1f2937" />
      <circle cx={x + w * 0.75} cy={66} r={3.5} fill="#1f2937" />
      {has(cust, 'lights', 'lights') && (
        <>
          <circle cx={x + w - 1} cy={bodyY + 4} r={1.6} fill="#fde68a" />
          <circle cx={x + 1} cy={bodyY + 4} r={1.6} fill="#f87171" />
        </>
      )}
    </g>
  )
}

function BeachHouse({ variant, cust, stage }: DrawProps) {
  const color = (variant && WALL_COLORS[variant]) || '#f1f5f9'
  const k = 0.92 + 0.09 * stage
  const wallH = (18 + 2 * stage) * Math.min(k, 1.18)
  const deck = GROUND - 6
  const wallY = deck - wallH
  const w = 22 + 2 * stage
  const x = 40 - w / 2
  const cx = x + w / 2
  const litWindow = has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd'
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 2} />}
      <rect x={x + 2} y={deck} width={3} height={6} fill="#a87b50" />
      <rect x={x + w - 5} y={deck} width={3} height={6} fill="#a87b50" />
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      <polygon points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${wallY - 14}`} fill="#0ea5e9" />
      <rect x={x + 4} y={wallY + 4} width={5} height={5} fill={litWindow} />
      {/* a second window + a railed sun-deck fill in as the beach house grows */}
      {stage >= 2 && <rect x={x + w - 9} y={wallY + 4} width={5} height={5} fill={litWindow} />}
      {stage >= 3 && (
        <g stroke="#a87b50" strokeWidth={1}>
          <line x1={x} y1={deck} x2={x + w} y2={deck} />
          <line x1={x + 6} y1={deck} x2={x + 6} y2={deck + 4} />
          <line x1={x + w - 6} y1={deck} x2={x + w - 6} y2={deck + 4} />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={wallY - 1} x={x} w={w} />}
    </g>
  )
}

function Boat({ variant, cust, stage }: DrawProps) {
  const hull = variant === 'white' ? '#e2e8f0' : '#a16207'
  const k = 0.9 + 0.1 * stage
  const sailH = 22 * k
  return (
    <g>
      <ellipse cx={40} cy={68} rx={22} ry={5} fill="#bae6fd" />
      <path d="M27 61 L53 61 L48 68 L32 68 Z" fill={hull} />
      <rect x={39} y={61 - sailH} width={2} height={sailH} fill="#7c5210" />
      <polygon points={`40,${61 - sailH + 2} 40,59 54,60`} fill="#f8fafc" />
      {/* a second jib sail unfurls, then a pennant flies, as the boat is rigged out by stage */}
      {stage >= 2 && <polygon points={`40,${61 - sailH + 4} 40,59 28,60`} fill="#e2e8f0" />}
      {stage >= 4 && (
        <polygon points={`41,${61 - sailH} 41,${61 - sailH + 4} 48,${61 - sailH + 2}`} fill="#fb7185" />
      )}
      {has(cust, 'lights', 'lights') && (
        <>
          <circle cx={30} cy={60} r={1.3} fill="#fbbf24" />
          <circle cx={50} cy={60} r={1.3} fill="#fbbf24" />
        </>
      )}
    </g>
  )
}

// --- companions -------------------------------------------------------------------------

// Wearables drawn on a character, positioned off the head centre (headX, headY). These cover
// both the legacy `accessory` slot (collar/bandana/hat) AND the new additive slots — `headwear`
// (hat / flower_crown / tiny_crown), `collar` (bandana / bowtie / bell), and `attire` (scarf /
// sunglasses). Slots are independent, so a character can wear several at once (a tiny crown AND
// a bowtie AND sunglasses) — each is drawn here if its option is set.

function Headwear({ option, headX, headY }: { option: string; headX: number; headY: number }) {
  if (option === 'hat') {
    return (
      <g>
        <rect x={headX - 5} y={headY - 8} width={10} height={2.5} fill="#1f2937" />
        <rect x={headX - 3} y={headY - 13} width={6} height={6} fill="#1f2937" />
      </g>
    )
  }
  if (option === 'flower_crown') {
    return (
      <g>
        <path
          d={`M${headX - 6} ${headY - 6} q6 -4 12 0`}
          fill="none"
          stroke="#65a30d"
          strokeWidth={1.4}
        />
        <circle cx={headX - 5} cy={headY - 7} r={1.6} fill="#f472b6" />
        <circle cx={headX} cy={headY - 8.5} r={1.8} fill="#fbbf24" />
        <circle cx={headX + 5} cy={headY - 7} r={1.6} fill="#a78bfa" />
      </g>
    )
  }
  if (option === 'tiny_crown') {
    return (
      <polygon
        points={`${headX - 5},${headY - 6} ${headX - 5},${headY - 9} ${headX - 2.5},${headY - 7} ${headX},${headY - 10} ${headX + 2.5},${headY - 7} ${headX + 5},${headY - 9} ${headX + 5},${headY - 6}`}
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth={0.5}
      />
    )
  }
  return null
}

function CollarPiece({ option, headX, headY }: { option: string; headX: number; headY: number }) {
  if (option === 'bandana') {
    return (
      <polygon
        points={`${headX - 6},${headY + 6} ${headX + 6},${headY + 6} ${headX},${headY + 13}`}
        fill="#10b981"
      />
    )
  }
  if (option === 'bowtie') {
    return (
      <g fill="#ef4444">
        <polygon points={`${headX - 5},${headY + 6} ${headX - 1},${headY + 8.5} ${headX - 5},${headY + 11}`} />
        <polygon points={`${headX + 5},${headY + 6} ${headX + 1},${headY + 8.5} ${headX + 5},${headY + 11}`} />
        <circle cx={headX} cy={headY + 8.5} r={1.2} fill="#b91c1c" />
      </g>
    )
  }
  if (option === 'bell') {
    return (
      <g>
        <rect x={headX - 6} y={headY + 6} width={12} height={2.5} rx={1} fill="#ef4444" />
        <circle cx={headX} cy={headY + 9.5} r={1.8} fill="#fbbf24" stroke="#b45309" strokeWidth={0.4} />
        <line x1={headX} y1={headY + 9} x2={headX} y2={headY + 11} stroke="#b45309" strokeWidth={0.4} />
      </g>
    )
  }
  // Legacy `collar` option (a plain bell-tagged band).
  if (option === 'collar') {
    return (
      <g>
        <rect x={headX - 6} y={headY + 6} width={12} height={2.5} rx={1} fill="#ef4444" />
        <circle cx={headX} cy={headY + 8.5} r={1.2} fill="#fbbf24" />
      </g>
    )
  }
  return null
}

function Attire({ option, headX, headY }: { option: string; headX: number; headY: number }) {
  if (option === 'scarf') {
    return (
      <g fill="#3b82f6">
        <rect x={headX - 6} y={headY + 6} width={12} height={3} rx={1.4} />
        <rect x={headX + 3} y={headY + 8} width={3} height={5} rx={1} />
      </g>
    )
  }
  if (option === 'sunglasses') {
    return (
      <g fill="#1f2937">
        <circle cx={headX - 2.4} cy={headY} r={1.9} />
        <circle cx={headX + 2.4} cy={headY} r={1.9} />
        <rect x={headX - 0.6} y={headY - 0.6} width={1.2} height={1} />
      </g>
    )
  }
  return null
}

// Draws every wearable a character currently has on, from whichever of the independent slots
// is set. Legacy `accessory` values (collar/bandana/hat) are routed to the right piece so old
// rows still render exactly as before.
function Wearables({ cust, headX, headY }: { cust: Cust; headX: number; headY: number }) {
  const legacy = cust.accessory
  return (
    <g>
      {legacy === 'hat' && <Headwear option="hat" headX={headX} headY={headY} />}
      {legacy === 'collar' && <CollarPiece option="collar" headX={headX} headY={headY} />}
      {legacy === 'bandana' && <CollarPiece option="bandana" headX={headX} headY={headY} />}
      {legacy === 'scarf' && <Attire option="scarf" headX={headX} headY={headY} />}
      {legacy === 'leaf' && (
        <path d={`M${headX} ${headY - 6} q4 -5 8 -2 q-3 4 -8 2z`} fill="#65a30d" />
      )}
      {cust.headwear && <Headwear option={cust.headwear} headX={headX} headY={headY} />}
      {cust.collar && <CollarPiece option={cust.collar} headX={headX} headY={headY} />}
      {cust.attire && <Attire option={cust.attire} headX={headX} headY={headY} />}
    </g>
  )
}

const FUR: Record<string, string> = {
  gray: '#9ca3af',
  ginger: '#f59e0b',
  black: '#374151',
  white: '#e5e7eb',
  red: '#ea580c',
  arctic: '#e0f2fe',
  corgi: '#d97706',
  husky: '#94a3b8',
  shiba: '#f59e0b',
  dalmatian: '#f8fafc',
  bluebird: '#38bdf8',
  robin: '#fb7185',
  canary: '#facc15',
  orange: '#fb923c',
  green: '#16a34a',
  amber: '#d97706',
  blue: '#3b82f6',
}

function Bird({ variant, cust, stage }: DrawProps) {
  const c = FUR[variant ?? 'bluebird'] ?? '#38bdf8'
  const s = 1 + 0.1 * stage
  return (
    <g>
      <ellipse cx={40} cy={67} rx={12} ry={4} fill="#a16207" />
      <ellipse cx={39} cy={58} rx={9 * s} ry={7 * s} fill={c} />
      <circle cx={47} cy={53} r={4 * s} fill={c} />
      <polygon points="50,53 54,52 54,55" fill="#f59e0b" />
      <ellipse cx={37} cy={58} rx={5 * s} ry={4 * s} fill="#0ea5e9" opacity={0.5} />
      {/* a fuller tail fans out as the bird matures */}
      {stage >= 3 && <polygon points={`30,57 ${24 - stage},55 ${24 - stage},61`} fill={c} />}
      <circle cx={48} cy={52} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={47} headY={53} />
    </g>
  )
}

function Fox({ variant, cust, stage }: DrawProps) {
  const c = FUR[variant ?? 'red'] ?? '#ea580c'
  const belly = variant === 'arctic' ? '#f1f5f9' : '#fff'
  const s = 1 + 0.1 * stage
  return (
    <g>
      <ellipse cx={40} cy={62} rx={11 * s} ry={8 * s} fill={c} />
      <ellipse cx={51} cy={64} rx={5 * s} ry={3 * s} fill={belly} />
      <circle cx={40} cy={50} r={6 * s} fill={c} />
      <polygon points="35,46 33,38 39,44" fill={c} />
      <polygon points="45,46 47,38 41,44" fill={c} />
      <polygon points="40,50 36,52 44,52" fill={belly} />
      <circle cx={37} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={49} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Cat({ variant, cust, stage }: DrawProps) {
  const c = FUR[variant ?? 'gray'] ?? '#9ca3af'
  const s = 1 + 0.1 * stage
  return (
    <g>
      <path d="M50 64 q11 -1 6 -13" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" />
      <ellipse cx={40} cy={62} rx={10 * s} ry={8 * s} fill={c} />
      <circle cx={40} cy={50} r={6 * s} fill={c} />
      <polygon points="36,46 34,37 39,44" fill={c} />
      <polygon points="44,46 46,37 41,44" fill={c} />
      <polygon points="37,45 36,40 39,44" fill="#f9a8d4" />
      <polygon points="43,45 44,40 41,44" fill="#f9a8d4" />
      <polygon points="40,51 38,53 42,53" fill="#6b7280" />
      <circle cx={37} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={49} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Dog({ variant, cust, stage }: DrawProps) {
  const c = FUR[variant ?? 'corgi'] ?? '#a16207'
  const ear = variant === 'husky' ? '#475569' : '#7c3f10'
  const s = 1 + 0.12 * stage
  return (
    <g>
      <path d="M50 62 q9 -4 11 -10" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" />
      <ellipse cx={40} cy={62} rx={11 * s} ry={8 * s} fill={c} />
      {variant === 'dalmatian' && (
        <g fill="#1f2937">
          <circle cx={36} cy={61} r={1.4} />
          <circle cx={44} cy={64} r={1.2} />
          <circle cx={41} cy={59} r={1} />
        </g>
      )}
      <circle cx={40} cy={50} r={6.5 * s} fill={c} />
      <ellipse cx={33} cy={50} rx={2.5 * s} ry={5 * s} fill={ear} />
      <ellipse cx={47} cy={50} rx={2.5 * s} ry={5 * s} fill={ear} />
      <ellipse cx={40} cy={53} rx={4} ry={3} fill="#d4a373" />
      <circle cx={40} cy={52} r={1.4} fill="#1c1c1e" />
      <circle cx={37} cy={48} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={48} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Goldfish({ variant, stage }: DrawProps) {
  const c = FUR[variant ?? 'orange'] ?? '#fb923c'
  const s = 1 + 0.12 * stage
  return (
    <g>
      <ellipse cx={40} cy={66} rx={16} ry={5} fill="#bae6fd" />
      <polygon points="33,60 25,56 25,64" fill="#f97316" />
      <ellipse cx={40} cy={60} rx={9 * s} ry={6 * s} fill={c} />
      <polygon points="40,55 44,51 46,57" fill="#f97316" />
      <circle cx={45} cy={59} r={1.2} fill="#1c1c1e" />
    </g>
  )
}

function Snake({ variant, cust, stage }: DrawProps) {
  const c = FUR[variant ?? 'green'] ?? '#16a34a'
  const s = 1 + 0.13 * stage
  const headwear = cust.headwear ?? (cust.accessory === 'hat' ? 'hat' : undefined)
  return (
    <g fill="none" stroke={c} strokeWidth={4 * s} strokeLinecap="round">
      <ellipse cx={40} cy={63} rx={12 * s} ry={5 * s} />
      <path d="M40 60 q7 -9 2 -16" />
      <circle cx={41} cy={45} r={3.2 * s} fill={c} stroke="none" />
      <circle cx={42} cy={44} r={0.8} fill="#1c1c1e" stroke="none" />
      <path d="M41 42 L41 38 M41 38 l-1.5 -2 M41 38 l1.5 -2" stroke="#dc2626" strokeWidth={0.7} />
      {headwear === 'hat' && (
        <g stroke="none">
          <rect x={36} y={38} width={10} height={2.2} fill="#1f2937" />
          <rect x={38} y={33} width={6} height={5.5} fill="#1f2937" />
        </g>
      )}
      {cust.headwear === 'tiny_crown' && (
        <polygon
          points="36,38 36,35 38.5,37 41,34 43.5,37 46,35 46,38"
          fill="#fbbf24"
          stroke="#d97706"
          strokeWidth={0.5}
        />
      )}
    </g>
  )
}

// --- whimsy + new nature/companions -----------------------------------------------------
//
// Each draws in the same flat 0 0 80 80 / GROUND=70 style, keyed off its variant (a colour
// or small shape change) and its purchased customizations (each a real visible add-on).

const MUSHROOM_CAP: Record<string, string> = { ruby: '#dc2626', amber: '#f59e0b', violet: '#8b5cf6' }

function Toadstool({ x, y, k, cap }: { x: number; y: number; k: number; cap: string }) {
  // A single capped toadstool with white spots.
  const r = 5 * k
  return (
    <g>
      <rect x={x - 1.5} y={y - 4 * k} width={3} height={6 * k} rx={1.4} fill="#f8fafc" />
      <path d={`M${x - r} ${y - 4 * k} a${r} ${r * 0.8} 0 0 1 ${2 * r} 0 z`} fill={cap} />
      <circle cx={x - r * 0.4} cy={y - 4.6 * k} r={0.9} fill="#fff" />
      <circle cx={x + r * 0.4} cy={y - 5.2 * k} r={0.8} fill="#fff" />
    </g>
  )
}

function MushroomRing({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  // The witch's-circle form darkens the caps; the moonlit form turns them pale silver-blue.
  const cap =
    form === 'witchs_circle' ? '#4c1d95' : form === 'moonlit' ? '#c7d2fe' : MUSHROOM_CAP[variant ?? 'ruby'] ?? '#dc2626'
  const k = 0.85 + 0.1 * stage + (stage >= 5 ? 0.06 : 0)
  // A ring of toadstools around a grassy centre; extra toadstools sprout as the ring spreads.
  const ring: Array<[number, number]> = [
    [28, 64],
    [40, 60],
    [52, 64],
    [34, 68],
    [46, 68],
    ...(stage >= 2 ? ([[22, 67]] as Array<[number, number]>) : []),
    ...(stage >= 3 ? ([[58, 67]] as Array<[number, number]>) : []),
    ...(stage >= 4 ? ([[40, 70]] as Array<[number, number]>) : []),
    ...(stage >= 5 ? ([[40, 58], [26, 61]] as Array<[number, number]>) : []),
  ]
  return (
    <g>
      <ellipse cx={40} cy={66} rx={20} ry={6} fill={form === 'witchs_circle' ? '#3f3f46' : '#bbf7d0'} opacity={0.7} />
      {/* moonlit form: a cool pale glow over the whole ring */}
      {form === 'moonlit' && <ellipse cx={40} cy={64} rx={21} ry={8} fill="#e0e7ff" opacity={0.4} />}
      {has(cust, 'glow', 'glow') && <ellipse cx={40} cy={64} rx={20} ry={7} fill="#fde68a" opacity={0.35} />}
      {ring.map(([x, y], i) => (
        <Toadstool key={i} x={x} y={y} k={k} cap={cap} />
      ))}
      {has(cust, 'sprite', 'sprite') && (
        <g transform="translate(40 46)">
          <circle cx={0} cy={0} r={2.4} fill="#fcd34d" />
          <ellipse cx={-3} cy={-1} rx={2.2} ry={3} fill="#fef3c7" opacity={0.8} />
          <ellipse cx={3} cy={-1} rx={2.2} ry={3} fill="#fef3c7" opacity={0.8} />
        </g>
      )}
      {/* firefly slot (ADR-0021): little drifting points of warm light over the ring */}
      {has(cust, 'firefly', 'fireflies') &&
        [
          [30, 54],
          [50, 50],
          [42, 57],
          [24, 58],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={2.4} fill="#fde68a" opacity={0.4} />
            <circle cx={cx} cy={cy} r={1} fill="#fef08a" />
          </g>
        ))}
    </g>
  )
}

const HEDGEHOG_BODY: Record<string, string> = { brown: '#92400e', cream: '#d6c1a8', salt: '#6b7280' }

function Hedgehog({ variant, cust, stage }: DrawProps) {
  const spine = HEDGEHOG_BODY[variant ?? 'brown'] ?? '#92400e'
  const s = 1 + 0.12 * stage
  const face = variant === 'cream' ? '#f5e6d3' : '#e9c9a3'
  // More quills bristle out as the hedgehog grows up — visibly fuller each stage.
  const quillCount = 7 + stage
  const spikes = Array.from({ length: quillCount }).map((_, i) => {
    const t = i / (quillCount - 1)
    const bx = 30 + t * 18
    return <polygon key={i} points={`${bx},${64} ${bx + 2.4},${64} ${bx + 1.2},${56 - 3 * s}`} fill={spine} />
  })
  return (
    <g>
      <ellipse cx={40} cy={64} rx={13 * s} ry={7 * s} fill={spine} />
      {spikes}
      <ellipse cx={52} cy={64} rx={5 * s} ry={4 * s} fill={face} />
      <circle cx={56} cy={64} r={1.1} fill="#1c1c1e" />
      <circle cx={54} cy={62.5} r={0.9} fill="#1c1c1e" />
      {has(cust, 'accessory', 'scarf') && (
        <g>
          <rect x={47} y={67} width={11} height={2.6} rx={1} fill="#ef4444" />
          <rect x={47} y={69} width={3} height={3} fill="#ef4444" />
        </g>
      )}
      {has(cust, 'accessory', 'leaf') && (
        <path d="M40 57 q4 -5 8 -2 q-3 4 -8 2z" fill="#65a30d" />
      )}
      {/* new additive slots ride above the snout */}
      <Wearables cust={{ headwear: cust.headwear, attire: cust.attire }} headX={52} headY={60} />
    </g>
  )
}

const SNAIL_SHELL: Record<string, string> = { amber: '#d97706', minty: '#34d399', rosy: '#fb7185' }

function Snail({ variant, cust, stage }: DrawProps) {
  const shell = SNAIL_SHELL[variant ?? 'amber'] ?? '#d97706'
  const s = 1 + 0.13 * stage
  return (
    <g>
      <path d="M24 66 q4 4 14 3" stroke="#a3e635" strokeWidth={4 * s} fill="none" strokeLinecap="round" />
      <ellipse cx={48} cy={62} rx={9 * s} ry={9 * s} fill={shell} />
      <ellipse cx={48} cy={62} rx={5.5 * s} ry={5.5 * s} fill="none" stroke="#fff7ed" strokeWidth={1.6} opacity={0.7} />
      <circle cx={48} cy={62} r={2 * s} fill="#fff7ed" opacity={0.7} />
      <path d="M30 56 l-2 -6 M34 56 l1 -6" stroke="#a3e635" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={28} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={35} cy={49} r={1} fill="#1c1c1e" />
      {has(cust, 'accessory', 'hat') && (
        <g>
          <rect x={43} y={49} width={10} height={2.2} fill="#1f2937" />
          <rect x={45} y={44} width={6} height={5.5} fill="#1f2937" />
        </g>
      )}
    </g>
  )
}

const GNOME_HAT: Record<string, string> = { classic: '#dc2626', mossy: '#4d7c0f', sleepy: '#3b82f6' }

function Gnome({ variant, cust, stage }: DrawProps) {
  const v = variant ?? 'classic'
  const hat = GNOME_HAT[v] ?? '#dc2626'
  const s = 1 + 0.12 * stage
  const cx = 40
  const bodyY = GROUND - 18 * s
  return (
    <g>
      {has(cust, 'companion', 'snail') && (
        <g>
          <ellipse cx={58} cy={68} rx={4} ry={3.4} fill="#d97706" />
          <path d="M52 69 q2 2 4 1" stroke="#a3e635" strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {/* blue coat / body */}
      <path d={`M${cx} ${GROUND} q-9 0 -9 -10 q0 -8 9 -8 q9 0 9 8 q0 10 -9 10z`} fill="#2563eb" />
      {/* face */}
      <circle cx={cx} cy={bodyY} r={6 * s} fill="#f5d0b0" />
      {/* beard */}
      <path d={`M${cx - 6} ${bodyY + 1} q6 12 12 0 q-2 8 -6 8 q-4 0 -6 -8z`} fill="#f1f5f9" />
      <circle cx={cx - 2.2} cy={bodyY} r={0.9} fill="#1c1c1e" />
      <circle cx={cx + 2.2} cy={bodyY} r={0.9} fill="#1c1c1e" />
      {v === 'mossy' && <ellipse cx={cx - 3} cy={bodyY - 5} rx={3} ry={1.6} fill="#84cc16" opacity={0.7} />}
      {/* pointed hat */}
      <polygon points={`${cx - 7},${bodyY - 4} ${cx + 7},${bodyY - 4} ${cx},${bodyY - 18 * s}`} fill={hat} />
      {v === 'sleepy' && <circle cx={cx} cy={bodyY - 17 * s} r={1.6} fill="#fff" />}
      {has(cust, 'lantern', 'lantern') && (
        <g>
          <line x1={49} y1={GROUND - 12} x2={49} y2={GROUND - 4} stroke="#7c5210" strokeWidth={1} />
          <rect x={47} y={GROUND - 5} width={5} height={6} rx={1} fill="#fde68a" stroke="#a16207" strokeWidth={0.8} />
        </g>
      )}
    </g>
  )
}

const CHIME_TUBE: Record<string, string> = { brass: '#d4a017', bamboo: '#a3a847', seaglass: '#5eead4' }

function WindChime({ variant, cust, stage }: DrawProps) {
  const tube = CHIME_TUBE[variant ?? 'brass'] ?? '#d4a017'
  const s = 1 + 0.12 * stage
  const topY = 30
  const len = 18 * s
  const tubes = [-6, -2, 2, 6]
  return (
    <g>
      {/* branch it hangs from */}
      <path d="M20 28 q20 -6 40 0" stroke="#8b5a2b" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* top disc */}
      <ellipse cx={40} cy={topY} rx={9} ry={2.6} fill="#a16207" />
      {tubes.map((dx) => (
        <g key={dx}>
          <line x1={40 + dx} y1={topY} x2={40 + dx} y2={topY + 4} stroke="#6b7280" strokeWidth={0.6} />
          <rect x={40 + dx - 1} y={topY + 4} width={2.2} height={len} rx={1} fill={tube} />
        </g>
      ))}
      {/* clapper */}
      <line x1={40} y1={topY} x2={40} y2={topY + len + 4} stroke="#9ca3af" strokeWidth={0.6} />
      <circle cx={40} cy={topY + len + 5} r={2.4} fill="#cbd5e1" />
      {has(cust, 'ribbon', 'ribbon') && (
        <g>
          <line x1={40} y1={topY + len + 5} x2={40} y2={topY + len + 11} stroke="#f472b6" strokeWidth={0.8} />
          <polygon
            points={`40,${topY + len + 11} 36,${topY + len + 15} 44,${topY + len + 15}`}
            fill="#f472b6"
          />
        </g>
      )}
      {has(cust, 'bell', 'bell') && (
        <g transform={`translate(54 ${topY + 2})`}>
          <path d="M-3 4 q0 -6 3 -6 q3 0 3 6 z" fill="#fbbf24" />
          <circle cx={0} cy={5} r={1} fill="#92400e" />
        </g>
      )}
    </g>
  )
}

const LANTERN_FRAME: Record<string, string> = { paper: '#fcd34d', iron: '#4b5563', stone: '#9ca3af' }

function Lantern({ variant, cust, stage }: DrawProps) {
  const frame = LANTERN_FRAME[variant ?? 'paper'] ?? '#fcd34d'
  const s = 1 + 0.12 * stage
  const w = 14 * s
  const h = 20 * s
  const x = 40 - w / 2
  const y = GROUND - h
  const flameColor = has(cust, 'flame', 'blue') ? '#60a5fa' : '#fbbf24'
  const lit = has(cust, 'flame', 'blue') || has(cust, 'flame', 'warm')
  return (
    <g>
      {/* post */}
      <rect x={39} y={y - 6} width={2} height={6} fill="#7c5210" />
      <path d={`M${40 - 3} ${y - 6} h6`} stroke="#7c5210" strokeWidth={2} />
      {/* glow */}
      {lit && <ellipse cx={40} cy={y + h / 2} rx={w} ry={h * 0.6} fill={flameColor} opacity={0.25} />}
      {/* body */}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={variant === 'paper' ? '#fef9c3' : '#1f2937'} />
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={frame} strokeWidth={1.6} />
      <line x1={40} y1={y} x2={40} y2={y + h} stroke={frame} strokeWidth={1} />
      <rect x={x - 1} y={y - 2} width={w + 2} height={2.4} rx={1} fill={frame} />
      {/* flame */}
      {lit && <path d={`M40 ${y + h - 4} q-2 -4 0 -7 q2 3 0 7z`} fill={flameColor} />}
      {has(cust, 'moth', 'moth') && (
        <g transform={`translate(${x - 4} ${y + 4})`}>
          <ellipse cx={-1.5} cy={0} rx={1.8} ry={2.4} fill="#d6d3d1" />
          <ellipse cx={1.5} cy={0} rx={1.8} ry={2.4} fill="#e7e5e4" />
        </g>
      )}
    </g>
  )
}

const FROG_BODY: Record<string, string> = { green: '#22c55e', golden: '#eab308', blue: '#38bdf8' }

function FrogLily({ variant, cust, stage }: DrawProps) {
  const body = FROG_BODY[variant ?? 'green'] ?? '#22c55e'
  const s = 1 + 0.12 * stage
  return (
    <g>
      {/* water + lily pad */}
      <ellipse cx={40} cy={68} rx={22} ry={6} fill="#bae6fd" />
      <ellipse cx={40} cy={66} rx={15} ry={5} fill="#16a34a" />
      <path d="M40 66 L51 63" stroke="#bae6fd" strokeWidth={1.4} />
      {/* frog body */}
      <ellipse cx={40} cy={60} rx={10 * s} ry={6 * s} fill={body} />
      <ellipse cx={48} cy={64} rx={4} ry={2} fill={body} />
      <ellipse cx={32} cy={64} rx={4} ry={2} fill={body} />
      {/* eyes */}
      <circle cx={35} cy={53} r={3 * s} fill={body} />
      <circle cx={45} cy={53} r={3 * s} fill={body} />
      <circle cx={35} cy={53} r={1.4} fill="#fff" />
      <circle cx={45} cy={53} r={1.4} fill="#fff" />
      <circle cx={35} cy={53} r={0.8} fill="#1c1c1e" />
      <circle cx={45} cy={53} r={0.8} fill="#1c1c1e" />
      <path d="M35 60 q5 3 10 0" stroke="#15803d" strokeWidth={1} fill="none" strokeLinecap="round" />
      {has(cust, 'crown', 'crown') && (
        <polygon points="35,49 38,45 40,48 42,45 45,49" fill="#fbbf24" stroke="#d97706" strokeWidth={0.5} />
      )}
      {has(cust, 'hat', 'hat') && (
        <g>
          <rect x={34} y={48} width={12} height={2} fill="#1f2937" />
          <rect x={36} y={43} width={8} height={5.5} fill="#1f2937" />
        </g>
      )}
    </g>
  )
}

const SCARECROW_SHIRT: Record<string, string> = {
  straw: '#a16207',
  patchwork: '#2563eb',
  pumpkin: '#ea580c',
}

function Scarecrow({ variant, cust, stage }: DrawProps) {
  const v = variant ?? 'straw'
  const shirt = SCARECROW_SHIRT[v] ?? '#a16207'
  const s = 1 + 0.12 * stage
  const headY = GROUND - 34 * s
  return (
    <g>
      {/* cross-post + outstretched arms */}
      <rect x={39} y={GROUND - 32 * s} width={2} height={32 * s} fill="#7c5210" />
      <rect x={26} y={GROUND - 22 * s} width={28} height={2} fill="#7c5210" />
      {/* straw hands */}
      <path d={`M26 ${GROUND - 21 * s} l-3 2 M26 ${GROUND - 21 * s} l-3 -1`} stroke="#eab308" strokeWidth={1} />
      <path d={`M54 ${GROUND - 21 * s} l3 2 M54 ${GROUND - 21 * s} l3 -1`} stroke="#eab308" strokeWidth={1} />
      {/* shirt */}
      <path d={`M31 ${GROUND - 22 * s} h18 l-2 16 h-14z`} fill={shirt} />
      {v === 'patchwork' && (
        <g fill="#f59e0b">
          <rect x={34} y={GROUND - 18 * s} width={4} height={4} />
          <rect x={42} y={GROUND - 12 * s} width={4} height={4} />
        </g>
      )}
      {/* head */}
      {v === 'pumpkin' ? (
        <g>
          <circle cx={40} cy={headY} r={6 * s} fill="#f97316" />
          <polygon points={`37,${headY} 39,${headY - 2} 41,${headY}`} fill="#1c1c1e" />
          <polygon points={`39,${headY} 41,${headY - 2} 43,${headY}`} fill="#1c1c1e" />
          <path d={`M36 ${headY + 2} q4 3 8 0`} stroke="#1c1c1e" strokeWidth={1} fill="none" />
        </g>
      ) : (
        <g>
          <circle cx={40} cy={headY} r={6 * s} fill="#facc15" />
          <circle cx={37.5} cy={headY - 1} r={0.9} fill="#1c1c1e" />
          <circle cx={42.5} cy={headY - 1} r={0.9} fill="#1c1c1e" />
          <path d={`M37 ${headY + 2.5} q3 2 6 0`} stroke="#1c1c1e" strokeWidth={0.9} fill="none" />
        </g>
      )}
      {/* straw hat brim */}
      <ellipse cx={40} cy={headY - 5 * s} rx={8 * s} ry={2} fill="#ca8a04" />
      <path d={`M${40 - 4 * s} ${headY - 5 * s} q${4 * s} -5 ${8 * s} 0z`} fill="#a16207" />
      {has(cust, 'crow', 'crow') && (
        <g transform={`translate(54 ${GROUND - 23 * s})`}>
          <ellipse cx={0} cy={0} rx={4} ry={2.6} fill="#1f2937" />
          <circle cx={3} cy={-2} r={2} fill="#1f2937" />
          <polygon points="5,-2 8,-1.5 5,-0.5" fill="#f59e0b" />
          <circle cx={3.5} cy={-2.4} r={0.6} fill="#fbbf24" />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={GROUND - 23 * s} x={30} w={20} />}
    </g>
  )
}

const FAIRY_DOOR: Record<string, string> = { acorn: '#92400e', toadstool: '#dc2626', rosewood: '#9d174d' }

function FairyDoor({ variant, cust, stage }: DrawProps) {
  const door = FAIRY_DOOR[variant ?? 'acorn'] ?? '#92400e'
  const s = 1 + 0.12 * stage
  const w = 14 * s
  const h = 22 * s
  const x = 40 - w / 2
  const y = GROUND - h
  return (
    <g>
      {/* tree-base mound */}
      <path d={`M${x - 8} ${GROUND} q${w / 2 + 8} -28 ${w + 16} 0z`} fill="#6b4423" />
      <path d={`M${x - 8} ${GROUND} q${w / 2 + 8} -28 ${w + 16} 0z`} fill="none" stroke="#5a3a1f" strokeWidth={1} />
      {has(cust, 'glow', 'glow') && <ellipse cx={40} cy={y + h / 2} rx={w} ry={h * 0.6} fill="#fde68a" opacity={0.3} />}
      {/* arched door */}
      <path d={`M${x} ${GROUND} v${-h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2}z`} fill={door} />
      <path
        d={`M${x} ${GROUND} v${-h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2}z`}
        fill="none"
        stroke="#3f2410"
        strokeWidth={1}
      />
      {/* planks + knob */}
      <line x1={40} y1={y + 3} x2={40} y2={GROUND} stroke="#3f2410" strokeWidth={0.7} />
      <circle cx={x + w - 3} cy={y + h * 0.6} r={1.2} fill="#fbbf24" />
      {variant === 'toadstool' && (
        <g fill="#fff">
          <circle cx={x + 3} cy={y + 3} r={0.9} />
          <circle cx={x + w - 3} cy={y + 4} r={0.9} />
        </g>
      )}
      {has(cust, 'path', 'path') && (
        <g fill="#cbd5e1">
          <ellipse cx={40} cy={GROUND + 1} rx={3} ry={1.4} />
          <ellipse cx={34} cy={GROUND + 3} rx={2.6} ry={1.2} />
          <ellipse cx={46} cy={GROUND + 3} rx={2.6} ry={1.2} />
        </g>
      )}
    </g>
  )
}

const HAMMOCK_CLOTH: Record<string, string> = { striped: '#f97316', canvas: '#d6c1a8', rainbow: '#a855f7' }

function Hammock({ variant, cust, stage }: DrawProps) {
  const cloth = HAMMOCK_CLOTH[variant ?? 'striped'] ?? '#f97316'
  const s = 1 + 0.12 * stage
  const postY = GROUND - 26 * s
  const sag = GROUND - 8
  return (
    <g>
      {/* two posts */}
      <rect x={20} y={postY} width={2.4} height={GROUND - postY} fill="#7c5210" />
      <rect x={57.6} y={postY} width={2.4} height={GROUND - postY} fill="#7c5210" />
      {/* the hammock sling */}
      <path d={`M21 ${postY + 2} Q40 ${sag + 10} 59 ${postY + 2}`} fill="none" stroke={cloth} strokeWidth={6 * s} strokeLinecap="round" />
      {variant === 'striped' && (
        <path d={`M21 ${postY + 2} Q40 ${sag + 10} 59 ${postY + 2}`} fill="none" stroke="#fff" strokeWidth={1.4} strokeDasharray="3 4" />
      )}
      {variant === 'rainbow' && (
        <path d={`M21 ${postY + 4} Q40 ${sag + 12} 59 ${postY + 4}`} fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.8} />
      )}
      {/* ropes */}
      <line x1={22} y1={postY + 2} x2={26} y2={postY + 5} stroke="#a8a29e" strokeWidth={0.8} />
      <line x1={58} y1={postY + 2} x2={54} y2={postY + 5} stroke="#a8a29e" strokeWidth={0.8} />
      {has(cust, 'occupant', 'cat') && (
        <g>
          <ellipse cx={40} cy={sag + 2} rx={6} ry={2.6} fill="#9ca3af" />
          <circle cx={45} cy={sag} r={2.4} fill="#9ca3af" />
          <polygon points="44,-1 43,-3 46,-2" transform={`translate(0 ${sag + 1})`} fill="#9ca3af" />
        </g>
      )}
      {has(cust, 'occupant', 'napper') && (
        <g>
          <ellipse cx={40} cy={sag + 2} rx={9} ry={2.8} fill="#60a5fa" />
          <circle cx={49} cy={sag + 1} r={3} fill="#f5d0b0" />
          <text x={33} y={sag - 3} fontSize="5" fill="#94a3b8">z</text>
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={postY} x={22} w={36} />}
    </g>
  )
}

const TEACART_BODY: Record<string, string> = { rose: '#fb7185', mint: '#5eead4', midnight: '#475569' }

function TeaCart({ variant, cust, stage }: DrawProps) {
  const body = TEACART_BODY[variant ?? 'rose'] ?? '#fb7185'
  const s = 1 + 0.12 * stage
  const w = 30 * s
  const x = 40 - w / 2
  const topY = GROUND - 22 * s
  return (
    <g>
      {/* frame + two tiers */}
      <rect x={x} y={topY} width={w} height={2.6} rx={1} fill={body} />
      <rect x={x} y={topY + 10} width={w} height={2.6} rx={1} fill={body} />
      <rect x={x + 1} y={topY} width={2} height={GROUND - 4 - topY} fill="#9ca3af" />
      <rect x={x + w - 3} y={topY} width={2} height={GROUND - 4 - topY} fill="#9ca3af" />
      {/* teapot on top */}
      <ellipse cx={40} cy={topY - 2} rx={5} ry={4} fill="#f8fafc" stroke={body} strokeWidth={1} />
      <path d={`M45 ${topY - 3} q4 0 3 3`} stroke={body} strokeWidth={1.2} fill="none" />
      <rect x={38.5} y={topY - 8} width={3} height={2} rx={1} fill={body} />
      {/* tiny cakes on the lower tier */}
      <rect x={x + 5} y={topY + 6} width={3} height={3} rx={0.6} fill="#fbcfe8" />
      <rect x={x + 11} y={topY + 6} width={3} height={3} rx={0.6} fill="#fde68a" />
      <rect x={x + w - 8} y={topY + 6} width={3} height={3} rx={0.6} fill="#bbf7d0" />
      {/* wheels */}
      <circle cx={x + 4} cy={GROUND - 3} r={3} fill="#1f2937" />
      <circle cx={x + w - 4} cy={GROUND - 3} r={3} fill="#1f2937" />
      {has(cust, 'cat', 'cat') && (
        <g>
          <ellipse cx={x - 3} cy={GROUND - 4} rx={4} ry={2.4} fill="#9ca3af" />
          <circle cx={x - 6} cy={GROUND - 6} r={2.2} fill="#9ca3af" />
          <polygon points="-8,-8 -7,-10 -5,-8" transform={`translate(${x} ${GROUND})`} fill="#9ca3af" />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={topY - 2} x={x} w={w} />}
    </g>
  )
}

type Renderer = (props: DrawProps) => JSX.Element

const RENDERERS: Record<string, Renderer> = {
  tree: Tree,
  flower: Flower,
  mushroom_ring: MushroomRing,
  pond: Pond,
  hut: (p) => <Building {...p} defaultColor="#d4a373" roof="#7c3f25" baseW={24} />,
  barn: (p) => <Building {...p} defaultColor="#b91c1c" roof="#7f1d1d" baseW={32} />,
  cottage: (p) => <Building {...p} defaultColor="#eaddc7" roof="#8a5a3b" baseW={28} />,
  beach_house: BeachHouse,
  car: Car,
  boat: Boat,
  bird: Bird,
  goldfish: Goldfish,
  cat: Cat,
  snake: Snake,
  fox: Fox,
  hedgehog: Hedgehog,
  snail: Snail,
  dog: Dog,
  garden_gnome: Gnome,
  wind_chime: WindChime,
  lantern: Lantern,
  frog_lily: FrogLily,
  scarecrow: Scarecrow,
  fairy_door: FairyDoor,
  hammock: Hammock,
  tea_cart: TeaCart,
}

// Items are drawn from their chosen variant + purchased customizations (each a real
// visual change). No more tier ladder — personalization is mix-and-match.
function SanctuaryPlant({
  itemKey,
  variant = null,
  customizations,
}: {
  itemKey: string
  variant?: string | null
  customizations?: Record<string, string>
}) {
  const Render = RENDERERS[itemKey]
  const cust = customizations ?? {}
  const stage = growthStage(cust)
  const label = `${itemLabel(itemKey)}${variant ? ` (${variantLabel(variant)})` : ''}`
  return (
    <svg className="sanctuary-svg" viewBox="0 0 80 80" role="img" aria-label={label}>
      <ellipse cx={40} cy={72} rx={24} ry={4} fill="#dcfce7" />
      {Render ? (
        <Render variant={variant} cust={cust} stage={stage} />
      ) : (
        <circle cx={40} cy={50} r={6} fill="#cbd5e1" />
      )}
    </svg>
  )
}

// Custom comparator: `customizations` is a plain object that may be a fresh reference on
// every render (the parent rebuilds the owned-grid inline). Compare by value so the memo
// bail-out fires correctly — a plant only re-renders when its data actually changes.
function arePlantsEqual(
  prev: Readonly<{ itemKey: string; variant?: string | null; customizations?: Record<string, string> }>,
  next: Readonly<{ itemKey: string; variant?: string | null; customizations?: Record<string, string> }>,
): boolean {
  if (prev.itemKey !== next.itemKey || prev.variant !== next.variant) return false
  const pc = prev.customizations ?? {}
  const nc = next.customizations ?? {}
  const keys = new Set([...Object.keys(pc), ...Object.keys(nc)])
  for (const k of keys) {
    if (pc[k] !== nc[k]) return false
  }
  return true
}

export default memo(SanctuaryPlant, arePlantsEqual)
