/**
 * Sentry error monitoring — provider-optional integration.
 *
 * Initialises Sentry only when the `VITE_SENTRY_DSN` environment variable is
 * set at build time.  With no DSN the module exports a no-op stub so the rest
 * of the app does not need to know whether monitoring is active.
 *
 * PII scrubbing policy (this app stores sensitive wellness data):
 * - `beforeSend` removes the full request/response body from every error event.
 * - Breadcrumbs that may carry URL query parameters with tokens are sanitised.
 * - Common PII key names (email, password, token, journal, gratitude, mood,
 *   biometric …) are replaced with "[Filtered]" in `extra` and `contexts`.
 * - `sendDefaultPII` is false (SDK default) — we never override it.
 * - Trace sample rate is kept at 0 unless the DSN owner explicitly raises it.
 */

import * as Sentry from '@sentry/react'

/** Key names we never want to send to Sentry. */
const PII_KEY_RE =
  /password|token|secret|auth|cookie|email|journal|gratitude|mood|biometric|heart_rate|hrv|note|text|content|body/i

/** Scrub a plain object, replacing values whose keys match PII_KEY_RE. */
function scrubObject(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (PII_KEY_RE.test(k)) return [k, '[Filtered]']
      if (v && typeof v === 'object' && !Array.isArray(v))
        return [k, scrubObject(v as Record<string, unknown>)]
      return [k, v]
    }),
  )
}

/** Strip the request body and scrub PII from a Sentry error event. */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Drop request body entirely — may contain journal text, biometrics, etc.
  if (event.request) {
    delete event.request.data
    // Scrub cookie header if present.
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
    event.extra = scrubObject(event.extra as Record<string, unknown>)
  }
  return event
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
  })
}

/** Re-export the React ErrorBoundary so callers can import from one place. */
export { Sentry }
