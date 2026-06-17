import { useEffect, useState } from 'react'
import { dashboardService } from '../services/dashboard'
import type { WeeklyReview as WeeklyReviewData } from '../types'

// A reflective "your week in practice" card — minutes (vs last week), days practiced,
// streak, longest sit, and the mood you logged most. All computed from activity.
const MOOD_EMOJI: Record<string, string> = {
  calm: '😌', content: '🙂', focused: '🎯', energized: '⚡', grateful: '🙏',
  neutral: '😐', restless: '😣', anxious: '😰', tired: '😴', low: '😔',
}

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`

export default function WeeklyReview() {
  const [data, setData] = useState<WeeklyReviewData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    dashboardService.getWeeklyReview().then(setData).catch(() => setError(true))
  }, [])

  // Secondary card — stays quiet if it can't load, so it never blocks the dashboard.
  if (error) return null
  if (!data) {
    return (
      <section className="weekly-review">
        <h2>This week</h2>
        <p className="muted">Gathering your week…</p>
      </section>
    )
  }

  if (data.sessions === 0 && !data.top_mood) {
    return (
      <section className="weekly-review">
        <h2>This week</h2>
        <p className="muted">No practice logged yet this week — a few mindful minutes is a great start. 🌱</p>
      </section>
    )
  }

  const delta = data.minutes - data.last_week_minutes
  const deltaLabel =
    data.last_week_minutes === 0
      ? null
      : delta === 0
        ? 'same as last week'
        : delta > 0
          ? `▲ ${delta} min vs last week`
          : `▼ ${Math.abs(delta)} min vs last week`

  return (
    <section className="weekly-review">
      <h2>This week</h2>
      <div className="weekly-grid">
        <div className="weekly-stat">
          <span className="weekly-value">{data.minutes}</span>
          <span className="weekly-label">minutes</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{data.active_days}/7</span>
          <span className="weekly-label">days practiced</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{data.current_streak_days} 🌱</span>
          <span className="weekly-label">day streak</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{minutes(data.longest_session_seconds)}</span>
          <span className="weekly-label">longest sit</span>
        </div>
        {data.top_mood && (
          <div className="weekly-stat">
            {/* The emoji is decorative; the text label below names the mood. */}
            <span className="weekly-value" aria-hidden="true">{MOOD_EMOJI[data.top_mood] ?? '🙂'}</span>
            <span className="weekly-label">mostly {data.top_mood}</span>
          </div>
        )}
      </div>
      {deltaLabel && <p className="muted weekly-delta">{deltaLabel}</p>}
    </section>
  )
}
