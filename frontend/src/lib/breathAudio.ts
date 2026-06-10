// A continuous guide tone for the breathing pacer.
//
// One sine oscillator runs for the whole session and never restarts — we only
// *glide its pitch*: up over the inhale, resting at the top during the hold,
// down over the exhale, resting at the bottom. Because the oscillator never
// starts/stops mid-session and the gain stays steady, there are no clicks and
// the tone never cuts out (the old per-breath approach created/destroyed a tone
// each phase, which clicked and felt like a dropping signal).

type Phase = 'inhale' | 'exhale'

const LOW = 247 // B3 — bottom of the breath (rest after exhale)
const HIGH = 330 // E4 — top of the breath (rest after inhale)

export class BreathAudio {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private gain: GainNode | null = null
  volume = 0.3

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  resume(): void {
    void this.ensureContext().resume()
  }

  /** Glide the continuous tone toward this phase's pitch over `durationSec`.
   *  Lazily spins up the oscillator on the first call (with a soft fade-in). */
  glide(phase: Phase, durationSec: number): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime

    if (!this.osc || !this.gain) {
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(this.volume, now + 0.4) // soft fade-in, no click
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(phase === 'inhale' ? LOW : HIGH, now)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      this.osc = osc
      this.gain = gain
    }

    const target = phase === 'inhale' ? HIGH : LOW
    const freq = this.osc.frequency
    freq.cancelScheduledValues(now)
    freq.setValueAtTime(freq.value, now) // continue from wherever we are
    freq.linearRampToValueAtTime(target, now + durationSec)

    // Keep the level steady (and pick up any volume-slider change) without dipping.
    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(this.volume, now + 0.1)
  }

  /** Fade out and stop the tone (on pause / finish / toggle off) — no click. */
  stop(): void {
    if (!this.osc || !this.gain || !this.ctx) return
    const now = this.ctx.currentTime
    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0.0001, now + 0.15)
    this.osc.stop(now + 0.2)
    this.osc = null
    this.gain = null
  }

  /** Optional soft bell at a transition — fire-and-forget, independent of the tone. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime
    const base = phase === 'inhale' ? 880 : 660 // A5 going in / E5 coming out
    const peak = Math.max(0.16, this.volume)

    const out = ctx.createGain()
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(peak, now + 0.008) // quick strike
    out.gain.setTargetAtTime(0, now + 0.008, 0.4) // natural bell decay
    out.connect(ctx.destination)

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

  close(): void {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
