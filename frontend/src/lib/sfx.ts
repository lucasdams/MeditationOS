// Small one-off sound effects (Web Audio). Gracefully no-ops if audio is blocked.

let ctx: AudioContext | null = null

// Create + unlock the context on the first user gesture, so the fanfare (which
// fires after async work, outside the original click) isn't blocked by autoplay.
if (typeof window !== 'undefined') {
  const warm = () => {
    try {
      if (!ctx) ctx = new AudioContext()
      void ctx.resume()
    } catch {
      // audio unavailable — ignore
    }
  }
  window.addEventListener('pointerdown', warm)
  window.addEventListener('keydown', warm)
}

export function playLevelUp(): void {
  try {
    if (!ctx) ctx = new AudioContext()
    void ctx.resume()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 · E5 · G5 · C6
    notes.forEach((freq, i) => {
      const t = ctx!.currentTime + i * 0.09
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.3)
    })
  } catch {
    // audio unavailable — skip silently
  }
}
