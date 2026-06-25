// Pure breathing-pacer math, shared by BreathePage and its tests. A breath cycle is
// inhale → hold-full → exhale → hold-empty, each phase its own length in seconds — so
// named presets like box (4·4·4·4) work, not just the longer-exhale resonance default
// (the model still supports fixed protocols). The visible circle scales MIN..MAX across
// inhale/exhale and holds at the turns.

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

// Box → an equal four-phase breath at `count` seconds each (in · hold · out · hold).
export const boxPatternForCount = (count: number): Pattern => ({
  inhale: count,
  holdFull: count,
  exhale: count,
  holdEmpty: count,
})

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

export type Preset = {
  key: string
  label: string
  hint: string
  // Which control adjusts it: 'bpm' = the breaths/min pace (rate patterns), 'count' =
  // seconds-per-phase (box), 'none' = a fixed named protocol (none ship today, but the
  // type stays so one can be reintroduced). Adjustable presets carry `derive` (control
  // value → pattern) and a null `pattern`; 'none' carries the fixed `pattern`.
  control: 'bpm' | 'count' | 'none'
  pattern: Pattern | null
  derive?: (value: number) => Pattern
}

// A brisk, invigorating breath: active inhale, quick exhale, no holds (5s cycle =
// 12 breaths/min) — the inverse of resonance's long exhale. Fixed, no pace slider.
export const ENERGIZING_PATTERN: Pattern = { inhale: 3, holdFull: 0, exhale: 2, holdEmpty: 0 }

// Nadi Shodhana (alternate-nostril): a balanced, calming 4·4·4 breath — inhale, hold,
// exhale, no empty-hold (12s cycle). Fixed pace; the distinctive part is switching the
// active nostril each round, which BreathePage surfaces as a left/right cue.
export const ALTERNATE_NOSTRIL_PATTERN: Pattern = { inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 0 }

export const PRESETS: Preset[] = [
  { key: 'resonance', label: 'Resonance', control: 'bpm', pattern: null, derive: patternForBpm, hint: 'Longer exhale, at your pace' },
  { key: 'box', label: 'Box', control: 'count', pattern: null, derive: boxPatternForCount, hint: 'Equal in · hold · out · hold' },
  { key: 'energizing', label: 'Energizing', control: 'none', pattern: ENERGIZING_PATTERN, hint: 'Active inhale, brisk pace' },
  { key: 'alternate', label: 'Alternate nostril', control: 'none', pattern: ALTERNATE_NOSTRIL_PATTERN, hint: 'Nadi Shodhana — switch nostrils each round' },
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
