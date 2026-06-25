/**
 * Light smoke test for BreathePage's deep-link support: `/breathe?pattern=<key>` must
 * pre-select that preset on mount (overriding the localStorage default), and a direct
 * visit with no param must fall back to the stored / default preset as before.
 *
 * The audio/biometric/draft machinery is mocked away so the page mounts cleanly in jsdom.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/sessions', () => ({ sessionService: { create: vi.fn(), update: vi.fn() } }))
vi.mock('../services/dashboard', () => ({ dashboardService: { getStats: vi.fn() } }))
vi.mock('../services/biometrics', () => ({ biometricsService: { linkSession: vi.fn() } }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock('../components/BiometricCapture', () => ({ default: () => null }))
vi.mock('../components/RewardOverlay', () => ({ default: () => null }))
vi.mock('../components/Spirit', () => ({ default: () => null }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
// Audio engines touch Web Audio APIs jsdom lacks — stub them out entirely.
vi.mock('../lib/breathAudio', () => ({
  BreathAudio: class {
    volume = 0
    ambient = 'ocean'
    isRunning() { return false }
    resume() {}
    stop() {}
    close() {}
    audioTime() { return 0 }
    glideAt() {}
    chimeAt() {}
    chime() {}
  },
  AMBIENT_SOUNDS: [{ value: 'ocean', label: 'Ocean' }],
}))
vi.mock('../components/SoundscapePicker', () => ({ default: () => null }))
vi.mock('../lib/soundscapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/soundscapes')>()
  return {
    ...actual,
    SoundscapeEngine: class {
      active = null
      start() {}
      stop() {}
      setVolume() {}
    },
  }
})
vi.mock('../lib/sessionDraft', () => ({
  MIN_DRAFT_SECONDS: 0,
  beaconSave: vi.fn(),
  clearDraft: vi.fn(),
  newClientToken: () => 'test-token',
  readRestorableDraft: () => null,
  writeDraft: vi.fn(),
}))

// BreathePage reads window.matchMedia (reduced-motion check) on mount; jsdom doesn't
// provide it, so stub a no-op (matches: false) before the page renders.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  )
})

afterAll(() => vi.unstubAllGlobals())

import BreathePage from './BreathePage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BreathePage />
    </MemoryRouter>,
  )
}

// The selected preset button carries aria-pressed="true". Find it and read its name.
function selectedPreset(): string | null {
  const pressed = screen
    .getAllByRole('button', { pressed: true })
    .find((b) => b.classList.contains('pattern-card'))
  return pressed?.textContent ?? null
}

describe('BreathePage — deep-link pre-selection', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('pre-selects the Box preset from ?pattern=box', () => {
    renderAt('/breathe?pattern=box')
    expect(selectedPreset()).toMatch(/box/i)
  })

  it('pre-selects Alternate nostril from ?pattern=alternate', () => {
    renderAt('/breathe?pattern=alternate')
    expect(selectedPreset()).toMatch(/alternate/i)
  })

  it('falls back to the default (Resonance) with no param', () => {
    renderAt('/breathe')
    expect(selectedPreset()).toMatch(/resonance/i)
  })

  it('ignores an unknown pattern and falls back to the default', () => {
    renderAt('/breathe?pattern=bogus')
    expect(selectedPreset()).toMatch(/resonance/i)
  })
})
