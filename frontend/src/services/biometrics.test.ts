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

import { biometricsService } from './biometrics'

describe('biometricsService', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockDel.mockReset()
    mockGet.mockResolvedValue([])
    mockPost.mockResolvedValue({ id: 'r1' })
  })

  it('posts a reading to the readings endpoint', async () => {
    await biometricsService.create({
      context: 'resting',
      bpm: 64,
      measured_at: '2026-06-16T08:00:00Z',
    })
    expect(mockPost).toHaveBeenCalledWith('/biometric-readings', {
      context: 'resting',
      bpm: 64,
      measured_at: '2026-06-16T08:00:00Z',
    })
  })

  it('builds the list query string with days and limit', async () => {
    await biometricsService.list({ days: 84, limit: 200 })
    expect(mockGet).toHaveBeenCalledWith('/biometric-readings?days=84&limit=200')
  })

  it('lists without a query string when no options are given', async () => {
    await biometricsService.list()
    expect(mockGet).toHaveBeenCalledWith('/biometric-readings')
  })

  it('requests the pre/post delta with a window', async () => {
    mockGet.mockResolvedValue({ sample_size: 0, avg_bpm_delta: null, avg_hrv_ms_delta: null })
    await biometricsService.delta({ days: 84 })
    expect(mockGet).toHaveBeenCalledWith('/biometric-readings/delta?days=84')
  })
})
