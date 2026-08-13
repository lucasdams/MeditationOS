// Spoken guidance via the browser Web Speech API (`speechSynthesis`). On-device
// TTS, no audio files — we speak the app's OWN guided-cue text aloud so the user
// can keep their eyes closed instead of reading the on-screen cues.
//
// Design constraints:
// - Calm + slowed: a gentle default rate, slightly lower pitch.
// - Must only be triggered from a user gesture (the session Start is a click).
// - Cancel any in-progress / queued speech on pause, finish, and unmount — no
//   speech should leak after the user navigates away.
// - Graceful fallback: callers check `speechAvailable()` first and fall back to
//   on-screen text + the transition bell when no usable voice exists.
//
// This module wraps the global `speechSynthesis`; it is mockable in tests (jsdom
// does not implement speechSynthesis), so the supported / fallback branch and the
// no-bell-when-speaking logic can be unit-tested behind a fake.

// A calm, slowed delivery. SpeechSynthesisUtterance rate is 0.1–10 (1 = normal);
// we nudge it down so the cues land unhurried. Pitch slightly under 1 reads warmer.
export const SPEECH_RATE = 0.85
export const SPEECH_PITCH = 0.95

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

/**
 * True when the browser exposes `speechSynthesis` AND at least one voice is
 * available. Voices can load asynchronously, so a `false` here may flip to `true`
 * once `voiceschanged` fires — callers that want the live value should re-check
 * (see `onVoicesReady`). When this returns false, fall back to text + bell.
 */
export function speechAvailable(): boolean {
  const s = synth()
  if (!s || typeof window.SpeechSynthesisUtterance !== 'function') return false
  try {
    return s.getVoices().length > 0
  } catch {
    return false
  }
}

/**
 * Subscribe to the moment voices become available. Fires immediately if voices
 * are already loaded, otherwise once on the next `voiceschanged`. Returns an
 * unsubscribe function. Used so the toggle's "is TTS usable" state can settle
 * after the async voice list populates on first load.
 */
export function onVoicesReady(cb: () => void): () => void {
  const s = synth()
  if (!s) return () => {}
  if (speechAvailable()) {
    cb()
    return () => {}
  }
  const handler = () => cb()
  s.addEventListener('voiceschanged', handler)
  return () => s.removeEventListener('voiceschanged', handler)
}

/**
 * Pick a sensible default voice when several exist: prefer a local (on-device)
 * voice in the CONTENT's language, then any voice in that language, then the
 * platform default, then the first available. Returns null if none — the caller
 * then lets the platform choose.
 *
 * `contentLang` matters: the guided-cue text is currently English (content
 * localization is deferred), so we must NOT pick by `navigator.language` — on a
 * Japanese-language browser that selects a ja voice reading English text, which
 * comes out badly garbled (worse than the bell fallback).
 */
export function pickVoice(contentLang = 'en'): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  let voices: SpeechSynthesisVoice[]
  try {
    voices = s.getVoices()
  } catch {
    return null
  }
  if (voices.length === 0) return null

  const base = contentLang.split('-')[0].toLowerCase()
  const inLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(base))

  return (
    inLang.find((v) => v.localService) ??
    inLang[0] ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null
  )
}

/**
 * Speak a single cue aloud in the calm, slowed voice. Cancels anything already
 * queued first, so each new cue replaces the previous one cleanly (cues don't
 * stack up if phases are short). No-ops silently if speech is unavailable.
 *
 * Must be reachable from a user gesture on first use (browser autoplay policy);
 * the caller only ever starts speech after the session Start click.
 */
export function speak(text: string): void {
  const s = synth()
  const trimmed = text?.trim()
  if (!s || !trimmed || typeof window.SpeechSynthesisUtterance !== 'function') return
  try {
    // Replace any in-flight cue rather than letting them queue up.
    s.cancel()
    const u = new SpeechSynthesisUtterance(trimmed)
    u.rate = SPEECH_RATE
    u.pitch = SPEECH_PITCH
    const voice = pickVoice()
    if (voice) {
      u.voice = voice
      if (voice.lang) u.lang = voice.lang
    }
    s.speak(u)
  } catch {
    // speech unavailable — skip silently (caller keeps the on-screen text)
  }
}

/**
 * Stop and clear any in-progress / queued speech. Safe to call repeatedly and
 * when nothing is speaking. Call on pause, finish, leave-page, and unmount.
 */
export function cancelSpeech(): void {
  const s = synth()
  if (!s) return
  try {
    s.cancel()
  } catch {
    // ignore
  }
}
