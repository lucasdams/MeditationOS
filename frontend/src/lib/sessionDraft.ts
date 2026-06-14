// Recovery for an in-progress sit the user never saved (closed the tab, navigated away).
// Two layers: (1) a localStorage draft we offer to restore on return, and (2) a
// best-effort navigator.sendBeacon on tab close. Both carry a `client_token` so the
// backend collapses them to one session (see session_service.create_session).

import type { SessionCreate } from '../types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

// Below a minute doesn't count as practice (matches the backend MIN_PRACTICE_SECONDS),
// so we don't bother persisting or offering to restore trivially short sits.
export const MIN_DRAFT_SECONDS = 60
const MAX_DRAFT_AGE_MS = 12 * 60 * 60 * 1000 // a stale draft (>12h) is dropped, not offered

export interface SessionDraft {
  clientToken: string
  label: string // e.g. "Mindfulness" — for the restore prompt
  elapsedSeconds: number
  payload: SessionCreate // ready to POST to /sessions (carries client_token)
  savedAt: number // epoch ms of the last write, for staleness
}

const storageKey = (page: string) => `session-draft:${page}`

export const newClientToken = (): string =>
  crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function writeDraft(page: string, draft: SessionDraft): void {
  try {
    localStorage.setItem(storageKey(page), JSON.stringify(draft))
  } catch {
    // localStorage unavailable (private mode, quota) — recovery just won't be offered.
  }
}

export function clearDraft(page: string): void {
  try {
    localStorage.removeItem(storageKey(page))
  } catch {
    // ignore
  }
}

// A draft worth offering to restore (long enough, not stale). Clears stale ones.
export function readRestorableDraft(page: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(page))
    if (!raw) return null
    const draft = JSON.parse(raw) as SessionDraft
    if (!draft?.payload || draft.elapsedSeconds < MIN_DRAFT_SECONDS) return null
    if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) {
      clearDraft(page)
      return null
    }
    return draft
  } catch {
    return null
  }
}

// Fire-and-forget save on tab close. text/plain keeps it a CORS-safelisted request (no
// preflight, which beacons can't do); the backend /sessions/beacon parses the raw body.
export function beaconSave(payload: SessionCreate): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' })
    navigator.sendBeacon(`${API}/sessions/beacon`, blob)
  } catch {
    // best-effort only — the localStorage draft is the reliable fallback
  }
}
