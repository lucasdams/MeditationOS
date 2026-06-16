/**
 * Tests for the shared request helper in api.ts.
 * Focuses on the timeout path and existing error-surfacing behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, TimeoutError } from './api'

// Store a reference to the fetch mock so tests can configure per-test behaviour.
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
  vi.useRealTimers()
})

// Re-import api fresh each time (important: module is cached, so we import once and use the
// exported api object directly — the fetch stub is installed before any call).
import { api } from './api'

describe('api timeout', () => {
  it('throws TimeoutError when the request exceeds 15 s', async () => {
    vi.useFakeTimers()

    // fetch never resolves — simulates a hung server.
    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        // When the AbortController fires, fetch rejects with a DOMException AbortError.
        opts.signal?.addEventListener('abort', () => {
          const err = new DOMException('The user aborted a request.', 'AbortError')
          reject(err)
        })
      })
    })

    // Attach a no-op catch immediately so the rejection is never "unhandled".
    // We collect it ourselves via the settled result below.
    const promise = api.get('/test').catch((e) => e)

    // Advance past the 15 s timeout.
    await vi.advanceTimersByTimeAsync(15_001)

    const result = await promise
    expect(result).toBeInstanceOf(TimeoutError)
  })

  it('does not throw TimeoutError for a fast successful response', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await expect(api.get('/fast')).resolves.toEqual({ ok: true })
  })

  it('throws ApiError (not TimeoutError) for a 4xx response', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }),
    )

    await expect(api.get('/missing')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('TimeoutError shape', () => {
  it('has the correct name and message', () => {
    const err = new TimeoutError()
    expect(err.name).toBe('TimeoutError')
    expect(err.message).toBe('Request timed out')
    expect(err.timeout).toBe(true)
  })

  it('is not an instance of ApiError', () => {
    expect(new TimeoutError()).not.toBeInstanceOf(ApiError)
  })
})
