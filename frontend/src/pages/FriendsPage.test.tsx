/**
 * Tests for the FriendsPage: the required data-view states (loading / error / empty),
 * rendering the friends + request lists, the add-friend flow (success + a not-found
 * error), and accept / decline / remove actions calling the service.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listFriends = vi.fn()
const listRequests = vi.fn()
const sendRequest = vi.fn()
const acceptReq = vi.fn()
const declineReq = vi.fn()
const removeFriend = vi.fn()

vi.mock('../services/friends', () => ({
  friendsService: {
    list: (...a: unknown[]) => listFriends(...a),
    requests: (...a: unknown[]) => listRequests(...a),
    sendRequest: (...a: unknown[]) => sendRequest(...a),
    accept: (...a: unknown[]) => acceptReq(...a),
    decline: (...a: unknown[]) => declineReq(...a),
    remove: (...a: unknown[]) => removeFriend(...a),
  },
}))
vi.mock('../context/ToastContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/ToastContext')>()
  return { ...actual, useToast: () => ({ showToast: vi.fn() }) }
})

import FriendsPage from './FriendsPage'
import { ApiError } from '../services/api'
import type { Friend, FriendRequest } from '../types'

function friend(overrides: Partial<Friend> = {}): Friend {
  return {
    friendship_id: 'f1',
    user_id: 'u-bob',
    username: 'bob',
    level: 4,
    current_streak: 3,
    sessions_this_week: 2,
    last_practiced_on: '2026-07-02',
    friends_since: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function req(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return { id: 'r1', username: 'carol', created_at: '2026-07-02T00:00:00Z', ...overrides }
}

const NO_REQUESTS = { incoming: [], outgoing: [] }

function renderPage() {
  return render(
    <MemoryRouter>
      <FriendsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listFriends.mockReset().mockResolvedValue([])
  listRequests.mockReset().mockResolvedValue(NO_REQUESTS)
  sendRequest.mockReset().mockResolvedValue(undefined)
  acceptReq.mockReset().mockResolvedValue(undefined)
  declineReq.mockReset().mockResolvedValue(undefined)
  removeFriend.mockReset().mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('FriendsPage states', () => {
  it('shows the empty state when there are no friends', async () => {
    renderPage()
    expect(await screen.findByText(/No friends yet/i)).toBeInTheDocument()
  })

  it('shows a retryable error when loading fails', async () => {
    listFriends.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/Couldn't load your friends/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })

  it('renders friends with level, streak, and a recent-activity line', async () => {
    listFriends.mockResolvedValue([friend()])
    renderPage()
    expect(await screen.findByText('bob')).toBeInTheDocument()
    expect(screen.getByText(/Lv 4/)).toBeInTheDocument()
    expect(screen.getByText(/3-day streak/)).toBeInTheDocument()
    expect(screen.getByText(/2 practices this week/)).toBeInTheDocument()
  })

  it('renders incoming + outgoing requests', async () => {
    listRequests.mockResolvedValue({
      incoming: [req({ id: 'in-1', username: 'carol' })],
      outgoing: [req({ id: 'out-1', username: 'dave' })],
    })
    renderPage()
    expect(await screen.findByText('carol')).toBeInTheDocument()
    expect(screen.getByText(/wants to be friends/i)).toBeInTheDocument()
    expect(screen.getByText('dave')).toBeInTheDocument()
    expect(screen.getByText(/awaiting their reply/i)).toBeInTheDocument()
  })
})

describe('FriendsPage add-friend flow', () => {
  it('sends a request for a valid username', async () => {
    renderPage()
    await screen.findByText(/No friends yet/i)
    fireEvent.change(screen.getByLabelText(/Add a friend by username/i), {
      target: { value: 'bob' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add friend/i }))
    await waitFor(() => expect(sendRequest).toHaveBeenCalledWith('bob'))
  })

  it('validates the username before submitting', async () => {
    renderPage()
    await screen.findByText(/No friends yet/i)
    fireEvent.change(screen.getByLabelText(/Add a friend by username/i), {
      target: { value: 'ab' }, // too short
    })
    fireEvent.click(screen.getByRole('button', { name: /Add friend/i }))
    expect(await screen.findByText(/3–20 letters/i)).toBeInTheDocument()
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('surfaces a friendly message when the username is unknown (404)', async () => {
    sendRequest.mockRejectedValueOnce(new ApiError(404, 'No user with that username.'))
    renderPage()
    await screen.findByText(/No friends yet/i)
    fireEvent.change(screen.getByLabelText(/Add a friend by username/i), {
      target: { value: 'ghost' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add friend/i }))
    expect(await screen.findByText(/No one goes by that username/i)).toBeInTheDocument()
  })

  it('surfaces the already-connected message on 409', async () => {
    sendRequest.mockRejectedValueOnce(new ApiError(409))
    renderPage()
    await screen.findByText(/No friends yet/i)
    fireEvent.change(screen.getByLabelText(/Add a friend by username/i), {
      target: { value: 'bob' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add friend/i }))
    expect(await screen.findByText(/already connected or have a pending request/i)).toBeInTheDocument()
  })
})

describe('FriendsPage actions', () => {
  it('accepts an incoming request', async () => {
    listRequests.mockResolvedValue({
      incoming: [req({ id: 'in-1', username: 'carol' })],
      outgoing: [],
    })
    renderPage()
    await screen.findByText('carol')
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }))
    await waitFor(() => expect(acceptReq).toHaveBeenCalledWith('in-1'))
  })

  it('declines an incoming request', async () => {
    listRequests.mockResolvedValue({
      incoming: [req({ id: 'in-1', username: 'carol' })],
      outgoing: [],
    })
    renderPage()
    await screen.findByText('carol')
    fireEvent.click(screen.getByRole('button', { name: /Decline/i }))
    await waitFor(() => expect(declineReq).toHaveBeenCalledWith('in-1'))
  })

  it('removes a friend', async () => {
    listFriends.mockResolvedValue([friend({ user_id: 'u-bob', username: 'bob' })])
    renderPage()
    const card = (await screen.findByText('bob')).closest('li') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /Remove/i }))
    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith('u-bob'))
  })
})
