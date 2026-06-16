import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import type { AdminMetrics, User } from '../types'

const metrics = vi.fn()
let mockUser: Partial<User> | null = null

vi.mock('../services/admin', () => ({
  adminService: { metrics: (...a: unknown[]) => metrics(...a) },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

import AdminPage from './AdminPage'

const sampleMetrics: AdminMetrics = {
  generated_at: '2026-06-16',
  users: {
    total: 5,
    guests: 1,
    registered: 4,
    email_verified: 3,
    email_unverified: 2,
    with_active_streak: 2,
    signups_last_30_days: Array.from({ length: 30 }, (_, i) => ({
      day: `2026-05-${String(i + 1).padStart(2, '0')}`,
      count: i === 29 ? 3 : 0,
    })),
  },
  active_users: { dau: 1, wau: 3, mau: 4 },
  practice: { total_sessions: 12, total_minutes: 240 },
  content: { gratitude_entries: 7, journal_entries: 4, mood_logs: 2 },
  adoption: { sanctuary_users: 2, goal_users: 3, reminder_users: 1, push_users: 0 },
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/" element={<div>Dashboard home</div>} />
      </Routes>
    </MemoryRouter>,
  )

describe('AdminPage', () => {
  beforeEach(() => {
    metrics.mockReset()
    mockUser = null
  })

  it('redirects a non-admin away from the page and never fetches metrics', async () => {
    mockUser = { is_admin: false }
    renderPage()
    await waitFor(() => expect(screen.getByText('Dashboard home')).toBeInTheDocument())
    expect(metrics).not.toHaveBeenCalled()
  })

  it('renders aggregate metrics for an admin', async () => {
    mockUser = { is_admin: true }
    metrics.mockResolvedValue(sampleMetrics)
    renderPage()

    await waitFor(() => expect(screen.getByText('total users')).toBeInTheDocument())
    expect(metrics).toHaveBeenCalledOnce()
    // A representative count from each group is shown.
    expect(screen.getByText('sessions')).toBeInTheDocument()
    expect(screen.getByText('DAU (1d)')).toBeInTheDocument()
    expect(screen.getByText(/Content created/i)).toBeInTheDocument()
  })

  it('shows an error state when the metrics request fails', async () => {
    mockUser = { is_admin: true }
    metrics.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load admin metrics/i),
    )
  })
})
