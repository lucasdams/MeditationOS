// Procedural SVG render of a Sanctuary item. Each item is drawn from a chosen `variant`
// (a base form — a tree species, a dog breed, a wall color) plus a set of purchased
// `customizations` ({slot: option}), each of which makes a *real* visual change (fruit on
// a tree, a hat on a pet, lilies on a pond, smoke from a chimney). The backend owns what
// was bought; this owns rendering. viewBox is 0 0 80 80, in the existing flat style.

import { memo } from 'react'
import { itemLabel, variantLabel } from '../lib/sanctuaryArt'

const GROUND = 70

type Cust = Record<string, string>
type DrawProps = { variant: string | null; cust: Cust; grown: boolean }

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

function Tree({ variant, cust, grown }: DrawProps) {
  const v = variant ?? 'oak'
  const k = grown ? 1.12 : 1
  const trunkH = 32 * k
  const trunkY = GROUND - trunkH
  const r = 20 * k
  const cy = trunkY - r * 0.3
  const leaf = TREE_LEAF[v] ?? '#22c55e'
  const isPine = v === 'pine'
  const isWillow = v === 'willow'
  return (
    <g>
      <rect x={37} y={trunkY} width={6} height={trunkH} rx={2} fill="#8b5a2b" />
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
        </g>
      ) : (
        <g fill={leaf}>
          <circle cx={40 - r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40 + r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40} cy={cy} r={r} />
        </g>
      )}
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
    </g>
  )
}

const FLOWER_PETAL: Record<string, string> = {
  rose: '#fb7185',
  tulip: '#f472b6',
  sunflower: '#facc15',
  daisy: '#f8fafc',
}

function Flower({ variant, cust, grown }: DrawProps) {
  const v = variant ?? 'rose'
  const k = grown ? 1.15 : 1
  const stemH = 34 * k
  const top = GROUND - stemH
  const petal = FLOWER_PETAL[v] ?? '#f472b6'
  const center = v === 'sunflower' ? '#92400e' : '#fbbf24'
  const petalR = (v === 'tulip' ? 5 : 5.5) * (has(cust, 'bloom', 'double') ? 1.25 : 1)
  return (
    <g>
      <rect x={39} y={top} width={2} height={stemH} rx={1} fill="#16a34a" />
      <ellipse cx={34} cy={top + stemH * 0.4} rx={6} ry={3} fill="#4ade80" />
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
    </g>
  )
}

function Pond({ cust, grown }: DrawProps) {
  const k = grown ? 1.18 : 1
  const rx = 20 * k
  const ry = 7.5 * k
  return (
    <g>
      <ellipse cx={40} cy={66} rx={22} ry={8} fill="none" stroke="#94a3b8" strokeWidth={2} />
      <ellipse cx={40} cy={66} rx={rx} ry={ry} fill="#38bdf8" />
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
  grown,
  defaultColor,
  roof,
  baseW,
}: DrawProps & { defaultColor: string; roof: string; baseX?: number; baseW: number }) {
  const color = (variant && WALL_COLORS[variant]) || defaultColor
  const k = grown ? 1.12 : 1
  const wallH = 26 * k
  const wallY = GROUND - wallH
  const w = baseW
  const x = 40 - w / 2
  const cx = 40
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 3} />}
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      <polygon points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${wallY - 16}`} fill={roof} />
      {/* door */}
      <rect x={cx - 3} y={GROUND - 11} width={6} height={11} fill={roof} />
      {/* window */}
      <rect
        x={x + 4}
        y={wallY + 5}
        width={6}
        height={6}
        fill={has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd'}
      />
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

function Car({ variant, cust, grown }: DrawProps) {
  const color = (variant && CAR_COLORS[variant]) || '#ef4444'
  const k = grown ? 1.12 : 1
  const w = 36 * k
  const x = 40 - w / 2
  const bodyY = 58
  return (
    <g>
      <path d={`M${x + 8} ${bodyY} q4 -9 12 -9 q8 0 10 9 z`} fill={color} />
      <path d={`M${x + 11} ${bodyY - 1} q3 -5 8 -5 q5 0 7 5 z`} fill="#bfdbfe" />
      <rect x={x} y={bodyY} width={w} height={8} rx={3} fill={color} />
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

function BeachHouse({ variant, cust, grown }: DrawProps) {
  const color = (variant && WALL_COLORS[variant]) || '#f1f5f9'
  const k = grown ? 1.12 : 1
  const wallH = 20 * k
  const deck = GROUND - 6
  const wallY = deck - wallH
  const x = 28
  const w = 24
  const cx = x + w / 2
  return (
    <g>
      {has(cust, 'garden', 'garden') && <Garden y={GROUND - 2} />}
      <rect x={x + 2} y={deck} width={3} height={6} fill="#a87b50" />
      <rect x={x + w - 5} y={deck} width={3} height={6} fill="#a87b50" />
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      <polygon points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${wallY - 14}`} fill="#0ea5e9" />
      <rect
        x={x + 4}
        y={wallY + 4}
        width={5}
        height={5}
        fill={has(cust, 'lights', 'lights') ? '#fde68a' : '#bae6fd'}
      />
      {has(cust, 'lights', 'lights') && <Lights y={wallY - 1} x={x} w={w} />}
    </g>
  )
}

function Boat({ variant, cust, grown }: DrawProps) {
  const hull = variant === 'white' ? '#e2e8f0' : '#a16207'
  const k = grown ? 1.12 : 1
  const sailH = 24 * k
  return (
    <g>
      <ellipse cx={40} cy={68} rx={22} ry={5} fill="#bae6fd" />
      <path d="M27 61 L53 61 L48 68 L32 68 Z" fill={hull} />
      <rect x={39} y={61 - sailH} width={2} height={sailH} fill="#7c5210" />
      <polygon points={`40,${61 - sailH + 2} 40,59 54,60`} fill="#f8fafc" />
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

function Accessory({ cust, headX, headY }: { cust: Cust; headX: number; headY: number }) {
  const a = cust.accessory
  if (a === 'hat') {
    return (
      <g>
        <rect x={headX - 5} y={headY - 8} width={10} height={2.5} fill="#1f2937" />
        <rect x={headX - 3} y={headY - 13} width={6} height={6} fill="#1f2937" />
      </g>
    )
  }
  if (a === 'collar') {
    return (
      <g>
        <rect x={headX - 6} y={headY + 6} width={12} height={2.5} rx={1} fill="#ef4444" />
        <circle cx={headX} cy={headY + 8.5} r={1.2} fill="#fbbf24" />
      </g>
    )
  }
  if (a === 'bandana') {
    return (
      <polygon
        points={`${headX - 6},${headY + 6} ${headX + 6},${headY + 6} ${headX},${headY + 13}`}
        fill="#10b981"
      />
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

function Bird({ variant, cust, grown }: DrawProps) {
  const c = FUR[variant ?? 'bluebird'] ?? '#38bdf8'
  const s = grown ? 1.15 : 1
  return (
    <g>
      <ellipse cx={40} cy={67} rx={12} ry={4} fill="#a16207" />
      <ellipse cx={39} cy={58} rx={9 * s} ry={7 * s} fill={c} />
      <circle cx={47} cy={53} r={4 * s} fill={c} />
      <polygon points="50,53 54,52 54,55" fill="#f59e0b" />
      <ellipse cx={37} cy={58} rx={5 * s} ry={4 * s} fill="#0ea5e9" opacity={0.5} />
      <circle cx={48} cy={52} r={1} fill="#1c1c1e" />
      <Accessory cust={cust} headX={47} headY={53} />
    </g>
  )
}

function Fox({ variant, cust, grown }: DrawProps) {
  const c = FUR[variant ?? 'red'] ?? '#ea580c'
  const belly = variant === 'arctic' ? '#f1f5f9' : '#fff'
  const s = grown ? 1.15 : 1
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
      <Accessory cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Cat({ variant, cust, grown }: DrawProps) {
  const c = FUR[variant ?? 'gray'] ?? '#9ca3af'
  const s = grown ? 1.15 : 1
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
      <Accessory cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Dog({ variant, cust, grown }: DrawProps) {
  const c = FUR[variant ?? 'corgi'] ?? '#a16207'
  const ear = variant === 'husky' ? '#475569' : '#7c3f10'
  const s = grown ? 1.18 : 1
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
      <Accessory cust={cust} headX={40} headY={50} />
    </g>
  )
}

function Goldfish({ variant, grown }: DrawProps) {
  const c = FUR[variant ?? 'orange'] ?? '#fb923c'
  const s = grown ? 1.2 : 1
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

function Snake({ variant, cust, grown }: DrawProps) {
  const c = FUR[variant ?? 'green'] ?? '#16a34a'
  const s = grown ? 1.2 : 1
  return (
    <g fill="none" stroke={c} strokeWidth={4 * s} strokeLinecap="round">
      <ellipse cx={40} cy={63} rx={12 * s} ry={5 * s} />
      <path d="M40 60 q7 -9 2 -16" />
      <circle cx={41} cy={45} r={3.2 * s} fill={c} stroke="none" />
      <circle cx={42} cy={44} r={0.8} fill="#1c1c1e" stroke="none" />
      <path d="M41 42 L41 38 M41 38 l-1.5 -2 M41 38 l1.5 -2" stroke="#dc2626" strokeWidth={0.7} />
      {cust.accessory === 'hat' && (
        <g stroke="none">
          <rect x={36} y={38} width={10} height={2.2} fill="#1f2937" />
          <rect x={38} y={33} width={6} height={5.5} fill="#1f2937" />
        </g>
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

function MushroomRing({ variant, cust, grown }: DrawProps) {
  const cap = MUSHROOM_CAP[variant ?? 'ruby'] ?? '#dc2626'
  const k = grown ? 1.18 : 1
  // A ring of toadstools around a grassy centre.
  const ring: Array<[number, number]> = [
    [28, 64],
    [40, 60],
    [52, 64],
    [34, 68],
    [46, 68],
  ]
  return (
    <g>
      <ellipse cx={40} cy={66} rx={20} ry={6} fill="#bbf7d0" opacity={0.7} />
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
    </g>
  )
}

const HEDGEHOG_BODY: Record<string, string> = { brown: '#92400e', cream: '#d6c1a8', salt: '#6b7280' }

function Hedgehog({ variant, cust, grown }: DrawProps) {
  const spine = HEDGEHOG_BODY[variant ?? 'brown'] ?? '#92400e'
  const s = grown ? 1.18 : 1
  const face = variant === 'cream' ? '#f5e6d3' : '#e9c9a3'
  const spikes = Array.from({ length: 7 }).map((_, i) => {
    const t = i / 6
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
    </g>
  )
}

const SNAIL_SHELL: Record<string, string> = { amber: '#d97706', minty: '#34d399', rosy: '#fb7185' }

function Snail({ variant, cust, grown }: DrawProps) {
  const shell = SNAIL_SHELL[variant ?? 'amber'] ?? '#d97706'
  const s = grown ? 1.2 : 1
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

function Gnome({ variant, cust, grown }: DrawProps) {
  const v = variant ?? 'classic'
  const hat = GNOME_HAT[v] ?? '#dc2626'
  const s = grown ? 1.18 : 1
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

function WindChime({ variant, cust, grown }: DrawProps) {
  const tube = CHIME_TUBE[variant ?? 'brass'] ?? '#d4a017'
  const s = grown ? 1.15 : 1
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

function Lantern({ variant, cust, grown }: DrawProps) {
  const frame = LANTERN_FRAME[variant ?? 'paper'] ?? '#fcd34d'
  const s = grown ? 1.18 : 1
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

function FrogLily({ variant, cust, grown }: DrawProps) {
  const body = FROG_BODY[variant ?? 'green'] ?? '#22c55e'
  const s = grown ? 1.18 : 1
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

function Scarecrow({ variant, cust, grown }: DrawProps) {
  const v = variant ?? 'straw'
  const shirt = SCARECROW_SHIRT[v] ?? '#a16207'
  const s = grown ? 1.15 : 1
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

function FairyDoor({ variant, cust, grown }: DrawProps) {
  const door = FAIRY_DOOR[variant ?? 'acorn'] ?? '#92400e'
  const s = grown ? 1.18 : 1
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

function Hammock({ variant, cust, grown }: DrawProps) {
  const cloth = HAMMOCK_CLOTH[variant ?? 'striped'] ?? '#f97316'
  const s = grown ? 1.12 : 1
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

function TeaCart({ variant, cust, grown }: DrawProps) {
  const body = TEACART_BODY[variant ?? 'rose'] ?? '#fb7185'
  const s = grown ? 1.12 : 1
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
  const grown = cust.grown === 'grown'
  const label = `${itemLabel(itemKey)}${variant ? ` (${variantLabel(variant)})` : ''}`
  return (
    <svg className="sanctuary-svg" viewBox="0 0 80 80" role="img" aria-label={label}>
      <ellipse cx={40} cy={72} rx={24} ry={4} fill="#dcfce7" />
      {Render ? (
        <Render variant={variant} cust={cust} grown={grown} />
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
