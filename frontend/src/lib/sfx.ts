// Small one-off sound effects (Web Audio). Gracefully no-ops if audio is blocked.
// Uses the shared, gesture-unlocked context (see audioContext.ts).

import { getAudioContext } from './audioContext'

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
