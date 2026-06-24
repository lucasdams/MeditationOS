import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  // True only once a data route has returned 403 AND a fresh /auth/me confirms the
  // account's email isn't verified — i.e. the backend gate is enforcing. Drives the
  // hard "confirm your email" screen. Stays false by default (the backend flag is off,
  // so no 403s occur) → ships dark, current users keep full access.
  verificationRequired: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [verificationRequired, setVerificationRequired] = useState(false)

  // Mirror the current user so event handlers can read it without a side effect
  // inside a state updater (updaters must be pure; StrictMode double-invokes them).
  const userRef = useRef<User | null>(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  async function refresh() {
    try {
      let me = await authService.me()
      // Keep the user's timezone in sync with their browser so streaks/quests
      // bucket on their local day. Only writes when it actually changed.
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (browserTz && me.timezone !== browserTz) {
        try {
          me = await authService.setTimezone(browserTz)
        } catch {
          // non-fatal — keep the stored timezone
        }
      }
      setUser(me)
      // A confirmed (or guest) account can never be behind the gate — clear it. This
      // is how the user proceeds after verifying: re-checking /auth/me lifts the block.
      if (me.email_verified) setVerificationRequired(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null)
      } else {
        throw err
      }
    }
  }

  async function logout() {
    await authService.logout()
    setUser(null)
  }

  // Hydrate auth state once on mount. refresh() swallows 401 (logged out) but
  // rethrows other errors (e.g. /auth/me 500, network down); catch those here so a
  // first-load failure doesn't become an unhandled rejection — treat it as logged out.
  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // If any API call returns 401, the session has expired/gone — drop to login.
  // Only act when we currently think we're logged in, and leave a breadcrumb so the
  // login page can explain why.
  useEffect(() => {
    function onUnauthorized() {
      setUser((current) => {
        if (current) sessionStorage.setItem('sessionExpired', '1')
        return null
      })
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  // A data route returned 403. The backend email-verification gate is the only thing
  // that 403s a normal data route, but we don't trust the 403 alone: re-check /auth/me
  // and only raise the hard gate if the account's email genuinely isn't verified. Any
  // other 403 (or a now-verified account) leaves verificationRequired false, so the
  // page surfaces its own error as before and nothing is blocked.
  useEffect(() => {
    function onForbidden() {
      // Only relevant while we think we're logged in. Read the current user from a ref
      // and perform the /auth/me fetch outside any state updater (updaters must be pure).
      if (!userRef.current) return
      void authService
        .me()
        .then((me) => {
          setUser(me)
          setVerificationRequired(!me.email_verified)
        })
        .catch(() => {
          // /auth/me failing (e.g. 401) is handled by its own event; don't gate.
        })
    }
    window.addEventListener('auth:forbidden', onForbidden)
    return () => window.removeEventListener('auth:forbidden', onForbidden)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh, logout, verificationRequired }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
