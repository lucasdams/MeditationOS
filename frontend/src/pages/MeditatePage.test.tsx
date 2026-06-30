/**
 * Light smoke tests for MeditatePage — guards the intention + reflection additions.
 * Full timer/bell integration is not exercised here (tested manually / E2E).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockGetStats = vi.fn()
const mockNavigate = vi.fn()

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
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../components/BiometricCapture', () => ({ default: () => null }))
vi.mock('../lib/sfx', () => ({ playBell: vi.fn() }))
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
// `/meditate?guided=<id>` pre-selects that guided structure on mount; `guided=none`
// or `style=mindfulness` pre-selects plain unguided sitting; no param falls back to
// the stored preference. Tests cover the pure param helper and the rendered <select>.

describe('guidedChoiceFromParams', () => {
  it('maps known guided ids', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=body-scan'))).toBe('body-scan')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=loving-kindness'))).toBe(
      'loving-kindness',
    )
  })

  it('maps the new guided ids (name-feelings, chakra-om, stretching)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=name-feelings'))).toBe(
      'name-feelings',
    )
    expect(guidedChoiceFromParams(new URLSearchParams('guided=chakra-om'))).toBe('chakra-om')
    expect(guidedChoiceFromParams(new URLSearchParams('guided=stretching'))).toBe('stretching')
  })

  it('maps guided=none and style=mindfulness to unguided', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=none'))).toBe('none')
    expect(guidedChoiceFromParams(new URLSearchParams('style=mindfulness'))).toBe('none')
  })

  it('no longer maps the old "acceptance" id (renamed → falls back to stored pref)', () => {
    expect(guidedChoiceFromParams(new URLSearchParams('guided=acceptance'))).toBeNull()
  })

  it('returns null for no / unknown params (falls back to stored pref)', () => {
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

  it('pre-selects the Body scan structure from ?guided=body-scan', () => {
    renderPageAt('/meditate?guided=body-scan')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    expect(select.value).toBe('body-scan')
  })

  it('pre-selects Name what you feel from ?guided=name-feelings', () => {
    renderPageAt('/meditate?guided=name-feelings')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    expect(select.value).toBe('name-feelings')
  })

  it('pre-selects Mindful stretching from ?guided=stretching', () => {
    renderPageAt('/meditate?guided=stretching')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    expect(select.value).toBe('stretching')
  })

  it('defaults to unguided (None) with no param', () => {
    renderPageAt('/meditate')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    expect(select.value).toBe('none')
  })
})

// ── Level gate (Chakra Om) ───────────────────────────────────────────────────
// Chakra Om unlocks at level 5. A `?guided=chakra-om` deep-link selects it only
// when the fetched level meets the gate; below it (or while the level is still
// unknown) the page falls back to plain unguided sitting.

describe('MeditatePage — Chakra Om level gate', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetStats.mockReset()
  })
  afterEach(cleanup)

  it('falls back to None when ?guided=chakra-om is deep-linked below level 5', async () => {
    mockGetStats.mockResolvedValue({ ...BASE_STATS, level: 3 })
    renderPageAt('/meditate?guided=chakra-om')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    // Once the level resolves (3 < 5), the gate effect resets the choice to none.
    await waitFor(() => expect(select.value).toBe('none'))
  })

  it('selects Chakra Om when ?guided=chakra-om is deep-linked at level 5+', async () => {
    mockGetStats.mockResolvedValue({ ...BASE_STATS, level: 5 })
    renderPageAt('/meditate?guided=chakra-om')
    const select = screen.getByLabelText(/guided structure/i) as HTMLSelectElement
    // Initial render selects it from the param; the gate effect leaves it (5 >= 5).
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    expect(select.value).toBe('chakra-om')
  })

  it('renders the Chakra Om option disabled with a "Reach level 5" hint below level 5', async () => {
    mockGetStats.mockResolvedValue({ ...BASE_STATS, level: 2 })
    renderPageAt('/meditate')
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    const option = Array.from(
      (screen.getByLabelText(/guided structure/i) as HTMLSelectElement).options,
    ).find((o) => o.textContent?.includes('Chakra Om'))!
    expect(option.disabled).toBe(true)
    expect(option.textContent).toMatch(/Reach level 5 to unlock/)
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
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({ id: SAVED_SESSION_ID })
    mockUpdate.mockResolvedValue({ id: SAVED_SESSION_ID })
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

  function selectGuided() {
    fireEvent.change(screen.getByLabelText(/guided structure/i), {
      target: { value: 'body-scan' },
    })
  }

  it('is hidden when no guided structure is selected', () => {
    renderPage()
    expect(screen.queryByLabelText(/spoken guidance/i)).not.toBeInTheDocument()
  })

  it('appears and is checked by default once a guided structure is chosen', () => {
    renderPage()
    selectGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle).toBeInTheDocument()
    expect(toggle.checked).toBe(true)
  })

  it('persists an off choice to localStorage', () => {
    renderPage()
    selectGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(false)
    expect(localStorage.getItem('meditate:spoken-guidance')).toBe('off')
  })

  it('reads a persisted off choice on next mount', () => {
    localStorage.setItem('meditate:spoken-guidance', 'off')
    renderPage()
    selectGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('is disabled with a fallback hint when no TTS voice is available', () => {
    speechState.available = false
    renderPage()
    selectGuided()
    const toggle = screen.getByLabelText(/spoken guidance/i) as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText(/voice unavailable/i)).toBeInTheDocument()
  })
})
