// An "ocean breath" guide for the breathing pacer.
//
// A loop of soft brown noise runs for the whole session; we shape it with the
// breath: the wash swells up and opens brighter on the inhale, recedes and darkens
// on the exhale. It never fully cuts out and nothing starts/stops mid-session (so
// there are no clicks). Gain/filter are ramped from a *tracked* rest value (not a
// read of AudioParam.value, which is ambiguous across browsers).

import { getAudioContext } from './audioContext'

type Phase = 'inhale' | 'exhale'

// The ambient wash can take a few characters. Each shapes the same breath-driven
// loop differently: the noise colour (brown = deep, white = airy) and the filter
// band it sweeps between on the out-/in-breath (`dark` exhale → `bright` inhale).
export type AmbientSound = 'ocean' | 'rain' | 'stream'

type AmbientSpec = { colour: 'brown' | 'white'; dark: number; bright: number; q: number }

const AMBIENTS: Record<AmbientSound, AmbientSpec> = {
  ocean: { colour: 'brown', dark: 320, bright: 1600, q: 0.6 }, // deep, rolling swell
  rain: { colour: 'white', dark: 900, bright: 3200, q: 0.5 }, // airy, hissing patter
  stream: { colour: 'brown', dark: 600, bright: 2400, q: 0.8 }, // burbling, mid-bright
}

export const AMBIENT_SOUNDS: { value: AmbientSound; label: string }[] = [
  { value: 'ocean', label: 'Ocean' },
  { value: 'rain', label: 'Rain' },
  { value: 'stream', label: 'Stream' },
]

export class BreathAudio {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private filter: BiquadFilterNode | null = null
  private gain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private gainTarget = 0.0001
  private filterTarget = 320
  volume = 0.6
  private _ambient: AmbientSound = 'ocean'

  /** Switch the ambient character. Drops any cached buffer so the next glide
   *  rebuilds with the new noise colour. Call while stopped (between sessions). */
  set ambient(name: AmbientSound) {
    if (name === this._ambient) return
    this._ambient = name
    this.noiseBuffer = null
  }
  get ambient(): AmbientSound {
    return this._ambient
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = getAudioContext()
    return this.ctx
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  resume(): void {
    void this.ensureContext().resume()
  }

  /** A couple of seconds of looping noise, coloured per the ambient (brown =
   *  soft/low ocean-like; white = airy rain-like). */
  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const size = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    if (AMBIENTS[this._ambient].colour === 'white') {
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.6
    } else {
      let last = 0
      for (let i = 0; i < size; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5 // brown noise is quiet; bring it up to ~unity
      }
    }
    this.noiseBuffer = buffer
    return buffer
  }

  /** Shape the wash toward this phase over `durationSec`. Lazily starts the loop. */
  glide(phase: Phase, durationSec: number): void {
    const ctx = this.ensureContext()
    // Safari drops sound scheduled while suspended — resume first, then retry.
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => this.glide(phase, durationSec)).catch(() => {})
      return
    }
    const now = ctx.currentTime

    const spec = AMBIENTS[this._ambient]
    if (!this.source || !this.gain || !this.filter) {
      const source = ctx.createBufferSource()
      source.buffer = this.noise(ctx)
      source.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.Q.value = spec.q
      this.filterTarget = phase === 'inhale' ? spec.dark : spec.bright
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
    const targetCutoff = swelling ? spec.bright : spec.dark // open brighter in / darker out

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

  /** Soft bell at a transition — fire-and-forget, independent of the wash. */
  chime(phase: Phase): void {
    const ctx = this.ensureContext()
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => this.chime(phase)).catch(() => {})
      return
    }
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
