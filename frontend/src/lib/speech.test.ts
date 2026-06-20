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
  cancelSpeech,
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
})

afterEach(() => {
  vi.unstubAllGlobals()
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
