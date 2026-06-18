// Procedural flame for Trataka (candle-gazing) — pure math, no DOM.
//
// The flame is drawn on a <canvas> by sampling these functions each frame. Keeping the
// geometry as pure functions of time means the sway/flicker is unit-testable in
// isolation and the renderer stays a thin shell. Mirrors the codebase's preference for
// procedural visuals (no image/video assets) — see `lib/breathPattern.ts`.

// A flame "pose" at a moment in time: a horizontal sway of the tip, a vertical stretch,
// and a brightness — all gentle, organic, and bounded. Coordinates are normalized so the
// renderer scales them to whatever canvas size it has.
export interface FlamePose {
  // Horizontal offset of the flame tip, in flame-widths. Bounded to roughly [-0.5, 0.5].
  sway: number
  // Vertical stretch multiplier for the flame height. Bounded to roughly [0.85, 1.15].
  stretch: number
  // Overall brightness, 0..1, used to modulate the glow/opacity so it "breathes".
  brightness: number
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// Sum of a few incommensurate sines → an organic, non-repeating drift rather than an
// obvious loop. Amplitudes are deliberately small so the flame sways, never jitters.
function organicWave(t: number, freqs: number[], amps: number[], phases: number[]): number {
  let v = 0
  for (let i = 0; i < freqs.length; i++) {
    v += amps[i] * Math.sin(t * freqs[i] + phases[i])
  }
  return v
}

// The flame's pose at time `t` (seconds). `intensity` scales the motion: 1 = normal
// gentle sway; 0 = perfectly still (used for the reduced-motion fallback). Intermediate
// values give a "very gentle" flame.
export function flamePoseAt(t: number, intensity = 1): FlamePose {
  const k = clamp(intensity, 0, 1)
  // Slow, layered sway — periods of ~3.4s, ~5.7s, ~8.9s never line up, so it wanders.
  const sway = k * organicWave(t, [1.83, 1.1, 0.71], [0.16, 0.1, 0.06], [0, 1.7, 4.1])
  // Gentle vertical breathing of the flame body.
  const stretch = 1 + k * organicWave(t, [2.3, 0.9], [0.07, 0.05], [2.0, 0.3])
  // Flicker in brightness — a touch faster, but still soft.
  const brightness = 0.85 + k * 0.15 * (0.5 + 0.5 * Math.sin(t * 3.1 + 0.6))
  return {
    sway: clamp(sway, -0.5, 0.5),
    stretch: clamp(stretch, 0.85, 1.15),
    brightness: clamp(brightness, 0, 1),
  }
}
