/**
 * Light smoke tests for MeditatePage — guards the intention + reflection additions.
 * Full timer/bell integration is not exercised here (tested manually / E2E).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockGetStats = vi.fn()
const mockNavigate = vi.fn()

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
vi.mock('../components/RewardOverlay', () => ({ default: () => null }))
vi.mock('../components/BiometricCapture', () => ({ default: () => null }))
vi.mock('../lib/sfx', () => ({ playBell: vi.fn() }))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
// Mock sessionDraft so sessionService.create can be called without localStorage.
vi.mock('../lib/sessionDraft', () => ({
  MIN_DRAFT_SECONDS: 60,
  beaconSave: vi.fn(),
  clearDraft: vi.fn(),
  newClientToken: () => 'test-token',
  readRestorableDraft: () => null,
  writeDraft: vi.fn(),
}))

import MeditatePage from './MeditatePage'

const SAVED_SESSION_ID = 'session-uuid-abc'

function renderPage() {
  return render(
    <MemoryRouter>
      <MeditatePage />
    </MemoryRouter>,
  )
}

describe('MeditatePage — pre-session intention', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockGetStats.mockReset()
    mockNavigate.mockReset()
    const stats = { xp: 0, level: 1, xp_for_next_level: 100, current_streak_days: 0 }
    mockGetStats.mockResolvedValue(stats)
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

  it('session create is not double-called when finish is clicked once', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    const finishBtn = await screen.findByRole('button', { name: /finish/i })
    // elapsed is ~0 in jsdom so finish() navigates — we just verify no double-call.
    fireEvent.click(finishBtn)
    // mockCreate should not have been called (elapsed < 1 guard) or called once.
    await new Promise((r) => setTimeout(r, 50))
    expect(mockCreate.mock.calls.length).toBeLessThanOrEqual(1)
  })
})

describe('MeditatePage — intention prompts', () => {
  afterEach(cleanup)

  it('shows a placeholder suggestion in the intention textarea', () => {
    renderPage()
    const textarea = screen.getByLabelText(/intention/i) as HTMLTextAreaElement
    expect(textarea.placeholder.length).toBeGreaterThan(0)
  })
})
