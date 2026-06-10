// One shared Web Audio context for the whole app, unlocked on the first user
// gesture. Safari is strict: it needs the webkit-prefixed constructor on older
// versions, and it won't play sound scheduled while the context is still
// "suspended" — so we resume it (and play a 1-sample silent buffer, the classic
// Safari/iOS unlock) on the first pointer/key/touch event, before any sound is cued.

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

function unlock(): void {
  try {
    const c = getAudioContext()
    void c.resume()
    if (c.state !== 'running') {
      const buffer = c.createBuffer(1, 1, 22050)
      const source = c.createBufferSource()
      source.buffer = buffer
      source.connect(c.destination)
      source.start(0)
    }
  } catch {
    // audio unavailable — ignore
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchend', unlock)
}
