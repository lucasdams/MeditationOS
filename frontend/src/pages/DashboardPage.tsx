import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardService } from '../services/dashboard'
import { sanctuaryService } from '../services/sanctuary'
import LevelCard from '../components/LevelCard'
import FirstRunCard, { shouldShowFirstRun, isFirstRunDismissed } from '../components/FirstRunCard'
import MoodCheckin from '../components/MoodCheckin'
import WeeklyReview from '../components/WeeklyReview'
import SanctuaryScene from '../components/SanctuaryScene'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { ACTIVITY_COLORS, ACTIVITY_META, type Activity } from '../lib/colors'
import { RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { GREETINGS, LOADING, dailyOf, randomOf } from '../lib/zen'
import type { DashboardStats, SanctuaryScene as SanctuarySceneType } from '../types'

// Where each daily-quest card deep-links — keyed by the backend quest key.
const QUEST_LINKS: Record<string, string> = {
  meditate: '/meditate',
  breathe: '/breathe',
  gratitude: '/gratitude',
  journal: '/journal',
}

// Quick-action tiles — one tap to the five main features from the dashboard.
// The four activity tiles read their emoji/label from the shared ACTIVITY_META;
// Sanctuary isn't a tracked activity, so it carries its own emoji/label.
const FEATURE_TILES = [
  { ...ACTIVITY_META.meditate, to: '/meditate', activity: 'meditate' as const },
  { ...ACTIVITY_META.breathe, to: '/breathe', activity: 'breathe' as const },
  { ...ACTIVITY_META.gratitude, to: '/gratitude', activity: 'gratitude' as const },
  { ...ACTIVITY_META.journal, to: '/journal', activity: 'journal' as const },
  { label: 'Sanctuary', emoji: '🌱', to: '/sanctuary', activity: null },
] as const

const formatTotal = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // Sanctuary scene is the heaviest dashboard read; fetch once here and pass down to
  // both LevelCard (next unlock) and SanctuaryScene (coins + garden preview).
  const [sanctuaryScene, setSanctuaryScene] = useState<SanctuarySceneType | null>(null)
  // Everything beyond the day's practice (quests, sanctuary, level detail, totals,
  // heatmap, weekly review) starts collapsed so the landing view stays calm — the
  // primary "start a practice" surface first, the rest one tap away. The open/closed
  // choice persists across visits.
  const [showMore, setShowMore] = useState(() => {
    try {
      return localStorage.getItem('dashboard.showMore') === '1'
    } catch {
      return false
    }
  })

  function toggleShowMore() {
    setShowMore((v) => {
      const next = !v
      try {
        localStorage.setItem('dashboard.showMore', next ? '1' : '0')
      } catch {
        // ignore storage failures (private mode, quota) — the toggle still works in-session
      }
      return next
    })
  }
  // A gentle daily greeting (stable through the day) and a mindful loading line.
  const [greeting] = useState(() => dailyOf(GREETINGS, new Date()))
  const [loadingLine] = useState(() => randomOf(LOADING))
  // First-run "start here" card: track manual dismissal in component state (seeded
  // from localStorage) so dismissing hides it immediately, and it stays hidden across
  // visits. It also auto-retires once the user has logged a few sessions.
  const [firstRunDismissed, setFirstRunDismissed] = useState(() => isFirstRunDismissed())

  function loadStats() {
    dashboardService
      .getStats()
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, 'Could not load your stats.')))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setSanctuaryScene)
      .catch(() => {}) // non-critical; LevelCard and SanctuaryScene handle null gracefully
  }, [])

  function retryStats() {
    setRetrying(true)
    loadStats()
  }

  return (
    <main id="main-content" className="dashboard">
      <h1>Your practice</h1>
      <p className="zen-greeting muted">{greeting}</p>

      <RetryableError message={error} onRetry={retryStats} retrying={retrying} />

      {!stats && !error && <p>{loadingLine}</p>}

      {/* First-run orientation: leads the dashboard for genuinely new users, above the
          denser progress surfaces. Hidden once dismissed or once they've practiced. */}
      {stats && !firstRunDismissed && shouldShowFirstRun(stats.session_count) && (
        <FirstRunCard onDismiss={() => setFirstRunDismissed(true)} />
      )}

      {/* Slim level/coins line — a quiet chip in place of the full LevelCard on the
          default view. The detailed LevelCard (XP bar, next unlock) lives in the
          collapse below so the landing view stays calm. */}
      {stats && (
        <p className="level-chip muted">
          <span aria-hidden="true">◆</span> Level {stats.level}
          {sanctuaryScene && (
            <>
              {' · '}
              <span aria-hidden="true">🪙</span> {sanctuaryScene.coins}
            </>
          )}
        </p>
      )}

      {/* Quick-access tiles — the primary purpose of the home screen: one tap to start
          a practice. Kept prominent and always visible. */}
      <nav className="feature-tiles" aria-label="Quick access">
        {FEATURE_TILES.map(({ label, emoji, to, activity }) => {
          const accent = activity ? ACTIVITY_COLORS[activity] : '#6b6b70'
          return (
            <Link
              key={to}
              to={to}
              className="feature-tile"
              style={{ ['--tile-accent' as string]: accent }}
            >
              <span className="feature-tile-emoji" aria-hidden="true">{emoji}</span>
              <span className="feature-tile-label">{label}</span>
            </Link>
          )
        })}
      </nav>

      <MoodCheckin />

      {/* Compact quests — a quiet "Today you could…" nudge with the day's quests as small
          tappable chips (emoji + short label), each deep-linking to its feature. Low-chrome
          on purpose: no descriptions, no XP numbers; done quests read muted with a check.
          The full quest detail used to live in the "Show more" drawer; this gentle version
          now sits on the calm default home so quests are visible at a glance. */}
      {stats && stats.daily_quests.length > 0 && (
        <section className="quests-compact" aria-label="Today's quests">
          <p className="quests-compact-lead muted">Today you could…</p>
          <ul className="quest-chips">
            {stats.daily_quests.map((q) => {
              const to = QUEST_LINKS[q.key] ?? '/sessions/new'
              const meta = ACTIVITY_META[q.key as Activity]
              const accent = ACTIVITY_COLORS[q.key as Activity]
              return (
                <li key={q.key}>
                  <Link
                    to={to}
                    className={q.done ? 'quest-chip done' : 'quest-chip'}
                    style={accent ? { ['--activity-accent' as string]: accent } : undefined}
                    aria-label={`${q.label}${q.done ? ' — done' : ''}`}
                  >
                    <span className="quest-chip-emoji" aria-hidden="true">
                      {meta?.emoji ?? '⭐'}
                    </span>
                    <span className="quest-chip-label">{q.label}</span>
                    {q.done && (
                      <span className="quest-chip-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Compact sanctuary — a slim garden teaser linking to the full /sanctuary page. No
          coin count here (the slim level chip above already shows coins; don't show twice).
          Also moved out of the "Show more" drawer onto the calm default home. */}
      {stats && <SanctuaryScene scene={sanctuaryScene} compact />}

      {/* Quiet fallback for the no-sessions state — only when the richer first-run card
          isn't on screen (dismissed), so the user never sees two "get started" prompts.
          Kept on the default view so a brand-new user always has a clear "start here". */}
      {stats &&
        stats.session_count === 0 &&
        (firstRunDismissed || !shouldShowFirstRun(stats.session_count)) && (
          <p className="muted">
            You're just getting started. <Link to="/sessions/new">Log a session</Link> or{' '}
            <Link to="/breathe">breathe</Link> to earn your first coins.
          </p>
        )}

      {/* The heavier retrospective/progress detail folds into one calm, default-collapsed
          drawer: the full level detail (XP bar, next unlock), totals, the heatmap, and the
          weekly review — all still here, just one tap away. Quests and the garden now live
          on the default home above (in compact form), so the drawer is purely the deeper
          progress view. */}
      {stats && (
        <section className="dashboard-more">
          <button
            type="button"
            className="show-more-toggle"
            onClick={toggleShowMore}
            aria-expanded={showMore}
            aria-controls="dashboard-more-panel"
          >
            {showMore ? 'Hide more' : 'Show more'}
          </button>

          {showMore && (
            <div id="dashboard-more-panel">
              {stats.current_streak_days > 0 && (
                <p className="quest-streak muted">
                  <span aria-hidden="true">🌱</span> {stats.current_streak_days}-day practice streak
                  {stats.rest_day_used ? ' · 🛡️ rest day — skipping one is fine' : ''}
                </p>
              )}

              <LevelCard stats={stats} scene={sanctuaryScene} />

              <section className="stat-cards">
                <div className="stat-card">
                  <div className="stat-value">{formatTotal(stats.total_seconds)}</div>
                  <div className="stat-label">Total practice</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.session_count}</div>
                  <div className="stat-label">Sessions</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.gratitude_count} 🙏</div>
                  <div className="stat-label">Gratitude moments</div>
                </div>
              </section>

              <ActivityHeatmap />

              <WeeklyReview />
            </div>
          )}
        </section>
      )}
    </main>
  )
}
