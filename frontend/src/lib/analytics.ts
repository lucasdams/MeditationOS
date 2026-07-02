// First-party, privacy-first usage analytics.
//
// Fire-and-forget: `track()` NEVER throws, never blocks the UI, and never routes through the
// shared api client (so it can't trip the 401→session-expired handler). It sends only an
// allowlisted event NAME + tiny scalar props — no PII, ever (the backend also enforces this).
// Respects Do-Not-Track and a local opt-out toggle, so nothing leaves the browser when the
// user has said no.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'
const OPTOUT_KEY = 'analytics.optout'

// The events the client may emit — must match the backend `EVENT_NAMES` allowlist.
export type AnalyticsEvent =
  | 'account_created'
  | 'guest_started'
  | 'first_session_completed'
  | 'session_completed'
  | 'breathing_completed'
  | 'streak_milestone'
  | 'path_enrolled'
  | 'spirit_path_chosen'
  | 'journal_created'
  | 'gratitude_created'

type Scalar = string | number | boolean | null

/** True when the user has opted out, or the browser signals Do-Not-Track. */
export function analyticsOptedOut(): boolean {
  try {
    const dnt =
      navigator.doNotTrack === '1' ||
      (window as unknown as { doNotTrack?: string }).doNotTrack === '1'
    if (dnt) return true
    return localStorage.getItem(OPTOUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist the opt-out preference (true = don't send anything). */
export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPTOUT_KEY, '1')
    else localStorage.removeItem(OPTOUT_KEY)
  } catch {
    /* localStorage unavailable — nothing to persist */
  }
}

/**
 * Record one anonymous usage event. Best-effort: swallows every error, doesn't await in hot
 * paths, uses `keepalive` so it survives a navigation. A no-op when the user has opted out.
 */
export function track(name: AnalyticsEvent, props?: Record<string, Scalar>): void {
  if (analyticsOptedOut()) return
  try {
    void fetch(`${BASE_URL}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props ? { name, props } : { name }),
      keepalive: true,
    }).catch(() => {
      /* fire-and-forget — a failed analytics ping must never surface to the user */
    })
  } catch {
    /* JSON/fetch unavailable — ignore */
  }
}
