// Pure breathing-pacer math, shared by BreathePage and its tests. A breath cycle is
// inhale → hold-full → exhale → hold-empty, each phase its own length in seconds — so
// named presets like box (4·4·4·4) or 4·7·8 work, not just the longer-exhale resonance
// default. The visible circle scales MIN..MAX across inhale/exhale and holds at the turns.

export const MIN_SCALE = 0.35
export const MAX_SCALE = 1
export const HOLD = 1 // default 1s hold at each turn for resonance pacing

export type Segment = 'inhale' | 'hold-full' | 'exhale' | 'hold-empty'
export type Pattern = { inhale: number; holdFull: number; exhale: number; holdEmpty: number }

export const SEGMENT_LABEL: Record<Segment, string> = {
  inhale: 'Breathe in',
  'hold-full': 'Hold',
  exhale: 'Breathe out',
  'hold-empty': 'Hold',
}

// Whole-second inhale/exhale for a target pace, at a ~2:3 in:out ratio (longer exhale).
// total = round(60/bpm) is strictly decreasing over 1–10; inhale takes ~2/5 of it (≥1s).
export const phasesForBpm = (bpm: number): { inhale: number; exhale: number } => {
  const total = Math.round(60 / bpm)
  const inhale = Math.max(1, Math.round((total * 2) / 5))
  return { inhale, exhale: total - inhale }
}

// Resonance pace → a Pattern with the default 1s holds at each turn.
export const patternForBpm = (bpm: number): Pattern => {
  const { inhale, exhale } = phasesForBpm(bpm)
  return { inhale, holdFull: HOLD, exhale, holdEmpty: HOLD }
}

export const cycleLength = (p: Pattern): number =>
  p.inhale + p.holdFull + p.exhale + p.holdEmpty

export const segmentAt = (pos: number, p: Pattern): Segment => {
  if (pos < p.inhale) return 'inhale'
  if (pos < p.inhale + p.holdFull) return 'hold-full'
  if (pos < p.inhale + p.holdFull + p.exhale) return 'exhale'
  return 'hold-empty'
}

export const scaleAt = (pos: number, p: Pattern): number => {
  if (pos < p.inhale) return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * (pos / p.inhale)
  if (pos < p.inhale + p.holdFull) return MAX_SCALE
  if (pos < p.inhale + p.holdFull + p.exhale) {
    return MAX_SCALE - (MAX_SCALE - MIN_SCALE) * ((pos - p.inhale - p.holdFull) / p.exhale)
  }
  return MIN_SCALE
}

// --- Audio cue events (for the look-ahead scheduler) ------------------------
// The breath drives two audio cues per cycle — the inhale at the cycle start and the
// exhale after the inhale + full-hold (holds carry no cue). `breathEventAt` gives the
// nth cue (n = 0, 1, 2, …) as a time offset (seconds from the run's inhale start) plus
// its phase duration, so audio can be scheduled ahead on the Web Audio clock instead of
// reacting to a JS timer (which background tabs throttle).
export interface BreathEvent {
  phase: 'inhale' | 'exhale'
  time: number // seconds from the run's inhale start
  duration: number // the phase length, for the gain/filter glide
}

export function breathEventAt(p: Pattern, n: number): BreathEvent {
  const cyc = cycleLength(p)
  const k = Math.floor(n / 2)
  if (n % 2 === 0) {
    return { phase: 'inhale', time: k * cyc, duration: p.inhale }
  }
  return { phase: 'exhale', time: k * cyc + p.inhale + p.holdFull, duration: p.exhale }
}

export type Preset = { key: string; label: string; pattern: Pattern | null; hint: string }

// `pattern: null` = resonance (the user's bpm Stepper drives it); the rest are fixed
// named cadences, each with its own holds.
export const PRESETS: Preset[] = [
  { key: 'resonance', label: 'Resonance', pattern: null, hint: 'Longer exhale — pick your pace below' },
  { key: 'coherence', label: 'Coherence', pattern: { inhale: 5, holdFull: 0, exhale: 5, holdEmpty: 0 }, hint: '5 in · 5 out (~6 breaths/min), balanced' },
  { key: 'box', label: 'Box', pattern: { inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 }, hint: '4 in · 4 hold · 4 out · 4 hold' },
  { key: '478', label: '4·7·8', pattern: { inhale: 4, holdFull: 7, exhale: 8, holdEmpty: 0 }, hint: '4 in · 7 hold · 8 out — calming' },
]

export const PRESET_STORAGE_KEY = 'breathe.preset'

export const loadPreset = (): string => {
  try {
    const k = localStorage.getItem(PRESET_STORAGE_KEY)
    if (k && PRESETS.some((p) => p.key === k)) return k
  } catch {
    // localStorage unavailable — default to resonance.
  }
  return 'resonance'
}

// Compact human label for a pattern's timing (holds shown only when present).
export const patternSummary = (p: Pattern): string =>
  p.holdFull || p.holdEmpty
    ? `${p.inhale}·${p.holdFull}·${p.exhale}·${p.holdEmpty}`
    : `${p.inhale} in · ${p.exhale} out`
