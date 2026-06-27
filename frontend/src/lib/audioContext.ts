// One shared Web Audio context for the whole app, unlocked and kept alive across
// Safari's quirks. Refs:
//   - MDN BaseAudioContext.state (suspended / running / closed / Safari's "interrupted")
//   - WebKit bug 231105 (context suspends when the macOS window is backgrounded)
//   - Tone.js #767 (resuming an "interrupted" context)
// Safari is strict: it needs the webkit-prefixed constructor on older versions, drops
// the context to suspended/interrupted on tab switches / backgrounding / audio-route
// changes (e.g. Bluetooth), and won't play sound scheduled while suspended.

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    ctx = new Ctor()
    // Whenever Safari pauses the context, try to resume it.
    ctx.addEventListener('statechange', () => {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume()
    })
  }
  return ctx
}

// A single shared MASTER BUS that all audible sound routes through (bells, the breathing
// wash, soundscapes, UI ticks, fanfares) on its way to the speakers. It's a gentle limiter
// (DynamicsCompressor with a soft knee) so that when sounds OVERLAP — a bell ringing over an
// ocean scape, a fire's roar plus its crackles — the sum is caught and rounded instead of
// clipping into a harsh digital edge. Created lazily once; survives for the context's life.
// Older Safari may lack createDynamicsCompressor — fall back to the raw destination so audio
// still plays (just unlimited).
let masterBus: AudioNode | null = null
export function getMasterBus(): AudioNode {
  const c = getAudioContext()
  if (!masterBus) {
    try {
      const limiter = c.createDynamicsCompressor()
      limiter.threshold.value = -3 // start easing peaks just below 0 dBFS
      limiter.knee.value = 6 // soft knee → transparent on quiet passages
      limiter.ratio.value = 12 // firm enough to catch transients (a struck bell)
      limiter.attack.value = 0.003 // grab fast peaks
      limiter.release.value = 0.25 // let go gently, no pumping
      limiter.connect(c.destination)
      masterBus = limiter
    } catch {
      masterBus = c.destination // no compressor available — play unlimited rather than silent
    }
  }
  return masterBus
}

// A silent, looping keep-alive source. Once started (from a gesture) it keeps the
// context "running" for good, so sounds scheduled later from timers/async — interval
// bells, the breathing wash, chimes, the level-up fanfare, the XP reward — aren't
// dropped because the context quietly idled back to suspended (the Safari failure
// mode where click-triggered sounds work but scheduled ones don't).
let keepAlive: AudioBufferSourceNode | null = null
function startKeepAlive(c: AudioContext): void {
  if (keepAlive) return
  const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate) // 1s of silence
  const source = c.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = c.createGain()
  gain.gain.value = 0.0001 // inaudible, but keeps the graph (and the context) active
  source.connect(gain).connect(c.destination)
  source.start(0)
  keepAlive = source
}

// The documented Safari/iOS unlock: on a user gesture, resume + play a 1-sample
// buffer at the context's own sample rate, then keep the context warm.
function unlock(): void {
  try {
    const c = getAudioContext()
    void c.resume()
    const source = c.createBufferSource()
    source.buffer = c.createBuffer(1, 1, c.sampleRate)
    source.connect(c.destination)
    source.start(0)
    startKeepAlive(c)
  } catch {
    // audio unavailable — ignore
  }
}

// Bind many event types in the capture phase so we unlock on the very first
// interaction, whatever it is.
const UNLOCK_EVENTS = ['touchstart', 'touchend', 'mousedown', 'pointerdown', 'click', 'keydown']
if (typeof document !== 'undefined') {
  UNLOCK_EVENTS.forEach((e) => document.addEventListener(e, unlock, true))
}
