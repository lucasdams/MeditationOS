import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Renders the official "Sign in with Google" button. On success the backend
// verifies the credential and sets the session cookie, then we refresh auth
// state and navigate home (the username gate handles first-time Google users).
export default function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    async function handleCredential(response: GoogleCredentialResponse) {
      try {
        await authService.googleLogin(response.credential)
        await refresh()
        navigate('/')
      } catch {
        onError?.('Google sign-in failed. Please try again.')
      }
    }

    function render(): boolean {
      const id = window.google?.accounts.id
      if (!id || !ref.current) return false
      id.initialize({ client_id: CLIENT_ID as string, callback: handleCredential })
      id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 280 })
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
  }, [navigate, refresh, onError])

  if (!CLIENT_ID) return null
  return <div className="google-signin" ref={ref} />
}
