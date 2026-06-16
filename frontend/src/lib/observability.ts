/**
 * Sentry error monitoring — provider-optional integration.
 *
 * Initialises Sentry only when the `VITE_SENTRY_DSN` environment variable is
 * set at build time.  With no DSN the module exports a no-op stub so the rest
 * of the app does not need to know whether monitoring is active.
 *
 * PII scrubbing policy (this app stores sensitive wellness data):
 * - `beforeSend` removes the full request/response body from every error event.
 * - `beforeSend` strips the query string from `event.request.url` so
 *   single-use secrets (`?token=…`, `?code=…`, `?access_token=…`) are never
 *   transmitted.
 * - `beforeBreadcrumb` scrubs query strings from navigation/fetch breadcrumb
 *   URLs and drops `console` breadcrumbs entirely (they can carry logged
 *   objects containing journal or mood data).
 * - Common PII key names (email, password, token, journal, gratitude, mood,
 *   biometric …) are replaced with "[Filtered]" in `extra` and `contexts`,
 *   including values nested inside arrays of objects.
 * - `sendDefaultPII` is false (SDK default) — we never override it.
 * - Trace sample rate is kept at 0 unless the DSN owner explicitly raises it.
 */

import * as Sentry from '@sentry/react'

/** Key names we never want to send to Sentry. */
const PII_KEY_RE =
  /password|token|secret|auth|cookie|email|journal|gratitude|mood|biometric|heart_rate|hrv|note|text|content|body/i

/** Strip the query string (and fragment) from a URL string.  Returns the
 *  path-only form; falls back to the original string on parse failure. */
function stripQuery(url: string | null | undefined): string | undefined {
  if (!url) return url ?? undefined
  try {
    // URL constructor requires an absolute URL; prepend a fake origin if needed.
    const absolute = url.startsWith('http') ? url : `https://x${url}`
    const parsed = new URL(absolute)
    const pathOnly = parsed.pathname
    // If the original was already a full URL, reconstruct origin + path.
    return url.startsWith('http') ? `${parsed.origin}${pathOnly}` : pathOnly
  } catch {
    return url
  }
}

/** Scrub a plain object or array, replacing values whose keys match PII_KEY_RE.
 *  Recurses into nested objects AND arrays of objects. */
function scrubObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubObject)
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        if (PII_KEY_RE.test(k)) return [k, '[Filtered]']
        return [k, scrubObject(v)]
      }),
    )
  }
  return value
}

/** Strip the request body and scrub PII from a Sentry error event. */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Drop request body entirely — may contain journal text, biometrics, etc.
  if (event.request) {
    delete event.request.data
    // Strip query string from URL — it may carry single-use tokens.
    if (event.request.url) {
      event.request.url = stripQuery(event.request.url)
    }
    // Scrub credential headers.
    if (event.request.headers) {
      const h = event.request.headers as Record<string, string>
      for (const key of Object.keys(h)) {
        if (/^(cookie|authorization|set-cookie|x-auth-token)$/i.test(key)) {
          h[key] = '[Filtered]'
        }
      }
    }
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra) as Record<string, unknown>
  }
  if (event.contexts) {
    // Cast through unknown to satisfy the SDK's Contexts branded type.
    event.contexts = scrubObject(event.contexts) as unknown as Sentry.ErrorEvent['contexts']
  }
  return event
}

/**
 * Sanitise breadcrumbs before they are attached to events.
 *
 * - `console` breadcrumbs are dropped entirely: they can carry logged objects
 *   that contain journal entries, mood readings, or other wellness data
 *   (e.g. from ErrorBoundary's `console.error` call).
 * - Navigation/fetch/xhr breadcrumbs are kept but their URLs are stripped of
 *   query strings so tokens in redirect targets are not transmitted.
 */
function beforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  // Drop console breadcrumbs — they may carry sensitive logged objects.
  if (breadcrumb.category === 'console') {
    return null
  }

  // Strip query strings from navigation and fetch/xhr breadcrumb URLs.
  if (breadcrumb.data) {
    const d = breadcrumb.data as Record<string, unknown>
    if (typeof d.url === 'string') d.url = stripQuery(d.url)
    if (typeof d.from === 'string') d.from = stripQuery(d.from)
    if (typeof d.to === 'string') d.to = stripQuery(d.to)
  }

  return breadcrumb
}

/** Initialise Sentry.  Called once at app startup. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Never collect PII automatically.
    sendDefaultPii: false,
    // Performance traces: 0 by default.  Override via VITE_SENTRY_TRACES_SAMPLE_RATE
    // once you want performance monitoring.
    tracesSampleRate: 0,
    beforeSend,
    beforeBreadcrumb,
  })
}

// Exported for unit testing only — not part of the public API.
export { stripQuery, scrubObject, beforeSend, beforeBreadcrumb }

/** Re-export the React ErrorBoundary so callers can import from one place. */
export { Sentry }
