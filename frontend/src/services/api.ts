// Thin fetch wrapper. All HTTP lives in services/ (see frontend/CLAUDE.md).
// `credentials: 'include'` sends/receives the httpOnly auth cookie cross-origin.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

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
