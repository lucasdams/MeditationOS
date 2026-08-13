import { useEffect, useRef, useState } from 'react'
import { dashboardService } from '../services/dashboard'
import { localYMD } from '../lib/format'
import { useT } from '../i18n'
import type { ConsistencyCalendar } from '../types'

// Parse "YYYY-MM-DD" in local time (avoids a UTC off-by-one); `localYMD` formats back.
const parse = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d)
}
const fmt = localYMD

// A calm 4-step intensity ramp keyed off the day's practice minutes (0 = no practice,
// faint). Gentle thresholds so a short sit still registers softly and a longer one reads
// deeper — never a shouted, saturated block.
type Level = 0 | 1 | 2 | 3 | 4
function levelFor(minutes: number): Level {
  if (minutes <= 0) return 0
  if (minutes < 10) return 1
  if (minutes < 20) return 2
  if (minutes < 40) return 3
  return 4
}

type Cell = {
  iso: string
  date: Date
  level: Level
  minutes: number
  inRange: boolean
}

// A calm "Your consistency" heatmap — weeks (columns) × 7 weekdays (rows) over roughly the
// last 12 weeks, each cell shaded by that day's practice. Self-fetches and carries its own
// loading / error / empty states. Placed on the Analytics page, where the insights live.
export default function ConsistencyHeatmap() {
  const { t } = useT()
  const [cal, setCal] = useState<ConsistencyCalendar | null>(null)
  const [failed, setFailed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dashboardService
      .getConsistency()
      .then(setCal)
      .catch(() => setFailed(true))
  }, [])

  // The grid runs oldest → today, so the most recent weeks sit at the right edge. Scroll
  // there on load so current activity is visible without scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [cal])

  if (failed) return null
  if (!cal) return <p className="muted">{t('tracking.consistency.loading')}</p>

  const byDate = new Map<string, number>(cal.days.map((d) => [d.date, d.minutes]))
  const rangeStart = parse(cal.start)
  const end = parse(cal.end)
  if (isNaN(rangeStart.getTime()) || isNaN(end.getTime())) return null

  // Start the grid on the Sunday on/before the range start, so every column is a full week.
  const gridStart = parse(cal.start)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const weeks: Cell[][] = []
  for (let cursor = new Date(gridStart); cursor <= end; ) {
    const week: Cell[] = []
    for (let i = 0; i < 7; i++) {
      const iso = fmt(cursor)
      const inRange = cursor >= rangeStart && cursor <= end
      const minutes = byDate.get(iso) ?? 0
      week.push({
        iso,
        date: new Date(cursor),
        level: inRange ? levelFor(minutes) : 0,
        minutes,
        inRange,
      })
      // Step by calendar day, not a fixed 24h (a fall-back DST day would land twice).
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  const totalMin = cal.days.reduce((s, d) => s + d.minutes, 0)
  const daysPracticed = cal.days.length

  if (daysPracticed === 0) {
    return (
      <section className="consistency">
        <h2>{t('tracking.consistency.title')}</h2>
        <p className="muted">{t('tracking.consistency.empty')}</p>
      </section>
    )
  }

  return (
    <section className="consistency">
      <h2>{t('tracking.consistency.title')}</h2>
      <div className="consistency-scroll" ref={scrollRef}>
        <div className="consistency-grid">
          {weeks.map((week) => (
            <div key={week[0].iso} className="consistency-week">
              {week.map((cell) => {
                const cellLabel = cell.inRange
                  ? cell.minutes > 0
                    ? t('tracking.consistency.cellLabel', {
                        minutes: cell.minutes,
                        iso: cell.iso,
                        count: cell.minutes,
                      })
                    : t('tracking.consistency.cellLabelEmpty', { iso: cell.iso })
                  : undefined
                return (
                  <div
                    key={cell.iso}
                    role={cell.inRange ? 'img' : undefined}
                    aria-label={cellLabel}
                    className={`consistency-cell lvl-${cell.level}${cell.inRange ? '' : ' out'}`}
                    title={cellLabel}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="consistency-legend">
        <span className="muted">
          {t('tracking.consistency.summary', {
            minutes: totalMin,
            days: daysPracticed,
            count: daysPracticed,
          })}
        </span>
        <span className="consistency-key" aria-hidden="true">
          {t('tracking.consistency.less')}
          <i className="consistency-cell lvl-1" />
          <i className="consistency-cell lvl-2" />
          <i className="consistency-cell lvl-3" />
          <i className="consistency-cell lvl-4" />
          {t('tracking.consistency.more')}
        </span>
      </div>
    </section>
  )
}
