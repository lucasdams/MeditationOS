import { useState } from 'react'
import { moodLogService } from '../services/moodLogs'
import { useToast } from '../context/ToastContext'
import type { Mood } from '../types'

// A one-tap "how do you feel?" — the low-friction counterpart to a written journal.
// Feeds the same mood analytics; nothing to type.
const MOODS: { mood: Mood; emoji: string; label: string }[] = [
  { mood: 'calm', emoji: '😌', label: 'Calm' },
  { mood: 'content', emoji: '🙂', label: 'Content' },
  { mood: 'focused', emoji: '🎯', label: 'Focused' },
  { mood: 'energized', emoji: '⚡', label: 'Energized' },
  { mood: 'grateful', emoji: '🙏', label: 'Grateful' },
  { mood: 'neutral', emoji: '😐', label: 'Neutral' },
  { mood: 'restless', emoji: '😣', label: 'Restless' },
  { mood: 'anxious', emoji: '😰', label: 'Anxious' },
  { mood: 'tired', emoji: '😴', label: 'Tired' },
  { mood: 'low', emoji: '😔', label: 'Low' },
]

export default function MoodCheckin() {
  const { showToast } = useToast()
  const [logged, setLogged] = useState<Mood | null>(null)
  const [saving, setSaving] = useState<Mood | null>(null)

  async function pick(mood: Mood) {
    if (saving) return
    setSaving(mood)
    try {
      await moodLogService.create(mood)
      setLogged(mood)
      showToast('Mood logged. 🌱')
    } catch {
      showToast('Could not log your mood.', 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="mood-checkin">
      <h2>How do you feel?</h2>
      <div className="mood-options" role="group" aria-label="Log your mood">
        {MOODS.map((m) => (
          <button
            key={m.mood}
            type="button"
            className={`mood-chip${logged === m.mood ? ' selected' : ''}`}
            onClick={() => pick(m.mood)}
            disabled={saving !== null}
            aria-pressed={logged === m.mood}
            title={m.label}
          >
            <span className="mood-emoji" aria-hidden="true">
              {m.emoji}
            </span>
            <span className="mood-name">{m.label}</span>
          </button>
        ))}
      </div>
      {logged && (
        <p className="muted mood-logged">Thanks for checking in — it feeds your trends.</p>
      )}
    </section>
  )
}
