import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { pathsService } from '../services/paths'
import { pathDayHref } from '../lib/pathRoutes'
import { ACTIVITY_META, type Activity } from '../lib/colors'
import { Loading, RetryableError, EmptyState, ErrorBanner } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { PathDay, PathSummary } from '../types'

// Paths — short, multi-day guided courses (beginner-first revision §8). A warm, never-punishing
// surface: a not-enrolled path offers a calm "Start this path"; an enrolled one lays its days out
// as a quiet vertical list (done quietly checked, the current day highlighted with its cue + a
// prominent "Start", locked days dimmed). A missed day is never scolded — the path simply waits.

// "Day N" prefix for a path day's title. The backend titles may already read "Day 3 · …" or just
// the bare title; we always show the index so the list stays scannable either way.
function dayLabel(day: PathDay): string {
  return `Day ${day.index}`
}

// A short, warm progress line under a path's blurb. Tailored to the path's state so the copy is
// always encouraging — never a "you're behind" framing.
function progressLine(path: PathSummary): string {
  if (path.completed) return `Complete · all ${path.total_days} days`
  if (!path.enrolled) return `${path.total_days} days · a gentle place to begin`
  return `Day ${path.current_day ?? 1} of ${path.total_days} · pick up where you left off`
}

// One enrolled day as a list row. The current day is the only actionable one here — it carries
// the day's cue and a prominent "Start" that launches its practice. Done days are quietly checked;
// locked days are dimmed and inert (no scolding, no lock-shaming copy).
function PathDayRow({ day }: { day: PathDay }) {
  const meta = ACTIVITY_META[day.practice as Activity]
  const PracticeIcon = meta.icon
  const minutes = `${day.min_minutes} min`

  return (
    <li className={`path-day path-day--${day.status}`}>
      <span className="path-day-marker" aria-hidden="true">
        {day.status === 'done' ? '✓' : day.status === 'current' ? '▸' : '·'}
      </span>
      <div className="path-day-body">
        <p className="path-day-head">
          <span className="path-day-num">{dayLabel(day)}</span>
          <span className="path-day-title">{day.title}</span>
          <span className="path-day-practice">
            <PracticeIcon size={16} strokeWidth={1.75} aria-hidden="true" /> {meta.label} · {minutes}
          </span>
        </p>

        {/* Only the current day surfaces its cue + the call to action — the row to do next. */}
        {day.status === 'current' && (
          <>
            <p className="path-day-cue">{day.cue}</p>
            <Link
              to={pathDayHref(day)}
              className="path-day-start today-action"
              aria-label={`Start ${dayLabel(day)}: ${day.title}`}
            >
              Start
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </li>
  )
}

// A single path: not-enrolled shows the calm "Start this path"; enrolled lays out its days.
function PathCard({
  path,
  onEnroll,
  enrolling,
}: {
  path: PathSummary
  onEnroll: (id: string) => void
  enrolling: boolean
}) {
  return (
    <section className="path-card" aria-label={path.title}>
      <h2 className="path-card-title">{path.title}</h2>
      <p className="path-card-blurb">{path.blurb}</p>
      <p className="path-card-progress muted">{progressLine(path)}</p>

      {!path.enrolled ? (
        <button
          type="button"
          className="path-start-btn today-action"
          onClick={() => onEnroll(path.id)}
          disabled={enrolling}
        >
          {enrolling ? 'Starting…' : 'Start this path'}
        </button>
      ) : (
        <>
          {/* Warm re-entry for an enrolled, unfinished path — never "you missed days". */}
          {!path.completed && (
            <p className="path-welcome muted">
              Welcome back — you're on Day {path.current_day ?? 1}.
            </p>
          )}
          {path.completed && (
            <p className="path-complete">
              You've finished this path. Beautifully done.
            </p>
          )}
          <ol className="path-days">
            {path.days.map((day) => (
              <PathDayRow key={day.index} day={day} />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

export default function PathsPage() {
  const [paths, setPaths] = useState<PathSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // The path id currently being enrolled (so only its button shows the in-flight state).
  const [enrollingId, setEnrollingId] = useState<string | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  function load(ignored?: () => boolean) {
    pathsService
      .list()
      .then((res) => {
        if (ignored?.()) return
        setPaths(res.paths)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignored?.()) setLoadError(messageForError(err, "Couldn't load the paths."))
      })
      .finally(() => {
        if (!ignored?.()) setRetrying(false)
      })
  }

  useEffect(() => {
    let ignore = false
    load(() => ignore)
    return () => {
      ignore = true
    }
  }, [])

  function retry() {
    setRetrying(true)
    setPaths(null)
    load()
  }

  function enroll(id: string) {
    setEnrollingId(id)
    setEnrollError(null)
    pathsService
      .enroll(id)
      .then((enrolled) => {
        // Swap the freshly-enrolled path into view in place — no refetch needed.
        setPaths((cur) =>
          cur ? cur.map((p) => (p.id === enrolled.id ? enrolled : p)) : [enrolled],
        )
      })
      .catch((err) => setEnrollError(messageForError(err, "Couldn't start the path. Try again.")))
      .finally(() => setEnrollingId(null))
  }

  return (
    <main id="main-content" className="paths-page">
      <h1>Paths</h1>
      <p className="zen-greeting muted">
        A short, day-by-day course to settle into a practice. Go at your own pace — a missed day
        is never a problem.
      </p>

      <RetryableError message={loadError} onRetry={retry} retrying={retrying} />
      <ErrorBanner message={enrollError} />

      {!paths && !loadError && <Loading label="Gathering the paths…" />}

      {paths && paths.length === 0 && !loadError && (
        <EmptyState>No paths yet — gentle courses are on the way.</EmptyState>
      )}

      {paths && paths.length > 0 && (
        <div className="paths-list">
          {paths.map((path) => (
            <PathCard
              key={path.id}
              path={path}
              onEnroll={enroll}
              enrolling={enrollingId === path.id}
            />
          ))}
        </div>
      )}
    </main>
  )
}
