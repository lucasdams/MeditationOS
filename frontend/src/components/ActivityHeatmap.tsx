import { useEffect, useState } from 'react'
import { dashboardService } from '../services/dashboard'
import type { ActivityCalendar } from '../types'

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Parse/format "YYYY-MM-DD" in local time (avoids a UTC off-by-one).
const parse = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d)
}
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 0–4 intensity by minutes practiced, GitHub-style.
const intensity = (seconds: number) => {
  const min = seconds / 60
  if (min <= 0) return 0
  if (min < 10) return 1
  if (min < 20) return 2
  if (min < 40) return 3
  return 4
}

type Cell = { iso: string; date: Date; seconds: number; inRange: boolean }

export default function ActivityHeatmap() {
  const [cal, setCal] = useState<ActivityCalendar | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    dashboardService
      .getActivity()
      .then(setCal)
      .catch(() => setFailed(true))
  }, [])

  if (failed) return null
  if (!cal) return <p className="muted">Loading activity…</p>

  const byDate = new Map(cal.days.map((d) => [d.date, d.seconds]))
  const rangeStart = parse(cal.start)
  const end = parse(cal.end)

  // Start the grid on the Sunday on/before the range start, so every column is a full week.
  const gridStart = parse(cal.start)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const weeks: Cell[][] = []
  for (let cursor = new Date(gridStart); cursor <= end; ) {
    const week: Cell[] = []
    for (let i = 0; i < 7; i++) {
      const iso = fmt(cursor)
      const inRange = cursor >= rangeStart && cursor <= end
      week.push({ iso, date: new Date(cursor), seconds: byDate.get(iso) ?? 0, inRange })
      cursor = new Date(cursor.getTime() + DAY_MS)
    }
    weeks.push(week)
  }

  const totalMin = Math.round(cal.days.reduce((s, d) => s + d.seconds, 0) / 60)

  return (
    <section className="calendar">
      <h2>Activity</h2>
      <div className="heatmap-scroll">
        <div className="heatmap">
          <div className="heatmap-months">
            {weeks.map((week, i) => {
              const month = week[0].date.getMonth()
              const show = i === 0 ? false : month !== weeks[i - 1][0].date.getMonth()
              return (
                <span key={week[0].iso} className="heatmap-month">
                  {show ? MONTHS[month] : ''}
                </span>
              )
            })}
          </div>
          <div className="heatmap-grid">
            {weeks.map((week) => (
              <div key={week[0].iso} className="heatmap-week">
                {week.map((cell) => (
                  <div
                    key={cell.iso}
                    className={`heatmap-cell lvl-${cell.inRange ? intensity(cell.seconds) : 0}${
                      cell.inRange ? '' : ' out'
                    }`}
                    title={
                      cell.inRange
                        ? `${Math.round(cell.seconds / 60)} min · ${cell.iso}`
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        <span className="muted">{totalMin} min in the last year</span>
        <span className="heatmap-key">
          Less
          <i className="heatmap-cell lvl-0" />
          <i className="heatmap-cell lvl-1" />
          <i className="heatmap-cell lvl-2" />
          <i className="heatmap-cell lvl-3" />
          <i className="heatmap-cell lvl-4" />
          More
        </span>
      </div>
    </section>
  )
}
