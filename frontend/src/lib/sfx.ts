// Small one-off sound effects (Web Audio). Gracefully no-ops if audio is blocked.
// Uses the shared, gesture-unlocked context (see audioContext.ts).

import { getAudioContext } from './audioContext'

/**
 * A soft, short UI "tick" for tactile feedback when pressing controls (the
 * duration / breaths-per-minute steppers, etc.). Deliberately quiet and brief so
 * rapid presses stay pleasant, not fatiguing. `volume` is 0–1. Always fired from a
 * click handler, so the shared audio context is already gesture-unlocked.
 */
export function playClick(volume = 0.5): void {
  try {
    const ctx = getAudioContext()
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => playClick(volume)).catch(() => {})
      return
    }
    const t = ctx.currentTime
    const vol = Math.max(0, Math.min(1, volume))
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 1100
    const peak = 0.12 * vol
    // Linear ramps (Safari mishandles exponential ramps from near-zero values).
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.005) // quick attack
    g.gain.linearRampToValueAtTime(0, t + 0.05) // short decay
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.06)
  } catch {
    // audio unavailable — skip silently
  }
}

// The meditation cue can be one of several soft bells. Each is a set of sine
// partials (freq in Hz, relative gain) plus a decay time. Pitched low and warm —
// these read as "bell", not "alarm". `peak` scales the overall loudness down a
// touch from the old default so the cue sits gently under the room.
export type BellSound = 'bowl' | 'chime' | 'gong' | 'soft'

type BellSpec = { partials: { freq: number; gain: number }[]; decay: number; peak: number }

const BELLS: Record<BellSound, BellSpec> = {
  // Singing bowl — the default. Lower fundamental than before (A3, was 320 Hz)
  // so the bell sounds deeper and rounder.
  bowl: { partials: [{ freq: 220, gain: 1 }, { freq: 440, gain: 0.35 }], decay: 2.8, peak: 0.26 },
  // Brighter, shorter tap.
  chime: { partials: [{ freq: 330, gain: 1 }, { freq: 660, gain: 0.3 }], decay: 1.8, peak: 0.24 },
  // Deep gong — low fundamental with a slightly detuned partial for body.
  gong: {
    partials: [{ freq: 110, gain: 1 }, { freq: 165, gain: 0.5 }, { freq: 221, gain: 0.25 }],
    decay: 3.6,
    peak: 0.3,
  },
  // Plain, muted soft bell.
  soft: { partials: [{ freq: 196, gain: 1 }], decay: 2.2, peak: 0.22 },
}

export const BELL_SOUNDS: { value: BellSound; label: string }[] = [
  { value: 'bowl', label: 'Singing bowl' },
  { value: 'chime', label: 'Chime' },
  { value: 'gong', label: 'Gong' },
  { value: 'soft', label: 'Soft bell' },
]

/**
 * A soft bell for meditation cues (start, interval, end). `volume` is 0–1;
 * `sound` selects the timbre (see BELL_SOUNDS).
 */
export function playBell(volume = 0.6, sound: BellSound = 'bowl'): void {
  try {
    const ctx = getAudioContext()
    // Safari drops sound scheduled while suspended — resume, then retry when ready.
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => playBell(volume, sound)).catch(() => {})
      return
    }
    const t = ctx.currentTime
    const spec = BELLS[sound] ?? BELLS.bowl
    const vol = Math.max(0, Math.min(1, volume))
    spec.partials.forEach(({ freq, gain }) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const peak = spec.peak * gain * vol
      // Linear ramps (Safari mishandles exponential ramps from near-zero values).
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + 0.01)
      g.gain.linearRampToValueAtTime(0, t + spec.decay)
      osc.connect(g).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + spec.decay + 0.1)
    })
  } catch {
    // audio unavailable — skip silently
  }
}

/**
 * A short, bright two-note chime for earning XP / completing a task — lighter than
 * the level-up fanfare, which still plays on a level crossing.
 */
export function playReward(): void {
  try {
    const ctx = getAudioContext()
    if (ctx.state !== 'running') {
      void ctx.resume().then(playReward).catch(() => {})
      return
    }
    const notes = [659.25, 987.77] // E5 · B5 — a gentle rising "ding"
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.11
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02)
      gain.gain.linearRampToValueAtTime(0, t + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  } catch {
    // audio unavailable — skip silently
  }
}

export function playLevelUp(): void {
  try {
    const ctx = getAudioContext()
    // Safari drops sound scheduled while suspended — resume, then retry when ready.
    if (ctx.state !== 'running') {
      void ctx.resume().then(playLevelUp).catch(() => {})
      return
    }
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 · E5 · G5 · C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.09
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      // Linear ramps (Safari mishandles exponential ramps from near-zero values).
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
      gain.gain.linearRampToValueAtTime(0, t + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.3)
    })
  } catch {
    // audio unavailable — skip silently
  }
}
