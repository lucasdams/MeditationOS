import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SOUNDSCAPES,
  loadSoundscapePref,
  saveSoundscapePref,
  SoundscapeEngine,
  SOUNDSCAPE_PREF_KEY,
  type SoundscapeName,
} from '../soundscapes'

// Shared, hoist-safe audio state so a test can move the clock and count scheduled events.
const audioState = vi.hoisted(() => ({ clock: 0, events: 0 }))

// Mock the shared AudioContext — we test selection/state + scheduling, not synthesis.
vi.mock('../audioContext', () => ({
  getAudioContext: () => ({
    state: 'running',
    get currentTime() {
      return audioState.clock
    },
    sampleRate: 44100,
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        // Count every scheduled gain event so a test can assert a scape keeps scheduling.
        setValueAtTime: () => {
          audioState.events++
        },
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { value: 800, setValueAtTime: vi.fn() },
      Q: { value: 0.6 },
      connect: vi.fn().mockReturnThis(),
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: { value: 440, setValueAtTime: vi.fn() },
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createBuffer: (_: number, size: number, sr: number) => ({
      getChannelData: () => new Float32Array(size || sr),
    }),
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    resume: vi.fn().mockResolvedValue(undefined),
  }),
  // The shared master limiter — a node that just accepts connections in tests.
  getMasterBus: () => ({ connect: vi.fn().mockReturnThis() }),
}))

describe('SOUNDSCAPES list', () => {
  it('includes all nine expected soundscapes', () => {
    const names = SOUNDSCAPES.map((s) => s.value)
    expect(names).toEqual([
      'silent', 'ocean', 'rain', 'stream', 'forest', 'night', 'fire', 'wind', 'drone',
    ])
  })

  it('every entry has a non-empty label', () => {
    SOUNDSCAPES.forEach((s) => {
      expect(s.label.length).toBeGreaterThan(0)
    })
  })
})

describe('localStorage preference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults to silent when no pref stored', () => {
    expect(loadSoundscapePref()).toBe('silent')
  })

  it('persists and loads a saved preference', () => {
    saveSoundscapePref('ocean')
    expect(localStorage.getItem(SOUNDSCAPE_PREF_KEY)).toBe('ocean')
    expect(loadSoundscapePref()).toBe('ocean')
  })

  it('rejects an unknown stored value and falls back to silent', () => {
    localStorage.setItem(SOUNDSCAPE_PREF_KEY, 'bananas')
    expect(loadSoundscapePref()).toBe('silent')
  })

  it('round-trips every valid soundscape name', () => {
    const names: SoundscapeName[] = SOUNDSCAPES.map((s) => s.value)
    names.forEach((name) => {
      saveSoundscapePref(name)
      expect(loadSoundscapePref()).toBe(name)
    })
  })
})

describe('SoundscapeEngine', () => {
  it('starts silent without calling any audio builder', () => {
    const engine = new SoundscapeEngine()
    // Should not throw and active stays null
    engine.start('silent', 0.5)
    expect(engine.active).toBeNull()
  })

  it('tracks the active soundscape name after start', () => {
    const engine = new SoundscapeEngine()
    engine.start('ocean', 0.5)
    expect(engine.active).toBe('ocean')
  })

  it('clears active after stop', () => {
    const engine = new SoundscapeEngine()
    engine.start('rain', 0.5)
    engine.stop()
    expect(engine.active).toBeNull()
  })

  it('switching soundscapes replaces the previous one', () => {
    const engine = new SoundscapeEngine()
    engine.start('forest', 0.5)
    engine.start('wind', 0.5)
    expect(engine.active).toBe('wind')
  })

  it('setVolume does not throw when no soundscape is playing', () => {
    const engine = new SoundscapeEngine()
    expect(() => engine.setVolume(0.8)).not.toThrow()
  })

  it('stop is idempotent', () => {
    const engine = new SoundscapeEngine()
    engine.start('drone', 0.5)
    expect(() => {
      engine.stop()
      engine.stop()
    }).not.toThrow()
  })

  // The core fix: a procedural scape (night crickets) must keep scheduling for the WHOLE
  // session, not run dry after the first batch (the old fixed-count bug). With a re-arming
  // scheduler, advancing the audio clock past the first horizon schedules MORE events.
  it('keeps scheduling events for a long session — a scape never runs dry', () => {
    vi.useFakeTimers()
    try {
      audioState.clock = 0
      audioState.events = 0
      const engine = new SoundscapeEngine()
      engine.start('night', 0.5) // crickets = purely scheduled gain events
      const initial = audioState.events
      expect(initial).toBeGreaterThan(0) // the first horizon was scheduled up front

      // Jump the audio clock far ahead and let the re-arming timer fire: the scheduler refills,
      // so the event count grows. A fixed-count scape would be frozen at `initial`.
      audioState.clock = 600
      vi.advanceTimersByTime(60_000)
      expect(audioState.events).toBeGreaterThan(initial)

      engine.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
