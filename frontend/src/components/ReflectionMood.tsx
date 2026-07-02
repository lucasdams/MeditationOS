import { MOOD_META } from '../lib/colors'
import type { Mood } from '../types'

// A calm, curated shortlist of moods offered in the post-session reflection step —
// the ones people most often feel just after a sit. Kept short so the reflection stays
// uncrowded (the full palette lives in the standalone MoodCheckin). Each still logs to
// the same MoodLog path, so it feeds the identical mood trends on Analytics.
export const REFLECTION_MOODS: Mood[] = [
  'calm',
  'peaceful',
  'content',
  'focused',
  'energized',
  'neutral',
  'tired',
  'restless',
]

/**
 * A single-select mood chip row for the post-session reflection. Unlike the standalone
 * MoodCheckin (which logs on tap), this is a controlled input: the parent holds the value
 * and logs it via the MoodLog path only when the reflection is kept. Tapping the selected
 * chip again clears it, so mood stays fully optional.
 */
export default function ReflectionMood({
  value,
  onChange,
}: {
  value: Mood | null
  onChange: (mood: Mood | null) => void
}) {
  return (
    <div
      className="session-reflect-moods"
      role="group"
      aria-label="Mood (optional)"
    >
      {REFLECTION_MOODS.map((mood) => {
        const meta = MOOD_META[mood]
        const selected = value === mood
        return (
          <button
            key={mood}
            type="button"
            className={`selectable mood-chip${selected ? ' selected' : ''}`}
            aria-pressed={selected}
            title={meta.label}
            // Re-tapping the selected mood clears it — keeps the step skippable.
            onClick={() => onChange(selected ? null : mood)}
          >
            <span className="mood-emoji" aria-hidden="true">
              {meta.emoji}
            </span>
            <span className="mood-name">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
