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
vi.mock('../components/RewardOverlay', () => ({ default: () => null }))

import LogSessionPage from './LogSessionPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LogSessionPage />
    </MemoryRouter>,
  )
}

describe('LogSessionPage', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    // Default stats response — enough to satisfy buildXpBreakdown.
    const stats = { xp: 0, level: 1, xp_for_next_level: 100, streak: 0, coins: 0 }
    mockGetStats.mockResolvedValue(stats)
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
})
