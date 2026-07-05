import { useEffect, useState } from 'react'
import { dashboardService } from '../services/dashboard'
import { MOOD_META } from '../lib/colors'
import { useT } from '../i18n'
import type { WeeklyReview as WeeklyReviewData } from '../types'

// A reflective "your week in practice" card — minutes (vs last week), days practiced,
// streak, longest sit, and the mood you logged most. All computed from activity.

export default function WeeklyReview() {
  const { t } = useT()
  const minutes = (seconds: number) => t('home.weekly.minutesUnit', { count: Math.round(seconds / 60) })
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
        <h2>{t('home.weekly.heading')}</h2>
        <p className="muted">{t('home.weekly.gathering')}</p>
      </section>
    )
  }

  // No practice logged this week → show the gentle empty copy rather than a grid of zeros,
  // even if a mood was logged. Surfacing "0 minutes / 0 days / 0 longest sit" prominently
  // reads as deflating against the low-pressure ethos.
  if (data.sessions === 0) {
    return (
      <section className="weekly-review">
        <h2>{t('home.weekly.heading')}</h2>
        <p className="muted">{t('home.weekly.empty')}</p>
      </section>
    )
  }

  const delta = data.minutes - data.last_week_minutes
  const deltaLabel =
    data.last_week_minutes === 0
      ? null
      : delta === 0
        ? t('home.weekly.delta.same')
        : delta > 0
          ? t('home.weekly.delta.up', { delta })
          : t('home.weekly.delta.down', { delta: Math.abs(delta) })

  return (
    <section className="weekly-review">
      <h2>{t('home.weekly.heading')}</h2>
      <div className="weekly-grid">
        <div className="weekly-stat">
          <span className="weekly-value">{data.minutes}</span>
          <span className="weekly-label">{t('home.weekly.label.minutes')}</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{t('home.weekly.daysPracticed', { days: data.active_days })}</span>
          <span className="weekly-label">{t('home.weekly.label.daysPracticed')}</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{data.current_streak_days}</span>
          <span className="weekly-label">{t('home.weekly.label.dayStreak')}</span>
        </div>
        <div className="weekly-stat">
          <span className="weekly-value">{minutes(data.longest_session_seconds)}</span>
          <span className="weekly-label">{t('home.weekly.label.longestSit')}</span>
        </div>
        {data.top_mood && (
          <div className="weekly-stat">
            {/* The emoji is decorative; the text label below names the mood. */}
            <span className="weekly-value" aria-hidden="true">{MOOD_META[data.top_mood].emoji}</span>
            <span className="weekly-label">{t('home.weekly.label.mostly', { mood: data.top_mood })}</span>
          </div>
        )}
      </div>
      {deltaLabel && <p className="muted weekly-delta">{deltaLabel}</p>}
    </section>
  )
}
