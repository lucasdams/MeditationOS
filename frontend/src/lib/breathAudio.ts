// An "ocean breath" guide for the breathing pacer.
//
// A loop of soft brown noise runs for the whole session; we shape it with the
// breath: the wash swells up and opens brighter on the inhale, rests full during
// the top hold, recedes and darkens on the exhale, rests low during the bottom
// hold. It never fully cuts out (so there's no dropping-signal feel) and nothing
// starts/stops mid-session (so there are no clicks).

type Phase = 'inhale' | 'exhale'

export class BreathAudio {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private filter: BiquadFilterNode | null = null
  private gain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  volume = 0.5

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  resume(): void {
    void this.ensureContext().resume()
  }

  /** A couple of seconds of brown noise (soft, low — ocean/waterfall-like). */
  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const size = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5 // brown noise is quiet; bring it up to ~unity
    }
    this.noiseBuffer = buffer
    return buffer
  }

  /** Shape the wash toward this phase over `durationSec`. Lazily starts the loop. */
  glide(phase: Phase, durationSec: number): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime

    if (!this.source || !this.gain || !this.filter) {
      const source = ctx.createBufferSource()
      source.buffer = this.noise(ctx)
      source.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.Q.value = 0.6
      filter.frequency.setValueAtTime(phase === 'inhale' ? 280 : 1600, now)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now) // ramped up by the inhale below
      source.connect(filter).connect(gain).connect(ctx.destination)
      source.start(now)
      this.source = source
      this.filter = filter
      this.gain = gain
    }

    const swelling = phase === 'inhale'
    // Wide swell-to-trough gap so it feels like a wave rolling in and far out.
    const targetGain = swelling ? this.volume : this.volume * 0.04
    const targetCutoff = swelling ? 1600 : 280 // open brighter in / darker out

    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(Math.max(g.value, 0.0001), now)
    g.linearRampToValueAtTime(Math.max(targetGain, 0.0001), now + durationSec)

    const f = this.filter.frequency
    f.cancelScheduledValues(now)
    f.setValueAtTime(f.value, now)
    f.linearRampToValueAtTime(targetCutoff, now + durationSec)
  }

  /** Fade out and stop the wash (on pause / finish / toggle off) — no click. */
  stop(): void {
    if (!this.source || !this.gain || !this.ctx) return
    const now = this.ctx.currentTime
    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(Math.max(g.value, 0.0001), now)
    g.linearRampToValueAtTime(0.0001, now + 0.2)
    this.source.stop(now + 0.25)
    this.source = null
    this.filter = null
    this.gain = null
  }

  /** Optional soft bell at a transition — fire-and-forget, independent of the wash. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    const now = ctx.currentTime
    const base = phase === 'inhale' ? 880 : 660 // A5 going in / E5 coming out
    const peak = this.volume * 0.2 // very soft — sits well under the ocean wash

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
    this.noiseBuffer = null
  }
}
