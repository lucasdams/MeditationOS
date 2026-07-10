// TEMP concept sketches — exploratory shape ideas to review + cut/adjust before wiring into Spirit.tsx.
// Standalone SVGs (no palette/animation pipeline) drawn in the dosha palette, just to judge silhouette.
// Delete this file + its FormGallery section once the ideas are chosen. (Coals rock already shipped;
// folded-wings / peacock / downy feather concepts were cut. Remaining: the spread-WINGS idea.)

// Vata (air) — amethyst palette.
const V = { core: '#f6f0ff', glow: '#c9b0f5', accent: '#9061e8', deep: '#5b34ad' }

const svgStyle: React.CSSProperties = { width: '100%', display: 'block' }

// A pointed FEATHER path from a shoulder point out along an angle (deg, 0 = +x, up = positive).
function featherPath(sx: number, sy: number, aDeg: number, L: number, w: number): string {
  const a = (aDeg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = -Math.sin(a)
  const px = -uy
  const py = ux
  const tx = sx + ux * L
  const ty = sy + uy * L
  const mx = sx + ux * L * 0.5
  const my = sy + uy * L * 0.5
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${(mx + px * w).toFixed(1)} ${(my + py * w).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q ${(mx - px * w).toFixed(1)} ${(my - py * w).toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)} Z`
}

// An open-eyed round face (glint eyes + smile).
function BrightFace({ fx, fy, ink }: { fx: number; fy: number; ink: string }) {
  return (
    <>
      <circle cx={fx - 2.1} cy={fy - 0.4} r={0.95} fill={ink} />
      <circle cx={fx + 2.1} cy={fy - 0.4} r={0.95} fill={ink} />
      <circle cx={fx - 2.4} cy={fy - 0.7} r={0.32} fill="#fff" />
      <circle cx={fx + 1.8} cy={fy - 0.7} r={0.32} fill="#fff" />
      <path d={`M ${fx - 2} ${fy + 2} q 2 1.5 4 0`} fill="none" stroke={ink} strokeWidth={0.7} strokeLinecap="round" />
    </>
  )
}

// ── WINGS: a spread PAIR of feathered wings sweeping OUT from a little bird-body ────────────────
function WingsSpread() {
  const wing = (dir: 1 | -1) => {
    const sx = 40 + dir * 3
    const sy = 46
    const A = (aDeg: number) => (dir < 0 ? 180 - aDeg : aDeg)
    // long primary feathers (back layer) sweeping outward + up, longest in the middle of the fan.
    const prim = [
      { a: 4, L: 15, w: 2.4 },
      { a: 20, L: 19.5, w: 2.9 },
      { a: 37, L: 21, w: 3 },
      { a: 54, L: 18.5, w: 2.7 },
      { a: 70, L: 13.5, w: 2.2 },
    ]
    // shorter covert feathers (front layer) fluffing over the shoulder.
    const cov = [
      { a: 16, L: 9, w: 2 },
      { a: 34, L: 11, w: 2.2 },
      { a: 52, L: 9, w: 2 },
    ]
    return (
      <>
        {prim.map((s, k) => (
          <path key={`p${k}`} d={featherPath(sx, sy, A(s.a), s.L, s.w)} fill={V.accent} stroke={V.deep} strokeWidth={0.4} strokeLinejoin="round" opacity={0.92} />
        ))}
        {cov.map((s, k) => (
          <path key={`c${k}`} d={featherPath(sx + dir * 0.6, sy + 1.8, A(s.a), s.L, s.w)} fill={V.glow} stroke={V.deep} strokeWidth={0.4} strokeLinejoin="round" opacity={0.96} />
        ))}
      </>
    )
  }
  return (
    <svg viewBox="0 0 80 80" style={svgStyle}>
      {/* wings behind the body */}
      {wing(1)}
      {wing(-1)}
      {/* a little rounded body + head in front */}
      <ellipse cx={40} cy={53} rx={4.8} ry={6.2} fill={V.glow} stroke={V.deep} strokeWidth={0.5} />
      <circle cx={40} cy={44} r={4.6} fill={V.core} stroke={V.deep} strokeWidth={0.5} />
      <BrightFace fx={40} fy={44} ink={V.deep} />
    </svg>
  )
}

export const CONCEPTS: { group: string; label: string; note: string; El: () => JSX.Element }[] = [
  { group: 'Feather → Wings', label: 'Spread wings', note: 'wings sweeping out from a little bird-body', El: WingsSpread },
]

export function ConceptCard({ label, note, El }: { label: string; note: string; El: () => JSX.Element }) {
  return (
    <div style={{ width: 150, textAlign: 'center', background: '#fff', border: '1px solid #eadfce', borderRadius: 12, padding: 6 }}>
      <El />
      <div style={{ font: '600 13px system-ui', marginTop: 2 }}>{label}</div>
      <div style={{ font: '400 11px system-ui', color: '#8a7f70' }}>{note}</div>
    </div>
  )
}
