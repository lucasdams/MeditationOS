// Small one-off sound effects (Web Audio). Gracefully no-ops if audio is blocked.
// Uses the shared, gesture-unlocked context (see audioContext.ts).

import { getAudioContext } from './audioContext'

/**
 * A soft singing-bowl bell for meditation cues (start, interval, end).
 * Two sine partials with a long, gentle decay. `volume` is 0–1.
 */
export function playBell(volume = 0.6): void {
  try {
    const ctx = getAudioContext()
    // Safari drops sound scheduled while suspended — resume, then retry when ready.
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => playBell(volume)).catch(() => {})
      return
    }
    const t = ctx.currentTime
    const partials = [
      { freq: 320, gain: 1 }, // fundamental
      { freq: 640, gain: 0.4 }, // octave shimmer
    ]
    const vol = Math.max(0, Math.min(1, volume))
    partials.forEach(({ freq, gain }) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const peak = 0.3 * gain * vol
      // Linear ramps (Safari mishandles exponential ramps from near-zero values).
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + 0.01)
      g.gain.linearRampToValueAtTime(0, t + 2.6)
      osc.connect(g).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 2.7)
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
