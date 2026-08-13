import { useState, type FormEvent } from 'react'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import AuthBrand from '../components/AuthBrand'
import { ErrorBanner } from '../components/StateViews'
import { useT } from '../i18n'

// Backend rule (see backend/app/schemas/user.py): 3–20 chars, letters/numbers/_.
const MIN_LEN = 3
const MAX_LEN = 20

// Gently shape free-form input into something the backend will accept, rather than
// rejecting the user for harmless things like spaces, dots, or capitals. We drop any
// character that isn't allowed (spaces → nothing, "jane.doe" → "janedoe") and cap the
// length. We keep the user's casing — only disallowed characters are filtered out.
function sanitize(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, MAX_LEN)
}

// A friendly starting suggestion from the email's local part, when it yields a valid
// handle. Guests have synthetic emails, so this may produce nothing — that's fine, we
// just start blank in that case.
function suggestionFrom(email: string | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  const cleaned = sanitize(local)
  return cleaned.length >= MIN_LEN ? cleaned : ''
}

export default function ChooseUsername() {
  const { t } = useT()
  const { user, refresh } = useAuth()
  const [username, setUsername] = useState(() => suggestionFrom(user?.email))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Sanitize as the user types so the field can never hold something we'd reject —
  // they see exactly what will be saved, with no surprise validation error.
  function handleChange(raw: string) {
    setUsername(sanitize(raw))
    if (error) setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const value = sanitize(username)
    // The only genuinely-blocking rule that remains: too short to be a valid handle.
    if (value.length < MIN_LEN) {
      setError(t('auth.chooseUsername.tooShort', { min: MIN_LEN }))
      return
    }
    setSubmitting(true)
    try {
      await authService.setUsername(value)
      await refresh() // updates user.username → unlocks the app
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t('auth.chooseUsername.taken')
          : messageForError(err),
      )
    } finally {
      // Reset even on success: refresh() normally unmounts this gate, but if it
      // resolves without lifting the gate the button must not stay stuck on "Saving…".
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>{t('auth.chooseUsername.title')}</h1>
      <p className="muted">
        {t('auth.chooseUsername.intro')}
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="username">{t('auth.chooseUsername.label')}</label>
        <input
          id="username"
          autoFocus
          value={username}
          onChange={(e) => handleChange(e.target.value)}
          aria-describedby={error ? 'username-hint username-error' : 'username-hint'}
          placeholder={t('auth.chooseUsername.placeholder')}
        />
        <p id="username-hint" className="muted field-hint">
          {t('auth.chooseUsername.hint', { min: MIN_LEN, max: MAX_LEN })}
        </p>
        <ErrorBanner message={error} id="username-error" />
        <button type="submit" disabled={submitting}>
          {submitting ? t('auth.chooseUsername.submitting') : t('auth.chooseUsername.cta')}
        </button>
      </form>
    </main>
  )
}
