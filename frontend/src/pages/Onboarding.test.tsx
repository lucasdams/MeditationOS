import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const setQuestFeatures = vi.fn().mockResolvedValue({})
const refresh = vi.fn().mockResolvedValue(undefined)
const navigate = vi.fn()

vi.mock('../services/auth', () => ({
  authService: {
    setQuestFeatures: (...a: unknown[]) => setQuestFeatures(...a),
  },
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refresh }) }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

import Onboarding from './Onboarding'

const renderOnboarding = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  )

// Beginner-first onboarding (§5): a single warm question that shapes the daily quests + tone,
// then drops the user straight into a 1-minute guided breath. The companion's dosha pick is
// DEFERRED to after the first sit (the "hatch").
describe('Onboarding — one warm question → guided breath', () => {
  beforeEach(() => {
    setQuestFeatures.mockClear()
    refresh.mockClear()
    navigate.mockClear()
    localStorage.clear()
  })

  // Unmount between tests so prior renders don't leak duplicate elements into
  // the next test's DOM queries.
  afterEach(() => {
    cleanup()
  })

  it('asks one warm question with four calm choices, no wizard steps', () => {
    renderOnboarding()
    expect(screen.getByText(/What brings you here\?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Calm/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Focus/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Better sleep/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Just curious/ })).toBeInTheDocument()
    // The deferred steps are gone — no experience / preferred-time / quest picker.
    expect(screen.queryByText(/How much have you practiced/i)).toBeNull()
  })

  it('choosing Calm sets quests, the hatch flags, the first-sit pace, and routes to the guided breath', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /Calm/ }))

    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(setQuestFeatures).toHaveBeenCalledWith(['breathe', 'gratitude', 'journal'])
    expect(refresh).toHaveBeenCalled()
    // The hatch flags steer the first sit → companion choose page, and remember the intent.
    expect(localStorage.getItem('onboarding.pendingHatch')).toBe('1')
    expect(localStorage.getItem('onboarding.intent')).toBe('calm')
    // A gentle first-sit pace.
    expect(localStorage.getItem('breathe.bpm')).toBe('6')
    // Straight into the zero-config 1-minute guided breath.
    expect(navigate).toHaveBeenCalledWith('/breathe?guided=1&duration=60')
  })

  it('stores the chosen intent so the hatch page can suggest a matching companion', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /Focus/ }))
    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(localStorage.getItem('onboarding.intent')).toBe('focus')
    expect(setQuestFeatures).toHaveBeenCalledWith(['meditate', 'breathe', 'journal'])
  })

  it('"Just curious" uses a sensible default quest set', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: /Just curious/ }))
    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(setQuestFeatures).toHaveBeenCalledWith(['breathe', 'gratitude', 'journal'])
    expect(localStorage.getItem('onboarding.intent')).toBe('curious')
  })
})
