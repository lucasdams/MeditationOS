import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyticsService } from '../services/analytics'
import { TYPE_COLORS, MOOD_COLORS, PALETTE } from '../lib/colors'
import type { AnalyticsSummary, MeditationType, Mood } from '../types'

const TYPE_LABELS: Record<string, string> = {
  mindfulness: 'Mindfulness',
  body_scan: 'Body scan',
  walking: 'Walking',
  loving_kindness: 'Loving-kindness',
  resonance_breathing: 'Resonance breathing',
  other: 'Other',
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BUCKET_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const typeLabel = (t: string) => TYPE_LABELS[t as MeditationType] ?? cap(t)

// A labelled horizontal bar: label + value on the left, the bar fills to the right.
// `max` normalizes the widths across the group.
function Bar({
  label,
  value,
  max,
  suffix = '',
  color = '#6366f1',
}: {
  label: string
  value: number
  max: number
  suffix?: string
  color?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-value">
        {value}
        {suffix}
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    analyticsService
      .get()
      .then(setData)
      .catch(() => setError('Could not load your analytics.'))
  }, [])

  return (
    <main className="dashboard">
      <header>
        <h1>Analytics</h1>
      </header>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading…</p>}

      {data && data.total_sessions === 0 && data.moods.length === 0 && (
        <p className="muted">No data yet — practice a little and your trends will appear here.</p>
      )}

      {data && (data.total_sessions > 0 || data.moods.length > 0) && (
        <>
          <section className="analytics-stats">
            <div className="stat">
              <div className="stat-value">{data.total_sessions}</div>
              <div className="stat-label">sessions</div>
            </div>
            <div className="stat">
              <div className="stat-value">{Math.round(data.total_minutes / 60)}</div>
              <div className="stat-label">hours practiced</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.days_practiced}</div>
              <div className="stat-label">days practiced</div>
            </div>
          </section>

          <section className="analytics-section">
            <h2>Minutes per week</h2>
            <div className="weeks">
              {(() => {
                const max = Math.max(1, ...data.minutes_by_week.map((w) => w.minutes))
                return data.minutes_by_week.map((w) => (
                  <div key={w.week_start} className="week-col" title={`${w.week_start}: ${w.minutes} min`}>
                    <div
                      className="week-bar"
                      style={{ height: `${Math.round((w.minutes / max) * 100)}%` }}
                    />
                  </div>
                ))
              })()}
            </div>
            <div className="muted analytics-axis">
              <span>{data.minutes_by_week[0]?.week_start}</span>
              <span>this week</span>
            </div>
          </section>

          {data.by_type.length > 0 && (
            <section className="analytics-section">
              <h2>By type</h2>
              <div className="bars">
                {(() => {
                  const max = Math.max(1, ...data.by_type.map((t) => t.minutes))
                  return data.by_type.map((t, i) => (
                    <Bar
                      key={t.type}
                      label={typeLabel(t.type)}
                      value={t.minutes}
                      max={max}
                      suffix=" min"
                      color={TYPE_COLORS[t.type as MeditationType] ?? PALETTE[i % PALETTE.length]}
                    />
                  ))
                })()}
              </div>
            </section>
          )}

          <section className="analytics-section">
            <h2>By day of week</h2>
            <div className="bars">
              {(() => {
                const max = Math.max(1, ...data.by_weekday.map((w) => w.count))
                return data.by_weekday.map((w, i) => (
                  <Bar
                    key={w.weekday}
                    label={WEEKDAYS[w.weekday]}
                    value={w.count}
                    max={max}
                    color={PALETTE[i % PALETTE.length]}
                  />
                ))
              })()}
            </div>
          </section>

          <section className="analytics-section">
            <h2>Time of day</h2>
            <div className="bars">
              {(() => {
                const max = Math.max(1, ...data.by_time_of_day.map((b) => b.count))
                return data.by_time_of_day.map((b, i) => (
                  <Bar
                    key={b.bucket}
                    label={BUCKET_LABELS[b.bucket] ?? b.bucket}
                    value={b.count}
                    max={max}
                    color={PALETTE[i % PALETTE.length]}
                  />
                ))
              })()}
            </div>
          </section>

          {data.moods.length > 0 && (
            <section className="analytics-section">
              <h2>Journal moods</h2>
              <div className="bars">
                {(() => {
                  const max = Math.max(1, ...data.moods.map((m) => m.count))
                  return data.moods.map((m, i) => (
                    <Bar
                      key={m.mood}
                      label={cap(m.mood)}
                      value={m.count}
                      max={max}
                      color={MOOD_COLORS[m.mood as Mood] ?? PALETTE[i % PALETTE.length]}
                    />
                  ))
                })()}
              </div>
            </section>
          )}

          {data.mood_by_week.some((w) => Object.keys(w.counts).length > 0) && (
            <section className="analytics-section">
              <h2>Mood over time</h2>
              {(() => {
                const totals = data.mood_by_week.map((w) =>
                  Object.values(w.counts).reduce((a, b) => a + b, 0),
                )
                const maxTotal = Math.max(1, ...totals)
                // Moods present, in overall-distribution order (most common first).
                const present = data.moods
                  .map((m) => m.mood)
                  .filter((m) => data.mood_by_week.some((w) => w.counts[m]))
                return (
                  <>
                    <div className="weeks">
                      {data.mood_by_week.map((w, i) => (
                        <div
                          key={w.week_start}
                          className="week-col"
                          title={`${w.week_start}: ${totals[i]} ${totals[i] === 1 ? 'entry' : 'entries'}`}
                        >
                          <div className="mood-stack">
                            {present.map((m) =>
                              w.counts[m] ? (
                                <div
                                  key={m}
                                  className="mood-seg"
                                  style={{
                                    height: `${(w.counts[m] / maxTotal) * 100}%`,
                                    background: MOOD_COLORS[m as Mood] ?? '#9ca3af',
                                  }}
                                />
                              ) : null,
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="muted analytics-axis">
                      <span>{data.mood_by_week[0]?.week_start}</span>
                      <span>this week</span>
                    </div>
                    <div className="mood-legend">
                      {present.map((m) => (
                        <span key={m} className="mood-legend-item">
                          <span
                            className="mood-legend-dot"
                            style={{ background: MOOD_COLORS[m as Mood] ?? '#9ca3af' }}
                          />
                          {cap(m)}
                        </span>
                      ))}
                    </div>
                  </>
                )
              })()}
            </section>
          )}
        </>
      )}
    </main>
  )
}
