import { useEffect, useRef, useState } from 'react'
import { dashboardService } from '../services/dashboard'
import { localYMD } from '../lib/format'
import type { ActivityCalendar } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Parse "YYYY-MM-DD" in local time (avoids a UTC off-by-one); `localYMD` formats.
const parse = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d)
}
const fmt = localYMD

// Three states: 0 inactive · 1 active (practiced) · 2 all daily quests completed.
type DayInfo = { seconds: number; allQuests: boolean }
type Cell = {
  iso: string
  date: Date
  level: 0 | 1 | 2
  minutes: number
  allQuests: boolean
  inRange: boolean
}

export default function ActivityHeatmap() {
  const [cal, setCal] = useState<ActivityCalendar | null>(null)
  const [failed, setFailed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Show roughly the last month (5 full weeks) rather than the whole year.
  useEffect(() => {
    dashboardService
      .getActivity(35)
      .then(setCal)
      .catch(() => setFailed(true))
  }, [])

  // The grid runs oldest → today, so the most recent weeks sit at the right edge.
  // Scroll there on load so current activity is visible without scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [cal])

  if (failed) return null
  if (!cal) return <p className="muted">Loading activity…</p>

  const byDate = new Map<string, DayInfo>(
    cal.days.map((d) => [d.date, { seconds: d.seconds, allQuests: d.all_quests }]),
  )
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
      const info = byDate.get(iso)
      const allQuests = info?.allQuests ?? false
      const seconds = info?.seconds ?? 0
      const level: 0 | 1 | 2 = !inRange ? 0 : allQuests ? 2 : seconds > 0 ? 1 : 0
      week.push({
        iso,
        date: new Date(cursor),
        level,
        minutes: Math.round(seconds / 60),
        allQuests,
        inRange,
      })
      // Step by calendar day, not a fixed 24h: adding DAY_MS across a fall-back DST
      // day lands twice on the same date (duplicate cell key / grid drift).
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  const totalMin = Math.round(cal.days.reduce((s, d) => s + d.seconds, 0) / 60)
  const perfectDays = cal.days.filter((d) => d.all_quests).length

  return (
    <section className="calendar">
      <h2>Activity</h2>
      <div className="heatmap-scroll" ref={scrollRef}>
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
                {week.map((cell) => {
                  const cellLabel = cell.inRange
                    ? `${cell.iso}: ${cell.minutes} min${cell.allQuests ? ', all quests completed' : ''}`
                    : undefined
                  return (
                    <div
                      key={cell.iso}
                      role={cell.inRange ? 'img' : undefined}
                      aria-label={cellLabel}
                      className={`heatmap-cell lvl-${cell.level}${cell.inRange ? '' : ' out'}`}
                      title={cellLabel}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        <span className="muted">
          {totalMin} min in the last month · {perfectDays} all-quest{' '}
          {perfectDays === 1 ? 'day' : 'days'}
        </span>
        <span className="heatmap-key" aria-hidden="true">
          <i className="heatmap-cell lvl-0" /> None
          <i className="heatmap-cell lvl-1" /> Active
          <i className="heatmap-cell lvl-2" /> All quests
        </span>
      </div>
    </section>
  )
}
