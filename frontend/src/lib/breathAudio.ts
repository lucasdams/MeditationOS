// A soft guide tone for the breathing pacer. Warm sine + a sub-octave through a
// low-pass filter (singing-bowl-ish), swelling in and fading fully to silence over
// each phase — so there's no click at the end and the holds are clean silence.

type Phase = 'inhale' | 'exhale'

export class BreathAudio {
  private ctx: AudioContext | null = null
  private toneNodes: OscillatorNode[] = []
  volume = 0.4

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  resume(): void {
    void this.ensureContext().resume()
  }

  playPhase(phase: Phase, durationSec: number): void {
    const ctx = this.ensureContext()
    this.stop() // stop the previous phase's tone (not chimes)

    const now = ctx.currentTime
    const end = now + durationSec
    // Mid-range so laptop speakers can actually reproduce it (a low sub-octave is
    // inaudible on small speakers). Gentle rise on the in-breath, fall on the out.
    const [from, to] = phase === 'inhale' ? [262, 330] : [330, 247] // C4→E4 in / E4→B3 out

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2400 // soften the upper partial, keep it warm

    // Slow swell in, hold, then fade fully to silence by the end (no click).
    const attack = Math.min(0.6, durationSec * 0.35)
    const release = Math.min(0.7, durationSec * 0.4)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(this.volume, now + attack)
    gain.gain.setValueAtTime(this.volume, Math.max(now + attack, end - release))
    gain.gain.linearRampToValueAtTime(0.0001, end)
    filter.connect(gain).connect(ctx.destination)

    // Fundamental + a soft octave above for a little air/warmth.
    for (const [mult, level] of [
      [1, 1],
      [2, 0.2],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(from * mult, now)
      osc.frequency.linearRampToValueAtTime(to * mult, end)
      const g = ctx.createGain()
      g.gain.value = level
      osc.connect(g).connect(filter)
      osc.start(now)
      osc.stop(end + 0.1)
      this.toneNodes.push(osc)
    }
  }

  /** Soft bell at a phase transition — fire-and-forget, independent of the tone.
   *  Sits well above the low guide tone so it cuts through instead of being masked. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime
    const base = phase === 'inhale' ? 880 : 660 // A5 going in / E5 coming out
    const peak = Math.max(0.16, this.volume) // audible even at a low guide volume

    const out = ctx.createGain()
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(peak, now + 0.008) // quick strike
    out.gain.setTargetAtTime(0, now + 0.008, 0.4) // natural bell decay (no zero-value pitfall)
    out.connect(ctx.destination)

    // Fundamental + a softer, brighter partial for a bell-like shimmer.
    for (const [mult, level] of [
      [1, 1],
      [2.01, 0.35],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = base * mult
      const g = ctx.createGain()
      g.gain.value = level
      osc.connect(g).connect(out)
      osc.start(now)
      osc.stop(now + 2)
    }
  }

  /** Stop the gliding tone (chimes are short and ring out on their own). */
  stop(): void {
    for (const osc of this.toneNodes) {
      try {
        osc.stop()
      } catch {
        // already stopped
      }
      osc.disconnect()
    }
    this.toneNodes = []
  }

  close(): void {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
