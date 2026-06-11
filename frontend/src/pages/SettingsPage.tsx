import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

function formatJoined(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function SettingsPage() {
  const { user, refresh } = useAuth()

  // Username section.
  const [username, setUsername] = useState(user?.username ?? '')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameOk, setUsernameOk] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)

  // Password section.
  const hasPassword = user?.has_password ?? true
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // The page only renders inside ProtectedRoute, so `user` is always present here,
  // but guard for type-safety.
  if (!user) return null

  async function handleUsername(e: FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameOk(false)
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–20 characters: letters, numbers, and underscores only.')
      return
    }
    if (username === user!.username) {
      setUsernameError('That’s already your username.')
      return
    }
    setSavingUsername(true)
    try {
      await authService.setUsername(username)
      await refresh()
      setUsernameOk(true)
    } catch (err) {
      setUsernameError(
        err instanceof ApiError && err.status === 409
          ? 'That username is taken.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setSavingUsername(false)
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordOk(false)
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords don’t match.')
      return
    }
    if (hasPassword && !currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }
    setSavingPassword(true)
    try {
      await authService.setPassword(newPassword, hasPassword ? currentPassword : undefined)
      await refresh()
      setPasswordOk(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(
        err instanceof ApiError && err.status === 401
          ? 'Your current password is incorrect.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <main className="settings">
      <Link to="/">← Dashboard</Link>
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Account</h2>
        <dl className="settings-info">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Member since</dt>
          <dd>{formatJoined(user.created_at)}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <h2>Username</h2>
        <p className="muted">Your public name — shown instead of your email.</p>
        <form onSubmit={handleUsername} noValidate>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setUsernameOk(false)
            }}
          />
          {usernameError && (
            <p role="alert" className="error">
              {usernameError}
            </p>
          )}
          {usernameOk && <p className="success">Username updated.</p>}
          <button type="submit" disabled={savingUsername}>
            {savingUsername ? 'Saving…' : 'Save username'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>{hasPassword ? 'Change password' : 'Set a password'}</h2>
        {!hasPassword && (
          <p className="muted">
            Your account uses Sign in with Google. Set a password to also log in with
            your email.
          </p>
        )}
        <form onSubmit={handlePassword} noValidate>
          {hasPassword && (
            <>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </>
          )}
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordError && (
            <p role="alert" className="error">
              {passwordError}
            </p>
          )}
          {passwordOk && (
            <p className="success">{hasPassword ? 'Password changed.' : 'Password set.'}</p>
          )}
          <button type="submit" disabled={savingPassword}>
            {savingPassword ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Timezone</h2>
        <p className="muted">
          Automatically set from your browser, so streaks and daily quests roll over at
          your local midnight.
        </p>
        <p className="settings-tz">{user.timezone}</p>
      </section>
    </main>
  )
}
