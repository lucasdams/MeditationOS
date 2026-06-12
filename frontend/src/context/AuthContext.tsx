import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Hydrate auth state once on mount.
  useEffect(() => {
    refresh().finally(() => setLoading(false))
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

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
