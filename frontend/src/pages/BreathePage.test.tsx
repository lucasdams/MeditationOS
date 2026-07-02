/**
 * Light smoke test for BreathePage's deep-link support: `/breathe?pattern=<key>` must
 * pre-select that preset on mount (overriding the localStorage default), and a direct
 * visit with no param must fall back to the stored / default preset as before.
 *
 * The audio/biometric/draft machinery is mocked away so the page mounts cleanly in jsdom.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockGetStats = vi.fn()
const mockMoodCreate = vi.fn()
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
vi.mock('../services/moodLogs', () => ({
  moodLogService: { create: (...a: unknown[]) => mockMoodCreate(...a) },
}))
// A stable navigate spy so tests can assert where a finished sit routes (e.g. the onboarding
// hatch → /spirit/choose). Reset per test where it matters.
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
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
    mockMoodCreate.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockUpdate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockMoodCreate.mockResolvedValue({ id: 'mood-uuid', mood: 'calm', created_at: '' })
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

    fireEvent.click(screen.getByRole('button', { name: /^keep it$/i }))
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

  it('logs a chosen mood via the mood-log path on keep — even with no focus/calm', async () => {
    await driveToReflection()

    const moodGroup = screen.getByRole('group', { name: /mood \(optional\)/i })
    fireEvent.click(within(moodGroup).getByRole('button', { name: /calm/i }))

    fireEvent.click(screen.getByRole('button', { name: /^keep it$/i }))
    await vi.waitFor(() => expect(mockMoodCreate).toHaveBeenCalledTimes(1))

    expect(mockMoodCreate).toHaveBeenCalledWith('calm')
    // Mood is a MoodLog, not a session field — no session PATCH when nothing else changed.
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not log a mood when none is chosen', async () => {
    await driveToReflection()

    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await act(async () => {})

    expect(mockMoodCreate).not.toHaveBeenCalled()
  })
})

// ── Best-effort post-save stats (regression) ─────────────────────────────────
// If getStats throws AFTER the session is saved, the reward step must proceed (the
// session is not lost) and the UI must NOT show "Couldn't save the session." — the
// post-save stats fetch is best-effort and must not mask the successful save.
describe('BreathePage — best-effort post-save stats', () => {
  beforeEach(() => {
    localStorage.clear()
    rewardOverlayState.onClose = null
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    navigate.mockReset()
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
  })
  afterEach(cleanup)

  it('still saves and proceeds (no save-error banner) when the after-getStats call throws', async () => {
    // getStats resolves for the before-save call but rejects on the AFTER-save call.
    // Keyed off whether create has run so the throw always lands post-save regardless
    // of how many pre-save fetches happened.
    mockGetStats.mockImplementation(() =>
      mockCreate.mock.calls.length > 0
        ? Promise.reject(new Error('network error'))
        : Promise.resolve(BASE_STATS),
    )

    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/breathe')
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    // Session must be created exactly once.
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))

    // Reflection step appears directly (no reward overlay first, since stats are unusable).
    await screen.findByRole('heading', { name: /how was that\?/i })

    // No fake-XP reward overlay, and — the bug — NO save-error banner.
    expect(rewardOverlayState.onClose).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/couldn't save the session/i)).toBeNull()
  })

  it('shows the save-error banner when the create itself fails', async () => {
    // The create rejecting IS a real save failure — the error banner must show.
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockRejectedValue(new Error('boom'))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/breathe')
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled())
    // A real save failure surfaces an error (non-ApiError → messageForError copy).
    await screen.findByRole('alert')
    // And no reflection step / reward overlay on a failed save.
    expect(screen.queryByRole('heading', { name: /how was that\?/i })).toBeNull()
    expect(rewardOverlayState.onClose).toBeNull()
  })
})

// ── Guided first sit (onboarding §5) ──────────────────────────────────────────
// `?guided=1` strips the page to a zero-config breath: Resonance, fixed short duration, no
// pattern/pace/duration/sound config — just the orb, one gentle cue, and a single Begin. On
// completion, if the onboarding hatch flag is set, the reward overlay's close routes to the
// companion choose page (the "hatch") instead of the usual reflection / home path.
describe('BreathePage — guided first sit', () => {
  beforeEach(() => {
    localStorage.clear()
    navigate.mockReset()
    rewardOverlayState.onClose = null
    mockCreate.mockReset()
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
  })
  afterEach(cleanup)

  it('renders the stripped-down guided sit: a gentle cue + Begin, with config hidden', () => {
    renderAt('/breathe?guided=1&duration=60')
    // The warm cue + the prominent Begin control.
    expect(screen.getByText(/Follow the orb/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^begin$/i })).toBeInTheDocument()
    // Config is hidden — no pattern picker, pace/duration steppers, or sound/intention controls.
    expect(screen.queryByRole('group', { name: /breathing pattern/i })).toBeNull()
    expect(screen.queryByLabelText(/^pace$/i)).toBeNull()
    expect(screen.queryByLabelText(/^duration$/i)).toBeNull()
    expect(screen.queryByLabelText(/^sound$/i)).toBeNull()
    expect(screen.queryByLabelText(/intention/i)).toBeNull()
  })

  // Drive a guided sit: Begin → advance elapsed a touch → Finish & save, then surface the
  // RewardOverlay's onClose (mirrors the reflection suite's driveToReflection; the timed
  // auto-finish leans on performance.now which fake timers don't advance, so we finish manually).
  async function driveGuidedToReward() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/breathe?guided=1&duration=60')
    fireEvent.click(screen.getByRole('button', { name: /^begin$/i }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(rewardOverlayState.onClose).not.toBeNull())
  }

  it('on completion with the hatch flag set, routes to /spirit/choose instead of the usual close', async () => {
    localStorage.setItem('onboarding.pendingHatch', '1')
    localStorage.setItem('onboarding.intent', 'calm')

    await driveGuidedToReward()
    await act(async () => {
      rewardOverlayState.onClose!()
    })

    // The hatch fires once: navigate to the choose page, and the flag is cleared.
    expect(navigate).toHaveBeenCalledWith('/spirit/choose')
    expect(localStorage.getItem('onboarding.pendingHatch')).toBeNull()
  })

  it('without the hatch flag, a guided sit closes the usual way (reflection, not the hatch)', async () => {
    await driveGuidedToReward()
    await act(async () => {
      rewardOverlayState.onClose!()
    })

    expect(navigate).not.toHaveBeenCalledWith('/spirit/choose')
    await screen.findByText(/how was that/i) // the usual reflection modal
  })
})
