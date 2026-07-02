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

// A short, calm line spoken by the Settings preview button so the user can hear a
// voice before committing to it.
export const PREVIEW_LINE = 'Settle in, and take a slow breath.'

// localStorage key for the user's chosen guidance voice. We store the voiceURI
// (a stable-ish per-voice id) rather than the name so we can re-resolve the live
// SpeechSynthesisVoice on each device; the voice list itself is never persisted.
const VOICE_URI_KEY = 'guidance.voiceURI'

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

/**
 * The user's saved guidance-voice preference (a `voiceURI`), or null if unset /
 * unavailable. Read fresh from localStorage each call so a change in Settings
 * applies to the next cue without a reload.
 */
export function getVoiceURIPref(): string | null {
  try {
    return localStorage.getItem(VOICE_URI_KEY) || null
  } catch {
    // localStorage unavailable (private mode, etc.) — no saved preference.
    return null
  }
}

/**
 * Persist (or clear, with null) the chosen guidance voice by its `voiceURI`.
 * Failures are swallowed — the preference simply won't stick.
 */
export function setVoiceURIPref(voiceURI: string | null): void {
  try {
    if (voiceURI) localStorage.setItem(VOICE_URI_KEY, voiceURI)
    else localStorage.removeItem(VOICE_URI_KEY)
  } catch {
    // ignore — the preference simply won't persist
  }
}

/**
 * All voices the platform exposes, or [] when speech is unavailable / not yet
 * loaded. Thin, safe wrapper over `getVoices()` (which can throw on some engines).
 */
export function listVoices(): SpeechSynthesisVoice[] {
  const s = synth()
  if (!s) return []
  try {
    return s.getVoices()
  } catch {
    return []
  }
}

/**
 * A curated, readable voice list for the picker — not the raw 200-voice dump.
 * Defaults to voices matching the page language (`navigator.language`), preferring
 * local (on-device, higher-quality) voices, sorted by name. Falls back to ALL
 * voices when none match the language, so the picker is never empty on an
 * unusual-locale device. Duplicates (same voiceURI) are collapsed.
 */
export function curatedVoices(): SpeechSynthesisVoice[] {
  const voices = listVoices()
  if (voices.length === 0) return []

  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
  const base = lang.split('-')[0].toLowerCase()
  const inLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(base))
  const pool = inLang.length > 0 ? inLang : voices

  // De-dupe by voiceURI (some engines list the same voice twice).
  const seen = new Set<string>()
  const unique = pool.filter((v) => {
    const key = v.voiceURI || v.name
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Local (on-device) voices first — they tend to be higher quality and work
  // offline — then alphabetical by name for a calm, scannable list.
  return unique.sort((a, b) => {
    if (a.localService !== b.localService) return a.localService ? -1 : 1
    return (a.name || '').localeCompare(b.name || '')
  })
}

/**
 * Resolve the user's saved voice to a live SpeechSynthesisVoice on this device,
 * or null if none is saved or the saved one is no longer available (e.g. a voice
 * that existed on another device). Callers fall back to `pickVoice()`.
 */
export function savedVoice(): SpeechSynthesisVoice | null {
  const uri = getVoiceURIPref()
  if (!uri) return null
  return listVoices().find((v) => v.voiceURI === uri) ?? null
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
 * Pick the voice to speak with. The user's saved choice wins when it's still
 * available on this device; otherwise fall back to a sensible default — a local
 * (on-device) voice in the page's language, then any voice in that language, then
 * the platform default, then the first available. Returns null if none — the
 * caller then lets the platform choose.
 */
export function pickVoice(): SpeechSynthesisVoice | null {
  // The user's explicit choice takes precedence when it resolves on this device.
  const chosen = savedVoice()
  if (chosen) return chosen

  const s = synth()
  if (!s) return null
  let voices: SpeechSynthesisVoice[]
  try {
    voices = s.getVoices()
  } catch {
    return null
  }
  if (voices.length === 0) return null

  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
  const base = lang.split('-')[0].toLowerCase()
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
  // No explicit voice → speak() resolves the user's saved choice (or default).
  speakWith(text, pickVoice())
}

/**
 * Preview a specific voice with the short sample line — used by the Settings
 * picker so the user can hear a voice before saving it. Speaks with the given
 * voice regardless of the current saved preference; no-ops if speech is
 * unavailable. Falls back to the default voice when `voice` is null.
 */
export function speakSample(voice: SpeechSynthesisVoice | null): void {
  speakWith(PREVIEW_LINE, voice ?? pickVoice())
}

/**
 * Speak `text` in the calm, slowed delivery using `voice` (falling back to the
 * platform default when null). Cancels anything already queued first so cues and
 * previews replace, never stack. No-ops silently when speech is unavailable.
 */
function speakWith(text: string, voice: SpeechSynthesisVoice | null): void {
  const s = synth()
  const trimmed = text?.trim()
  if (!s || !trimmed || typeof window.SpeechSynthesisUtterance !== 'function') return
  try {
    // Replace any in-flight cue rather than letting them queue up.
    s.cancel()
    const u = new SpeechSynthesisUtterance(trimmed)
    u.rate = SPEECH_RATE
    u.pitch = SPEECH_PITCH
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
