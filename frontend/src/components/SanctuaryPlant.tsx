// Procedural SVG render of a Sanctuary item. Drawn parametrically from `progress`
// (0..1) so a plant grows smoothly as you practice — the vector successor to the
// ASCII art. The backend owns *growth* (the progress value); this owns *rendering*.

const GROUND = 70
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
// Eased appearance of a feature that starts at `from` and is full by progress 1.
const reveal = (p: number, from: number) => clamp01((p - from) / (1 - from))

function Tree({ p }: { p: number }) {
  const trunkH = 6 + 26 * p
  const trunkY = GROUND - trunkH
  const r = 5 + 15 * p
  const cy = trunkY - r * 0.3
  return (
    <g>
      <rect x={37} y={trunkY} width={6} height={trunkH} rx={2} fill="#8b5a2b" />
      {p > 0.04 && (
        <g fill="#22c55e">
          <circle cx={40 - r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40 + r * 0.55} cy={cy + 3} r={r * 0.8} />
          <circle cx={40} cy={cy} r={r} />
        </g>
      )}
    </g>
  )
}

function Flower({ p }: { p: number }) {
  const stemH = 6 + 30 * p
  const top = GROUND - stemH
  const b = reveal(p, 0.4)
  return (
    <g>
      <rect x={39} y={top} width={2} height={stemH} rx={1} fill="#16a34a" />
      {p > 0.25 && <ellipse cx={34} cy={top + stemH * 0.4} rx={6} ry={3} fill="#4ade80" />}
      {b > 0 && (
        <g opacity={b}>
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const a = (deg * Math.PI) / 180
            return (
              <circle
                key={deg}
                cx={40 + Math.cos(a) * 5 * b}
                cy={top + Math.sin(a) * 5 * b}
                r={4 * b}
                fill="#f472b6"
              />
            )
          })}
          <circle cx={40} cy={top} r={3 * b} fill="#fbbf24" />
        </g>
      )}
    </g>
  )
}

function Pond({ p }: { p: number }) {
  return (
    <g>
      <ellipse cx={40} cy={66} rx={22} ry={8} fill="none" stroke="#94a3b8" strokeWidth={2} />
      <ellipse cx={40} cy={66} rx={4 + 16 * p} ry={2 + 6 * p} fill="#38bdf8" />
      {p > 0.7 && (
        <g stroke="#bae6fd" strokeWidth={1.2} fill="none" opacity={reveal(p, 0.7)}>
          <path d="M30 64 q4 -3 8 0" />
          <path d="M44 68 q4 -3 8 0" />
        </g>
      )}
    </g>
  )
}

function Building({ p, color, roof, x, w }: { p: number; color: string; roof: string; x: number; w: number }) {
  const wallH = 4 + 22 * p
  const wallY = GROUND - wallH
  const r = reveal(p, 0.45)
  const cx = x + w / 2
  return (
    <g>
      <rect x={x} y={wallY} width={w} height={wallH} fill={color} />
      {r > 0 && (
        <polygon
          points={`${x - 2},${wallY} ${x + w + 2},${wallY} ${cx},${wallY - 16 * r}`}
          fill={roof}
          opacity={r}
        />
      )}
      {p > 0.7 && (
        <rect x={cx - 3} y={GROUND - 11} width={6} height={11} fill={roof} opacity={reveal(p, 0.7)} />
      )}
    </g>
  )
}

function Bird({ p }: { p: number }) {
  const hatched = p >= 0.45
  const s = 0.6 + 0.4 * reveal(p, 0.45)
  return (
    <g>
      <ellipse cx={40} cy={67} rx={12} ry={4} fill="#a16207" />
      {!hatched ? (
        <ellipse cx={40} cy={62} rx={6} ry={7} fill="#fde68a" />
      ) : (
        <g opacity={reveal(p, 0.45)}>
          <ellipse cx={39} cy={58} rx={9 * s} ry={7 * s} fill="#38bdf8" />
          <circle cx={47} cy={53} r={4 * s} fill="#38bdf8" />
          <polygon points={`${50 * 1},${53} ${50 + 4},${52} ${50 + 4},${55}`} fill="#f59e0b" />
          <ellipse cx={37} cy={58} rx={5 * s} ry={4 * s} fill="#0ea5e9" />
          <circle cx={48} cy={52} r={1} fill="#1c1c1e" />
        </g>
      )}
    </g>
  )
}

function Fox({ p }: { p: number }) {
  const up = p >= 0.4
  const s = 0.6 + 0.4 * reveal(p, 0.4)
  if (!up) return <ellipse cx={40} cy={64} rx={10} ry={5} fill="#ea580c" />
  return (
    <g opacity={reveal(p, 0.4)}>
      <ellipse cx={40} cy={62} rx={11 * s} ry={8 * s} fill="#ea580c" />
      <ellipse cx={51} cy={64} rx={5 * s} ry={3 * s} fill="#fff" />
      <circle cx={40} cy={50} r={6 * s} fill="#ea580c" />
      <polygon points={`${35},${46} ${33},${38} ${39},${44}`} fill="#ea580c" />
      <polygon points={`${45},${46} ${47},${38} ${41},${44}`} fill="#ea580c" />
      <polygon points={`${40},${50} ${36},${52} ${44},${52}`} fill="#fff" />
      <circle cx={37} cy={49} r={1} fill="#1c1c1e" />
      <circle cx={43} cy={49} r={1} fill="#1c1c1e" />
    </g>
  )
}

const RENDERERS: Record<string, (props: { p: number }) => JSX.Element> = {
  tree: Tree,
  flower: Flower,
  pond: Pond,
  hut: (props) => <Building {...props} color="#d4a373" roof="#7c3f25" x={28} w={24} />,
  barn: (props) => <Building {...props} color="#b91c1c" roof="#7f1d1d" x={24} w={32} />,
  bird: Bird,
  fox: Fox,
}

export default function SanctuaryPlant({ itemKey, progress }: { itemKey: string; progress: number }) {
  const Render = RENDERERS[itemKey]
  const p = clamp01(progress)
  return (
    <svg className="sanctuary-svg" viewBox="0 0 80 80" role="img" aria-label={itemKey}>
      <ellipse cx={40} cy={72} rx={24} ry={4} fill="#dcfce7" />
      {Render ? <Render p={p} /> : <circle cx={40} cy={50} r={6} fill="#cbd5e1" />}
    </svg>
  )
}
