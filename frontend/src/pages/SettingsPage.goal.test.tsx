/**
 * Focused test for the SettingsPage daily-goal control (the ring's target). The rest of the
 * page's sections are exercised elsewhere / manually; here we mock the contexts + services and
 * drive only the "Daily goal" form.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { User } from '../types'

const setDailyGoal = vi.fn()
const refresh = vi.fn()

vi.mock('../services/auth', () => ({
  authService: {
    setDailyGoal: (...a: unknown[]) => setDailyGoal(...a),
  },
}))

let mockUser: User
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refresh, logout: vi.fn() }),
}))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    pref: 'auto',
    setPref: vi.fn(),
    season: 'summer',
    dayPhase: 'day',
  }),
}))
// PushToggle does its own service-worker/push work — irrelevant here, render nothing.
vi.mock('../components/PushToggle', () => ({ default: () => null }))

import SettingsPage from './SettingsPage'

function baseUser(over: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'a@example.com',
    username: 'alice',
    timezone: 'UTC',
    has_password: true,
    email_verified: true,
    is_guest: false,
    is_admin: false,
    reminder_enabled: false,
    reminder_hour: null,
    streak_save_enabled: true,
    weekly_summary_enabled: false,
    weekly_summary_day: null,
    quest_features: ['meditate', 'breathe', 'gratitude'],
    daily_goal_minutes: 10,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('SettingsPage — daily goal', () => {
  beforeEach(() => {
    setDailyGoal.mockReset().mockResolvedValue(baseUser({ daily_goal_minutes: 25 }))
    refresh.mockReset().mockResolvedValue(undefined)
    mockUser = baseUser()
  })
  afterEach(cleanup)

  function renderPage() {
    return render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
  }

  it('saves a new goal and refreshes the user', async () => {
    renderPage()
    const input = screen.getByLabelText(/minutes per day/i) as HTMLInputElement
    expect(input.value).toBe('10') // seeded from the user
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /save goal/i }))

    await waitFor(() => expect(setDailyGoal).toHaveBeenCalledWith(25))
    expect(refresh).toHaveBeenCalled()
    expect(await screen.findByText(/daily goal saved/i)).toBeInTheDocument()
  })

  it('rejects an out-of-range goal client-side without calling the API', async () => {
    renderPage()
    const input = screen.getByLabelText(/minutes per day/i)
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /save goal/i }))

    expect(await screen.findByText(/between 1 and 120/i)).toBeInTheDocument()
    expect(setDailyGoal).not.toHaveBeenCalled()
  })
})
