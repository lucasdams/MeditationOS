/**
 * Light smoke tests for MeditatePage — guards the intention + reflection additions.
 * Full timer/bell integration is not exercised here (tested manually / E2E).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockGetStats = vi.fn()
const mockNavigate = vi.fn()
const mockMoodCreate = vi.fn()

// Shared mutable state for the RewardOverlay mock so tests can fire onClose manually.
// Must be a plain object (not a `let` binding) so the vi.mock factory closure captures
// a stable reference that survives hoisting.
const rewardOverlayState = { onClose: null as (() => void) | null }

vi.mock('../components/RewardOverlay', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    rewardOverlayState.onClose = props.onClose ?? null
    return null
  },
}))

vi.mock('../services/sessions', () => ({
  sessionService: {
    create: (...a: unknown[]) => mockCreate(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
}))
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: (...a: unknown[]) => mockGetStats(...a) },
}))
vi.mock('../services/moodLogs', () => ({
  moodLogService: { create: (...a: unknown[]) => mockMoodCreate(...a) },
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../components/BiometricCapture', () => ({ default: () => null }))
const mockPlayBell = vi.fn()
vi.mock('../lib/sfx', () => ({ playBell: (...a: unknown[]) => mockPlayBell(...a) }))
// Speech is mocked so the toggle renders as "supported" by default (jsdom has no
// speechSynthesis). `speechAvailableValue` lets a test flip the supported branch.
const speechState = { available: true }
vi.mock('../lib/speech', () => ({
  speechAvailable: () => speechState.available,
  onVoicesReady: () => () => {},
  cancelSpeech: vi.fn(),
  speak: vi.fn(),
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
// Mock sessionDraft with MIN_DRAFT_SECONDS=0 so elapsed>0 is enough to save.
vi.mock('../lib/sessionDraft', () => ({
  MIN_DRAFT_SECONDS: 0,
  beaconSave: vi.fn(),
  clearDraft: vi.fn(),
  newClientToken: () => 'test-token',
  readRestorableDraft: () => null,
  writeDraft: vi.fn(),
}))

import MeditatePage, { guidedChoiceFromParams } from './MeditatePage'

const SAVED_SESSION_ID = 'session-uuid-abc'

function renderPage() {
  return render(
    <MemoryRouter>
      <MeditatePage />
    </MemoryRouter>,
  )
}

function renderPageAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MeditatePage />
    </MemoryRouter>,
  )
}

// Renders through the real /meditate + /meditate/:guided routes so the path segment is
// parsed by useParams — the way each guided practice's own URL is resolved.
function renderPageAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meditate" element={<MeditatePage />} />
        <Route path="/meditate/:guided" element={<MeditatePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Full stats shape expected by buildXpBreakdown (daily_quests + streak_bonus_xp required).
const BASE_STATS = {
  xp: 0,
  level: 1,
  xp_for_next_level: 100,
  current_streak_days: 0,
  streak_bonus_xp: 0,
  daily_quests: [],
}

describe('MeditatePage — pre-session intention', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
  })
  afterEach(cleanup)

  it('renders the intention textarea before the sit starts', () => {
    renderPage()
    expect(screen.getByLabelText(/intention/i)).toBeInTheDocument()
  })

  it('renders the Start button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
  })

  it('hides the intention textarea once the sit has started', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    // After start, running=true, started=true → intention section hidden.
    await waitFor(() =>
      expect(screen.queryByLabelText(/intention/i)).not.toBeInTheDocument(),
    )
  })

  it('shows Finish & save once started', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument(),
    )
  })

  it('intention text stays in the textarea when typed', () => {
    renderPage()
    const textarea = screen.getByLabelText(/intention/i)
    fireEvent.change(textarea, { target: { value: 'Stay present' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('Stay present')
  })

  it('session create is called exactly once when finish is clicked twice rapidly', async () => {
    // Use fake timers so we can advance elapsed > 0 without real wall-clock waiting.
    vi.useFakeTimers()
    renderPage()

    // Start the sit — this sets running=true and schedules the 250ms interval.
    fireEvent.click(screen.getByRole('button', { name: /start/i }))

    // Advance 2 seconds so the interval fires and elapsed > 1 (past the save guard).
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    // Finish & save button is now visible (started=true).
    const finishBtn = screen.getByRole('button', { name: /finish/i })

    // Click finish twice in rapid succession — only one save must be triggered.
    fireEvent.click(finishBtn)
    fireEvent.click(finishBtn)

    // Let any pending promises (the async saveSession) resolve.
    await act(async () => {
      vi.runAllTimers()
    })
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled())

    expect(mockCreate).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})

// ── Deep-link pre-selection (Practices hub) ──────────────────────────────────
// Each guided practice has its own path — /meditate/<id> — resolved by useParams; a
// legacy `?guided=` query param still resolves for old links/bookmarks; `guided=none`,
// `style=mindfulness`, or no param at all is a plain unguided sit. Tests cover the pure
// param helper and the rendered page heading.

describe('guidedChoiceFromParams', () => {
  it('maps known guided ids', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=body-scan'))).toBe('body-scan')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=loving-kindness'))).toBe(
      'loving-kindness',
    )
  })

  it('maps the rest of the trimmed guided core (focus, noting, mantra, yoga-nidra, wind-down, three-breaths)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=focus'))).toBe('focus')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=noting'))).toBe('noting')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=mantra'))).toBe('mantra')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=yoga-nidra'))).toBe('yoga-nidra')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=wind-down'))).toBe('wind-down')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=three-breaths'))).toBe(
      'three-breaths',
    )
  })

  it('maps guided=none and style=mindfulness to unguided', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=none'))).toBe('none')
    expect(guidedChoiceFromParams(new URLSearchParams('style=mindfulness'))).toBe('none')
  })

  it('no longer maps the old "acceptance" id (renamed → null → plain unguided)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=acceptance'))).toBeNull()
  })

  it('returns null for a cut guided id (old bookmark degrades to plain unguided)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=chakra-om'))).toBeNull()
    expect(guidedChoiceFromParams(new URLSearchParams('guided=walking'))).toBeNull()
    expect(guidedChoiceFromParams(new URLSearchParams('guided=stretching'))).toBeNull()
  })

  it('returns null for no / unknown params (→ plain unguided)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams(''))).toBeNull()
    expect(guidedChoiceFromParams(new URLSearchParams('guided=bogus'))).toBeNull()
  })
})

describe('MeditatePage — guided deep-link', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetStats.mockReset()
    // Default: a high enough level that all gated structures are unlocked.
    mockGetStats.mockResolvedValue({ ...BASE_STATS, level: 10 })
  })
  afterEach(cleanup)

  // Each guided practice's own path (/meditate/body-scan) → its heading.
  const PATH_LABELS: Record<string, string> = {
    'body-scan': 'Body scan',
    'loving-kindness': 'Loving-kindness',
    focus: 'Focused attention',
    noting: 'Noting',
    mantra: 'Mantra',
    'yoga-nidra': 'Yoga Nidra',
    'wind-down': 'Wind down',
    'three-breaths': 'Three mindful breaths',
  }

  it('titles the page with the practice named by its path (/meditate/body-scan)', () => {
    renderPageAtRoute('/meditate/body-scan')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Body scan')
  })

  it('resolves every guided practice from its own path', () => {
    for (const [id, label] of Object.entries(PATH_LABELS)) {
      renderPageAtRoute(`/meditate/${id}`)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label)
      cleanup()
    }
  })

  it('still honours a legacy ?guided= query param (old links/bookmarks)', () => {
    renderPageAt('/meditate?guided=loving-kindness')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loving-kindness')
  })

  it('falls back to a plain sit for a cut practice id (old bookmark degrades gracefully)', () => {
    renderPageAtRoute('/meditate/walking')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Meditate')
  })

  it('is a plain unguided sit at bare /meditate', () => {
    renderPageAtRoute('/meditate')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Meditate')
  })

  it('offers a link back to the Practices hub to switch practice', () => {
    renderPageAtRoute('/meditate/body-scan')
    expect(
      screen.getByRole('link', { name: /choose another practice/i }),
    ).toHaveAttribute('href', '/practices')
  })
})

describe('MeditatePage — intention prompts', () => {
  beforeEach(() => {
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
  })
  afterEach(cleanup)

  it('shows a placeholder suggestion in the intention textarea', () => {
    renderPage()
    const textarea = screen.getByLabelText(/intention/i) as HTMLTextAreaElement
    expect(textarea.placeholder.length).toBeGreaterThan(0)
  })
})

// ── Interval bells across a reset (regression) ───────────────────────────────
// The interval-bell loop rings when `mark > lastBellMarkRef.current`. If a long
// first sit left a high mark, a fresh sit after Reset must NOT be silenced until
// `mark` re-exceeds the stale value — reset() (and the fresh-sit branch of start())
// zero the mark so a new sit rings from its first interval again.
describe('MeditatePage — interval bells reset with a fresh sit', () => {
  // The bell scheduler reads elapsed from performance.now() (not the setInterval
  // fake clock), so we drive a controllable now() alongside fake timers.
  let now = 0
  const realNow = performance.now.bind(performance)

  beforeEach(() => {
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockPlayBell.mockReset()
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => {
    vi.mocked(performance.now).mockRestore?.()
    performance.now = realNow
    cleanup()
  })

  // Advance both the wall clock (performance.now) and the fake interval timer so the
  // 250ms bell loop fires with the new elapsed reading.
  async function tick(ms: number) {
    now += ms
    await act(async () => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('rings the interval bell again on a fresh sit after a long sit + reset', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    renderPage()

    // Turn on 5-min interval bells (open the Sound & bells disclosure first).
    fireEvent.click(screen.getByText(/sound & bells/i))
    fireEvent.change(screen.getByLabelText(/bells/i), { target: { value: 'every5' } })

    // First sit — run past the 5-min mark so interval bell "mark 1" fires.
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    mockPlayBell.mockClear() // drop the opening bell + the bell-mode preview
    await tick(5 * 60 * 1000 + 1000) // 5m01s
    const bellsInFirstSit = mockPlayBell.mock.calls.length
    expect(bellsInFirstSit).toBeGreaterThan(0) // the 5-min interval bell rang

    // Pause, then Reset back to a clean slate.
    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))
    mockPlayBell.mockClear()

    // Fresh sit — advance only ~5m10s. Without clearing lastBellMarkRef the stale
    // mark (1) would swallow this sit's first interval bell; with the fix it rings.
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    mockPlayBell.mockClear() // drop the fresh-sit opening bell
    await tick(5 * 60 * 1000 + 10 * 1000) // 5m10s into the new sit
    expect(mockPlayBell).toHaveBeenCalled() // interval bell rings again — not silenced

    vi.useRealTimers()
  })
})

describe('MeditatePage — Sound & bells disclosure', () => {
  beforeEach(() => {
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
  })
  afterEach(cleanup)

  // The disclosure is collapsed by default; bells controls live inside it.
  it('has a "Sound & bells" disclosure toggle', () => {
    renderPage()
    expect(screen.getByText(/sound & bells/i)).toBeInTheDocument()
  })

  it('disclosure is collapsed by default (Bells select not visible)', () => {
    renderPage()
    // The <details> element starts closed, so the Bells select is in the DOM
    // but the disclosure itself is not open.
    const disclosure = document.querySelector('details.meditate-disclosure') as HTMLDetailsElement
    expect(disclosure).toBeInTheDocument()
    expect(disclosure.open).toBe(false)
  })

  it('opening the disclosure reveals the Bells select', () => {
    renderPage()
    const summary = screen.getByText(/sound & bells/i)
    fireEvent.click(summary)
    // After clicking, the Bells select should be reachable.
    expect(screen.getByLabelText(/bells/i)).toBeInTheDocument()
  })

  it('closing the disclosure after opening sets it back to closed', () => {
    renderPage()
    const summary = screen.getByText(/sound & bells/i)
    fireEvent.click(summary) // open
    fireEvent.click(summary) // close
    const disclosure = document.querySelector('details.meditate-disclosure') as HTMLDetailsElement
    expect(disclosure.open).toBe(false)
  })
})

// ── Reflection PATCH coverage ────────────────────────────────────────────────
// After the sit is saved (RewardOverlay shown), closing the overlay reveals the
// reflection Modal. Submitting it PATCHes the saved session via sessionService.update;
// skipping it skips the update entirely.

describe('MeditatePage — post-session reflection', () => {
  beforeEach(() => {
    rewardOverlayState.onClose = null
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    mockMoodCreate.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockUpdate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockMoodCreate.mockResolvedValue({ id: 'mood-uuid', mood: 'calm', created_at: '' })
  })
  afterEach(cleanup)

  /** Helper: start → advance elapsed → finish and wait for create to complete,
   *  then fire the captured RewardOverlay onClose to open the reflection modal. */
  async function driveToReflection() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    // Advance 2 seconds so elapsed > 0 (past the save guard).
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    // Switch back to real timers so Promise resolution works normally.
    vi.useRealTimers()

    // Wait for saveSession to complete (mockCreate must have been called).
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))

    // Wait for RewardOverlay to be rendered (reward state set → onClose captured).
    await vi.waitFor(() => expect(rewardOverlayState.onClose).not.toBeNull())

    // Fire the RewardOverlay onClose so the reflection modal appears.
    await act(async () => {
      rewardOverlayState.onClose!()
    })
    await screen.findByText(/how was that/i)
  }

  it('submitting reflection calls sessionService.update with the saved session id', async () => {
    await driveToReflection()

    // Rate focus = 4 via the Focus chip group.
    const focusChips = screen.getAllByRole('group', { name: /focus/i })[0]
    const chip4 = Array.from(focusChips.querySelectorAll('button')).find(
      (b) => b.textContent === '4',
    )!
    fireEvent.click(chip4)

    // Submit.
    fireEvent.click(screen.getByRole('button', { name: /^keep it$/i }))
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))

    // Must PATCH the already-saved session — not create a new one.
    expect(mockUpdate).toHaveBeenCalledWith(
      SAVED_SESSION_ID,
      expect.objectContaining({ focus: 4 }),
    )
    expect(mockCreate).toHaveBeenCalledTimes(1) // no second create
  })

  it('skipping reflection does not call sessionService.update', async () => {
    await driveToReflection()

    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    // Give any async effects a tick to settle.
    await act(async () => {})

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(1) // still only the one save
  })

  it('logs a chosen mood via the mood-log path on keep — even with no focus/calm', async () => {
    await driveToReflection()

    // Pick a mood from the reflection mood group, then keep — no focus/calm rated.
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

// ── Best-effort post-save stats ──────────────────────────────────────────────
// If getStats throws AFTER the session is saved, the reward overlay must still
// appear (the session is not lost). The UI must NOT show "Could not save the session."

describe('MeditatePage — best-effort post-save stats', () => {
  beforeEach(() => {
    rewardOverlayState.onClose = null
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
  })
  afterEach(cleanup)

  it('still saves and goes to reflection (no fake-XP reward) when the after-getStats call throws', async () => {
    // getStats resolves for the on-mount level fetch + the before-save call, but the
    // AFTER-save call throws. With stats unavailable, the XP breakdown would be a
    // meaningless "0 XP / level 1", so the reward overlay is suppressed and we go
    // straight to the reflection step instead of celebrating fake numbers — the
    // session itself is still saved with no error. Keyed off whether the session has
    // been created yet (mockCreate) so the throw lands on the post-save fetch
    // regardless of how many pre-save fetches (mount + before-save) ran.
    mockGetStats.mockImplementation(() =>
      mockCreate.mock.calls.length > 0
        ? Promise.reject(new Error('network error'))
        : Promise.resolve(BASE_STATS),
    )

    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await act(async () => { vi.advanceTimersByTime(2000) })
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    vi.useRealTimers()

    // Session must be created.
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))

    // Reflection step appears directly (no reward overlay first).
    await screen.findByRole('heading', { name: /how was that\?/i })

    // No fake-XP reward overlay, and no save-error banner.
    expect(rewardOverlayState.onClose).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── Spoken guidance toggle ───────────────────────────────────────────────────
// The toggle appears only for guided sits, is ON by default, persists to
// localStorage, and is disabled (with an explanatory hint) when the device has no
// usable TTS voice.

describe('MeditatePage — spoken guidance toggle', () => {
  beforeEach(() => {
    speechState.available = true
    localStorage.clear()
    mockGetStats.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
  })
  afterEach(cleanup)

  // A guided sit is now a route, not a dropdown pick — /meditate/body-scan enters guided mode.
  function renderGuided() {
    return renderPageAtRoute('/meditate/body-scan')
  }

  it('is hidden on a plain unguided sit', () => {
    renderPageAtRoute('/meditate')
    expect(screen.queryByLabelText(/spoken guidance/i)).not.toBeInTheDocument()
  })

  it('appears and is checked by default on a guided sit', () => {
    renderGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle).toBeInTheDocument()
    expect(toggle.checked).toBe(true)
  })

  it('persists an off choice to localStorage', () => {
    renderGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(false)
    expect(localStorage.getItem('meditate:spoken-guidance')).toBe('off')
  })

  it('reads a persisted off choice on next mount', () => {
    localStorage.setItem('meditate:spoken-guidance', 'off')
    renderGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('is disabled with a fallback hint when no TTS voice is available', () => {
    speechState.available = false
    renderGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText(/voice unavailable/i)).toBeInTheDocument()
  })
})
