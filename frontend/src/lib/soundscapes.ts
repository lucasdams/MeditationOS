// Continuous ambient soundscape engine for meditation and breathing sessions.
// All synthesis is via Web Audio (no samples); shares the app's single AudioContext.
// API: start(name, volume), stop(), setVolume(vol). Clean teardown on stop().

import { getAudioContext } from './audioContext'

export type SoundscapeName =
  | 'silent'
  | 'ocean'
  | 'rain'
  | 'stream'
  | 'forest'
  | 'night'
  | 'fire'
  | 'wind'
  | 'drone'

export const SOUNDSCAPES: { value: SoundscapeName; label: string }[] = [
  { value: 'silent', label: 'Silent' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'rain', label: 'Rain' },
  { value: 'stream', label: 'Stream' },
  { value: 'forest', label: 'Forest birds' },
  { value: 'night', label: 'Night crickets' },
  { value: 'fire', label: 'Fire & crackle' },
  { value: 'wind', label: 'Wind' },
  { value: 'drone', label: 'Low drone' },
]

export const SOUNDSCAPE_PREF_KEY = 'soundscape:preference'

export function loadSoundscapePref(): SoundscapeName {
  try {
    const v = localStorage.getItem(SOUNDSCAPE_PREF_KEY)
    if (v && SOUNDSCAPES.some((s) => s.value === v)) return v as SoundscapeName
  } catch {
    // localStorage unavailable
  }
  return 'silent'
}

export function saveSoundscapePref(name: SoundscapeName): void {
  try {
    localStorage.setItem(SOUNDSCAPE_PREF_KEY, name)
  } catch {
    // ignore
  }
}

export const SOUNDSCAPE_VOL_KEY = 'soundscape:volume'
export const DEFAULT_SOUNDSCAPE_VOL = 0.4

export function loadSoundscapeVolPref(): number {
  try {
    const v = Number(localStorage.getItem(SOUNDSCAPE_VOL_KEY))
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_SOUNDSCAPE_VOL
}

export function saveSoundscapeVolPref(vol: number): void {
  try {
    localStorage.setItem(SOUNDSCAPE_VOL_KEY, String(vol))
  } catch {
    // ignore
  }
}

// A running set of nodes that must be stopped together on teardown.
type StopFn = () => void

function makeNoise(ctx: AudioContext, colour: 'brown' | 'white'): AudioBufferSourceNode {
  const size = ctx.sampleRate * 3
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  if (colour === 'white') {
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.6
  } else {
    let last = 0
    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function startOcean(ctx: AudioContext, out: GainNode): StopFn {
  const src = makeNoise(ctx, 'brown')
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 800
  filter.Q.value = 0.6

  // Slow swell: LFO on filter frequency
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.08 // one swell every ~12 s
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 400
  lfo.connect(lfoGain).connect(filter.frequency)
  lfo.start()

  src.connect(filter).connect(out)
  src.start()
  return () => {
    try { src.stop() } catch { /* already stopped */ }
    try { lfo.stop() } catch { /* already stopped */ }
  }
}

function startRain(ctx: AudioContext, out: GainNode): StopFn {
  const src = makeNoise(ctx, 'white')
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2200
  filter.Q.value = 0.4
  src.connect(filter).connect(out)
  src.start()
  return () => { try { src.stop() } catch { /* already stopped */ } }
}

function startStream(ctx: AudioContext, out: GainNode): StopFn {
  const src = makeNoise(ctx, 'brown')
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1400
  filter.Q.value = 0.8
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.22
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 300
  lfo.connect(lfoGain).connect(filter.frequency)
  lfo.start()
  src.connect(filter).connect(out)
  src.start()
  return () => {
    try { src.stop() } catch { /* already stopped */ }
    try { lfo.stop() } catch { /* already stopped */ }
  }
}

// Forest birds: several detuned sine tones that drift slowly + noise floor
function startForest(ctx: AudioContext, out: GainNode): StopFn {
  const stops: StopFn[] = []

  // Ambient leaf/wind noise bed
  const noise = makeNoise(ctx, 'brown')
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 600
  const ng = ctx.createGain()
  ng.gain.value = 0.25
  noise.connect(nf).connect(ng).connect(out)
  noise.start()
  stops.push(() => { try { noise.stop() } catch { /* already stopped */ } })

  // Sparse birdsong: 4 oscillators with random intervals + tremolos
  const birdFreqs = [2400, 3100, 1800, 2700]
  birdFreqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq + i * 130

    const trem = ctx.createOscillator()
    trem.type = 'sine'
    trem.frequency.value = 7 + i * 1.5 // warble rate

    const tremGain = ctx.createGain()
    tremGain.gain.value = 0.08
    trem.connect(tremGain).connect(osc.frequency)
    trem.start()

    const env = ctx.createGain()
    env.gain.value = 0

    // Schedule on/off chirp cycles with offsets
    const period = 4.5 + i * 1.1
    const offset = i * 0.9
    const now = ctx.currentTime

    // Queue several chirp bursts ahead of time
    for (let n = 0; n < 60; n++) {
      const t = now + offset + n * period
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.06, t + 0.04)
      env.gain.setTargetAtTime(0, t + 0.12, 0.15)
    }

    osc.connect(env).connect(out)
    osc.start()
    stops.push(() => {
      try { osc.stop() } catch { /* already stopped */ }
      try { trem.stop() } catch { /* already stopped */ }
    })
  })

  return () => stops.forEach((s) => s())
}

// Night crickets: layered high-frequency sine pulses + brown noise floor
function startNight(ctx: AudioContext, out: GainNode): StopFn {
  const stops: StopFn[] = []

  const noise = makeNoise(ctx, 'brown')
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.value = 200
  const ng = ctx.createGain()
  ng.gain.value = 0.15
  noise.connect(nf).connect(ng).connect(out)
  noise.start()
  stops.push(() => { try { noise.stop() } catch { /* already stopped */ } })

  // Three cricket "sections" at slightly different rates
  const layers = [
    { freq: 3900, rate: 22, offset: 0 },
    { freq: 4200, rate: 18, offset: 0.7 },
    { freq: 3600, rate: 25, offset: 0.3 },
  ]
  layers.forEach(({ freq, rate, offset }) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const env = ctx.createGain()
    env.gain.value = 0

    const pulseLen = 0.012
    const period = 1 / rate
    const now = ctx.currentTime
    for (let n = 0; n < 1200; n++) {
      const t = now + offset + n * period
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.055, t + pulseLen * 0.4)
      env.gain.linearRampToValueAtTime(0, t + pulseLen)
    }

    osc.connect(env).connect(out)
    osc.start()
    stops.push(() => { try { osc.stop() } catch { /* already stopped */ } })
  })

  return () => stops.forEach((s) => s())
}

// Fire/crackle: filtered brown noise + occasional short white-noise pops
function startFire(ctx: AudioContext, out: GainNode): StopFn {
  const stops: StopFn[] = []

  // Main fire roar
  const roar = makeNoise(ctx, 'brown')
  const rf = ctx.createBiquadFilter()
  rf.type = 'lowpass'
  rf.frequency.value = 500
  rf.Q.value = 0.4
  const rLfo = ctx.createOscillator()
  rLfo.type = 'sine'
  rLfo.frequency.value = 0.06
  const rLfoGain = ctx.createGain()
  rLfoGain.gain.value = 150
  rLfo.connect(rLfoGain).connect(rf.frequency)
  rLfo.start()
  const rg = ctx.createGain()
  rg.gain.value = 0.7
  roar.connect(rf).connect(rg).connect(out)
  roar.start()
  stops.push(() => {
    try { roar.stop() } catch { /* already stopped */ }
    try { rLfo.stop() } catch { /* already stopped */ }
  })

  // Crackles: white noise with short random envelopes
  const crackle = makeNoise(ctx, 'white')
  const cf = ctx.createBiquadFilter()
  cf.type = 'highpass'
  cf.frequency.value = 1800
  const cEnv = ctx.createGain()
  cEnv.gain.value = 0

  const now = ctx.currentTime
  // Irregular crackle pattern
  const times = [0.4, 0.9, 1.55, 2.1, 2.6, 3.2, 3.55, 4.3, 4.9, 5.5, 6.1, 6.8, 7.4, 8.0]
  const cycle = 8.5
  for (let rep = 0; rep < 30; rep++) {
    times.forEach((t) => {
      const at = now + t + rep * cycle + (Math.random() * 0.15 - 0.075)
      cEnv.gain.setValueAtTime(0, at)
      cEnv.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.03, at + 0.008)
      cEnv.gain.linearRampToValueAtTime(0, at + 0.04)
    })
  }

  crackle.connect(cf).connect(cEnv).connect(out)
  crackle.start()
  stops.push(() => { try { crackle.stop() } catch { /* already stopped */ } })

  return () => stops.forEach((s) => s())
}

// Wind: white noise shaped through a slowly-sweeping bandpass
function startWind(ctx: AudioContext, out: GainNode): StopFn {
  const src = makeNoise(ctx, 'white')
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 600
  filter.Q.value = 0.35

  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.05 // very slow gust
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 350
  lfo.connect(lfoGain).connect(filter.frequency)

  // Amplitude swell LFO (gusts)
  const ampLfo = ctx.createOscillator()
  ampLfo.type = 'sine'
  ampLfo.frequency.value = 0.04
  const ampMod = ctx.createGain()
  ampMod.gain.value = 0.3
  const ampBase = ctx.createGain()
  ampBase.gain.value = 0.7

  lfo.start()
  ampLfo.start()
  ampLfo.connect(ampMod).connect(ampBase.gain)
  src.connect(filter).connect(ampBase).connect(out)
  src.start()

  return () => {
    try { src.stop() } catch { /* already stopped */ }
    try { lfo.stop() } catch { /* already stopped */ }
    try { ampLfo.stop() } catch { /* already stopped */ }
  }
}

// Low warm drone: stacked slightly-detuned sine oscillators, very still
function startDrone(ctx: AudioContext, out: GainNode): StopFn {
  const stops: StopFn[] = []

  // Dedicated tremolo gain sits between the drone mix and master so the LFO
  // only modulates this node — leaving master free for setVolume/stop writes.
  const tremoloNode = ctx.createGain()
  tremoloNode.gain.value = 1
  tremoloNode.connect(out)

  // Base partials: root (110 Hz ≈ A2), fifth (165), octave (220), soft upper
  const partials: { freq: number; gain: number }[] = [
    { freq: 110, gain: 0.5 },
    { freq: 110.3, gain: 0.35 }, // slight detune for warmth
    { freq: 165, gain: 0.25 },
    { freq: 220, gain: 0.12 },
    { freq: 330, gain: 0.06 },
  ]

  partials.forEach(({ freq, gain }) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g).connect(tremoloNode)
    osc.start()
    stops.push(() => { try { osc.stop() } catch { /* already stopped */ } })
  })

  // Very slow tremolo for organic life — modulates the dedicated tremoloNode, not master
  const tremOsc = ctx.createOscillator()
  tremOsc.type = 'sine'
  tremOsc.frequency.value = 0.03
  const tremGain = ctx.createGain()
  tremGain.gain.value = 0.04
  tremOsc.connect(tremGain).connect(tremoloNode.gain)
  tremOsc.start()
  stops.push(() => { try { tremOsc.stop() } catch { /* already stopped */ } })

  return () => stops.forEach((s) => s())
}

type StartFn = (ctx: AudioContext, out: GainNode) => StopFn

const BUILDERS: Partial<Record<SoundscapeName, StartFn>> = {
  ocean: startOcean,
  rain: startRain,
  stream: startStream,
  forest: startForest,
  night: startNight,
  fire: startFire,
  wind: startWind,
  drone: startDrone,
}

export class SoundscapeEngine {
  private masterGain: GainNode | null = null
  private stopNodes: StopFn | null = null
  private ctx: AudioContext | null = null
  private current: SoundscapeName | null = null

  start(name: SoundscapeName, volume: number): void {
    this.stop()
    if (name === 'silent') return
    const builder = BUILDERS[name]
    if (!builder) return

    try {
      const ctx = getAudioContext()
      if (ctx.state !== 'running') void ctx.resume()
      this.ctx = ctx

      const master = ctx.createGain()
      master.gain.value = Math.max(0, Math.min(1, volume))
      master.connect(ctx.destination)
      this.masterGain = master

      this.stopNodes = builder(ctx, master)
      this.current = name
    } catch {
      // audio unavailable — skip silently
    }
  }

  stop(): void {
    const stopNodes = this.stopNodes
    this.stopNodes = null
    this.current = null

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.15)
      const mg = this.masterGain
      this.masterGain = null
      setTimeout(() => {
        // Stop source nodes after the fade so the cut isn't abrupt
        if (stopNodes) stopNodes()
        try { mg.disconnect() } catch { /* already disconnected */ }
      }, 250)
    } else {
      if (stopNodes) stopNodes()
      this.masterGain = null
    }
  }

  setVolume(vol: number): void {
    if (!this.masterGain || !this.ctx) return
    const v = Math.max(0, Math.min(1, vol))
    const now = this.ctx.currentTime
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(v, now + 0.05)
  }

  get active(): SoundscapeName | null {
    return this.current
  }
}
