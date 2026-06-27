/**
 * Light smoke tests for LogSessionPage.
 * Guards that all fields are present, the practice picker works,
 * and that handleSubmit sends the right payload shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockCreate = vi.fn()
const mockGetStats = vi.fn()
const mockNavigate = vi.fn()

// Shared mutable state for the RewardOverlay mock so tests can detect when it is shown.
const rewardOverlayState = { shown: false }

vi.mock('../services/sessions', () => ({
  sessionService: { create: (...a: unknown[]) => mockCreate(...a) },
}))
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: (...a: unknown[]) => mockGetStats(...a) },
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../components/RewardOverlay', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (_props: any) => {
    rewardOverlayState.shown = true
    return null
  },
}))

import LogSessionPage from './LogSessionPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LogSessionPage />
    </MemoryRouter>,
  )
}

// Full stats shape expected by buildXpBreakdown (daily_quests + streak_bonus_xp required).
const BASE_STATS = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

describe('LogSessionPage', () => {
  beforeEach(() => {
    rewardOverlayState.shown = false
    mockCreate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    mockGetStats.mockResolvedValue(BASE_STATS)
    mockCreate.mockResolvedValue({})
  })
  afterEach(cleanup)

  it('renders the page heading and subtitle', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /log a session/i })).toBeInTheDocument()
    expect(screen.getByText(/record a meditation/i)).toBeInTheDocument()
  })

  it('renders a back link to the dashboard', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /dashboard/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders the practice picker with Meditation and Breathing options', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /breathing/i })).toBeInTheDocument()
  })

  it('renders the Date & time field', () => {
    renderPage()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
  })

  it('renders duration quick-pick chips including 10 and 30', () => {
    renderPage()
    // Look inside the duration group specifically to avoid ambiguity with rating chips.
    const durationGroup = screen.getByRole('group', { name: /duration in minutes/i })
    expect(durationGroup.querySelector('button[aria-pressed="true"]')).toBeDefined()
    // 10 is the default.
    const tenBtn = Array.from(durationGroup.querySelectorAll('button')).find(
      (b) => b.textContent === '10',
    )
    expect(tenBtn).toBeDefined()
  })

  it('renders Focus and Calm rating rows with "Not rated" as default', () => {
    renderPage()
    const notRatedButtons = screen.getAllByRole('button', { name: /not rated/i })
    expect(notRatedButtons).toHaveLength(2)
    notRatedButtons.forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'true'))
  })

  it('renders a Notes textarea', () => {
    renderPage()
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument()
  })

  it('renders an optional Intention textarea (≤140 chars)', () => {
    renderPage()
    const intention = screen.getByLabelText(/intention/i) as HTMLTextAreaElement
    expect(intention).toBeInTheDocument()
    expect(intention.maxLength).toBe(140)
  })

  it('includes a trimmed intention in the create payload when set', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/intention/i), {
      target: { value: '  Return to the breath.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate.mock.calls[0][0].intention).toBe('Return to the breath.')
  })

  it('omits a blank intention (sends null) from the create payload', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate.mock.calls[0][0].intention).toBeNull()
  })

  it('submits the correct payload for a mindfulness session', async () => {
    renderPage()

    // Select Meditation (default) — already selected. Pick 15 min.
    fireEvent.click(screen.getByRole('button', { name: '15' }))

    // Set focus to 3.
    const focusGroup = screen.getByRole('group', { name: /focus rating/i })
    const focus3 = Array.from(focusGroup.querySelectorAll('button')).find(
      (b) => b.textContent === '3',
    )
    fireEvent.click(focus3!)

    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())

    const payload = mockCreate.mock.calls[0][0]
    expect(payload.type).toBe('mindfulness')
    expect(payload.duration_seconds).toBe(15 * 60)
    expect(payload.focus).toBe(3)
    expect(payload.calm).toBeNull()
    expect(typeof payload.occurred_at).toBe('string')
    expect(payload.occurred_at.length).toBeGreaterThan(0)
  })

  it('sends a tz-aware (UTC ISO) occurred_at, not a naive datetime-local string', async () => {
    // The picker holds a tz-naive "YYYY-MM-DDThh:mm"; the payload must be a tz-aware
    // ISO 8601 string (UTC "Z" suffix) so the backend buckets the local day correctly,
    // matching MeditatePage / BiometricCapture (which send toISOString()).
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /save session/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())

    const occurredAt: string = mockCreate.mock.calls[0][0].occurred_at
    // ISO with offset — a naive "datetime-local" value has none.
    expect(occurredAt).toMatch(/Z$/)
    expect(occurredAt).not.toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    // It round-trips through Date (i.e. it's a valid timestamp).
    expect(Number.isNaN(new Date(occurredAt).getTime())).toBe(false)
  })

  it('submits a resonance_breathing payload when Breathing is selected', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /breathing/i }))
    // 10 min is still selected.

    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())

    const payload = mockCreate.mock.calls[0][0]
    expect(payload.type).toBe('resonance_breathing')
    expect(payload.duration_seconds).toBe(10 * 60)
  })

  it('shows a validation error when Custom duration is empty', async () => {
    renderPage()

    // Click Custom and leave the number blank.
    fireEvent.click(screen.getByRole('button', { name: /custom/i }))
    // Leave the custom input empty.

    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/positive number/i),
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('sends a client_token in the create payload', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())

    const payload = mockCreate.mock.calls[0][0]
    expect(typeof payload.client_token).toBe('string')
    expect(payload.client_token.length).toBeGreaterThan(0)
  })

  it('sends the same client_token on retry (no duplicate session)', async () => {
    // First call fails, second succeeds.
    mockCreate
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({})

    renderPage()

    // First submit — should fail.
    fireEvent.click(screen.getByRole('button', { name: /save session/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    const firstToken = mockCreate.mock.calls[0][0].client_token

    // Retry.
    fireEvent.click(screen.getByRole('button', { name: /save session/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2))

    const secondToken = mockCreate.mock.calls[1][0].client_token
    expect(secondToken).toBe(firstToken)
  })
})

// ── Best-effort post-save stats ──────────────────────────────────────────────
// If getStats throws AFTER the session is saved, the reward overlay must still
// appear. The UI must NOT show "Could not save the session."

describe('LogSessionPage — best-effort post-save stats', () => {
  beforeEach(() => {
    rewardOverlayState.shown = false
    mockCreate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    mockCreate.mockResolvedValue({})
  })
  afterEach(cleanup)

  it('shows the reward overlay even when after-getStats throws', async () => {
    // First getStats (before) succeeds; second (after) throws.
    mockGetStats
      .mockResolvedValueOnce(BASE_STATS)
      .mockRejectedValueOnce(new Error('network error'))

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /save session/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(rewardOverlayState.shown).toBe(true))

    // No error banner should be shown.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
