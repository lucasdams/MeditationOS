import { useState } from 'react'
import { moodLogService } from '../services/moodLogs'
import { useToast } from '../context/ToastContext'
import { MOOD_META } from '../lib/colors'
import type { Mood } from '../types'

// A one-tap "how do you feel?" — the low-friction counterpart to a written journal.
// Feeds the same mood analytics; nothing to type. Emoji/label come from the shared
// MOOD_META so the check-in and the timeline read a mood identically.
const MOODS = (Object.keys(MOOD_META) as Mood[]).map((mood) => ({ mood, ...MOOD_META[mood] }))

type Props = {
  // Heading text — lets the on-open modal frame it on the present moment
  // ("how are you arriving?") while inline use keeps the plain prompt.
  heading?: string
  // The mood already logged today, if any — surfaced as the pre-selected chip when the
  // check-in is reopened to re-log, so the prior choice is visible rather than starting blank.
  initial?: Mood | null
  // Called after a mood saves successfully — the modal uses this to close itself.
  onLogged?: (mood: Mood) => void
}

export default function MoodCheckin({ heading = 'How do you feel?', initial = null, onLogged }: Props) {
  const { showToast } = useToast()
  // `logged` drives the selected chip — seeded with today's already-logged mood so the
  // prior choice shows when reopened. `justLogged` gates the confirmation line so it only
  // appears after an actual save this session, not for the pre-selected initial value.
  const [logged, setLogged] = useState<Mood | null>(initial)
  const [justLogged, setJustLogged] = useState(false)
  const [saving, setSaving] = useState<Mood | null>(null)

  async function pick(mood: Mood) {
    if (saving) return
    setSaving(mood)
    try {
      await moodLogService.create(mood)
      setLogged(mood)
      setJustLogged(true)
      showToast('Mood logged. 🌱')
      onLogged?.(mood)
    } catch {
      showToast('Could not log your mood.', 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="mood-checkin">
      <h2>{heading}</h2>
      <div className="mood-options" role="group" aria-label="Log your mood">
        {MOODS.map((m) => (
          <button
            key={m.mood}
            type="button"
            className={`selectable mood-chip${logged === m.mood ? ' selected' : ''}`}
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
      {justLogged && (
        <p className="muted mood-logged">Thanks for checking in — it feeds your trends.</p>
      )}
    </section>
  )
}
