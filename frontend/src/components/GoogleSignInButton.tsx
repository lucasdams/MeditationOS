import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import { t } from '../i18n'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Resolve the active theme the way the app does: an explicit data-theme attribute
// (set for light/dark/auto) wins; with no attribute ("system") fall back to the OS
// prefers-color-scheme media query that the CSS @media also honours.
function isDarkTheme(): boolean {
  const attr = document.documentElement.dataset.theme
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

// Renders the official "Sign in with Google" button. On success the backend
// verifies the credential and sets the session cookie, then we refresh auth
// state and navigate home (the username gate handles first-time Google users).
export default function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [dark, setDark] = useState(isDarkTheme)

  // Keep the rendered button in sync with the active theme. data-theme is toggled on
  // <html>; "system" mode leaves it absent and follows the OS media query instead.
  useEffect(() => {
    const update = () => setDark(isDarkTheme())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change', update)
    return () => {
      observer.disconnect()
      media?.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    async function handleCredential(response: GoogleCredentialResponse) {
      try {
        await authService.googleLogin(response.credential)
        await refresh()
        navigate('/')
      } catch {
        onError?.(t('auth.google.error'))
      }
    }

    function render(): boolean {
      const id = window.google?.accounts.id
      if (!id || !ref.current) return false
      id.initialize({ client_id: CLIENT_ID as string, callback: handleCredential })
      // Match the active theme so the button doesn't render as a white card on a dark
      // auth surface (and vice versa). Fluid width keeps it aligned with the stacked
      // full-width auth actions instead of a fixed, narrower 280px button.
      ref.current.replaceChildren()
      id.renderButton(ref.current, {
        theme: dark ? 'filled_black' : 'outline',
        size: 'large',
        width: ref.current.offsetWidth || undefined,
      })
      return true
    }

    // The GSI script loads async — poll briefly until it's ready.
    if (render()) return
    const timer = setInterval(() => {
      if (cancelled || render()) clearInterval(timer)
    }, 200)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [navigate, refresh, onError, dark])

  if (!CLIENT_ID) return null
  return <div className="google-signin" ref={ref} />
}
