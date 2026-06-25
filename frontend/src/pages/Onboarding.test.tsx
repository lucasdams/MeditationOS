import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const setQuestFeatures = vi.fn().mockResolvedValue({})
const setReminders = vi.fn().mockResolvedValue({})
const refresh = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/auth', () => ({
  authService: {
    setQuestFeatures: (...a: unknown[]) => setQuestFeatures(...a),
    setReminders: (...a: unknown[]) => setReminders(...a),
  },
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refresh }) }))

import Onboarding from './Onboarding'

const renderOnboarding = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  )

describe('Onboarding', () => {
  beforeEach(() => {
    setQuestFeatures.mockClear()
    setReminders.mockClear()
    refresh.mockClear()
    localStorage.clear()
  })

  // Unmount between tests so prior renders don't leak duplicate elements into
  // the next test's DOM queries.
  afterEach(() => {
    cleanup()
  })

  it('walks goal → experience → time → quests and sets up the account', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByText(/Let.s begin/))
    fireEvent.click(screen.getByText(/Focus & clarity/)) // → quests meditate, breathe, journal
    fireEvent.click(screen.getByText('Some experience')) // → breathe.bpm 4.5
    fireEvent.click(screen.getByText('Mornings')) // → reminder hour 8
    fireEvent.click(screen.getByText('Start practicing'))

    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(setQuestFeatures).toHaveBeenCalledWith(['meditate', 'breathe', 'journal'])
    expect(setReminders).toHaveBeenCalledWith(true, 8)
    expect(refresh).toHaveBeenCalled()
    expect(localStorage.getItem('breathe.bpm')).toBe('4.5')
  })

  it('keeps hand-toggled quests when returning to the goal step and re-picking the same goal', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByText(/Let.s begin/))
    fireEvent.click(screen.getByText(/Focus & clarity/)) // seeds meditate, breathe, journal
    fireEvent.click(screen.getByText('Some experience'))
    fireEvent.click(screen.getByText('Mornings'))

    // On the quests step, add gratitude (a quest not in the focus preset).
    fireEvent.click(screen.getByLabelText(/Gratitude/i))

    // Back to goal, re-tap the SAME goal — manual edits must survive.
    fireEvent.click(screen.getByText('← Back')) // time
    fireEvent.click(screen.getByText('← Back')) // experience
    fireEvent.click(screen.getByText('← Back')) // goal
    fireEvent.click(screen.getByText(/Focus & clarity/))
    fireEvent.click(screen.getByText('Some experience'))
    fireEvent.click(screen.getByText('Mornings'))
    fireEvent.click(screen.getByText('Start practicing'))

    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(setQuestFeatures).toHaveBeenCalledWith(['meditate', 'breathe', 'journal', 'gratitude'])
  })

  it('does not set a reminder when "No reminder" is chosen', async () => {
    renderOnboarding()
    fireEvent.click(screen.getByText(/Let.s begin/))
    fireEvent.click(screen.getByText(/Calm & stress relief/))
    fireEvent.click(screen.getByText('New to meditation'))
    fireEvent.click(screen.getByText(/No reminder/))
    fireEvent.click(screen.getByText('Start practicing'))

    await waitFor(() => expect(setQuestFeatures).toHaveBeenCalled())
    expect(setReminders).not.toHaveBeenCalled()
  })
})
