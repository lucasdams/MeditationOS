import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { track, analyticsOptedOut, setAnalyticsOptOut } from './analytics'

describe('analytics.track', () => {
  beforeEach(() => {
    localStorage.clear()
    // Default: DNT off.
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the event (name + props) when not opted out', () => {
    track('session_completed', { type: 'mindfulness' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toMatch(/\/events$/)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 'session_completed',
      props: { type: 'mindfulness' },
    })
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('is a no-op when the user has opted out locally', () => {
    setAnalyticsOptOut(true)
    expect(analyticsOptedOut()).toBe(true)
    track('guest_started')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('respects Do Not Track', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    expect(analyticsOptedOut()).toBe(true)
    track('journal_created')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never throws, even if fetch itself throws', () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network down')
    }))
    expect(() => track('gratitude_created')).not.toThrow()
  })

  it('opt-out toggles back on', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(analyticsOptedOut()).toBe(false)
    track('breathing_completed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
