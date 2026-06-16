import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ApiError } from '../services/api'

const verifyEmail = vi.fn()
const resendVerification = vi.fn()
const refresh = vi.fn().mockResolvedValue(undefined)
let mockUser: { email: string } | null = null

vi.mock('../services/auth', () => ({
  authService: {
    verifyEmail: (...a: unknown[]) => verifyEmail(...a),
    resendVerification: (...a: unknown[]) => resendVerification(...a),
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refresh }),
}))

import VerifyEmailPage from './VerifyEmailPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <VerifyEmailPage />
    </MemoryRouter>,
  )

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    verifyEmail.mockReset()
    resendVerification.mockReset()
    refresh.mockClear()
    mockUser = null
  })

  it('shows a missing-token message when there is no token', () => {
    renderAt('/verify-email')
    expect(screen.getByRole('alert')).toHaveTextContent(/missing its token/i)
    expect(verifyEmail).not.toHaveBeenCalled()
  })

  it('confirms the email on a valid token', async () => {
    verifyEmail.mockResolvedValue(undefined)
    renderAt('/verify-email?token=good')
    await waitFor(() =>
      expect(screen.getByText(/email confirmed/i)).toBeInTheDocument(),
    )
    expect(verifyEmail).toHaveBeenCalledWith('good')
  })

  it('offers a resend when the link is invalid and the user is logged in', async () => {
    mockUser = { email: 'a@b.com' }
    verifyEmail.mockRejectedValue(new ApiError(400, 'expired'))
    resendVerification.mockResolvedValue(undefined)
    renderAt('/verify-email?token=stale')

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /send a new link/i }))
    await waitFor(() => expect(screen.getByText(/sent — check/i)).toBeInTheDocument())
    expect(resendVerification).toHaveBeenCalledOnce()
  })

  it('handles the rate-limit 429 on resend gracefully', async () => {
    mockUser = { email: 'a@b.com' }
    verifyEmail.mockRejectedValue(new ApiError(400, 'expired'))
    resendVerification.mockRejectedValue(new ApiError(429, 'slow down'))
    renderAt('/verify-email?token=stale')

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /send a new link/i }))
    await waitFor(() =>
      expect(screen.getByText(/please wait a moment/i)).toBeInTheDocument(),
    )
  })
})
