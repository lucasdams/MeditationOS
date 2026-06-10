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

// The documented Safari/iOS unlock: on a user gesture, resume + play a 1-sample
// buffer at the context's own sample rate.
function unlock(): void {
  try {
    const c = getAudioContext()
    void c.resume()
    const source = c.createBufferSource()
    source.buffer = c.createBuffer(1, 1, c.sampleRate)
    source.connect(c.destination)
    source.start(0)
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

/** A short human-readable description of the audio context, for diagnostics. */
export function audioDiagnostics(): string {
  try {
    const c = getAudioContext()
    return `state=${c.state} · ${Math.round(c.sampleRate)}Hz`
  } catch (err) {
    return `unavailable (${err instanceof Error ? err.name : 'error'})`
  }
}
