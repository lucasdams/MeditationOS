import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import type { AdminMetrics, AdminUserDetail, AdminUserList, AuditList, User } from '../types'

const metrics = vi.fn()
const listUsers = vi.fn()
const getUser = vi.fn()
const resendVerification = vi.fn()
const disableUser = vi.fn()
const enableUser = vi.fn()
const deleteUser = vi.fn()
const audit = vi.fn()
let mockUser: Partial<User> | null = null

vi.mock('../services/admin', () => ({
  adminService: {
    metrics: (...a: unknown[]) => metrics(...a),
    listUsers: (...a: unknown[]) => listUsers(...a),
    getUser: (...a: unknown[]) => getUser(...a),
    resendVerification: (...a: unknown[]) => resendVerification(...a),
    disableUser: (...a: unknown[]) => disableUser(...a),
    enableUser: (...a: unknown[]) => enableUser(...a),
    deleteUser: (...a: unknown[]) => deleteUser(...a),
    audit: (...a: unknown[]) => audit(...a),
  },
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
  adoption: { goal_users: 3, reminder_users: 1, push_users: 0 },
}

const sampleList: AdminUserList = {
  total: 1,
  users: [
    {
      id: 'user-1',
      email: 'jane@example.com',
      username: 'jane',
      created_at: '2026-01-01T00:00:00Z',
      email_verified: false,
      is_guest: false,
      is_admin: false,
      is_disabled: false,
    },
  ],
}

const sampleDetail: AdminUserDetail = {
  ...sampleList.users[0],
  last_active_at: null,
  counts: { sessions: 3, journals: 1, gratitude: 0, mood_logs: 0, goals: 2 },
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
    listUsers.mockReset()
    getUser.mockReset()
    resendVerification.mockReset()
    disableUser.mockReset()
    enableUser.mockReset()
    deleteUser.mockReset()
    audit.mockReset()
    mockUser = null
  })

  afterEach(cleanup)

  it('redirects a non-admin away from the page and never fetches metrics', async () => {
    mockUser = { is_admin: false }
    renderPage()
    await waitFor(() => expect(screen.getByText('Dashboard home')).toBeInTheDocument())
    expect(metrics).not.toHaveBeenCalled()
  })

  it('renders aggregate metrics for an admin (default tab)', async () => {
    mockUser = { is_admin: true }
    metrics.mockResolvedValue(sampleMetrics)
    renderPage()

    await waitFor(() => expect(screen.getByText('total users')).toBeInTheDocument())
    expect(metrics).toHaveBeenCalledOnce()
    expect(screen.getByText('sessions')).toBeInTheDocument()
    expect(screen.getByText('DAU (1d)')).toBeInTheDocument()
    expect(screen.getByText(/Content created/i)).toBeInTheDocument()
  })

  it('shows an error state when the metrics request fails', async () => {
    mockUser = { is_admin: true }
    metrics.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load admin metrics/i),
    )
  })

  it('searches users and opens a detail with support actions', async () => {
    mockUser = { is_admin: true, id: 'admin-1' }
    metrics.mockResolvedValue(sampleMetrics)
    listUsers.mockResolvedValue(sampleList)
    getUser.mockResolvedValue(sampleDetail)
    disableUser.mockResolvedValue({ ...sampleDetail, is_disabled: true })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Users' }))
    fireEvent.change(screen.getByLabelText(/search by email/i), {
      target: { value: 'jane' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(listUsers).toHaveBeenCalled())
    fireEvent.click(await screen.findByText('jane@example.com'))

    await waitFor(() => expect(getUser).toHaveBeenCalledWith('user-1'))
    // Detail shows counts and the support actions.
    expect(screen.getByText('journals')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Disable account' }))
    await waitFor(() => expect(disableUser).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByText(/account disabled/i)).toBeInTheDocument()
  })

  it('renders the audit log tab', async () => {
    mockUser = { is_admin: true, id: 'admin-1' }
    metrics.mockResolvedValue(sampleMetrics)
    const auditData: AuditList = {
      total: 1,
      entries: [
        {
          id: 'a1',
          actor_user_id: 'admin-1',
          target_user_id: 'user-1',
          action: 'user.disable',
          detail: null,
          created_at: '2026-06-16T10:00:00Z',
        },
      ],
    }
    audit.mockResolvedValue(auditData)
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Audit log' }))
    await waitFor(() => expect(audit).toHaveBeenCalled())
    expect(await screen.findByText(/disabled account/i)).toBeInTheDocument()
  })

  it("disables self-action buttons for the admin's own account", async () => {
    mockUser = { is_admin: true, id: 'user-1' }
    metrics.mockResolvedValue(sampleMetrics)
    listUsers.mockResolvedValue(sampleList)
    getUser.mockResolvedValue({ ...sampleDetail, id: 'user-1' })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Users' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByText('jane@example.com'))

    await waitFor(() => expect(getUser).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Disable account' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled()
  })
})
