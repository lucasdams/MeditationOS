import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

import type { User } from '../types'

const me = vi.fn()
const setTimezone = vi.fn()
const logout = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/auth', () => ({
  authService: {
    me: (...a: unknown[]) => me(...a),
    setTimezone: (...a: unknown[]) => setTimezone(...a),
    logout: (...a: unknown[]) => logout(...a),
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

function Probe() {
  const { user, loading, verificationRequired } = useAuth()
  if (loading) return <span>loading</span>
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <span data-testid="gate">{verificationRequired ? 'gated' : 'open'}</span>
    </div>
  )
}

const baseUser = (over: Partial<User> = {}): User =>
  ({
    id: '1',
    email: 'a@b.com',
    username: 'a',
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
    quest_features: ['meditate'],
    created_at: '2026-01-01',
    ...over,
  }) as User

async function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

describe('AuthContext email-verification gate', () => {
  beforeEach(() => {
    me.mockReset()
    setTimezone.mockReset()
    // Default: a verified account whose timezone already matches the browser, so
    // refresh() never calls setTimezone.
    me.mockResolvedValue(baseUser({ timezone: TZ }))
  })

  // Explicitly unmount between tests so a leaked provider can't catch a later
  // window 'auth:forbidden' event.
  afterEach(() => cleanup())

  it('does not gate by default (no 403, verified user) — ships dark', async () => {
    await renderProvider()
    expect(screen.getByTestId('gate')).toHaveTextContent('open')
    expect(screen.getByTestId('user')).toHaveTextContent('a@b.com')
  })

  it('raises the gate on a 403 only after /auth/me confirms email is unverified', async () => {
    await renderProvider()
    expect(screen.getByTestId('gate')).toHaveTextContent('open')

    // Now the backend gate is on; the recheck reports unverified.
    me.mockResolvedValue(baseUser({ timezone: TZ, email_verified: false }))
    act(() => {
      window.dispatchEvent(new Event('auth:forbidden'))
    })
    await waitFor(() => expect(screen.getByTestId('gate')).toHaveTextContent('gated'))
  })

  it('does NOT gate on an unrelated 403 when /auth/me still reports verified', async () => {
    await renderProvider()

    const callsBefore = me.mock.calls.length
    me.mockResolvedValue(baseUser({ timezone: TZ, email_verified: true }))
    act(() => {
      window.dispatchEvent(new Event('auth:forbidden'))
    })
    // Wait for the recheck to run, then confirm it stayed open.
    await waitFor(() => expect(me.mock.calls.length).toBeGreaterThan(callsBefore))
    expect(screen.getByTestId('gate')).toHaveTextContent('open')
  })
})
