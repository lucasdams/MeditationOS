// A gliding/fading guide tone for the breathing pacer.
// Each phase schedules an oscillator whose pitch + volume ramp across the phase's
// exact duration, so the changing sound tells you where you are in the breath.

type Phase = 'inhale' | 'exhale'

export class BreathAudio {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private gain: GainNode | null = null
  volume = 0.2

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
    this.stop()

    const now = ctx.currentTime
    const end = now + durationSec
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'

    // Inhale glides up; exhale glides down.
    const [from, to] = phase === 'inhale' ? [196, 294] : [294, 165]
    osc.frequency.setValueAtTime(from, now)
    osc.frequency.linearRampToValueAtTime(to, end)

    // Inhale swells then holds; exhale fades to silence by the end.
    gain.gain.setValueAtTime(0.0001, now)
    if (phase === 'inhale') {
      gain.gain.linearRampToValueAtTime(this.volume, now + durationSec * 0.5)
      gain.gain.linearRampToValueAtTime(this.volume * 0.85, end)
    } else {
      gain.gain.linearRampToValueAtTime(this.volume, now + durationSec * 0.2)
      gain.gain.linearRampToValueAtTime(0.0001, end)
    }

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(end + 0.05)
    this.osc = osc
    this.gain = gain
  }

  /** A short bell ping marking a phase transition. Higher for inhale, lower for
   *  exhale. Independent of the guide tone (own nodes), so it can play alone. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = phase === 'inhale' ? 660 : 440
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, this.volume), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.4)
  }

  stop(): void {
    if (this.osc) {
      try {
        this.osc.stop()
      } catch {
        // already stopped
      }
      this.osc.disconnect()
      this.osc = null
    }
    this.gain?.disconnect()
    this.gain = null
  }

  close(): void {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
