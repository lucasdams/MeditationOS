// Thin fetch wrapper. All HTTP lives in services/ (see frontend/CLAUDE.md).
// `credentials: 'include'` sends/receives the httpOnly auth cookie cross-origin.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

// How long before we give up on a request. 15 s is generous for mobile; short enough
// that a stuck save doesn't leave the UI spinning forever.
const REQUEST_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  status: number
  detail?: string

  constructor(status: number, detail?: string) {
    super(detail ?? `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export class TimeoutError extends Error {
  timeout: true = true
  constructor() {
    super('Request timed out')
    this.name = 'TimeoutError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timerId)
    // AbortError is thrown by fetch when the signal fires — surface it as TimeoutError
    // so callers' catch blocks get a typed, recognisable error instead of a raw DOMException.
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError()
    }
    throw err
  }
  clearTimeout(timerId)

  if (!res.ok) {
    let detail: string | undefined
    try {
      detail = (await res.json())?.detail
    } catch {
      // no JSON body
    }
    // A 401 means the session is gone (e.g. the short-lived token expired). Tell the
    // app so it can drop to the login screen, rather than every page showing its own
    // "could not load/save" error.
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    // A 403 on a data route can mean the backend email-verification gate is now
    // enforcing (REQUIRE_EMAIL_VERIFICATION on) and this account isn't confirmed.
    // Signal the app so it can re-check /auth/me and, only if email_verified is
    // false, show the hard "confirm your email" gate. We never decide that here from
    // the 403 detail string — AuthContext confirms via email_verified — so unrelated
    // 403s don't trip the gate. Ships dark: while the flag is off there are no 403s.
    if (res.status === 403 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:forbidden'))
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
