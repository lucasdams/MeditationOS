import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDel = vi.fn()
vi.mock('./api', () => ({
  api: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    del: (...a: unknown[]) => mockDel(...a),
  },
}))

import { journalService } from './journals'

describe('journalService.list', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue([])
  })

  it('lists without a query string when no options are given', async () => {
    await journalService.list()
    expect(mockGet).toHaveBeenCalledWith('/journals')
  })

  it('forwards a mood filter to the ?mood= query param', async () => {
    await journalService.list({ mood: 'hopeful' })
    expect(mockGet).toHaveBeenCalledWith('/journals?mood=hopeful')
  })

  it('combines mood, text search, and paging params', async () => {
    await journalService.list({ mood: 'calm', q: 'breath', limit: 50, offset: 100 })
    expect(mockGet).toHaveBeenCalledWith('/journals?mood=calm&q=breath&limit=50&offset=100')
  })
})
