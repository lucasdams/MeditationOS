import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'

type Status = 'verifying' | 'ok' | 'error' | 'missing'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    authService
      .verifyEmail(token)
      .then(async () => {
        if (cancelled) return
        setStatus('ok')
        // If the user is logged in, refresh so the "verify your email" banner clears.
        if (user) await refresh()
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
    // Run once for the token in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <main className="auth-card">
      <h1>Email verification</h1>
      {status === 'verifying' && <p>Verifying your email…</p>}
      {status === 'ok' && (
        <p>Your email is verified. Thanks — you’re all set.</p>
      )}
      {status === 'missing' && (
        <p role="alert" className="error">
          This verification link is missing its token.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="error">
          This verification link is invalid or has expired. Log in and request a new one
          from the banner at the top.
        </p>
      )}
      <p className="auth-aux">
        <Link to="/">{user ? 'Go to dashboard' : 'Go to log in'}</Link>
      </p>
    </main>
  )
}
