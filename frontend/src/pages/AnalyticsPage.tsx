import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyticsService } from '../services/analytics'
import { biometricsService } from '../services/biometrics'
import { TYPE_COLORS, MOOD_COLORS, PALETTE } from '../lib/colors'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type {
  AnalyticsSummary,
  BiometricDelta,
  BiometricReading,
  InsightsResponse,
  MeditationType,
  Mood,
  WeekRatings,
} from '../types'

// Trend window: recent weeks of readings feed the heart-rate (and HRV) chart.
const TREND_DAYS = 84 // ~12 weeks
const HR_COLOR = '#ef4444' // warm red for heart rate
const HRV_COLOR = '#10b981' // green for HRV (higher generally = more recovered)
const CALM_COLOR = '#6366f1' // indigo for calm (matches the default bar accent)
const FOCUS_COLOR = '#f59e0b' // amber for focus

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
// `max` normalizes the widths across the group. The visual bar is decorative; the
// text label + value already convey the data to screen readers.
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
      <span className="bar-track" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  )
}

// Gentle, honest observations from the user's own data. Loads independently of the
// charts so a hiccup in one doesn't blank the other.
function Insights() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ignore = false
    analyticsService
      .insights()
      .then((d) => { if (!ignore) setInsights(d) })
      .catch(() => { if (!ignore) setError(true) })
    return () => { ignore = true }
  }, [])

  if (error) return null // stay quiet — the charts below still carry the page
  if (!insights) {
    return (
      <section className="analytics-section">
        <h2>Patterns</h2>
        <p className="muted">Looking for patterns…</p>
      </section>
    )
  }

  return (
    <section className="analytics-section">
      <h2>Patterns</h2>
      {insights.needs_more_data || insights.insights.length === 0 ? (
        <p className="muted">
          Keep practicing — gentle patterns will appear here as your history grows.
        </p>
      ) : (
        <ul className="insight-cards">
          {insights.insights.map((i) => (
            <li key={i.kind} className="insight-card">
              <span className="insight-title">{i.title}</span>
              <span className="insight-detail">{i.detail}</span>
              <span className="insight-basis">{i.basis}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Format the gentle pre→post delta sentence, or null when there isn't enough basis.
function deltaSentence(delta: BiometricDelta): string | null {
  if (delta.sample_size < 1 || delta.avg_bpm_delta == null) return null
  const n = delta.sample_size
  const bpmBasis = `based on ${n} ${n === 1 ? 'sit' : 'sits'} with a pre- and post-reading`
  const bpm = delta.avg_bpm_delta
  let sentence: string
  if (bpm < 0) {
    sentence = `Your heart rate settles about ${Math.abs(bpm)} bpm over a sit, ${bpmBasis}.`
  } else if (bpm > 0) {
    sentence = `Your heart rate is about ${bpm} bpm higher after a sit, ${bpmBasis}.`
  } else {
    sentence = `Your heart rate is about the same before and after a sit, ${bpmBasis}.`
  }
  // Append HRV delta when available, using its own honest sample basis.
  if (delta.avg_hrv_ms_delta != null && delta.hrv_sample_size > 0) {
    const hn = delta.hrv_sample_size
    const hrvBasis = `${hn} ${hn === 1 ? 'sit' : 'sits'}`
    const hrv = delta.avg_hrv_ms_delta
    if (hrv > 0) {
      sentence += ` HRV rises about ${hrv} ms (based on ${hrvBasis} with HRV readings).`
    } else if (hrv < 0) {
      sentence += ` HRV dips about ${Math.abs(hrv)} ms (based on ${hrvBasis} with HRV readings).`
    }
  }
  return sentence
}

// A heart-rate (and optional HRV) trend over recent readings. Loads independently so
// a hiccup here never blanks the practice charts above. Readings are a personal
// wellness signal the user enters — not a medical measurement.
function BiometricTrend() {
  const [readings, setReadings] = useState<BiometricReading[] | null>(null)
  const [delta, setDelta] = useState<BiometricDelta | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ignore = false
    Promise.all([
      biometricsService.list({ days: TREND_DAYS, limit: 200 }),
      biometricsService.delta({ days: TREND_DAYS }),
    ])
      .then(([r, d]) => {
        if (!ignore) {
          setReadings(r)
          setDelta(d)
        }
      })
      .catch(() => { if (!ignore) setError(true) })
    return () => { ignore = true }
  }, [])

  if (error) return null // stay quiet — the practice charts still carry the page

  if (!readings) {
    return (
      <section className="analytics-section">
        <h2>Heart rate &amp; HRV</h2>
        <p className="muted">Loading your readings…</p>
      </section>
    )
  }

  if (readings.length === 0) {
    return (
      <section className="analytics-section">
        <h2>Heart rate &amp; HRV</h2>
        <p className="muted">
          No readings yet. Log a quick one after a sit, or{' '}
          <Link to="/biometrics/new">add a resting reading</Link>, to start a trend.
        </p>
      </section>
    )
  }

  // Oldest → newest for a left-to-right trend (the API returns newest first).
  const ordered = [...readings].reverse()
  const bpms = ordered.map((r) => r.bpm)
  const minBpm = bpms.reduce((a, b) => Math.min(a, b), bpms[0])
  const maxBpm = bpms.reduce((a, b) => Math.max(a, b), bpms[0])
  const bpmRange = Math.max(1, maxBpm - minBpm)
  // Height as a share of the band, with a floor so a flat line stays visible.
  const barHeight = (v: number) => 15 + ((v - minBpm) / bpmRange) * 85

  const hrvReadings = ordered.filter((r) => r.hrv_ms != null)
  const hrvVals = hrvReadings.map((r) => r.hrv_ms as number)
  const minHrv = hrvVals.length ? hrvVals.reduce((a, b) => Math.min(a, b), hrvVals[0]) : 0
  const maxHrv = hrvVals.length ? hrvVals.reduce((a, b) => Math.max(a, b), hrvVals[0]) : 1
  const hrvRange = Math.max(1, maxHrv - minHrv)

  const sentence = delta ? deltaSentence(delta) : null

  return (
    <section className="analytics-section">
      <h2>Heart rate &amp; HRV</h2>
      <p className="muted biometric-note">
        A personal wellness signal you log yourself — not a medical measurement.
      </p>

      <div className="weeks" aria-hidden="true">
        {ordered.map((r) => (
          <div
            key={r.id}
            className="week-col"
            title={`${new Date(r.measured_at).toLocaleDateString()} · ${r.bpm} bpm${
              r.hrv_ms != null ? ` · HRV ${r.hrv_ms} ms` : ''
            } · ${r.context}`}
          >
            <div
              className="week-bar"
              style={{ height: `${barHeight(r.bpm)}%`, background: HR_COLOR }}
            />
          </div>
        ))}
      </div>
      <div className="muted analytics-axis">
        <span>{minBpm} bpm</span>
        <span>heart rate, oldest → newest</span>
        <span>{maxBpm} bpm</span>
      </div>

      {hrvReadings.length > 0 && (
        <>
          <div className="weeks biometric-hrv-row" aria-hidden="true">
            {hrvReadings.map((r) => (
              <div
                key={r.id}
                className="week-col"
                title={`${new Date(r.measured_at).toLocaleDateString()} · HRV ${
                  r.hrv_ms
                } ms`}
              >
                <div
                  className="week-bar"
                  style={{
                    height: `${15 + (((r.hrv_ms as number) - minHrv) / hrvRange) * 85}%`,
                    background: HRV_COLOR,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="muted analytics-axis">
            <span>{minHrv} ms</span>
            <span>HRV (when logged)</span>
            <span>{maxHrv} ms</span>
          </div>
        </>
      )}

      {sentence && <p className="biometric-delta">{sentence}</p>}

      <p className="muted biometric-cta">
        <Link to="/biometrics/new">Log a resting reading</Link>
      </p>
    </section>
  )
}

// Calm & focus self-ratings (1–5) averaged per week. Purely descriptive — it just
// charts the numbers you logged, not a statistical claim. Only weeks with at least
// one rated session appear, so the trend never implies data that isn't there.
function CalmFocusTrend({ weeks }: { weeks: WeekRatings[] }) {
  if (weeks.length === 0) return null
  // Map a 1–5 rating to a bar height, with a floor so a low rating stays visible.
  const barHeight = (v: number) => 12 + ((v - 1) / 4) * 88

  const row = (key: 'calm' | 'focus', color: string) => (
    <div className="weeks" aria-hidden="true">
      {weeks.map((w) => {
        const v = w[key]
        return (
          <div
            key={w.week_start}
            className="week-col"
            title={`${w.week_start}: ${key} ${v != null ? v.toFixed(1) : '—'}`}
          >
            {v != null && (
              <div className="week-bar" style={{ height: `${barHeight(v)}%`, background: color }} />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <section className="analytics-section">
      <h2>Calm &amp; focus over time</h2>
      <p className="muted">
        Weekly averages of the calm and focus ratings you give your sits (1–5). Just
        what you logged — weeks without a rated sit are left out.
      </p>
      {/* sr-only text alternative for the color-coded chart */}
      <ul className="sr-only">
        {weeks.map((w) => {
          const parts = [
            w.calm != null ? `calm ${w.calm.toFixed(1)}` : null,
            w.focus != null ? `focus ${w.focus.toFixed(1)}` : null,
          ].filter(Boolean)
          return <li key={w.week_start}>{w.week_start}: {parts.join(', ')}</li>
        })}
      </ul>
      {row('calm', CALM_COLOR)}
      <div className="muted analytics-axis" aria-hidden="true">
        <span>{weeks[0]?.week_start}</span>
        <span>calm (1–5)</span>
        <span>{weeks[weeks.length - 1]?.week_start}</span>
      </div>
      {row('focus', FOCUS_COLOR)}
      <div className="muted analytics-axis" aria-hidden="true">
        <span>{weeks[0]?.week_start}</span>
        <span>focus (1–5)</span>
        <span>{weeks[weeks.length - 1]?.week_start}</span>
      </div>
      <div className="mood-legend" aria-hidden="true">
        <span className="mood-legend-item">
          <span className="mood-legend-dot" style={{ background: CALM_COLOR }} />
          Calm
        </span>
        <span className="mood-legend-item">
          <span className="mood-legend-dot" style={{ background: FOCUS_COLOR }} />
          Focus
        </span>
      </div>
    </section>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  function load() {
    return analyticsService
      .get()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, 'Could not load your analytics.')))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retry() {
    setRetrying(true)
    load()
  }

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Analytics</h1>
        <p className="page-subtitle">Patterns in your practice, computed from your activity.</p>
      </header>

      <RetryableError message={error} onRetry={retry} retrying={retrying} />
      {!data && !error && <Loading />}

      {data && data.total_sessions === 0 && data.moods.length === 0 && (
        <>
          <EmptyState>
            No practice data yet — practice a little and your trends will appear here.
          </EmptyState>
          {/* Readings can exist independently of sessions, so still offer the trend. */}
          <BiometricTrend />
        </>
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

          <Insights />

          <BiometricTrend />

          <section className="analytics-section">
            <h2>Minutes per week</h2>
            {/* sr-only text alternative for the color-coded bar chart */}
            <ul className="sr-only">
              {data.minutes_by_week.map((w) => (
                <li key={w.week_start}>{w.week_start}: {w.minutes} min</li>
              ))}
            </ul>
            <div className="weeks" aria-hidden="true">
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
            <div className="muted analytics-axis" aria-hidden="true">
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
                    {/* sr-only text alternative for the color-coded mood-over-time chart */}
                    <ul className="sr-only">
                      {data.mood_by_week.map((w) => {
                        const breakdown = present
                          .filter((m) => w.counts[m])
                          .map((m) => `${cap(m)}: ${w.counts[m]}`)
                          .join(', ')
                        return (
                          <li key={w.week_start}>{w.week_start}: {breakdown || 'no entries'}</li>
                        )
                      })}
                    </ul>
                    <div className="weeks" aria-hidden="true">
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
                    <div className="muted analytics-axis" aria-hidden="true">
                      <span>{data.mood_by_week[0]?.week_start}</span>
                      <span>this week</span>
                    </div>
                    <div className="mood-legend" aria-hidden="true">
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

          <CalmFocusTrend weeks={data.ratings_by_week} />
        </>
      )}
    </main>
  )
}
