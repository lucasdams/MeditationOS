import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockDel = vi.fn()
vi.mock('./api', () => ({
  api: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    del: (...a: unknown[]) => mockDel(...a),
  },
}))

import { friendsService } from './friends'

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([])
  mockPost.mockReset().mockResolvedValue(undefined)
  mockDel.mockReset().mockResolvedValue(undefined)
})

describe('friendsService', () => {
  it('lists friends from /friends', async () => {
    await friendsService.list()
    expect(mockGet).toHaveBeenCalledWith('/friends')
  })

  it('lists requests from /friends/requests', async () => {
    await friendsService.requests()
    expect(mockGet).toHaveBeenCalledWith('/friends/requests')
  })

  it('sends a request with the username body', async () => {
    await friendsService.sendRequest('bob')
    expect(mockPost).toHaveBeenCalledWith('/friends/requests', { username: 'bob' })
  })

  it('accepts a request by friendship id', async () => {
    await friendsService.accept('fid-1')
    expect(mockPost).toHaveBeenCalledWith('/friends/requests/fid-1/accept')
  })

  it('declines a request by friendship id', async () => {
    await friendsService.decline('fid-2')
    expect(mockPost).toHaveBeenCalledWith('/friends/requests/fid-2/decline')
  })

  it('removes a friend by user id', async () => {
    await friendsService.remove('user-9')
    expect(mockDel).toHaveBeenCalledWith('/friends/user-9')
  })
})
