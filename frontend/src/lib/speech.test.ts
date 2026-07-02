/**
 * Tests for the speech helper's supported / fallback branch and voice selection.
 *
 * jsdom does not implement `speechSynthesis`, so we install a minimal fake on the
 * global to exercise the branches: no API at all (fallback), API present but no
 * voices (fallback), API with voices (supported + speak/cancel wiring), and the
 * default-voice preference (local in-language voice wins).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  speechAvailable,
  pickVoice,
  speak,
  speakSample,
  cancelSpeech,
  curatedVoices,
  getVoiceURIPref,
  setVoiceURIPref,
  savedVoice,
  PREVIEW_LINE,
  SPEECH_RATE,
} from './speech'

type FakeVoice = Partial<SpeechSynthesisVoice>

function installSynth(voices: FakeVoice[]) {
  const speak = vi.fn()
  const cancel = vi.fn()
  const synth = {
    getVoices: () => voices as SpeechSynthesisVoice[],
    speak,
    cancel,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('speechSynthesis', synth)
  // A constructor that records the utterance it was given.
  const utterances: Array<Record<string, unknown>> = []
  class FakeUtterance {
    text: string
    rate = 1
    pitch = 1
    lang = ''
    voice: unknown = null
    constructor(text: string) {
      this.text = text
      utterances.push(this as unknown as Record<string, unknown>)
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return { synth, speak, cancel, utterances }
}

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-US' })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('speechAvailable', () => {
  it('is false when speechSynthesis is absent', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(speechAvailable()).toBe(false)
  })

  it('is false when the API exists but no voices are available', () => {
    installSynth([])
    expect(speechAvailable()).toBe(false)
  })

  it('is true when at least one voice exists', () => {
    installSynth([{ name: 'Samantha', lang: 'en-US', localService: true }])
    expect(speechAvailable()).toBe(true)
  })
})

describe('pickVoice', () => {
  it('prefers a local in-language voice', () => {
    installSynth([
      { name: 'Remote EN', lang: 'en-US', localService: false },
      { name: 'Local EN', lang: 'en-GB', localService: true },
      { name: 'Local FR', lang: 'fr-FR', localService: true },
    ])
    expect(pickVoice()?.name).toBe('Local EN')
  })

  it('falls back to the default voice when no in-language voice exists', () => {
    installSynth([
      { name: 'FR', lang: 'fr-FR', localService: true, default: false },
      { name: 'DefaultDE', lang: 'de-DE', localService: false, default: true },
    ])
    expect(pickVoice()?.name).toBe('DefaultDE')
  })

  it('returns null when there are no voices', () => {
    installSynth([])
    expect(pickVoice()).toBeNull()
  })
})

describe('speak', () => {
  it('cancels then speaks a calm, slowed utterance', () => {
    const { speak: speakSpy, cancel, utterances } = installSynth([
      { name: 'EN', lang: 'en-US', localService: true },
    ])
    speak('Settle in.')
    expect(cancel).toHaveBeenCalledOnce()
    expect(speakSpy).toHaveBeenCalledOnce()
    expect(utterances[0].text).toBe('Settle in.')
    expect(utterances[0].rate).toBe(SPEECH_RATE)
  })

  it('no-ops on empty text', () => {
    const { speak: speakSpy } = installSynth([{ name: 'EN', lang: 'en-US' }])
    speak('   ')
    expect(speakSpy).not.toHaveBeenCalled()
  })

  it('no-ops when speech is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => speak('hello')).not.toThrow()
  })
})

describe('cancelSpeech', () => {
  it('cancels in-flight speech', () => {
    const { cancel } = installSynth([{ name: 'EN', lang: 'en-US' }])
    cancelSpeech()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('is safe when speech is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => cancelSpeech()).not.toThrow()
  })
})

describe('voiceURI preference persistence', () => {
  it('round-trips a saved voiceURI through localStorage', () => {
    expect(getVoiceURIPref()).toBeNull()
    setVoiceURIPref('urn:voice:calm')
    expect(getVoiceURIPref()).toBe('urn:voice:calm')
    expect(localStorage.getItem('guidance.voiceURI')).toBe('urn:voice:calm')
  })

  it('clears the preference when set to null', () => {
    setVoiceURIPref('urn:voice:calm')
    setVoiceURIPref(null)
    expect(getVoiceURIPref()).toBeNull()
    expect(localStorage.getItem('guidance.voiceURI')).toBeNull()
  })
})

describe('savedVoice', () => {
  it('resolves the saved voiceURI to a live voice', () => {
    installSynth([
      { name: 'Calm', lang: 'en-US', voiceURI: 'urn:voice:calm', localService: true },
      { name: 'Other', lang: 'en-US', voiceURI: 'urn:voice:other' },
    ])
    setVoiceURIPref('urn:voice:calm')
    expect(savedVoice()?.name).toBe('Calm')
  })

  it('returns null when the saved voice is unavailable on this device', () => {
    installSynth([{ name: 'Only', lang: 'en-US', voiceURI: 'urn:voice:only' }])
    setVoiceURIPref('urn:voice:gone')
    expect(savedVoice()).toBeNull()
  })

  it('returns null when no preference is saved', () => {
    installSynth([{ name: 'Any', lang: 'en-US', voiceURI: 'urn:voice:any' }])
    expect(savedVoice()).toBeNull()
  })
})

describe('speak applies the saved voice', () => {
  it('sets the chosen voice on the utterance', () => {
    const { utterances } = installSynth([
      { name: 'Default EN', lang: 'en-US', voiceURI: 'urn:voice:def', localService: true },
      { name: 'Chosen', lang: 'en-GB', voiceURI: 'urn:voice:chosen', localService: true },
    ])
    setVoiceURIPref('urn:voice:chosen')
    speak('Breathe in.')
    const applied = utterances[0].voice as SpeechSynthesisVoice
    expect(applied.name).toBe('Chosen')
    // The utterance lang follows the chosen voice's locale.
    expect(utterances[0].lang).toBe('en-GB')
  })

  it('falls back to a default voice when the saved one is missing', () => {
    const { utterances } = installSynth([
      { name: 'Local EN', lang: 'en-US', voiceURI: 'urn:voice:local', localService: true },
    ])
    setVoiceURIPref('urn:voice:not-on-this-device')
    speak('Breathe out.')
    const applied = utterances[0].voice as SpeechSynthesisVoice
    // The saved voice is gone, so pickVoice falls through to the local in-language voice.
    expect(applied.name).toBe('Local EN')
  })
})

describe('speakSample (preview)', () => {
  it('previews a specific voice with the sample line, ignoring the saved pref', () => {
    const { speak: speakSpy, utterances } = installSynth([
      { name: 'Saved', lang: 'en-US', voiceURI: 'urn:voice:saved', localService: true },
      { name: 'Previewed', lang: 'en-US', voiceURI: 'urn:voice:preview', localService: true },
    ])
    setVoiceURIPref('urn:voice:saved')
    const previewVoice = { name: 'Previewed', voiceURI: 'urn:voice:preview', lang: 'en-US' } as SpeechSynthesisVoice
    speakSample(previewVoice)
    expect(speakSpy).toHaveBeenCalledOnce()
    expect(utterances[0].text).toBe(PREVIEW_LINE)
    expect((utterances[0].voice as SpeechSynthesisVoice).name).toBe('Previewed')
  })

  it('falls back to the default voice when given null (Auto)', () => {
    const { utterances } = installSynth([
      { name: 'Local EN', lang: 'en-US', voiceURI: 'urn:voice:local', localService: true },
    ])
    speakSample(null)
    expect(utterances[0].text).toBe(PREVIEW_LINE)
    expect((utterances[0].voice as SpeechSynthesisVoice).name).toBe('Local EN')
  })
})

describe('curatedVoices', () => {
  it('returns in-language voices, local first then alphabetical, de-duped', () => {
    installSynth([
      { name: 'Zed EN', lang: 'en-US', voiceURI: 'urn:z', localService: true },
      { name: 'Amy EN', lang: 'en-GB', voiceURI: 'urn:a', localService: true },
      { name: 'Remote EN', lang: 'en-US', voiceURI: 'urn:r', localService: false },
      { name: 'French', lang: 'fr-FR', voiceURI: 'urn:f', localService: true },
      // duplicate voiceURI of Amy — should be collapsed
      { name: 'Amy EN dup', lang: 'en-GB', voiceURI: 'urn:a', localService: true },
    ])
    const names = curatedVoices().map((v) => v.name)
    // French excluded (out of language); Amy dup collapsed; locals before remote,
    // locals sorted alphabetically (Amy, Zed), then the remote.
    expect(names).toEqual(['Amy EN', 'Zed EN', 'Remote EN'])
  })

  it('falls back to all voices when none match the page language', () => {
    installSynth([
      { name: 'German', lang: 'de-DE', voiceURI: 'urn:de', localService: true },
      { name: 'French', lang: 'fr-FR', voiceURI: 'urn:fr', localService: true },
    ])
    expect(curatedVoices().map((v) => v.name)).toEqual(['French', 'German'])
  })

  it('is empty when there are no voices', () => {
    installSynth([])
    expect(curatedVoices()).toEqual([])
  })
})
