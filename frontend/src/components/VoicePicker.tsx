import { useEffect, useMemo, useState } from 'react'
import { Volume2 } from 'lucide-react'
import {
  curatedVoices,
  getVoiceURIPref,
  setVoiceURIPref,
  savedVoice,
  speakSample,
  cancelSpeech,
  onVoicesReady,
  speechAvailable,
} from '../lib/speech'

// Guidance-voice picker for the spoken guided cues. Self-contained, like PushToggle:
// it enumerates the browser's on-device TTS voices (handling the async
// `voiceschanged` load), lets the user choose one, previews it, and persists the
// choice (`guidance.voiceURI` in localStorage) so `speak()` applies it to every cue.
//
// Renders nothing when the browser exposes no usable voices — the app then falls
// back to on-screen cues + the soft bell, so there's no dead control to explain.
//
// Value 'auto' means "no explicit choice" — the app picks a sensible default. Any
// other value is a voiceURI. We store the URI (not the name) so it re-resolves to a
// live voice on each device and degrades gracefully when a saved voice is missing.
const AUTO = 'auto'

// A short label per voice: name, plus its locale when it adds information.
function voiceLabel(v: SpeechSynthesisVoice): string {
  const name = v.name || 'Voice'
  return v.lang ? `${name} · ${v.lang}` : name
}

export default function VoicePicker() {
  // Voices load asynchronously on many engines, so start from whatever's ready and
  // refresh when `voiceschanged` fires. `ready` gates rendering: null while we don't
  // yet know, then a boolean once voices settle (or definitively don't exist).
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => curatedVoices())
  const [ready, setReady] = useState<boolean>(() => speechAvailable())
  // The selected value: a voiceURI, or AUTO for "let the app choose".
  const [selected, setSelected] = useState<string>(() => getVoiceURIPref() ?? AUTO)

  useEffect(() => {
    // Refresh the curated list once voices are available (they often load late).
    const off = onVoicesReady(() => {
      setVoices(curatedVoices())
      setReady(speechAvailable())
    })
    return off
  }, [])

  // Cancel any in-flight preview when the picker unmounts (leaving Settings), so no
  // preview leaks across pages.
  useEffect(() => cancelSpeech, [])

  // If a saved voiceURI isn't among the currently available voices (e.g. synced from
  // another device), fall the visible selection back to Auto so the control reflects
  // what will actually play — without clearing the stored preference, in case the
  // voice returns later.
  const savedUnavailable = useMemo(() => {
    const uri = getVoiceURIPref()
    return uri != null && savedVoice() == null
  }, [ready, voices])

  const effectiveSelected = savedUnavailable ? AUTO : selected

  // No usable voices → render nothing (matches PushToggle's inert-when-unsupported
  // pattern; the meditate page already falls back to text + bell).
  if (!ready || voices.length === 0) return null

  function choose(value: string) {
    setSelected(value)
    setVoiceURIPref(value === AUTO ? null : value)
    cancelSpeech() // stop any preview from the previous voice
  }

  function preview() {
    const voice =
      effectiveSelected === AUTO
        ? null
        : voices.find((v) => v.voiceURI === effectiveSelected) ?? null
    // speakSample falls back to the default voice when given null (the Auto case).
    speakSample(voice)
  }

  return (
    <section className="settings-section">
      <h2>Guidance voice</h2>
      <p className="muted">
        The voice that reads guided-session cues aloud on this device. Preview one,
        then it’s used whenever spoken guidance is on.
      </p>
      <label htmlFor="guidance-voice">Voice</label>
      <div className="voice-picker-row">
        <select
          id="guidance-voice"
          className="voice-picker-select"
          value={effectiveSelected}
          onChange={(e) => choose(e.target.value)}
        >
          <option value={AUTO}>Automatic (recommended)</option>
          {voices.map((v) => (
            <option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>
              {voiceLabel(v)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="settings-secondary voice-picker-preview"
          onClick={preview}
        >
          <Volume2 size={16} aria-hidden="true" />
          Preview
        </button>
      </div>
    </section>
  )
}
