// An "ocean breath" guide for the breathing pacer.
//
// A loop of soft brown noise runs for the whole session; we shape it with the
// breath: the wash swells up and opens brighter on the inhale, recedes and darkens
// on the exhale. It never fully cuts out and nothing starts/stops mid-session (so
// there are no clicks). Gain/filter are ramped from a *tracked* rest value (not a
// read of AudioParam.value, which is ambiguous across browsers).

import { getAudioContext } from './audioContext'

type Phase = 'inhale' | 'exhale'

export class BreathAudio {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private filter: BiquadFilterNode | null = null
  private gain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private gainTarget = 0.0001
  private filterTarget = 320
  volume = 0.6

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = getAudioContext()
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
    void ctx.resume() // guarantee the context is running before we schedule
    const now = ctx.currentTime

    if (!this.source || !this.gain || !this.filter) {
      const source = ctx.createBufferSource()
      source.buffer = this.noise(ctx)
      source.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.Q.value = 0.6
      this.filterTarget = phase === 'inhale' ? 320 : 1600
      filter.frequency.setValueAtTime(this.filterTarget, now)
      const gain = ctx.createGain()
      this.gainTarget = 0.0001
      gain.gain.setValueAtTime(this.gainTarget, now)
      source.connect(filter).connect(gain).connect(ctx.destination)
      source.start(now)
      this.source = source
      this.filter = filter
      this.gain = gain
    }

    const swelling = phase === 'inhale'
    // Swells loud on the in-breath, recedes (but stays audible) on the out-breath.
    const targetGain = swelling ? this.volume : this.volume * 0.2
    const targetCutoff = swelling ? 1600 : 320 // open brighter in / darker out

    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(this.gainTarget, now) // continue from the last rest value
    g.linearRampToValueAtTime(targetGain, now + durationSec)
    this.gainTarget = targetGain

    const f = this.filter.frequency
    f.cancelScheduledValues(now)
    f.setValueAtTime(this.filterTarget, now)
    f.linearRampToValueAtTime(targetCutoff, now + durationSec)
    this.filterTarget = targetCutoff
  }

  /** Fade out and stop the wash (on pause / finish / toggle off) — no click. */
  stop(): void {
    if (!this.source || !this.gain || !this.ctx) return
    const now = this.ctx.currentTime
    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(this.gainTarget, now)
    g.linearRampToValueAtTime(0.0001, now + 0.2)
    this.source.stop(now + 0.25)
    this.source = null
    this.filter = null
    this.gain = null
    this.gainTarget = 0.0001
    this.filterTarget = 320
  }

  /** A clear, loud test tone played synchronously — the simplest possible Web Audio
   *  path, for confirming sound output works at all. */
  testBeep(): void {
    const ctx = this.ensureContext()
    void ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 440
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
  }

  /** Soft bell at a transition — fire-and-forget, independent of the wash. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    void ctx.resume()
    const now = ctx.currentTime
    const base = phase === 'inhale' ? 880 : 660 // A5 going in / E5 coming out
    const peak = Math.max(0.14, this.volume * 0.4) // audible bell, still soft

    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, now)
    out.gain.linearRampToValueAtTime(peak, now + 0.01) // quick strike
    out.gain.setTargetAtTime(0, now + 0.01, 0.4) // natural bell decay
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
    // The AudioContext is shared app-wide (see audioContext.ts) — stop our nodes
    // but never close it, or other sounds (the level-up fanfare) would go silent.
    this.stop()
    this.ctx = null
    this.noiseBuffer = null
  }
}
