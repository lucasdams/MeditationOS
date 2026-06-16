// Procedural SVG render of a Sanctuary item. Each item is drawn from a chosen `variant`
// (a base form — a tree species, a dog breed, a wall color) plus a set of purchased
// `customizations` ({slot: option}), each of which makes a *real* visual change (fruit on
// a tree, a hat on a pet, lilies on a pond, smoke from a chimney). The backend owns what
// was bought; this owns rendering. viewBox is 0 0 80 80, in the existing flat style.

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

type Renderer = (props: DrawProps) => JSX.Element

const RENDERERS: Record<string, Renderer> = {
  tree: Tree,
  flower: Flower,
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
  dog: Dog,
}

// Items are drawn from their chosen variant + purchased customizations (each a real
// visual change). No more tier ladder — personalization is mix-and-match.
export default function SanctuaryPlant({
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
  const label = `${itemKey}${variant ? ` (${variant})` : ''}`
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
