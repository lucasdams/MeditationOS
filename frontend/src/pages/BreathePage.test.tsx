/**
 * Light smoke test for BreathePage's deep-link support: `/breathe?pattern=<key>` must
 * pre-select that preset on mount (overriding the localStorage default), and a direct
 * visit with no param must fall back to the stored / default preset as before.
 *
 * The audio/biometric/draft machinery is mocked away so the page mounts cleanly in jsdom.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockGetStats = vi.fn()
const SAVED_SESSION_ID = 'breathe-session-1'

// Full stats shape expected by buildXpBreakdown.
const BASE_STATS = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// Capture the RewardOverlay's onClose so a test can dismiss the reward and reveal the
// reflection step (mirrors MeditatePage.test).
const rewardOverlayState: { onClose: (() => void) | null } = { onClose: null }

vi.mock('../services/sessions', () => ({
  sessionService: {
    create: (...a: unknown[]) => mockCreate(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
}))
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: (...a: unknown[]) => mockGetStats(...a) },
}))
vi.mock('../services/biometrics', () => ({ biometricsService: { linkSession: vi.fn() } }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock('../components/BiometricCapture', () => ({ default: () => null }))
vi.mock('../components/RewardOverlay', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    rewardOverlayState.onClose = props.onClose
    return null
  },
}))
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

// ── Pre-session intention + post-session reflection ──────────────────────────
// The optional intention shows in the setup; a finished sit reveals a skippable
// reflection that PATCHes focus/calm onto the already-saved session.

describe('BreathePage — pre-session intention', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('renders an optional intention textarea (≤140 chars) before starting', () => {
    renderAt('/breathe')
    const intention = screen.getByLabelText(/intention/i) as HTMLTextAreaElement
    expect(intention).toBeInTheDocument()
    expect(intention.maxLength).toBe(140)
  })
})

describe('BreathePage — post-session reflection', () => {
  beforeEach(() => {
    localStorage.clear()
    rewardOverlayState.onClose = null
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockUpdate.mockResolvedValue({ id: SAVED_SESSION_ID })
  })
  afterEach(cleanup)

  /** Start → advance elapsed → finish & save, then dismiss the reward to open the
   *  reflection modal. Mirrors MeditatePage.test's driveToReflection. */
  async function driveToReflection() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/breathe')
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(rewardOverlayState.onClose).not.toBeNull())
    await act(async () => {
      rewardOverlayState.onClose!()
    })
    await screen.findByText(/how was that/i)
  }

  it('carries the intention onto the saved session create call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/breathe')
    fireEvent.change(screen.getByLabelText(/intention/i), {
      target: { value: '  Soften the exhale.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate.mock.calls[0][0].intention).toBe('Soften the exhale.')
  })

  it('submitting reflection PATCHes focus onto the saved session', async () => {
    await driveToReflection()

    const focusChips = screen.getAllByRole('group', { name: /focus/i })[0]
    const chip4 = Array.from(focusChips.querySelectorAll('button')).find(
      (b) => b.textContent === '4',
    )!
    fireEvent.click(chip4)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))

    expect(mockUpdate).toHaveBeenCalledWith(
      SAVED_SESSION_ID,
      expect.objectContaining({ focus: 4 }),
    )
    expect(mockCreate).toHaveBeenCalledTimes(1) // no second create
  })

  it('skipping reflection does not PATCH the session', async () => {
    await driveToReflection()

    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await act(async () => {})

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})
