// Human, non-alarming copy for API failures. Keeps the calm, low-pressure voice
// and distinguishes a network/offline failure (we never reached the server) from a
// server-side failure (we reached it, but it errored or timed out).
//
// `fetch` rejects with a `TypeError` ("Failed to fetch") when the request never
// leaves the device — offline, DNS, CORS, connection refused. Our api wrapper also
// surfaces a TimeoutError for aborted requests. Anything else (ApiError with a
// status, or an unknown throw) means the server answered or the failure isn't a
// connectivity one, so we use the gentler "on our end" copy.

import { t } from '../i18n'

// The frozen English copy (the i18n catalog's source of truth — see locales/en/common.ts).
// Kept as named constants so tests can assert the exact wording; rendering resolves the
// catalog keys below at CALL time, so the message follows the active locale.
const NETWORK_MESSAGE =
  "Can't reach the server — check your connection and try again."
const SERVER_MESSAGE =
  'Something stumbled on our end. Give it a moment and try again.'

// True when the error means the request never reached the server (offline / DNS /
// connection refused). The browser throws a TypeError for these; the message text
// varies by engine, so we key off the type rather than the wording.
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  // A request we aborted on timeout also reflects connectivity trouble, not a
  // server-side bug. Detected by shape so we don't import the api module here.
  if (
    err &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name?: string }).name === 'TimeoutError'
  ) {
    return true
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return false
}

// The user-facing message for a thrown error from a service/API call. Pass an
// optional `fallback` to override the generic server-side copy with something more
// specific to the action (e.g. "Could not save the reading."). Messages resolve from
// the i18n catalog at call time (callers re-render via useT, so this stays in step
// with the active locale).
export function messageForError(err: unknown, fallback?: string): string {
  if (isNetworkError(err)) return t('common.error.network')
  return fallback ?? t('common.error.server')
}

export { NETWORK_MESSAGE, SERVER_MESSAGE }
