// Procedural SVG render of a Sanctuary item. Each item is drawn from a chosen `variant`
// (a base form — a tree species, a dog breed, a wall color) plus a set of purchased
// `customizations` ({slot: option}), each of which makes a *real* visual change (fruit on
// a tree, a hat on a pet, lilies on a pond, smoke from a chimney). The backend owns what
// was bought; this owns rendering. viewBox is 0 0 80 80, in the existing flat style.

import { memo } from 'react'
import { itemLabel, variantLabel, GROWTH_STAGES } from '../lib/sanctuaryArt'

const GROUND = 70

type Cust = Record<string, string>

// The `grown` slot is a sequential growth ladder (shared GROWTH_STAGES, mirroring the backend):
// each option keys a stage that renders visibly larger and lusher than the last. Stage 0 is the
// un-grown base; stages 1–5 are grown → flourishing → mature → ancient → venerable. The first
// rung is keyed literally "grown" for backward-compat, so a legacy {"grown":"grown"} row maps to
// stage 1. The fifth rung (venerable, ADR-0021) is a pure addition above the original four.
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
  const form = cust.form
  // The evolution fork (ADR-0021) reshapes the home's silhouette and palette. `grand_manor` /
  // `heritage` read as a broader, statelier building; `enchanted` / `festival` recolour it.
  const grand = form === 'grand_manor' || form === 'heritage'
  const color =
    form === 'enchanted'
      ? '#a78bfa'
      : form === 'festival'
        ? '#fb7185'
        : form === 'hermitage'
          ? '#b8b0a4' // austere stone walls
          : (variant && WALL_COLORS[variant]) || defaultColor
  const roofColor =
    form === 'enchanted'
      ? '#7c3aed'
      : form === 'festival'
        ? '#be185d'
        : form === 'hermitage'
          ? '#8a8175' // weathered slate
          : form === 'thatched'
            ? '#c79a45' // straw thatch
            : roof
  // `cosy` reads as a warm, lit home: its front window always glows even without the lights slot.
  const cosyWindow = form === 'cosy' ? '#fde68a' : null
  // The footprint widens a little and the walls climb with each stage, so a "mature" home
  // reads as a taller, broader cottage — an added upper window appears from `flourishing`.
  const k = 0.92 + 0.1 * stage
  const wallH = (22 + 2 * stage) * Math.min(k, 1.2)
  const wallY = GROUND - wallH
  const w = baseW * (0.92 + 0.05 * stage) * (grand ? 1.18 : 1)
  const x = 40 - w / 2
  const cx = 40
  const litWindow = cosyWindow ?? (has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd')
  const roofPeak = wallY - (grand ? 20 : 16)
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 3} />}
      {/* treehouse form: a stout trunk + bough the cabin perches on */}
      {form === 'treehouse' && (
        <g>
          <rect x={37} y={wallY} width={6} height={GROUND - wallY} fill="#8b5a2b" />
          <path d={`M40 ${wallY + 4} q-9 -2 -13 -7`} stroke="#15803d" strokeWidth={4} fill="none" strokeLinecap="round" />
          <circle cx={26} cy={wallY - 5} r={6} fill="#22c55e" />
        </g>
      )}
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      <polygon points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${roofPeak}`} fill={roofColor} />
      {/* thatched form: a rounded, overhanging straw roof drawn over the gable, with combed
          thatch-texture lines so it reads as soft straw rather than a hard-edged roof */}
      {form === 'thatched' && (
        <g>
          <path
            d={`M${x - 3} ${wallY + 1} Q${cx} ${roofPeak - 5} ${x + w + 3} ${wallY + 1} Q${cx} ${wallY + 4} ${x - 3} ${wallY + 1} Z`}
            fill={roofColor}
          />
          <g stroke="#9c7526" strokeWidth={0.6} opacity={0.6} strokeLinecap="round">
            <path d={`M${x + 2} ${wallY} q${w / 2 - 2} -7 ${w - 4} 0`} fill="none" />
            <path d={`M${x + 6} ${wallY - 2.5} q${w / 2 - 6} -5 ${w - 12} 0`} fill="none" />
          </g>
        </g>
      )}
      {/* hermitage form: an austere stone home — a single recessed window, no decorative trim */}
      {form === 'hermitage' && (
        <g stroke="#8a8175" strokeWidth={0.6} opacity={0.5}>
          <line x1={x} y1={wallY + wallH / 2} x2={x + w} y2={wallY + wallH / 2} />
          <line x1={cx} y1={wallY} x2={cx} y2={GROUND} />
        </g>
      )}
      {/* enchanted form: a toadstool-cap roof with white spots */}
      {form === 'enchanted' && (
        <g fill="#fff">
          <circle cx={cx - 4} cy={wallY - 5} r={1.1} />
          <circle cx={cx + 4} cy={wallY - 5} r={1.1} />
          <circle cx={cx} cy={wallY - 9} r={1} />
        </g>
      )}
      {/* heritage / grand_manor: a stately second gable wing */}
      {grand && (
        <polygon
          points={`${x + w - 8},${wallY} ${x + w + 4},${wallY} ${x + w - 2},${wallY - 9}`}
          fill={roofColor}
        />
      )}
      {/* festival form: a string of bright pennant flags along the ridge */}
      {form === 'festival' &&
        [-8, -3, 2, 7].map((dx, i) => (
          <polygon
            key={dx}
            points={`${cx + dx},${roofPeak + (Math.abs(dx) / 2)} ${cx + dx + 3},${roofPeak + (Math.abs(dx) / 2)} ${cx + dx + 1.5},${roofPeak + 3 + (Math.abs(dx) / 2)}`}
            fill={['#fbbf24', '#34d399', '#60a5fa', '#f472b6'][i % 4]}
          />
        ))}
      {/* door */}
      <rect x={cx - 3} y={GROUND - 11} width={6} height={11} fill={roofColor} />
      {/* cosy form: a little evergreen wreath hung on the door + a curl of chimney smoke, so a
          warm-lit cottage reads even before any slots are bought */}
      {form === 'cosy' && (
        <g>
          <circle cx={cx} cy={GROUND - 8} r={2.2} fill="none" stroke="#15803d" strokeWidth={1.2} />
          <circle cx={cx} cy={GROUND - 9.8} r={0.7} fill="#ef4444" />
          <rect x={x + w - 7} y={wallY - 11} width={3.5} height={7} fill={roofColor} />
          <Smoke x={x + w - 5.3} y={wallY - 13} />
        </g>
      )}
      {/* window — hermitage keeps a single austere window; cosy's glows warm */}
      <rect x={x + 4} y={wallY + 5} width={6} height={6} fill={litWindow} />
      {/* a second ground-floor window appears once the home has grown a bit wider (not the
          austere hermitage, which stays single-windowed at every stage) */}
      {stage >= 2 && form !== 'hermitage' && <rect x={x + w - 10} y={wallY + 5} width={6} height={6} fill={litWindow} />}
      {/* an upper-storey window in the gable on the maturest stages */}
      {stage >= 3 && form !== 'hermitage' && <rect x={cx - 2.5} y={wallY - 11} width={5} height={5} fill={litWindow} />}
      {/* working_farm form: an open barn door (dark interior + hay loft hatch), a round hay
          bale, and a low paddock fence — a barn that's clearly in use */}
      {form === 'working_farm' && (
        <g>
          {/* open hay-loft hatch in the gable */}
          <rect x={cx - 2.5} y={wallY - 9} width={5} height={5} fill="#3f2d18" />
          {/* open door — dark interior showing through the wide front opening */}
          <rect x={cx - 4} y={GROUND - 13} width={8} height={13} fill="#2a1d10" />
          <rect x={cx - 4} y={GROUND - 13} width={1.4} height={13} fill={roofColor} />
          <rect x={cx + 2.6} y={GROUND - 13} width={1.4} height={13} fill={roofColor} />
          {/* a round hay bale to one side */}
          <g transform={`translate(${x + w + 5} ${GROUND - 4})`}>
            <ellipse cx={0} cy={0} rx={4} ry={3.4} fill="#e0b35a" />
            <path d="M-4 0 q4 -2 8 0" stroke="#b8862f" strokeWidth={0.6} fill="none" opacity={0.7} />
          </g>
          {/* low paddock fence */}
          <g stroke="#a1672e" strokeWidth={1.3} strokeLinecap="round">
            <line x1={x - 8} y1={GROUND} x2={x - 8} y2={GROUND - 6} />
            <line x1={x - 2} y1={GROUND} x2={x - 2} y2={GROUND - 6} />
            <line x1={x - 9} y1={GROUND - 5} x2={x - 1} y2={GROUND - 5} />
            <line x1={x - 9} y1={GROUND - 2.5} x2={x - 1} y2={GROUND - 2.5} />
          </g>
        </g>
      )}
      {/* venerable (stage 5): a grown-over, ivy-creased home — a moss-streaked roof, a third
          dormer window, and a weathered cornerstone — reads distinctly older than `ancient`. */}
      {stage >= 5 && (
        <g>
          <path d={`M${x - 2} ${wallY} q${w / 2 + 2} 5 ${w + 4} 0`} stroke="#4d7c0f" strokeWidth={1.4} fill="none" opacity={0.7} />
          <rect x={cx + 5} y={wallY + 5} width={5} height={5} fill={litWindow} />
          <rect x={x} y={GROUND - 7} width={2.5} height={7} fill="#94a3b8" opacity={0.8} />
        </g>
      )}
      {has(cust, 'chimney_smoke', 'smoke') && (
        <g>
          <rect x={x + w - 7} y={wallY - 12} width={4} height={8} fill={roofColor} />
          <Smoke x={x + w - 5} y={wallY - 14} />
        </g>
      )}
      {/* window_box slot (ADR-0021): a planter of flowers or herbs under the front window */}
      {has(cust, 'window_box', 'flowers') && (
        <g>
          <rect x={x + 3} y={wallY + 11} width={8} height={2.4} rx={0.6} fill="#7c5210" />
          <circle cx={x + 4.5} cy={wallY + 11} r={1.4} fill="#f472b6" />
          <circle cx={x + 7} cy={wallY + 10.5} r={1.4} fill="#fbbf24" />
          <circle cx={x + 9.5} cy={wallY + 11} r={1.4} fill="#a78bfa" />
        </g>
      )}
      {has(cust, 'window_box', 'herbs') && (
        <g>
          <rect x={x + 3} y={wallY + 11} width={8} height={2.4} rx={0.6} fill="#7c5210" />
          {[4.5, 7, 9.5].map((dx) => (
            <path key={dx} d={`M${x + dx} ${wallY + 11} q-1 -3 0 -4 q1 1 0 4`} fill="#4ade80" />
          ))}
        </g>
      )}
      {/* ivy slot: climbing vines up one wall */}
      {has(cust, 'ivy', 'ivy') && (
        <g>
          <path
            d={`M${x + 2} ${GROUND} q3 -${wallH * 0.5} 1 -${wallH}`}
            stroke="#15803d"
            strokeWidth={1.4}
            fill="none"
          />
          {[0.25, 0.5, 0.75].map((f) => (
            <circle key={f} cx={x + 2 + 2 * Math.sin(f * 9)} cy={GROUND - wallH * f} r={1.8} fill="#22c55e" />
          ))}
        </g>
      )}
      {/* weathervane slot: a little rooster vane on the ridge */}
      {has(cust, 'weathervane', 'rooster') && (
        <g stroke="#475569" strokeWidth={0.7}>
          <line x1={cx} y1={roofPeak} x2={cx} y2={roofPeak - 7} />
          <g transform={`translate(${cx} ${roofPeak - 7})`} fill="#1f2937" stroke="none">
            <ellipse cx={1} cy={0} rx={2.4} ry={1.6} />
            <circle cx={3} cy={-1.2} r={1.2} />
            <polygon points="4,-1.2 5.6,-0.8 4,-0.4" fill="#ef4444" />
            <polygon points="-1.4,0.4 -3.6,1.4 -1.4,1.6" />
          </g>
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={wallY - 1} x={x} w={w} />}
    </g>
  )
}

const CAR_COLORS: Record<string, string> = { red: '#ef4444', blue: '#3b82f6', yellow: '#eab308' }

function Car({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  // Evolution fork (ADR-0021): `vintage` is a sleeker, deeper-toned roadster; `camper` is a
  // taller boxy van with a pop-top — each reshapes the body silhouette.
  const color =
    form === 'vintage' ? '#7f1d1d' : (variant && CAR_COLORS[variant]) || '#ef4444'
  const k = 0.9 + 0.08 * stage
  const w = 36 * k
  const x = 40 - w / 2
  const bodyY = 58
  if (form === 'camper') {
    // A boxy camper van: a tall body with a window band and a pop-top roof.
    const vanH = 18
    const vanY = 64 - vanH
    return (
      <g>
        <rect x={x} y={vanY} width={w} height={vanH} rx={3} fill={(variant && CAR_COLORS[variant]) || '#f1f5f9'} />
        <rect x={x} y={vanY + 5} width={w} height={4} fill="#bfdbfe" />
        {/* pop-top */}
        <rect x={x + 4} y={vanY - 4} width={w - 8} height={4.5} rx={1.5} fill="#e2e8f0" />
        <rect x={x + 6} y={vanY + 11} width={5} height={5} fill="#fbbf24" />
        <circle cx={x + w * 0.25} cy={66} r={3.5} fill="#1f2937" />
        <circle cx={x + w * 0.75} cy={66} r={3.5} fill="#1f2937" />
        {stage >= 5 && <path d={`M${x} ${vanY - 1} h${w}`} stroke="#4d7c0f" strokeWidth={1.2} opacity={0.6} />}
        {has(cust, 'flag', 'pennant') && (
          <g>
            <line x1={x + w} y1={vanY - 4} x2={x + w} y2={vanY - 12} stroke="#475569" strokeWidth={0.7} />
            <polygon points={`${x + w},${vanY - 12} ${x + w + 6},${vanY - 10.5} ${x + w},${vanY - 9}`} fill="#f472b6" />
          </g>
        )}
        {has(cust, 'lights', 'lights') && (
          <>
            <circle cx={x + w - 1} cy={62} r={1.6} fill="#fde68a" />
            <circle cx={x + 1} cy={62} r={1.6} fill="#f87171" />
          </>
        )}
      </g>
    )
  }
  return (
    <g>
      <path d={`M${x + 8} ${bodyY} q4 -9 12 -9 q8 0 10 9 z`} fill={color} />
      <path d={`M${x + 11} ${bodyY - 1} q3 -5 8 -5 q5 0 7 5 z`} fill="#bfdbfe" />
      <rect x={x} y={bodyY} width={w} height={8} rx={3} fill={color} />
      {/* vintage form: a chrome running-board stripe + round headlamp */}
      {form === 'vintage' && (
        <g>
          <rect x={x} y={bodyY + 5} width={w} height={1.4} fill="#e2e8f0" />
          <circle cx={x + w - 2} cy={bodyY + 2} r={1.6} fill="#fde68a" stroke="#94a3b8" strokeWidth={0.4} />
        </g>
      )}
      {/* a roof rack with a little luggage appears as the car is "kitted out" over stages */}
      {stage >= 2 && (
        <g>
          <rect x={x + 11} y={bodyY - 11} width={14} height={1.6} rx={0.8} fill="#475569" />
          {stage >= 3 && <rect x={x + 13} y={bodyY - 14} width={9} height={3.4} rx={1} fill="#a16207" />}
        </g>
      )}
      {/* venerable (stage 5): a roof-top travel trunk + a curl of road dust — well-travelled */}
      {stage >= 5 && (
        <g>
          <rect x={x + 13} y={bodyY - 18} width={9} height={4} rx={1} fill="#7c3f25" stroke="#5a3a1f" strokeWidth={0.5} />
          <g fill="#cbd5e1" opacity={0.6}>
            <circle cx={x - 2} cy={65} r={1.6} />
            <circle cx={x - 5} cy={64} r={1.2} />
          </g>
        </g>
      )}
      <circle cx={x + w * 0.25} cy={66} r={3.5} fill="#1f2937" />
      <circle cx={x + w * 0.75} cy={66} r={3.5} fill="#1f2937" />
      {/* flag slot (ADR-0021): a pennant flag flying from the aerial */}
      {has(cust, 'flag', 'pennant') && (
        <g>
          <line x1={x + w - 3} y1={bodyY - 9} x2={x + w - 3} y2={bodyY - 18} stroke="#475569" strokeWidth={0.7} />
          <polygon
            points={`${x + w - 3},${bodyY - 18} ${x + w + 4},${bodyY - 16.5} ${x + w - 3},${bodyY - 15}`}
            fill="#f472b6"
          />
        </g>
      )}
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
  const form = cust.form
  // Evolution fork (ADR-0021): `lighthouse_keeper` raises a striped tower beside the cottage;
  // `stilt_house` lifts the whole house on tall stilts over the sand; `cabana` lightens it to
  // an airy striped beach hut.
  const color =
    form === 'cabana' ? '#fef9c3' : (variant && WALL_COLORS[variant]) || '#f1f5f9'
  const k = 0.92 + 0.09 * stage
  const wallH = (18 + 2 * stage) * Math.min(k, 1.18)
  const stilt = form === 'stilt_house'
  const deck = GROUND - 6 - (stilt ? 8 : 0)
  const wallY = deck - wallH
  const w = 22 + 2 * stage
  const x = 40 - w / 2
  const cx = x + w / 2
  const litWindow = has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd'
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 2} />}
      {/* stilt_house form: tall stilts lift the house, with cross-bracing */}
      {stilt ? (
        <g stroke="#a87b50" strokeWidth={2.4}>
          <line x1={x + 3} y1={deck} x2={x + 3} y2={GROUND} />
          <line x1={x + w - 3} y1={deck} x2={x + w - 3} y2={GROUND} />
          <line x1={x + 3} y1={deck + 4} x2={x + w - 3} y2={GROUND - 2} strokeWidth={1} />
        </g>
      ) : (
        <>
          <rect x={x + 2} y={deck} width={3} height={6} fill="#a87b50" />
          <rect x={x + w - 5} y={deck} width={3} height={6} fill="#a87b50" />
        </>
      )}
      {/* lighthouse_keeper form: a red-white banded tower with a lamp room */}
      {form === 'lighthouse_keeper' && (
        <g>
          <rect x={x + w - 1} y={wallY - 14} width={7} height={wallH + 14} fill="#f1f5f9" />
          <rect x={x + w - 1} y={wallY - 14} width={7} height={5} fill="#dc2626" />
          <rect x={x + w - 1} y={wallY - 2} width={7} height={5} fill="#dc2626" />
          <rect x={x + w - 1.5} y={wallY - 18} width={8} height={4} rx={1} fill="#fde68a" />
        </g>
      )}
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      {/* cabana stripes */}
      {form === 'cabana' &&
        [0, 2, 4].map((i) => (
          <rect key={i} x={x} y={wallY + 2 + i * (wallH / 3)} width={w} height={wallH / 6} fill="#38bdf8" opacity={0.5} />
        ))}
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
      {/* venerable (stage 5): a weathered, sun-bleached look — a driftwood gull-perch finial,
          a third porthole window, and sea-grass tufts at the base — older than `ancient`. */}
      {stage >= 5 && (
        <g>
          <circle cx={cx} cy={wallY + 9} r={2.4} fill="none" stroke="#0ea5e9" strokeWidth={1} />
          <line x1={cx} y1={wallY - 14} x2={cx} y2={wallY - 18} stroke="#a87b50" strokeWidth={1} />
          <g stroke="#65a30d" strokeWidth={1} strokeLinecap="round">
            <line x1={x - 2} y1={GROUND} x2={x - 3} y2={GROUND - 4} />
            <line x1={x} y1={GROUND} x2={x + 1} y2={GROUND - 5} />
          </g>
        </g>
      )}
      {/* bunting slot (ADR-0021): a string of triangular flags strung along the eave */}
      {has(cust, 'bunting', 'bunting') && (
        <g>
          <path d={`M${x - 1} ${wallY + 1} q${w / 2} 4 ${w + 2} 0`} stroke="#94a3b8" strokeWidth={0.5} fill="none" />
          {[0.15, 0.38, 0.62, 0.85].map((f, i) => {
            const fx = x - 1 + f * (w + 2)
            const fy = wallY + 1 + Math.sin(f * Math.PI) * 4
            return (
              <polygon
                key={f}
                points={`${fx - 1.6},${fy} ${fx + 1.6},${fy} ${fx},${fy + 3}`}
                fill={['#f87171', '#fbbf24', '#34d399', '#60a5fa'][i % 4]}
              />
            )
          })}
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={wallY - 1} x={x} w={w} />}
    </g>
  )
}

function Boat({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const hull = variant === 'white' ? '#e2e8f0' : '#a16207'
  const k = 0.9 + 0.1 * stage
  // Evolution fork (ADR-0021): `sailboat` raises a tall second mast of full sails;
  // `fishing_boat` is a stout trawler with a cabin + a hauling net instead of big sails.
  const sailH = 22 * k * (form === 'sailboat' ? 1.25 : 1)
  if (form === 'fishing_boat') {
    return (
      <g>
        <ellipse cx={40} cy={68} rx={22} ry={5} fill="#bae6fd" />
        <path d="M25 60 L55 60 L49 68 L31 68 Z" fill={hull} />
        {/* wheelhouse cabin */}
        <rect x={34} y={50} width={12} height={10} rx={1} fill="#f1f5f9" />
        <rect x={36} y={52} width={3} height={3} fill="#bae6fd" />
        <rect x={41} y={52} width={3} height={3} fill="#bae6fd" />
        {/* a short mast with a hauling-net derrick */}
        <rect x={47} y={42} width={1.6} height={18} fill="#7c5210" />
        <line x1={47.8} y1={44} x2={56} y2={56} stroke="#7c5210" strokeWidth={1} />
        <path d="M52 54 q2 4 4 2" stroke="#94a3b8" strokeWidth={0.6} fill="none" />
        {stage >= 5 && <ellipse cx={28} cy={59} rx={2.4} ry={1} fill="#cbd5e1" opacity={0.7} />}
        {has(cust, 'pennant', 'pennant') && (
          <g>
            <line x1={47.8} y1={42} x2={47.8} y2={36} stroke="#475569" strokeWidth={0.6} />
            <polygon points="47.8,36 54,37.2 47.8,38.4" fill="#fb7185" />
          </g>
        )}
        {has(cust, 'lights', 'lights') && (
          <>
            <circle cx={30} cy={58} r={1.3} fill="#fbbf24" />
            <circle cx={50} cy={58} r={1.3} fill="#fbbf24" />
          </>
        )}
      </g>
    )
  }
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
      {/* sailboat form: a second taller mast + full mainsail abaft, a proper tall ship */}
      {form === 'sailboat' && (
        <g>
          <rect x={45} y={61 - sailH * 0.85} width={1.6} height={sailH * 0.85} fill="#7c5210" />
          <polygon points={`45.8,${61 - sailH * 0.85 + 2} 45.8,60 36,60`} fill="#f8fafc" />
        </g>
      )}
      {/* venerable (stage 5): a sun-faded sail (a patched seam) + a gentle wake — well-sailed */}
      {stage >= 5 && (
        <g>
          <line x1={42} y1={61 - sailH + 8} x2={50} y2={59.6} stroke="#cbd5e1" strokeWidth={0.6} />
          <path d="M18 67 q4 -2 8 0" stroke="#7dd3fc" strokeWidth={1} fill="none" opacity={0.7} />
        </g>
      )}
      {/* pennant slot (ADR-0021): a pennant streaming from the masthead */}
      {has(cust, 'pennant', 'pennant') && (
        <g>
          <polygon
            points={`41,${61 - sailH} 48,${61 - sailH + 1.6} 41,${61 - sailH + 3.2}`}
            fill="#f472b6"
          />
        </g>
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

// The companion `toy` slot (ADR-0021): one small plaything set on the ground beside the
// character at (x, y). Independent of the dress-up slots above, so a pet can wear a hat AND
// have a ball. Each option draws a distinct little prop; unknown options draw nothing.
function Toy({ cust, x, y }: { cust: Cust; x: number; y: number }) {
  const toy = cust.toy
  if (toy === 'ball') {
    return (
      <g>
        <circle cx={x} cy={y} r={3} fill="#ef4444" />
        <path d={`M${x - 3} ${y} q3 -2 6 0`} stroke="#fff" strokeWidth={0.6} fill="none" />
        <path d={`M${x - 3} ${y} q3 2 6 0`} stroke="#fff" strokeWidth={0.6} fill="none" />
      </g>
    )
  }
  if (toy === 'stick') {
    return <rect x={x - 4} y={y} width={9} height={2} rx={1} fill="#a16207" transform={`rotate(-12 ${x} ${y})`} />
  }
  if (toy === 'bone') {
    return (
      <g fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.4}>
        <circle cx={x - 3} cy={y - 1} r={1.4} />
        <circle cx={x - 3} cy={y + 1} r={1.4} />
        <circle cx={x + 3} cy={y - 1} r={1.4} />
        <circle cx={x + 3} cy={y + 1} r={1.4} />
        <rect x={x - 3} y={y - 1} width={6} height={2} />
      </g>
    )
  }
  if (toy === 'yarn') {
    return (
      <g>
        <circle cx={x} cy={y} r={3} fill="#f472b6" />
        <path d={`M${x - 2.6} ${y - 1.4} q5 1 5 2.8 M${x - 2.8} ${y + 1} q4 -1 5.4 -2.4`} stroke="#be185d" strokeWidth={0.5} fill="none" />
        <path d={`M${x + 3} ${y} q3 1 1 3`} stroke="#be185d" strokeWidth={0.5} fill="none" />
      </g>
    )
  }
  if (toy === 'feather') {
    return (
      <g>
        <line x1={x - 3} y1={y + 2} x2={x + 2} y2={y - 4} stroke="#a16207" strokeWidth={0.7} />
        <ellipse cx={x + 3} cy={y - 5} rx={1.6} ry={3} fill="#34d399" transform={`rotate(35 ${x + 3} ${y - 5})`} />
      </g>
    )
  }
  if (toy === 'apple') {
    return (
      <g>
        <circle cx={x} cy={y} r={2.6} fill="#dc2626" />
        <rect x={x - 0.3} y={y - 4} width={0.8} height={2} fill="#7c5210" />
        <ellipse cx={x + 1.6} cy={y - 3} rx={1.4} ry={0.8} fill="#16a34a" transform={`rotate(-30 ${x + 1.6} ${y - 3})`} />
      </g>
    )
  }
  if (toy === 'leaf_toy') {
    return <path d={`M${x} ${y} q4 -5 8 -2 q-3 4 -8 2z`} fill="#65a30d" />
  }
  if (toy === 'basking_stone') {
    return (
      <g>
        <ellipse cx={x} cy={y + 1} rx={5} ry={2.4} fill="#94a3b8" />
        <ellipse cx={x - 1} cy={y} rx={3} ry={1.6} fill="#cbd5e1" />
      </g>
    )
  }
  if (toy === 'bell_toy') {
    // A hanging perch-bell on a short string.
    return (
      <g>
        <line x1={x} y1={y - 7} x2={x} y2={y - 2} stroke="#94a3b8" strokeWidth={0.6} />
        <path d={`M${x - 2.4} ${y} q0 -3 2.4 -3 q2.4 0 2.4 3 z`} fill="#fbbf24" stroke="#b45309" strokeWidth={0.4} />
        <circle cx={x} cy={y + 1} r={0.9} fill="#92400e" />
      </g>
    )
  }
  if (toy === 'mirror') {
    return (
      <g>
        <circle cx={x} cy={y} r={3} fill="#bae6fd" stroke="#94a3b8" strokeWidth={1} />
        <path d={`M${x - 1.4} ${y - 1.4} l1.6 1.6`} stroke="#fff" strokeWidth={0.8} />
      </g>
    )
  }
  if (toy === 'bubble_ring') {
    return (
      <g fill="none" stroke="#e0f2fe">
        <circle cx={x} cy={y} r={2.4} strokeWidth={0.8} />
        <circle cx={x + 4} cy={y - 3} r={1.4} strokeWidth={0.7} />
        <circle cx={x - 3} cy={y - 4} r={1} strokeWidth={0.6} />
      </g>
    )
  }
  if (toy === 'treasure') {
    // A tiny sunken treasure chest.
    return (
      <g>
        <rect x={x - 3} y={y - 1} width={6} height={4} rx={0.6} fill="#a16207" />
        <path d={`M${x - 3} ${y - 1} q3 -3 6 0z`} fill="#7c5210" />
        <rect x={x - 0.6} y={y - 1} width={1.2} height={4} fill="#fbbf24" />
      </g>
    )
  }
  return null
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
  const form = cust.form
  // Evolution fork (ADR-0021): `songful` adds little song-notes; `plumed` raises a showy crest;
  // `migratory` tints the plumage to a far-traveller's slate with a rust breast.
  const base = FUR[variant ?? 'bluebird'] ?? '#38bdf8'
  const c = form === 'migratory' ? '#64748b' : base
  const s = 1 + 0.1 * stage
  return (
    <g>
      <ellipse cx={40} cy={67} rx={12} ry={4} fill="#a16207" />
      <ellipse cx={39} cy={58} rx={9 * s} ry={7 * s} fill={c} />
      {/* migratory form: a rust-coloured breast patch of the long-haul traveller */}
      {form === 'migratory' && <ellipse cx={37} cy={60} rx={4} ry={3.4} fill="#c2410c" />}
      <circle cx={47} cy={53} r={4 * s} fill={c} />
      {/* plumed form: a swept-back head crest */}
      {form === 'plumed' && <polygon points="47,49 49,43 51,49" fill="#f59e0b" />}
      <polygon points="50,53 54,52 54,55" fill="#f59e0b" />
      <ellipse cx={37} cy={58} rx={5 * s} ry={4 * s} fill="#0ea5e9" opacity={0.5} />
      {/* a fuller tail fans out as the bird matures */}
      {stage >= 3 && <polygon points={`30,57 ${24 - stage},55 ${24 - stage},61`} fill={c} />}
      {/* venerable (stage 5): a distinguished elder — a broad fanned tail with two long
          tail-streamers, reading visibly grander than `ancient` */}
      {stage >= 5 && (
        <g>
          <polygon points="30,57 19,52 19,62" fill={c} />
          <path d="M22 60 q-6 2 -9 5" stroke={c} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <path d="M22 62 q-6 3 -8 7" stroke={c} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {/* songful form: a couple of song-notes drifting from the beak */}
      {form === 'songful' && (
        <g fill="#fbbf24">
          <circle cx={58} cy={49} r={1.2} />
          <rect x={58.8} y={45} width={0.8} height={4} />
          <circle cx={62} cy={46} r={1} />
          <rect x={62.6} y={42.5} width={0.7} height={3.5} />
        </g>
      )}
      <circle cx={48} cy={52} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={47} headY={53} />
      <Toy cust={cust} x={26} y={64} />
    </g>
  )
}

function Fox({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  // Evolution fork (ADR-0021): `woodland` recolours to a leaf-dappled forest russet, `arctic_form`
  // to a snowy white coat, `fire_kissed` to a deep ember-orange. Each overrides the variant fur.
  const c =
    form === 'woodland'
      ? '#7c5c1e'
      : form === 'arctic_form'
        ? '#e0f2fe'
        : form === 'fire_kissed'
          ? '#c2410c'
          : FUR[variant ?? 'red'] ?? '#ea580c'
  const belly = variant === 'arctic' || form === 'arctic_form' ? '#f1f5f9' : '#fff'
  const s = 1 + 0.1 * stage
  return (
    <g>
      <ellipse cx={40} cy={62} rx={11 * s} ry={8 * s} fill={c} />
      <ellipse cx={51} cy={64} rx={5 * s} ry={3 * s} fill={belly} />
      {/* woodland form: a couple of fallen leaves dappling the coat */}
      {form === 'woodland' &&
        [
          [36, 60],
          [44, 63],
        ].map(([lx, ly], i) => (
          <path key={i} d={`M${lx} ${ly} q3 -3 5 -1 q-2 3 -5 1z`} fill={i ? '#ca8a04' : '#b45309'} />
        ))}
      {/* fire_kissed form: a couple of warm ember sparks rising from the brush */}
      {form === 'fire_kissed' && (
        <g fill="#fbbf24">
          <circle cx={28} cy={58} r={1} />
          <circle cx={26} cy={54} r={0.8} />
        </g>
      )}
      <circle cx={40} cy={50} r={6 * s} fill={c} />
      <polygon points="35,46 33,38 39,44" fill={c} />
      <polygon points="45,46 47,38 41,44" fill={c} />
      <polygon points="40,50 36,52 44,52" fill={belly} />
      {/* venerable (stage 5): a grand silver-tipped brush sweeps out behind — visibly elder */}
      {stage >= 5 && (
        <g>
          <path d="M30 64 q-12 -1 -16 -8" stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" />
          <circle cx={14} cy={56} r={2.4} fill="#f1f5f9" />
        </g>
      )}
      <circle cx={37} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={49} r={1} fill="#1c1c1e" />
      <Wearables cust={cust} headX={40} headY={50} />
      <Toy cust={cust} x={58} y={66} />
    </g>
  )
}

function Cat({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  // Evolution fork (ADR-0021): `mystic` recolours to a deep twilight purple; `lap_cat` and
  // `sleek_hunter` keep the variant fur but reshape the pose (a curled-up loaf vs. a lithe
  // crouch with a longer body).
  const c = form === 'mystic' ? '#7c6aa8' : FUR[variant ?? 'gray'] ?? '#9ca3af'
  const s = 1 + 0.1 * stage
  const bodyRx = (form === 'sleek_hunter' ? 12 : form === 'lap_cat' ? 11 : 10) * s
  const bodyRy = (form === 'lap_cat' ? 7 : 8) * s
  return (
    <g>
      <path d="M50 64 q11 -1 6 -13" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" />
      <ellipse cx={40} cy={62} rx={bodyRx} ry={bodyRy} fill={c} />
      {/* lap_cat form: a curled-up loaf — paws tucked, a soft tail wrapped round the front */}
      {form === 'lap_cat' && (
        <path d="M30 64 q-3 -6 4 -8" stroke={c} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      )}
      {/* sleek_hunter form: a low-crouch shoulder line and a long, low sweeping tail — a lithe,
          ready-to-pounce silhouette rather than a plain seated cat */}
      {form === 'sleek_hunter' && (
        <g>
          <g stroke={c} fill="none" strokeLinecap="round">
            <path d="M50 66 q14 1 17 -5" strokeWidth={2.6} />
            <path d="M31 60 q9 -4 18 0" strokeWidth={1.4} opacity={0.7} />
          </g>
          {/* tall, pricked, alert ears */}
          <polygon points="36,45 33,34 39,43" fill={c} />
          <polygon points="44,45 47,34 41,43" fill={c} />
        </g>
      )}
      <circle cx={40} cy={50} r={6 * s} fill={c} />
      <polygon points="36,46 34,37 39,44" fill={c} />
      <polygon points="44,46 46,37 41,44" fill={c} />
      <polygon points="37,45 36,40 39,44" fill="#f9a8d4" />
      <polygon points="43,45 44,40 41,44" fill="#f9a8d4" />
      <polygon points="40,51 38,53 42,53" fill="#6b7280" />
      {/* mystic form: a small third-eye gem on the brow + a faint aura */}
      {form === 'mystic' && (
        <g>
          <circle cx={40} cy={50} r={8 * s} fill="#a78bfa" opacity={0.18} />
          <polygon points="40,45 41.4,46.6 40,48.2 38.6,46.6" fill="#c4b5fd" />
        </g>
      )}
      <circle cx={37} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={49} r={1} fill="#1c1c1e" />
      {/* venerable (stage 5): a grand elder cat — long whiskers + a luxuriant high-curled tail */}
      {stage >= 5 && (
        <g>
          <path d="M50 64 q14 -2 7 -16" stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <g stroke="#cbd5e1" strokeWidth={0.5}>
            <line x1={34} y1={50} x2={27} y2={48} />
            <line x1={34} y1={52} x2={27} y2={53} />
          </g>
        </g>
      )}
      <Wearables cust={cust} headX={40} headY={50} />
      <Toy cust={cust} x={58} y={66} />
    </g>
  )
}

function Dog({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const c = FUR[variant ?? 'corgi'] ?? '#a16207'
  const ear = variant === 'husky' ? '#475569' : '#7c3f10'
  const s = 1 + 0.12 * stage
  // Evolution fork (ADR-0021): `playful` lolls its tongue + a bouncy raised tail; `regal` adds a
  // noble cape + a held-high posture; `guardian` adds an alert stance + a watchful collar-badge.
  return (
    <g>
      {/* regal form: a draped cape behind the shoulders */}
      {form === 'regal' && (
        <path d="M30 56 q-6 8 -3 14 q10 -2 13 -2 z" fill="#7c3aed" opacity={0.9} />
      )}
      <path
        d={form === 'playful' ? 'M50 62 q11 -6 8 -16' : 'M50 62 q9 -4 11 -10'}
        stroke={c}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
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
      {/* playful form: a lolling pink tongue */}
      {form === 'playful' && <ellipse cx={40} cy={56} rx={1.4} ry={2.4} fill="#f472b6" />}
      <circle cx={37} cy={48} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={48} r={1} fill="#1c1c1e" />
      {/* guardian form: a small watchful badge on the chest */}
      {form === 'guardian' && (
        <g>
          <circle cx={40} cy={60} r={2} fill="#fbbf24" stroke="#b45309" strokeWidth={0.5} />
          <polygon points="40,58.6 40.6,60 40,61.4 39.4,60" fill="#b45309" />
        </g>
      )}
      {/* venerable (stage 5): a grand grey-muzzled elder — a wise greyed snout + bushy brows */}
      {stage >= 5 && (
        <g>
          <ellipse cx={40} cy={53.5} rx={4} ry={2.4} fill="#e5e7eb" opacity={0.8} />
          <path d="M35 47 q1.5 -1 3 0 M42 47 q1.5 -1 3 0" stroke="#e5e7eb" strokeWidth={1} fill="none" />
        </g>
      )}
      <Wearables cust={cust} headX={40} headY={50} />
      <Toy cust={cust} x={58} y={66} />
    </g>
  )
}

function Goldfish({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const c = FUR[variant ?? 'orange'] ?? '#fb923c'
  const s = 1 + 0.12 * stage
  // Evolution fork (ADR-0021): `fantail` flows a big trailing twin tail; `koi_kissed` adds bold
  // koi blotches over the body.
  const tail = form === 'fantail' ? '#fdba74' : '#f97316'
  return (
    <g>
      <ellipse cx={40} cy={66} rx={16} ry={5} fill="#bae6fd" />
      {/* fantail form: a wide, flowing double tail-fin */}
      {form === 'fantail' ? (
        <g fill={tail} opacity={0.9}>
          <path d="M33 60 q-12 -6 -10 0 q-3 4 10 2z" />
          <path d="M33 61 q-12 2 -11 7 q5 1 11 -4z" />
        </g>
      ) : (
        <polygon points="33,60 25,56 25,64" fill={tail} />
      )}
      <ellipse cx={40} cy={60} rx={9 * s} ry={6 * s} fill={c} />
      {/* koi_kissed form: a couple of bold koi blotches */}
      {form === 'koi_kissed' && (
        <g fill="#1c1c1e" opacity={0.85}>
          <ellipse cx={38} cy={58} rx={2.4} ry={1.8} />
          <ellipse cx={43} cy={62} rx={1.8} ry={1.4} fill="#dc2626" />
        </g>
      )}
      <polygon points="40,55 44,51 46,57" fill="#f97316" />
      {/* venerable (stage 5): a grand old fish — long flowing whisker-barbels + a fuller dorsal */}
      {stage >= 5 && (
        <g>
          <path d="M48 60 q5 1 7 4 M48 61 q5 3 6 6" stroke="#f59e0b" strokeWidth={0.6} fill="none" />
          <path d="M37 54 q3 -4 6 0z" fill="#f97316" />
        </g>
      )}
      <circle cx={45} cy={59} r={1.2} fill="#1c1c1e" />
      <Toy cust={cust} x={30} y={66} />
    </g>
  )
}

function Snake({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const c = FUR[variant ?? 'green'] ?? '#16a34a'
  const s = 1 + 0.13 * stage
  const headwear = cust.headwear ?? (cust.accessory === 'hat' ? 'hat' : undefined)
  // Evolution fork (ADR-0021): `coiled` adds a second neat resting loop; `patterned` lays a row
  // of regal diamond markings along the body.
  return (
    <g fill="none" stroke={c} strokeWidth={4 * s} strokeLinecap="round">
      {/* coiled form: an extra resting loop beneath the body */}
      {form === 'coiled' && <ellipse cx={40} cy={66} rx={15 * s} ry={3.4 * s} opacity={0.85} />}
      <ellipse cx={40} cy={63} rx={12 * s} ry={5 * s} />
      <path d="M40 60 q7 -9 2 -16" />
      {/* patterned form: a line of diamond markings down the back */}
      {form === 'patterned' && (
        <g stroke="none" fill="#facc15">
          {[59, 63, 67].map((cy, i) => (
            <polygon key={i} points={`40,${cy - 2} 42,${cy} 40,${cy + 2} 38,${cy}`} />
          ))}
        </g>
      )}
      <circle cx={41} cy={45} r={3.2 * s} fill={c} stroke="none" />
      <circle cx={42} cy={44} r={0.8} fill="#1c1c1e" stroke="none" />
      <path d="M41 42 L41 38 M41 38 l-1.5 -2 M41 38 l1.5 -2" stroke="#dc2626" strokeWidth={0.7} />
      {/* venerable (stage 5): a venerable old serpent — a third deep coil + a wise brow ridge */}
      {stage >= 5 && (
        <g>
          <ellipse cx={40} cy={68} rx={17 * s} ry={2.6 * s} opacity={0.6} />
          <path d="M37 43 q4 -2 7 0" strokeWidth={1} />
        </g>
      )}
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
      <g stroke="none">
        <Toy cust={cust} x={60} y={66} />
      </g>
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
  const form = cust.form
  const spine = HEDGEHOG_BODY[variant ?? 'brown'] ?? '#92400e'
  const s = 1 + 0.12 * stage
  const face = variant === 'cream' ? '#f5e6d3' : '#e9c9a3'
  // Evolution fork (ADR-0021): `snug` rounds into a tucked-up ball with shorter quills; `forager`
  // dresses the spines with carried autumn leaves.
  const snug = form === 'snug'
  // More quills bristle out as the hedgehog grows up — visibly fuller each stage; the snug ball
  // pulls them shorter and rounder.
  const quillCount = 7 + stage
  const quillTop = (snug ? 60 : 56) - 3 * s
  const spikes = Array.from({ length: quillCount }).map((_, i) => {
    const t = i / (quillCount - 1)
    const bx = 30 + t * 18
    return <polygon key={i} points={`${bx},${64} ${bx + 2.4},${64} ${bx + 1.2},${quillTop}`} fill={spine} />
  })
  return (
    <g>
      <ellipse cx={40} cy={64} rx={(snug ? 11 : 13) * s} ry={(snug ? 8 : 7) * s} fill={spine} />
      {spikes}
      {/* forager form: a couple of autumn leaves caught on the spines */}
      {form === 'forager' &&
        [
          [34, 58, '#ca8a04'],
          [42, 56, '#c2410c'],
        ].map(([lx, ly, fill], i) => (
          <path key={i} d={`M${lx} ${ly} q3 -4 6 -1 q-2 4 -6 1z`} fill={fill as string} />
        ))}
      <ellipse cx={52} cy={64} rx={5 * s} ry={4 * s} fill={face} />
      <circle cx={56} cy={64} r={1.1} fill="#1c1c1e" />
      <circle cx={54} cy={62.5} r={0.9} fill="#1c1c1e" />
      {/* venerable (stage 5): a wise elder — a couple of silvered quills + a brow tuft */}
      {stage >= 5 && (
        <g stroke="#e5e7eb" strokeWidth={0.9} strokeLinecap="round">
          <line x1={36} y1={63} x2={35} y2={quillTop + 1} />
          <line x1={44} y1={63} x2={45} y2={quillTop + 1} />
        </g>
      )}
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
      <Toy cust={cust} x={24} y={66} />
    </g>
  )
}

const SNAIL_SHELL: Record<string, string> = { amber: '#d97706', minty: '#34d399', rosy: '#fb7185' }

function Snail({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  // Evolution fork (ADR-0021): `garden` keeps a tidy mossy garden shell; `jeweled` turns the
  // shell to a faceted gemstone.
  const shell = form === 'jeweled' ? '#a855f7' : SNAIL_SHELL[variant ?? 'amber'] ?? '#d97706'
  const s = 1 + 0.13 * stage
  return (
    <g>
      <path d="M24 66 q4 4 14 3" stroke="#a3e635" strokeWidth={4 * s} fill="none" strokeLinecap="round" />
      <ellipse cx={48} cy={62} rx={9 * s} ry={9 * s} fill={shell} />
      {form === 'jeweled' ? (
        // a faceted gem shell: crossing highlight lines
        <g stroke="#f5d0fe" strokeWidth={0.8} fill="none" opacity={0.9}>
          <path d={`M48 ${62 - 8 * s} L48 ${62 + 8 * s} M${48 - 8 * s} 62 L${48 + 8 * s} 62`} />
          <circle cx={48} cy={62} r={5.5 * s} />
        </g>
      ) : (
        <>
          <ellipse cx={48} cy={62} rx={5.5 * s} ry={5.5 * s} fill="none" stroke="#fff7ed" strokeWidth={1.6} opacity={0.7} />
          <circle cx={48} cy={62} r={2 * s} fill="#fff7ed" opacity={0.7} />
        </>
      )}
      {/* mossy_garden form: a tiny tuft of moss + a flower atop the shell */}
      {form === 'mossy_garden' && (
        <g>
          <ellipse cx={48} cy={62 - 8 * s} rx={3} ry={1.6} fill="#65a30d" />
          <circle cx={48} cy={62 - 9 * s} r={1.4} fill="#f472b6" />
        </g>
      )}
      <path d="M30 56 l-2 -6 M34 56 l1 -6" stroke="#a3e635" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={28} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={35} cy={49} r={1} fill="#1c1c1e" />
      {/* venerable (stage 5): a grand old shell — an extra outer spiral whorl ring */}
      {stage >= 5 && (
        <ellipse cx={48} cy={62} rx={8 * s} ry={8 * s} fill="none" stroke="#fff7ed" strokeWidth={1} opacity={0.5} />
      )}
      {has(cust, 'accessory', 'hat') && (
        <g>
          <rect x={43} y={49} width={10} height={2.2} fill="#1f2937" />
          <rect x={45} y={44} width={6} height={5.5} fill="#1f2937" />
        </g>
      )}
      <Toy cust={cust} x={20} y={67} />
    </g>
  )
}

const GNOME_HAT: Record<string, string> = { classic: '#dc2626', mossy: '#4d7c0f', sleepy: '#3b82f6' }

function Gnome({ variant, cust, stage }: DrawProps) {
  const v = variant ?? 'classic'
  const form = cust.form
  // The wizardly form trades the red cap for a deep-violet star hat; the others keep variant hue.
  const hat = form === 'wizardly' ? '#6d28d9' : GNOME_HAT[v] ?? '#dc2626'
  const coat = form === 'wizardly' ? '#4338ca' : '#2563eb'
  const s = 1 + 0.12 * stage
  const cx = 40
  const bodyY = GROUND - 18 * s
  const hatTip = bodyY - 18 * s
  return (
    <g>
      {has(cust, 'companion', 'snail') && (
        <g>
          <ellipse cx={58} cy={68} rx={4} ry={3.4} fill="#d97706" />
          <path d="M52 69 q2 2 4 1" stroke="#a3e635" strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {/* wandering form: a walking staff in hand */}
      {form === 'wandering' && (
        <g>
          <line x1={52} y1={GROUND} x2={49} y2={bodyY - 6} stroke="#7c5210" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={49} cy={bodyY - 6} r={1.6} fill="#a16207" />
        </g>
      )}
      {/* coat / body */}
      <path d={`M${cx} ${GROUND} q-9 0 -9 -10 q0 -8 9 -8 q9 0 9 8 q0 10 -9 10z`} fill={coat} />
      {/* wizardly form: little stars sprinkled on the robe */}
      {form === 'wizardly' && (
        <g fill="#fde68a">
          <circle cx={cx - 4} cy={GROUND - 6} r={0.9} />
          <circle cx={cx + 4} cy={GROUND - 9} r={0.9} />
          <circle cx={cx} cy={GROUND - 3} r={0.8} />
        </g>
      )}
      {/* face */}
      <circle cx={cx} cy={bodyY} r={6 * s} fill="#f5d0b0" />
      {/* beard — the wizardly sage's flows longer */}
      <path
        d={
          form === 'wizardly'
            ? `M${cx - 6} ${bodyY + 1} q6 16 12 0 q-2 12 -6 12 q-4 0 -6 -12z`
            : `M${cx - 6} ${bodyY + 1} q6 12 12 0 q-2 8 -6 8 q-4 0 -6 -8z`
        }
        fill="#f1f5f9"
      />
      {/* dozing form: closed eyes (a content snooze) instead of dots */}
      {form === 'dozing' ? (
        <g stroke="#1c1c1e" strokeWidth={0.9} strokeLinecap="round">
          <path d={`M${cx - 3.2} ${bodyY} q1 1.2 2 0`} fill="none" />
          <path d={`M${cx + 1.2} ${bodyY} q1 1.2 2 0`} fill="none" />
        </g>
      ) : (
        <>
          <circle cx={cx - 2.2} cy={bodyY} r={0.9} fill="#1c1c1e" />
          <circle cx={cx + 2.2} cy={bodyY} r={0.9} fill="#1c1c1e" />
        </>
      )}
      {v === 'mossy' && <ellipse cx={cx - 3} cy={bodyY - 5} rx={3} ry={1.6} fill="#84cc16" opacity={0.7} />}
      {/* pointed hat */}
      <polygon points={`${cx - 7},${bodyY - 4} ${cx + 7},${bodyY - 4} ${cx},${hatTip}`} fill={hat} />
      {/* wizardly form: a gold star on the hat tip */}
      {form === 'wizardly' && (
        <polygon
          points={`${cx},${hatTip - 2.5} ${cx + 0.9},${hatTip} ${cx + 2.5},${hatTip} ${cx + 1.2},${hatTip + 1.5} ${cx + 1.8},${hatTip + 3.5} ${cx},${hatTip + 2.2} ${cx - 1.8},${hatTip + 3.5} ${cx - 1.2},${hatTip + 1.5} ${cx - 2.5},${hatTip} ${cx - 0.9},${hatTip}`}
          fill="#fde68a"
        />
      )}
      {v === 'sleepy' && <circle cx={cx} cy={bodyY - 17 * s} r={1.6} fill="#fff" />}
      {/* dozing form: a drifting 'z' */}
      {form === 'dozing' && <text x={cx + 8} y={bodyY - 6} fontSize="5" fill="#94a3b8">z</text>}
      {/* venerable (stage 5): a great old gnome — a longer cap that curls, on a little stone */}
      {stage >= 5 && (
        <g>
          <ellipse cx={cx} cy={GROUND} rx={11} ry={2.4} fill="#cbd5e1" opacity={0.7} />
          <path d={`M${cx},${hatTip} q4 -3 6 1`} stroke={hat} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </g>
      )}
      {has(cust, 'lantern', 'lantern') && (
        <g>
          <line x1={49} y1={GROUND - 12} x2={49} y2={GROUND - 4} stroke="#7c5210" strokeWidth={1} />
          <rect x={47} y={GROUND - 5} width={5} height={6} rx={1} fill="#fde68a" stroke="#a16207" strokeWidth={0.8} />
        </g>
      )}
      {/* new additive slot: a toadstool sprouting at the gnome's feet */}
      {has(cust, 'toadstool', 'toadstool_cap') && (
        <g>
          <rect x={26} y={GROUND - 5} width={2} height={5} rx={1} fill="#fef3c7" />
          <path d={`M22 ${GROUND - 5} q5 -6 10 0z`} fill="#dc2626" />
          <g fill="#fff">
            <circle cx={25} cy={GROUND - 7} r={0.7} />
            <circle cx={29} cy={GROUND - 8} r={0.7} />
          </g>
        </g>
      )}
    </g>
  )
}

const CHIME_TUBE: Record<string, string> = { brass: '#d4a017', bamboo: '#a3a847', seaglass: '#5eead4' }

function WindChime({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const tube = form === 'crystal_chime' ? '#a5f3fc' : CHIME_TUBE[variant ?? 'brass'] ?? '#d4a017'
  const s = 1 + 0.12 * stage
  const topY = 30
  const len = 18 * s
  const tubes = [-6, -2, 2, 6]
  // pan_pipes form: graduated reed lengths, longest in the middle, for a panpipe silhouette.
  const panLen = (dx: number) => len * (0.6 + 0.5 * (1 - Math.abs(dx) / 6))
  return (
    <g>
      {/* branch it hangs from */}
      <path d="M20 28 q20 -6 40 0" stroke="#8b5a2b" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* top disc */}
      <ellipse cx={40} cy={topY} rx={9} ry={2.6} fill={form === 'pan_pipes' ? '#a3a847' : '#a16207'} />
      {tubes.map((dx) => {
        const l = form === 'pan_pipes' ? panLen(dx) : len
        return (
          <g key={dx}>
            <line x1={40 + dx} y1={topY} x2={40 + dx} y2={topY + 4} stroke="#6b7280" strokeWidth={0.6} />
            {form === 'crystal_chime' ? (
              // faceted hanging gems instead of metal tubes
              <g>
                <polygon
                  points={`${40 + dx},${topY + 4} ${40 + dx - 2},${topY + 9} ${40 + dx},${topY + 14} ${40 + dx + 2},${topY + 9}`}
                  fill={tube}
                  stroke="#67e8f9"
                  strokeWidth={0.4}
                />
              </g>
            ) : (
              <rect x={40 + dx - 1} y={topY + 4} width={form === 'pan_pipes' ? 2.6 : 2.2} height={l} rx={1} fill={tube} />
            )}
          </g>
        )
      })}
      {/* clapper (omitted for pan_pipes, which has no dangling striker) */}
      {form !== 'pan_pipes' && (
        <>
          <line x1={40} y1={topY} x2={40} y2={topY + len + 4} stroke="#9ca3af" strokeWidth={0.6} />
          <circle cx={40} cy={topY + len + 5} r={2.4} fill={form === 'crystal_chime' ? '#a5f3fc' : '#cbd5e1'} />
        </>
      )}
      {/* venerable (stage 5): a weathered, well-hung chime — a second branch-loop + extra tube */}
      {stage >= 5 && (
        <g>
          <path d="M18 27 q22 -7 44 0" stroke="#8b5a2b" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7} />
          <rect x={49} y={topY + 4} width={2} height={len * 0.7} rx={1} fill={tube} opacity={0.85} />
        </g>
      )}
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
      {/* new additive slot: a little chickadee come to perch on the branch */}
      {has(cust, 'perched_bird', 'chickadee') && (
        <g>
          <ellipse cx={26} cy={26} rx={3} ry={2.4} fill="#94a3b8" />
          <circle cx={23} cy={24} r={2} fill="#1f2937" />
          <polygon points="21,24 18.5,24.5 21,25.5" fill="#f59e0b" />
          <circle cx={22.4} cy={23.6} r={0.5} fill="#fff" />
          <path d="M28 26 l3 -1.5 l-2 2z" fill="#64748b" />
        </g>
      )}
    </g>
  )
}

const LANTERN_FRAME: Record<string, string> = { paper: '#fcd34d', iron: '#4b5563', stone: '#9ca3af' }

function Lantern({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const frame =
    form === 'star_lantern' ? '#f59e0b' : form === 'spirit_lantern' ? '#a78bfa' : LANTERN_FRAME[variant ?? 'paper'] ?? '#fcd34d'
  const s = 1 + 0.12 * stage
  const w = 14 * s
  const h = 20 * s
  const x = 40 - w / 2
  const y = GROUND - h
  const flameColor = has(cust, 'flame', 'blue') ? '#60a5fa' : '#fbbf24'
  const lit = has(cust, 'flame', 'blue') || has(cust, 'flame', 'warm') || !!form
  // Form recolours the inner glow: green for fireflies, gold for star, ghost-violet for spirit.
  const glowColor =
    form === 'firefly_lantern' ? '#a3e635' : form === 'star_lantern' ? '#fde68a' : form === 'spirit_lantern' ? '#c4b5fd' : flameColor
  const bodyFill = form === 'spirit_lantern' ? '#312e6b' : variant === 'paper' || form === 'firefly_lantern' ? '#fef9c3' : '#1f2937'
  return (
    <g>
      {/* post — the star/spirit forms hang from a hook instead of standing on a post */}
      {form === 'star_lantern' || form === 'spirit_lantern' ? (
        <line x1={40} y1={0} x2={40} y2={y} stroke="#7c5210" strokeWidth={1.4} />
      ) : (
        <>
          <rect x={39} y={y - 6} width={2} height={6} fill="#7c5210" />
          <path d={`M${40 - 3} ${y - 6} h6`} stroke="#7c5210" strokeWidth={2} />
        </>
      )}
      {/* glow */}
      {lit && <ellipse cx={40} cy={y + h / 2} rx={w} ry={h * 0.6} fill={glowColor} opacity={0.28} />}
      {/* body */}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={bodyFill} />
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={frame} strokeWidth={1.6} />
      <line x1={40} y1={y} x2={40} y2={y + h} stroke={frame} strokeWidth={1} />
      <rect x={x - 1} y={y - 2} width={w + 2} height={2.4} rx={1} fill={frame} />
      {/* firefly_lantern form: a cluster of glowing firefly dots inside the jar */}
      {form === 'firefly_lantern' &&
        [
          [40, y + 6],
          [37, y + 11],
          [43, y + 13],
          [39, y + 16],
        ].map(([fx, fy], i) => <circle key={i} cx={fx} cy={fy} r={1.1} fill="#bef264" />)}
      {/* star_lantern form: a gold star cut into the glowing face */}
      {form === 'star_lantern' && (
        <polygon
          points={`40,${y + 5} 41.4,${y + 9} 45.4,${y + 9} 42.2,${y + 11.6} 43.4,${y + 15.6} 40,${y + 13} 36.6,${y + 15.6} 37.8,${y + 11.6} 34.6,${y + 9} 38.6,${y + 9}`}
          fill="#fde68a"
        />
      )}
      {/* spirit_lantern form: a pale wisp drifting up from the lantern top */}
      {form === 'spirit_lantern' && (
        <path d={`M40 ${y} q-3 -5 0 -8 q3 4 1 7`} fill="#ddd6fe" opacity={0.8} />
      )}
      {/* flame (the base forms; the evolved forms supply their own inner light above) */}
      {lit && !form && <path d={`M40 ${y + h - 4} q-2 -4 0 -7 q2 3 0 7z`} fill={flameColor} />}
      {/* venerable (stage 5): a weathered, long-burning lantern — a wider base + a curl of smoke */}
      {stage >= 5 && (
        <g>
          <rect x={x - 2} y={y + h - 1} width={w + 4} height={2.2} rx={1} fill={frame} opacity={0.8} />
          <path d={`M40 ${y - 3} q-2 -3 0 -5 q2 2 0 5`} fill="#cbd5e1" opacity={0.6} />
        </g>
      )}
      {has(cust, 'moth', 'moth') && (
        <g transform={`translate(${x - 4} ${y + 4})`}>
          <ellipse cx={-1.5} cy={0} rx={1.8} ry={2.4} fill="#d6d3d1" />
          <ellipse cx={1.5} cy={0} rx={1.8} ry={2.4} fill="#e7e5e4" />
        </g>
      )}
      {/* new additive slot: a crystal charm dangling beneath the lantern */}
      {has(cust, 'charm', 'crystal_charm') && (
        <g>
          <line x1={40} y1={y + h} x2={40} y2={y + h + 4} stroke="#9ca3af" strokeWidth={0.6} />
          <polygon
            points={`40,${y + h + 4} 38,${y + h + 7} 40,${y + h + 11} 42,${y + h + 7}`}
            fill="#a5f3fc"
            stroke="#67e8f9"
            strokeWidth={0.4}
          />
        </g>
      )}
    </g>
  )
}

const FROG_BODY: Record<string, string> = { green: '#22c55e', golden: '#eab308', blue: '#38bdf8' }

function FrogLily({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const body = form === 'frog_prince' ? '#16a34a' : FROG_BODY[variant ?? 'green'] ?? '#22c55e'
  const s = 1 + 0.12 * stage
  const zen = form === 'zen_frog'
  return (
    <g>
      {/* water + lily pad */}
      <ellipse cx={40} cy={68} rx={22} ry={6} fill="#bae6fd" />
      <ellipse cx={40} cy={66} rx={15} ry={5} fill="#16a34a" />
      <path d="M40 66 L51 63" stroke="#bae6fd" strokeWidth={1.4} />
      {/* zen_frog form: a calm aura ring around the meditating frog */}
      {zen && <circle cx={40} cy={57} r={13} fill="none" stroke="#bbf7d0" strokeWidth={1.4} opacity={0.7} />}
      {/* frog body */}
      <ellipse cx={40} cy={60} rx={10 * s} ry={6 * s} fill={body} />
      <ellipse cx={48} cy={64} rx={4} ry={2} fill={body} />
      <ellipse cx={32} cy={64} rx={4} ry={2} fill={body} />
      {/* frog_prince form: a little royal cape clasped at the neck */}
      {form === 'frog_prince' && (
        <path d="M31 58 q9 6 18 0 q-2 6 -9 6 q-7 0 -9 -6z" fill="#7f1d1d" opacity={0.9} />
      )}
      {/* eyes */}
      <circle cx={35} cy={53} r={3 * s} fill={body} />
      <circle cx={45} cy={53} r={3 * s} fill={body} />
      {/* zen_frog meditates with closed eyes; the others keep bright open eyes */}
      {zen ? (
        <g stroke="#15803d" strokeWidth={1} strokeLinecap="round" fill="none">
          <path d="M33 53 q2 1.5 4 0" />
          <path d="M43 53 q2 1.5 4 0" />
        </g>
      ) : (
        <>
          <circle cx={35} cy={53} r={1.4} fill="#fff" />
          <circle cx={45} cy={53} r={1.4} fill="#fff" />
          <circle cx={35} cy={53} r={0.8} fill="#1c1c1e" />
          <circle cx={45} cy={53} r={0.8} fill="#1c1c1e" />
        </>
      )}
      <path d="M35 60 q5 3 10 0" stroke="#15803d" strokeWidth={1} fill="none" strokeLinecap="round" />
      {/* venerable (stage 5): a grand old frog on a broader pad with a second small lily bud */}
      {stage >= 5 && (
        <g>
          <ellipse cx={40} cy={66} rx={19} ry={6} fill="#15803d" opacity={0.5} />
          <circle cx={58} cy={64} r={2} fill="#f472b6" />
        </g>
      )}
      {has(cust, 'crown', 'crown') && (
        <polygon points="35,49 38,45 40,48 42,45 45,49" fill="#fbbf24" stroke="#d97706" strokeWidth={0.5} />
      )}
      {/* frog_prince form: its own gold crown (a step grander than the plain crown slot) */}
      {form === 'frog_prince' && !has(cust, 'crown', 'crown') && (
        <g>
          <polygon points="34,49 37,44 40,47 43,44 46,49" fill="#fbbf24" stroke="#d97706" strokeWidth={0.6} />
          <circle cx={40} cy={45} r={1} fill="#ef4444" />
        </g>
      )}
      {has(cust, 'hat', 'hat') && (
        <g>
          <rect x={34} y={48} width={12} height={2} fill="#1f2937" />
          <rect x={36} y={43} width={8} height={5.5} fill="#1f2937" />
        </g>
      )}
      {/* new additive slot: a dragonfly hovering over the lily pad */}
      {has(cust, 'dragonfly_friend', 'pond_dragonfly') && (
        <g transform="translate(58 50)">
          <rect x={-0.5} y={-3} width={1} height={7} rx={0.5} fill="#0ea5e9" />
          <ellipse cx={-2.5} cy={-1.5} rx={2.6} ry={1} fill="#7dd3fc" opacity={0.85} />
          <ellipse cx={2.5} cy={-1.5} rx={2.6} ry={1} fill="#7dd3fc" opacity={0.85} />
          <ellipse cx={-2.2} cy={1} rx={2.2} ry={0.9} fill="#7dd3fc" opacity={0.7} />
          <ellipse cx={2.2} cy={1} rx={2.2} ry={0.9} fill="#7dd3fc" opacity={0.7} />
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
  const form = cust.form
  // harvest_guard warms the shirt to autumn russet; the others keep the variant colour.
  const shirt = form === 'harvest_guard' ? '#b45309' : form === 'dapper' ? '#334155' : SCARECROW_SHIRT[v] ?? '#a16207'
  const s = 1 + 0.12 * stage
  const headY = GROUND - 34 * s
  // The spooky form forces a carved jack-o'-lantern head regardless of variant.
  const pumpkinHead = v === 'pumpkin' || form === 'spooky'
  return (
    <g>
      {/* spooky form: a wash of dusk behind the scarecrow */}
      {form === 'spooky' && <ellipse cx={40} cy={headY} rx={20} ry={22} fill="#4c1d95" opacity={0.18} />}
      {/* cross-post + outstretched arms */}
      <rect x={39} y={GROUND - 32 * s} width={2} height={32 * s} fill="#7c5210" />
      <rect x={26} y={GROUND - 22 * s} width={28} height={2} fill="#7c5210" />
      {/* straw hands */}
      <path d={`M26 ${GROUND - 21 * s} l-3 2 M26 ${GROUND - 21 * s} l-3 -1`} stroke="#eab308" strokeWidth={1} />
      <path d={`M54 ${GROUND - 21 * s} l3 2 M54 ${GROUND - 21 * s} l3 -1`} stroke="#eab308" strokeWidth={1} />
      {/* harvest_guard form: a sheaf of wheat tucked under one arm */}
      {form === 'harvest_guard' && (
        <g stroke="#d97706" strokeWidth={1} strokeLinecap="round">
          <line x1={24} y1={GROUND - 20 * s} x2={22} y2={GROUND - 28 * s} />
          <line x1={26} y1={GROUND - 20 * s} x2={26} y2={GROUND - 28 * s} />
          <line x1={28} y1={GROUND - 20 * s} x2={30} y2={GROUND - 28 * s} />
        </g>
      )}
      {/* shirt */}
      <path d={`M31 ${GROUND - 22 * s} h18 l-2 16 h-14z`} fill={shirt} />
      {v === 'patchwork' && (
        <g fill="#f59e0b">
          <rect x={34} y={GROUND - 18 * s} width={4} height={4} />
          <rect x={42} y={GROUND - 12 * s} width={4} height={4} />
        </g>
      )}
      {/* dapper form: a little bow tie at the collar */}
      {form === 'dapper' && (
        <g fill="#dc2626">
          <polygon points={`40,${GROUND - 22 * s} 37,${GROUND - 23.5 * s} 37,${GROUND - 20.5 * s}`} />
          <polygon points={`40,${GROUND - 22 * s} 43,${GROUND - 23.5 * s} 43,${GROUND - 20.5 * s}`} />
        </g>
      )}
      {/* head */}
      {pumpkinHead ? (
        <g>
          <circle cx={40} cy={headY} r={6 * s} fill="#f97316" />
          <polygon points={`37,${headY} 39,${headY - 2} 41,${headY}`} fill="#1c1c1e" />
          <polygon points={`39,${headY} 41,${headY - 2} 43,${headY}`} fill="#1c1c1e" />
          <path d={`M36 ${headY + 2} q4 3 8 0`} stroke="#1c1c1e" strokeWidth={1} fill="none" />
          {/* spooky form: a faint inner glow through the carved face */}
          {form === 'spooky' && <circle cx={40} cy={headY} r={3} fill="#fde68a" opacity={0.6} />}
        </g>
      ) : (
        <g>
          <circle cx={40} cy={headY} r={6 * s} fill="#facc15" />
          <circle cx={37.5} cy={headY - 1} r={0.9} fill="#1c1c1e" />
          <circle cx={42.5} cy={headY - 1} r={0.9} fill="#1c1c1e" />
          <path d={`M37 ${headY + 2.5} q3 2 6 0`} stroke="#1c1c1e" strokeWidth={0.9} fill="none" />
        </g>
      )}
      {/* hat — the dapper form swaps the straw hat for a black top hat */}
      {form === 'dapper' ? (
        <g fill="#1f2937">
          <ellipse cx={40} cy={headY - 5 * s} rx={7 * s} ry={1.8} />
          <rect x={40 - 4 * s} y={headY - 12 * s} width={8 * s} height={7 * s} rx={0.6} />
        </g>
      ) : (
        <>
          <ellipse cx={40} cy={headY - 5 * s} rx={8 * s} ry={2} fill="#ca8a04" />
          <path d={`M${40 - 4 * s} ${headY - 5 * s} q${4 * s} -5 ${8 * s} 0z`} fill="#a16207" />
        </>
      )}
      {/* venerable (stage 5): a long-standing guardian — a leaning fence rail + scattered straw */}
      {stage >= 5 && (
        <g stroke="#a16207" strokeWidth={1.4} strokeLinecap="round">
          <line x1={16} y1={GROUND - 4} x2={24} y2={GROUND - 7} />
          <path d={`M52 ${GROUND} l3 -2 M55 ${GROUND - 1} l2 -3`} strokeWidth={1} stroke="#eab308" />
        </g>
      )}
      {has(cust, 'crow', 'crow') && (
        <g transform={`translate(54 ${GROUND - 23 * s})`}>
          <ellipse cx={0} cy={0} rx={4} ry={2.6} fill="#1f2937" />
          <circle cx={3} cy={-2} r={2} fill="#1f2937" />
          <polygon points="5,-2 8,-1.5 5,-0.5" fill="#f59e0b" />
          <circle cx={3.5} cy={-2.4} r={0.6} fill="#fbbf24" />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={GROUND - 23 * s} x={30} w={20} />}
      {/* new additive slot: a little pumpkin patch sprouting at its feet */}
      {has(cust, 'pumpkin_patch', 'pumpkins') && (
        <g>
          <ellipse cx={24} cy={GROUND - 1} rx={3.4} ry={2.6} fill="#ea580c" />
          <line x1={24} y1={GROUND - 3.6} x2={24} y2={GROUND - 5} stroke="#15803d" strokeWidth={1} />
          <ellipse cx={30} cy={GROUND} rx={2.6} ry={2} fill="#f97316" />
          <line x1={30} y1={GROUND - 2} x2={30} y2={GROUND - 3} stroke="#15803d" strokeWidth={0.8} />
        </g>
      )}
    </g>
  )
}

const FAIRY_DOOR: Record<string, string> = { acorn: '#92400e', toadstool: '#dc2626', rosewood: '#9d174d' }

function FairyDoor({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const door =
    form === 'royal_door' ? '#7c2d12' : form === 'starlit_door' ? '#1e3a8a' : FAIRY_DOOR[variant ?? 'acorn'] ?? '#92400e'
  const arch = form === 'royal_door' ? '#fbbf24' : form === 'starlit_door' ? '#818cf8' : '#3f2410'
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
      {/* mossy_door form: a cushion of moss creeping over the mound */}
      {form === 'mossy_door' && (
        <g fill="#4d7c0f" opacity={0.85}>
          <ellipse cx={x - 4} cy={GROUND - 6} rx={4} ry={2.4} />
          <ellipse cx={x + w + 4} cy={GROUND - 7} rx={4} ry={2.6} />
          <ellipse cx={40} cy={y - 1} rx={5} ry={2.2} />
        </g>
      )}
      {(has(cust, 'glow', 'glow') || form === 'starlit_door') && (
        <ellipse cx={40} cy={y + h / 2} rx={w} ry={h * 0.6} fill={form === 'starlit_door' ? '#c7d2fe' : '#fde68a'} opacity={0.3} />
      )}
      {/* arched door */}
      <path d={`M${x} ${GROUND} v${-h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2}z`} fill={door} />
      <path
        d={`M${x} ${GROUND} v${-h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2}z`}
        fill="none"
        stroke={arch}
        strokeWidth={form === 'royal_door' ? 1.6 : 1}
      />
      {/* planks + knob */}
      <line x1={40} y1={y + 3} x2={40} y2={GROUND} stroke="#3f2410" strokeWidth={0.7} />
      <circle cx={x + w - 3} cy={y + h * 0.6} r={1.2} fill="#fbbf24" />
      {/* royal_door form: a gold crown emblem above the arch */}
      {form === 'royal_door' && (
        <polygon points={`40,${y - 2} 37,${y + 1} 38.5,${y + 1} 40,${y - 0.5} 41.5,${y + 1} 43,${y + 1}`} fill="#fbbf24" />
      )}
      {/* starlit_door form: a scatter of little stars over the door */}
      {form === 'starlit_door' && (
        <g fill="#e0e7ff">
          <circle cx={x + 4} cy={y + 5} r={0.7} />
          <circle cx={x + w - 4} cy={y + 8} r={0.7} />
          <circle cx={x + 5} cy={y + 13} r={0.6} />
          <circle cx={x + w - 5} cy={y + 16} r={0.6} />
        </g>
      )}
      {variant === 'toadstool' && form !== 'starlit_door' && (
        <g fill="#fff">
          <circle cx={x + 3} cy={y + 3} r={0.9} />
          <circle cx={x + w - 3} cy={y + 4} r={0.9} />
        </g>
      )}
      {/* venerable (stage 5): a long-settled door — ivy trailing down one side of the arch */}
      {stage >= 5 && (
        <path
          d={`M${x} ${y + 3} q-3 6 1 10 q-3 5 0 9`}
          fill="none"
          stroke="#4d7c0f"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      )}
      {has(cust, 'path', 'path') && (
        <g fill="#cbd5e1">
          <ellipse cx={40} cy={GROUND + 1} rx={3} ry={1.4} />
          <ellipse cx={34} cy={GROUND + 3} rx={2.6} ry={1.2} />
          <ellipse cx={46} cy={GROUND + 3} rx={2.6} ry={1.2} />
        </g>
      )}
      {/* new additive slot: a tiny welcome mat on the doorstep */}
      {has(cust, 'doorstep', 'welcome_mat') && (
        <g>
          <rect x={40 - w / 2 + 1} y={GROUND} width={w - 2} height={2.4} rx={0.6} fill="#b45309" />
          <line x1={40} y1={GROUND + 0.4} x2={40} y2={GROUND + 2} stroke="#7c2d12" strokeWidth={0.5} />
        </g>
      )}
    </g>
  )
}

const HAMMOCK_CLOTH: Record<string, string> = { striped: '#f97316', canvas: '#d6c1a8', rainbow: '#a855f7' }

function Hammock({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const cloth = HAMMOCK_CLOTH[variant ?? 'striped'] ?? '#f97316'
  const s = 1 + 0.12 * stage
  const postY = GROUND - 26 * s
  const sag = GROUND - 8
  return (
    <g>
      {/* two posts */}
      <rect x={20} y={postY} width={2.4} height={GROUND - postY} fill="#7c5210" />
      <rect x={57.6} y={postY} width={2.4} height={GROUND - postY} fill="#7c5210" />
      {/* canopy_hammock form: a fabric canopy stretched over the top between the posts */}
      {form === 'canopy_hammock' && (
        <g>
          <path d={`M19 ${postY} Q40 ${postY - 8} 60 ${postY}`} fill="none" stroke={cloth} strokeWidth={3} strokeLinecap="round" />
          <line x1={19} y1={postY} x2={19} y2={postY + 3} stroke="#a8a29e" strokeWidth={0.6} />
          <line x1={60} y1={postY} x2={60} y2={postY + 3} stroke="#a8a29e" strokeWidth={0.6} />
        </g>
      )}
      {form === 'garden_swing' ? (
        // garden_swing form: a hanging plank swing seat instead of the cloth sling.
        <g>
          <line x1={28} y1={postY + 2} x2={28} y2={sag + 4} stroke="#a8a29e" strokeWidth={0.8} />
          <line x1={52} y1={postY + 2} x2={52} y2={sag + 4} stroke="#a8a29e" strokeWidth={0.8} />
          <rect x={25} y={sag + 4} width={30} height={3} rx={1} fill="#a16207" />
          <rect x={25} y={sag + 4} width={30} height={1} fill="#d97706" />
        </g>
      ) : (
        <>
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
        </>
      )}
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
      {/* venerable (stage 5): well-worn posts — trailing ivy up one post + a fallen leaf */}
      {stage >= 5 && (
        <g>
          <path d={`M21 ${GROUND} q-3 -6 1 -10 q-3 -5 0 -9`} fill="none" stroke="#4d7c0f" strokeWidth={1.1} strokeLinecap="round" />
          <ellipse cx={64} cy={GROUND - 1} rx={2.4} ry={1.2} fill="#ca8a04" transform="rotate(20 64 69)" />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={postY} x={22} w={36} />}
      {/* new additive slot: a side table with a glass of lemonade within reach */}
      {has(cust, 'side_table', 'lemonade') && (
        <g>
          <rect x={62} y={GROUND - 9} width={6} height={1.6} rx={0.6} fill="#a16207" />
          <line x1={63} y1={GROUND - 7.4} x2={63} y2={GROUND} stroke="#7c5210" strokeWidth={0.8} />
          <line x1={67} y1={GROUND - 7.4} x2={67} y2={GROUND} stroke="#7c5210" strokeWidth={0.8} />
          <path d={`M63.5 ${GROUND - 14} l1 5 h2 l1 -5z`} fill="#fde047" opacity={0.9} />
        </g>
      )}
    </g>
  )
}

const TEACART_BODY: Record<string, string> = { rose: '#fb7185', mint: '#5eead4', midnight: '#475569' }

function TeaCart({ variant, cust, stage }: DrawProps) {
  const form = cust.form
  const body = TEACART_BODY[variant ?? 'rose'] ?? '#fb7185'
  const s = 1 + 0.12 * stage
  const w = 30 * s
  const x = 40 - w / 2
  const topY = GROUND - 22 * s
  return (
    <g>
      {/* garden_party form: a little run of bunting strung above the cart */}
      {form === 'garden_party' &&
        [0, 1, 2, 3].map((i) => {
          const fx = x + 4 + (i * (w - 8)) / 3
          const colors = ['#fbbf24', '#fb7185', '#34d399', '#60a5fa']
          return <polygon key={i} points={`${fx - 2},${topY - 8} ${fx + 2},${topY - 8} ${fx},${topY - 4}`} fill={colors[i]} />
        })}
      {/* frame + two tiers */}
      <rect x={x} y={topY} width={w} height={2.6} rx={1} fill={body} />
      <rect x={x} y={topY + 10} width={w} height={2.6} rx={1} fill={body} />
      <rect x={x + 1} y={topY} width={2} height={GROUND - 4 - topY} fill="#9ca3af" />
      <rect x={x + w - 3} y={topY} width={2} height={GROUND - 4 - topY} fill="#9ca3af" />
      {form === 'high_tea' ? (
        // high_tea form: a tall three-tier cake stand rises from the cart top.
        <g>
          <line x1={40} y1={topY - 16} x2={40} y2={topY} stroke="#cbd5e1" strokeWidth={1.2} />
          <ellipse cx={40} cy={topY - 16} rx={5} ry={1.4} fill="#f8fafc" stroke={body} strokeWidth={0.8} />
          <ellipse cx={40} cy={topY - 10} rx={7} ry={1.6} fill="#f8fafc" stroke={body} strokeWidth={0.8} />
          <ellipse cx={40} cy={topY - 4} rx={9} ry={1.8} fill="#f8fafc" stroke={body} strokeWidth={0.8} />
          <circle cx={38} cy={topY - 17} r={1} fill="#fbcfe8" />
          <circle cx={42} cy={topY - 11} r={1} fill="#bbf7d0" />
        </g>
      ) : form === 'patisserie' ? (
        // patisserie form: a glass dome over a fine pastry on the upper tier.
        <g>
          <rect x={x + 8} y={topY - 3} width={3} height={3} rx={1} fill="#f9a8d4" />
          <path d={`M${x + 5} ${topY} a${4.5} ${5} 0 0 1 ${9} 0z`} fill="#bae6fd" opacity={0.45} stroke="#7dd3fc" strokeWidth={0.6} />
          <circle cx={x + 9.5} cy={topY - 6} r={0.8} fill="#cbd5e1" />
        </g>
      ) : (
        // base: a teapot on top
        <>
          <ellipse cx={40} cy={topY - 2} rx={5} ry={4} fill="#f8fafc" stroke={body} strokeWidth={1} />
          <path d={`M45 ${topY - 3} q4 0 3 3`} stroke={body} strokeWidth={1.2} fill="none" />
          <rect x={38.5} y={topY - 8} width={3} height={2} rx={1} fill={body} />
        </>
      )}
      {/* tiny cakes on the lower tier */}
      <rect x={x + 5} y={topY + 6} width={3} height={3} rx={0.6} fill="#fbcfe8" />
      <rect x={x + 11} y={topY + 6} width={3} height={3} rx={0.6} fill="#fde68a" />
      <rect x={x + w - 8} y={topY + 6} width={3} height={3} rx={0.6} fill="#bbf7d0" />
      {/* wheels */}
      <circle cx={x + 4} cy={GROUND - 3} r={3} fill="#1f2937" />
      <circle cx={x + w - 4} cy={GROUND - 3} r={3} fill="#1f2937" />
      {/* venerable (stage 5): a well-loved cart — a lace doily trim along the top rail */}
      {stage >= 5 && (
        <path
          d={`M${x} ${topY + 2.8} q3 2 6 0 q3 2 6 0 q3 2 6 0 q3 2 6 0 q3 2 6 0`}
          fill="none"
          stroke="#fff"
          strokeWidth={0.7}
          opacity={0.85}
        />
      )}
      {has(cust, 'cat', 'cat') && (
        <g>
          <ellipse cx={x - 3} cy={GROUND - 4} rx={4} ry={2.4} fill="#9ca3af" />
          <circle cx={x - 6} cy={GROUND - 6} r={2.2} fill="#9ca3af" />
          <polygon points="-8,-8 -7,-10 -5,-8" transform={`translate(${x} ${GROUND})`} fill="#9ca3af" />
        </g>
      )}
      {has(cust, 'lights', 'lights') && <Lights y={topY - 2} x={x} w={w} />}
      {/* new additive slot: a plate of dainty macarons on the upper tier */}
      {has(cust, 'treats', 'macarons') && (
        <g>
          <ellipse cx={x + w - 7} cy={topY - 1} rx={4} ry={1.2} fill="#e2e8f0" />
          <circle cx={x + w - 9} cy={topY - 2.4} r={1.4} fill="#f9a8d4" />
          <circle cx={x + w - 6} cy={topY - 2.4} r={1.4} fill="#a7f3d0" />
          <circle cx={x + w - 7.5} cy={topY - 4} r={1.4} fill="#fde68a" />
        </g>
      )}
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
    // viewBox carries 64u of extra headroom above y=0 (the drawn ground sits at GROUND=70) so a
    // fully grown, evolved tree — whose canopy reaches up past the old 0 0 80 80 frame — renders
    // complete instead of clipped at the top. The drawing coordinates are unchanged; only the
    // frame grew. Every placement sizes the svg by WIDTH (height:auto / CSS aspect-ratio), so the
    // art keeps its on-screen scale and simply gains transparent sky above it.
    <svg className="sanctuary-svg" viewBox="0 -64 80 144" role="img" aria-label={label}>
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
