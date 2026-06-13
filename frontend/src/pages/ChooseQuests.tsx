import { useState, type FormEvent } from 'react'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import AuthBrand from '../components/AuthBrand'
import { QUEST_FEATURES, MIN_QUEST_FEATURES } from '../types'

// First-run picker: choose which daily-activity quests to receive (≥3). Shown by
// ProtectedRoute while the user's quest_features is null; mirrors ChooseUsername.
export default function ChooseQuests() {
  const { refresh } = useAuth()
  // Default everything on — opting out is the deliberate action.
  const [selected, setSelected] = useState<string[]>(QUEST_FEATURES.map((f) => f.key))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggle(key: string, on: boolean) {
    setSelected((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (selected.length < MIN_QUEST_FEATURES) {
      setError(`Pick at least ${MIN_QUEST_FEATURES}.`)
      return
    }
    setSubmitting(true)
    try {
      await authService.setQuestFeatures(selected)
      await refresh() // sets user.quest_features → unlocks the app
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-card">
      <AuthBrand />
      <h1>Choose your quests</h1>
      <p className="muted">
        Pick the daily practices you want quests for — at least {MIN_QUEST_FEATURES}. You can
        change these anytime in Settings.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="quest-picker">
          {QUEST_FEATURES.map((f) => (
            <label key={f.key} className="quest-option">
              <input
                type="checkbox"
                checked={selected.includes(f.key)}
                onChange={(e) => toggle(f.key, e.target.checked)}
              />{' '}
              {f.label}
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </main>
  )
}
