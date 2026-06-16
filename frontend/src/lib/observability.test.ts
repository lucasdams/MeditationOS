/**
 * Tests for the frontend observability module.
 *
 * Verified:
 * - initSentry() is a no-op when VITE_SENTRY_DSN is absent.
 * - beforeSend strips request bodies, scrubs PII keys, strips query strings
 *   from event.request.url so single-use tokens are never transmitted, and
 *   scrubs contexts in addition to extra.
 * - beforeBreadcrumb drops console breadcrumbs and strips query strings from
 *   navigation/fetch breadcrumb URLs.
 * - scrubObject recurses into arrays of objects (not just nested dicts).
 */

import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @sentry/react so tests never hit the network.
// ---------------------------------------------------------------------------

const mockInit = vi.fn()

vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: vi.fn(),
}))

// Import AFTER the mock is registered.
import {
  beforeBreadcrumb,
  beforeSend,
  initSentry,
  scrubObject,
  stripQuery,
} from './observability'

// ---------------------------------------------------------------------------
// initSentry no-op when no DSN
// ---------------------------------------------------------------------------

describe('initSentry', () => {
  it('does not call Sentry.init when VITE_SENTRY_DSN is absent', () => {
    // In the vitest jsdom env, import.meta.env.VITE_SENTRY_DSN is undefined.
    mockInit.mockReset()
    initSentry()
    expect(mockInit).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// stripQuery
// ---------------------------------------------------------------------------

describe('stripQuery', () => {
  it('strips token from a full URL', () => {
    expect(stripQuery('https://app.example.com/verify-email?token=SECRET')).toBe(
      'https://app.example.com/verify-email',
    )
  })

  it('strips token from a path-only URL', () => {
    expect(stripQuery('/reset-password?token=ABC&code=XYZ')).toBe('/reset-password')
  })

  it('leaves URL without query string unchanged', () => {
    expect(stripQuery('https://app.example.com/api/v1/sessions')).toBe(
      'https://app.example.com/api/v1/sessions',
    )
  })

  it('returns undefined for null/undefined input', () => {
    expect(stripQuery(null)).toBeUndefined()
    expect(stripQuery(undefined)).toBeUndefined()
  })

  it('returns empty string unchanged', () => {
    // Empty string has no query string; implementation returns it as-is.
    expect(stripQuery('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// scrubObject — list recursion
// ---------------------------------------------------------------------------

describe('scrubObject', () => {
  it('scrubs PII keys in nested objects', () => {
    const result = scrubObject({ meta: { email: 'x@y.com', route: '/health' } }) as Record<
      string,
      Record<string, unknown>
    >
    expect(result.meta.email).toBe('[Filtered]')
    expect(result.meta.route).toBe('/health')
  })

  it('recurses into arrays of objects (list recursion fix)', () => {
    const result = scrubObject({
      entries: [
        { email: 'a@b.com', route: '/health' },
        { token: 'abc', count: 5 },
      ],
    }) as Record<string, Array<Record<string, unknown>>>
    expect(result.entries[0].email).toBe('[Filtered]')
    expect(result.entries[0].route).toBe('/health')
    expect(result.entries[1].token).toBe('[Filtered]')
    expect(result.entries[1].count).toBe(5)
  })

  it('passes through primitive values unchanged', () => {
    expect(scrubObject(42)).toBe(42)
    expect(scrubObject('hello')).toBe('hello')
  })
})

// ---------------------------------------------------------------------------
// beforeSend scrubbing
// ---------------------------------------------------------------------------

type SentryErrorEvent = Parameters<typeof beforeSend>[0]

function makeEvent(overrides: Record<string, unknown> = {}): SentryErrorEvent {
  return {
    exception: { values: [{ type: 'Error', value: 'boom' }] },
    request: {
      url: '/api/v1/journals',
      method: 'POST',
      data: '{"text": "my journal entry"}',
      headers: {
        authorization: 'Bearer tok',
        'content-type': 'application/json',
        cookie: 'session=abc',
      },
    },
    extra: {
      email: 'user@example.com',
      request_id: 'req-1',
      mood: 'calm',
    },
    ...overrides,
  } as SentryErrorEvent
}

describe('beforeSend scrubbing', () => {
  it('strips request body', () => {
    const result = beforeSend(makeEvent())
    expect(result?.request?.data).toBeUndefined()
  })

  it('marks authorization and cookie headers as [Filtered]', () => {
    const result = beforeSend(makeEvent())
    const headers = result?.request?.headers as Record<string, string>
    expect(headers['authorization']).toBe('[Filtered]')
    expect(headers['cookie']).toBe('[Filtered]')
    expect(headers['content-type']).toBe('application/json')
  })

  it('strips query string from request.url (token leak fix)', () => {
    const event = makeEvent({
      request: { url: 'https://app.example.com/verify-email?token=SECRET123', method: 'GET' },
    })
    const result = beforeSend(event)
    expect(result?.request?.url).toBe('https://app.example.com/verify-email')
    expect(result?.request?.url).not.toContain('SECRET123')
  })

  it('strips query string from path-only request.url', () => {
    const event = makeEvent({
      request: { url: '/reset-password?token=ABC&code=XYZ', method: 'GET' },
    })
    const result = beforeSend(event)
    expect(result?.request?.url).toBe('/reset-password')
  })

  it('leaves path-only URLs without query strings unchanged', () => {
    const event = makeEvent({ request: { url: '/api/v1/sessions', method: 'GET' } })
    const result = beforeSend(event)
    expect(result?.request?.url).toBe('/api/v1/sessions')
  })

  it('marks journal, mood, and email extra keys as [Filtered]', () => {
    const result = beforeSend(makeEvent())
    const extra = result?.extra as Record<string, unknown>
    expect(extra['email']).toBe('[Filtered]')
    expect(extra['mood']).toBe('[Filtered]')
    expect(extra['request_id']).toBe('req-1')
  })

  it('scrubs contexts in addition to extra', () => {
    const event = makeEvent({
      contexts: { user_profile: { email: 'u@example.com', plan: 'free' } },
    })
    const result = beforeSend(event)
    const ctx = result?.contexts as Record<string, Record<string, unknown>>
    expect(ctx['user_profile']['email']).toBe('[Filtered]')
    expect(ctx['user_profile']['plan']).toBe('free')
  })

  it('scrubs PII inside arrays of objects in extra (list recursion fix)', () => {
    const event = makeEvent({
      extra: {
        entries: [
          { email: 'a@b.com', route: '/health' },
          { token: 'abc', count: 5 },
        ],
      },
    })
    const result = beforeSend(event)
    const entries = (result?.extra as Record<string, unknown[]>)['entries']
    expect((entries[0] as Record<string, unknown>)['email']).toBe('[Filtered]')
    expect((entries[0] as Record<string, unknown>)['route']).toBe('/health')
    expect((entries[1] as Record<string, unknown>)['token']).toBe('[Filtered]')
    expect((entries[1] as Record<string, unknown>)['count']).toBe(5)
  })

  it('returns the event (not null)', () => {
    expect(beforeSend(makeEvent())).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// beforeBreadcrumb
// ---------------------------------------------------------------------------

type SentryBreadcrumb = Parameters<typeof beforeBreadcrumb>[0]

describe('beforeBreadcrumb', () => {
  it('drops console breadcrumbs entirely', () => {
    const bc: SentryBreadcrumb = {
      category: 'console',
      level: 'error',
      message: 'Something failed',
      data: { arguments: [{ journal: 'Dear diary' }] },
    }
    expect(beforeBreadcrumb(bc)).toBeNull()
  })

  it('keeps navigation breadcrumbs but strips query strings from to/from', () => {
    const bc: SentryBreadcrumb = {
      category: 'navigation',
      data: { from: '/login', to: '/verify-email?token=SECRET' },
    }
    const result = beforeBreadcrumb(bc)
    expect(result).not.toBeNull()
    expect((result!.data as Record<string, unknown>).to).toBe('/verify-email')
    expect((result!.data as Record<string, unknown>).from).toBe('/login')
  })

  it('keeps fetch breadcrumbs but strips query string from url', () => {
    const bc: SentryBreadcrumb = {
      category: 'fetch',
      data: { url: 'https://api.example.com/verify-email?token=SECRET', status_code: 200 },
    }
    const result = beforeBreadcrumb(bc)
    expect(result).not.toBeNull()
    expect((result!.data as Record<string, unknown>).url).toBe(
      'https://api.example.com/verify-email',
    )
  })

  it('passes through non-console breadcrumbs without data.url unchanged', () => {
    const bc: SentryBreadcrumb = { category: 'ui.click', message: 'button click' }
    const result = beforeBreadcrumb(bc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe('ui.click')
  })
})

// ---------------------------------------------------------------------------
// PII_KEY_RE coverage (kept from original suite)
// ---------------------------------------------------------------------------

describe('PII_KEY_RE coverage', () => {
  const PII_KEY_RE =
    /password|token|secret|auth|cookie|email|journal|gratitude|mood|biometric|heart_rate|hrv|note|text|content|body/i

  it('matches biometric-related keys', () => {
    expect(PII_KEY_RE.test('heart_rate')).toBe(true)
    expect(PII_KEY_RE.test('hrv')).toBe(true)
    expect(PII_KEY_RE.test('biometric_reading')).toBe(true)
    expect(PII_KEY_RE.test('gratitude')).toBe(true)
    expect(PII_KEY_RE.test('route')).toBe(false)
    expect(PII_KEY_RE.test('user_id')).toBe(false)
  })
})
