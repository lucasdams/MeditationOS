import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyticsService } from '../services/analytics'
import { biometricsService } from '../services/biometrics'
import { TYPE_COLORS, MOOD_COLORS, PALETTE } from '../lib/colors'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { messageForError } from '../lib/errors'
import { t as translate, useT } from '../i18n'
import type {
  AnalyticsSummary,
  BiometricDelta,
  BiometricReading,
  InsightsResponse,
  MonthComparison,
  WeekRatings,
} from '../types'

// Trend window: recent weeks of readings feed the heart-rate (and HRV) chart.
const TREND_DAYS = 84 // ~12 weeks
const HR_COLOR = '#ef4444' // warm red for heart rate
const HRV_COLOR = '#10b981' // green for HRV (higher generally = more recovered)
const CALM_COLOR = '#06b6d4' // cyan for calm (matches the calm mood colour)
const FOCUS_COLOR = '#f59e0b' // amber for focus

// Analytics-local label maps as i18n keys — resolved at render via translate() so a
// locale switch re-labels the charts. The backend sends plain strings for types; an
// unknown type falls back to a capitalized version of the raw value.
const TYPE_LABEL_KEYS: Record<string, string> = {
  mindfulness: 'tracking.analytics.type.mindfulness',
  body_scan: 'tracking.analytics.type.body_scan',
  walking: 'tracking.analytics.type.walking',
  loving_kindness: 'tracking.analytics.type.loving_kindness',
  resonance_breathing: 'tracking.analytics.type.resonance_breathing',
  energizing_breathing: 'tracking.analytics.type.energizing_breathing',
  other: 'tracking.analytics.type.other',
}
const WEEKDAY_KEYS = [
  'tracking.analytics.weekday.sun',
  'tracking.analytics.weekday.mon',
  'tracking.analytics.weekday.tue',
  'tracking.analytics.weekday.wed',
  'tracking.analytics.weekday.thu',
  'tracking.analytics.weekday.fri',
  'tracking.analytics.weekday.sat',
]
const BUCKET_LABEL_KEYS: Record<string, string> = {
  morning: 'tracking.analytics.bucket.morning',
  afternoon: 'tracking.analytics.bucket.afternoon',
  evening: 'tracking.analytics.bucket.evening',
  night: 'tracking.analytics.bucket.night',
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const typeLabel = (t: string) =>
  TYPE_LABEL_KEYS[t] ? translate(TYPE_LABEL_KEYS[t]) : cap(t)

// String-keyed views of the shared color maps. The backend sends plain strings for
// types/moods, so indexing by string (with a fallback) is honest — no `as Enum` cast
// pretending an arbitrary value is a member of the union.
const typeColors: Record<string, string> = TYPE_COLORS
const moodColors: Record<string, string> = MOOD_COLORS

// A labelled horizontal bar: label + value on the left, the bar fills to the right.
// `max` normalizes the widths across the group. The visual bar is decorative; the
// text label + value already convey the data to screen readers.
function Bar({
  label,
  value,
  max,
  suffix = '',
  color = '#6a5cff',
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
  const { t } = useT()
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

  if (error) {
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.patterns.title')}</h2>
        <p className="muted">{t('tracking.analytics.patterns.loadError')}</p>
      </section>
    )
  }
  if (!insights) {
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.patterns.title')}</h2>
        <p className="muted">{t('tracking.analytics.patterns.looking')}</p>
      </section>
    )
  }

  return (
    <section className="analytics-section">
      <h2>{t('tracking.analytics.patterns.title')}</h2>
      {insights.needs_more_data || insights.insights.length === 0 ? (
        <p className="muted">
          {t('tracking.analytics.patterns.willAppear')}
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
  const bpmBasis = translate('tracking.analytics.hr.sitBasis', { count: n })
  const bpm = delta.avg_bpm_delta
  let sentence: string
  if (bpm < 0) {
    sentence = translate('tracking.analytics.hr.deltaDown', { bpm: Math.abs(bpm), basis: bpmBasis })
  } else if (bpm > 0) {
    sentence = translate('tracking.analytics.hr.deltaUp', { bpm, basis: bpmBasis })
  } else {
    sentence = translate('tracking.analytics.hr.deltaSame', { basis: bpmBasis })
  }
  // Append HRV delta when available, using its own honest sample basis.
  if (delta.avg_hrv_ms_delta != null && delta.hrv_sample_size > 0) {
    const hn = delta.hrv_sample_size
    const hrvBasis = translate('tracking.analytics.hr.hrvBasis', { count: hn })
    const hrv = delta.avg_hrv_ms_delta
    if (hrv > 0) {
      sentence += translate('tracking.analytics.hr.hrvUp', { hrv, basis: hrvBasis })
    } else if (hrv < 0) {
      sentence += translate('tracking.analytics.hr.hrvDown', { hrv: Math.abs(hrv), basis: hrvBasis })
    }
  }
  return sentence
}

// A heart-rate (and optional HRV) trend over recent readings. Loads independently so
// a hiccup here never blanks the practice charts above. Readings are a personal
// wellness signal the user enters — not a medical measurement.
function BiometricTrend() {
  const { t } = useT()
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

  if (error) {
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.hr.title')}</h2>
        <p className="muted">{t('tracking.analytics.hr.loadError')}</p>
      </section>
    )
  }

  if (!readings) {
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.hr.title')}</h2>
        <p className="muted">{t('tracking.analytics.hr.reading')}</p>
      </section>
    )
  }

  if (readings.length === 0) {
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.hr.title')}</h2>
        <p className="muted">
          {t('tracking.analytics.hr.emptyPre')}{' '}
          <Link to="/biometrics/new">{t('tracking.analytics.hr.emptyLink')}</Link>{t('tracking.analytics.hr.emptyPost')}
        </p>
      </section>
    )
  }

  // With a single reading a min→max trend is meaningless (one bar at the floor,
  // identical end labels), so show a plain "Latest" line until there are ≥2.
  if (readings.length < 2) {
    const latest = readings[0]
    return (
      <section className="analytics-section">
        <h2>{t('tracking.analytics.hr.title')}</h2>
        <p className="muted biometric-note">
          {t('tracking.analytics.hr.noteShort')}
        </p>
        <p className="biometric-delta">
          {t('tracking.analytics.hr.latest', { bpm: latest.bpm })}
          {latest.hrv_ms != null ? t('tracking.analytics.hr.latestHrv', { hrv: latest.hrv_ms }) : ''}
        </p>
        <p className="muted">{t('tracking.analytics.hr.oneMore')}</p>
        <p className="muted biometric-cta">
          <Link to="/biometrics/new">{t('tracking.analytics.hr.logResting')}</Link>
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
      <h2>{t('tracking.analytics.hr.title')}</h2>
      <p className="muted biometric-note">
        {t('tracking.analytics.hr.noteLong')}
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
        <span>{t('tracking.analytics.hr.oldest')}</span>
        <span>{t('tracking.analytics.hr.rangeBpm', { min: minBpm, max: maxBpm })}</span>
        <span>{t('tracking.analytics.hr.newest')}</span>
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
            <span>{t('tracking.analytics.hr.oldest')}</span>
            <span>{t('tracking.analytics.hr.rangeHrv', { min: minHrv, max: maxHrv })}</span>
            <span>{t('tracking.analytics.hr.newest')}</span>
          </div>
        </>
      )}

      {sentence && <p className="biometric-delta">{sentence}</p>}

      <p className="muted biometric-cta">
        <Link to="/biometrics/new">{t('tracking.analytics.hr.logResting')}</Link>
      </p>
    </section>
  )
}

// Calm & focus self-ratings (1–5) averaged per week. Purely descriptive — it just
// charts the numbers you logged, not a statistical claim. Only weeks with at least
// one rated session appear, so the trend never implies data that isn't there.
function CalmFocusTrend({ weeks }: { weeks: WeekRatings[] }) {
  const { t } = useT()
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
      <h2>{t('tracking.analytics.calmFocus.title')}</h2>
      <p className="muted">
        {t('tracking.analytics.calmFocus.subtitle')}
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
        <span>{t('tracking.analytics.calmFocus.calmAxis')}</span>
        <span>{weeks[weeks.length - 1]?.week_start}</span>
      </div>
      {row('focus', FOCUS_COLOR)}
      <div className="muted analytics-axis" aria-hidden="true">
        <span>{weeks[0]?.week_start}</span>
        <span>{t('tracking.analytics.calmFocus.focusAxis')}</span>
        <span>{weeks[weeks.length - 1]?.week_start}</span>
      </div>
      <div className="mood-legend" aria-hidden="true">
        <span className="mood-legend-item">
          <span className="mood-legend-dot" style={{ background: CALM_COLOR }} />
          {t('tracking.analytics.calmFocus.calm')}
        </span>
        <span className="mood-legend-item">
          <span className="mood-legend-dot" style={{ background: FOCUS_COLOR }} />
          {t('tracking.analytics.calmFocus.focus')}
        </span>
      </div>
    </section>
  )
}

// Mood-over-time needs at least this many tagged entries across the window before we
// surface the per-week stacked chart — mirrors the insights' minimum-sample guards so
// a near-empty chart never implies a trend that isn't there.
const MOOD_OVER_TIME_MIN_ENTRIES = 6

// "This month vs last" — a clear, honest summary card. The delta is this − last, so a
// positive number reads as ▲ (more than last month) and a negative as ▼.
function MonthVsLast({ data }: { data: MonthComparison }) {
  const { t } = useT()
  const { this_month: now, last_month: prev } = data

  // A signed delta line: an arrow + magnitude + plain-language comparison, or a calm
  // "same as last month" when unchanged. Decorative arrow is aria-hidden; the text
  // (e.g. "12 more than last month") carries the meaning for screen readers.
  const Delta = ({ delta, unit }: { delta: number; unit: string }) => {
    if (delta === 0) {
      return <span className="month-delta month-delta-flat">{t('tracking.analytics.month.same')}</span>
    }
    const up = delta > 0
    const mag = Math.abs(delta)
    return (
      <span className={`month-delta ${up ? 'month-delta-up' : 'month-delta-down'}`}>
        <span aria-hidden="true">{up ? '▲' : '▼'}</span>{' '}
        {up
          ? t('tracking.analytics.month.more', { mag, unit })
          : t('tracking.analytics.month.fewer', { mag, unit })}
      </span>
    )
  }

  const rows: { label: string; now: number; delta: number; unit: string }[] = [
    { label: t('tracking.analytics.month.rowMinutes'), now: now.minutes, delta: data.minutes_delta, unit: t('tracking.analytics.month.unitMin') },
    { label: t('tracking.analytics.month.rowSessions'), now: now.sessions, delta: data.sessions_delta, unit: t('tracking.analytics.month.unitSessions') },
    {
      label: t('tracking.analytics.month.rowDays'),
      now: now.days_practiced,
      delta: data.days_practiced_delta,
      unit: t('tracking.analytics.month.unitDays'),
    },
  ]

  return (
    <section className="analytics-section">
      <h2>{t('tracking.analytics.month.title')}</h2>
      <ul className="month-compare">
        {rows.map((r) => (
          <li key={r.label} className="month-compare-row">
            <span className="month-metric-label">{r.label}</span>
            <span className="month-metric-value">{r.now}</span>
            <Delta delta={r.delta} unit={r.unit} />
          </li>
        ))}
      </ul>
      <p className="muted">
        {t('tracking.analytics.month.note', {
          noPrev: prev.sessions === 0 ? t('tracking.analytics.month.noPrev') : '',
        })}
      </p>
    </section>
  )
}

export default function AnalyticsPage() {
  const { t } = useT()
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
      .catch((err) => setError(messageForError(err, t('tracking.analytics.loadError'))))
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
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <header className="page-head">
        <h1>{t('tracking.analytics.title')}</h1>
        <p className="page-subtitle">{t('tracking.analytics.subtitle')}</p>
      </header>

      <RetryableError message={error} onRetry={retry} retrying={retrying} />
      {!data && !error && <Loading />}

      {data && data.total_sessions === 0 && data.moods.length === 0 && (
        <>
          <EmptyState>
            {t('tracking.analytics.empty')}
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
              <div className="stat-label">{t('tracking.analytics.stat.sessions')}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{Math.round(data.total_minutes / 60)}</div>
              <div className="stat-label">{t('tracking.analytics.stat.hours')}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{data.days_practiced}</div>
              <div className="stat-label">{t('tracking.analytics.stat.days')}</div>
            </div>
          </section>

          {/* Activity calendar — a month-at-a-glance heatmap of practice/all-quest days.
              Lives here with the rest of the stats (moved off the calm home). Self-fetches
              and carries its own loading/empty/error states. */}
          <ActivityHeatmap />

          <MonthVsLast data={data.monthly_comparison} />

          <Insights />

          <BiometricTrend />

          <section className="analytics-section">
            <h2>{t('tracking.analytics.minutesPerWeek')}</h2>
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
              <span>{data.minutes_by_week[data.minutes_by_week.length - 1]?.week_start}</span>
            </div>
          </section>

          {/* Session breakdowns — the secondary by-type / by-weekday / time-of-day slices, folded
              behind ONE quiet disclosure (collapsed by default) so the page leads with the habit
              metrics (stats, calendar, month-vs-last, minutes) instead of a 4-screen chart wall. */}
          <details className="meditate-disclosure analytics-breakdowns">
            <summary className="meditate-disclosure-summary">
              {t('tracking.analytics.breakdowns')}
            </summary>
            <div className="meditate-disclosure-body">
              {data.by_type.length > 0 && (
                <section className="analytics-section">
                  <h2>{t('tracking.analytics.byType')}</h2>
                  <div className="bars">
                    {(() => {
                      const max = Math.max(1, ...data.by_type.map((bt) => bt.minutes))
                      return data.by_type.map((bt, i) => (
                        <Bar
                          key={bt.type}
                          label={typeLabel(bt.type)}
                          value={bt.minutes}
                          max={max}
                          suffix={t('tracking.analytics.minSuffix')}
                          color={typeColors[bt.type] ?? PALETTE[i % PALETTE.length]}
                        />
                      ))
                    })()}
                  </div>
                </section>
              )}

              <section className="analytics-section">
                <h2>{t('tracking.analytics.byWeekday')}</h2>
                <div className="bars">
                  {(() => {
                    const max = Math.max(1, ...data.by_weekday.map((w) => w.count))
                    return data.by_weekday.map((w, i) => (
                      <Bar
                        key={w.weekday}
                        label={translate(WEEKDAY_KEYS[w.weekday])}
                        value={w.count}
                        max={max}
                        color={PALETTE[i % PALETTE.length]}
                      />
                    ))
                  })()}
                </div>
              </section>

              <section className="analytics-section">
                <h2>{t('tracking.analytics.timeOfDay')}</h2>
                <div className="bars">
                  {(() => {
                    const max = Math.max(1, ...data.by_time_of_day.map((b) => b.count))
                    return data.by_time_of_day.map((b, i) => (
                      <Bar
                        key={b.bucket}
                        label={BUCKET_LABEL_KEYS[b.bucket] ? translate(BUCKET_LABEL_KEYS[b.bucket]) : b.bucket}
                        value={b.count}
                        max={max}
                        color={PALETTE[i % PALETTE.length]}
                      />
                    ))
                  })()}
                </div>
              </section>
            </div>
          </details>

          {data.moods.length > 0 && (
            <section className="analytics-section">
              <h2>{t('tracking.analytics.journalMoods')}</h2>
              <div className="bars">
                {(() => {
                  const max = Math.max(1, ...data.moods.map((m) => m.count))
                  return data.moods.map((m, i) => (
                    <Bar
                      key={m.mood}
                      label={cap(m.mood)}
                      value={m.count}
                      max={max}
                      color={moodColors[m.mood] ?? PALETTE[i % PALETTE.length]}
                    />
                  ))
                })()}
              </div>
            </section>
          )}

          {data.mood_by_week.reduce(
            (sum, w) => sum + Object.values(w.counts).reduce((a, b) => a + b, 0),
            0,
          ) >= MOOD_OVER_TIME_MIN_ENTRIES && (
            <section className="analytics-section">
              <h2>{t('tracking.analytics.moodOverTime')}</h2>
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
                          <li key={w.week_start}>{w.week_start}: {breakdown || t('tracking.analytics.noEntries')}</li>
                        )
                      })}
                    </ul>
                    <div className="weeks" aria-hidden="true">
                      {data.mood_by_week.map((w, i) => (
                        <div
                          key={w.week_start}
                          className="week-col"
                          title={`${w.week_start}: ${t('tracking.analytics.entryCount', { count: totals[i] })}`}
                        >
                          <div className="mood-stack">
                            {present.map((m) =>
                              w.counts[m] ? (
                                <div
                                  key={m}
                                  className="mood-seg"
                                  style={{
                                    height: `${(w.counts[m] / maxTotal) * 100}%`,
                                    background: moodColors[m] ?? '#94a3b8',
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
                      <span>{data.mood_by_week[data.mood_by_week.length - 1]?.week_start}</span>
                    </div>
                    <div className="mood-legend" aria-hidden="true">
                      {present.map((m) => (
                        <span key={m} className="mood-legend-item">
                          <span
                            className="mood-legend-dot"
                            style={{ background: moodColors[m] ?? '#94a3b8' }}
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
