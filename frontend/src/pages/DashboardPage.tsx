import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardService } from '../services/dashboard'
import { sanctuaryService } from '../services/sanctuary'
import LevelCard from '../components/LevelCard'
import FirstRunCard, { shouldShowFirstRun, isFirstRunDismissed } from '../components/FirstRunCard'
import MoodCheckin from '../components/MoodCheckin'
import Modal from '../components/Modal'
import WeeklyReview from '../components/WeeklyReview'
import SanctuaryScene from '../components/SanctuaryScene'
import { ACTIVITY_COLORS, ACTIVITY_META, type Activity } from '../lib/colors'
import { RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { GREETINGS, LOADING, dailyOf, randomOf, localDateKey } from '../lib/zen'
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

// Once-per-day gate for the on-open mood check-in. We record the local date the prompt
// was shown so it appears at most once per calendar day — not on every navigation or
// refresh. Storage failures (private mode) degrade to "don't prompt" rather than nag.
const MOOD_PROMPT_PREFIX = 'mood.prompted.'

function moodPromptedToday(): boolean {
  try {
    return localStorage.getItem(MOOD_PROMPT_PREFIX + localDateKey()) === '1'
  } catch {
    // Can't read storage — assume already prompted so we never nag on every visit.
    return true
  }
}

function markMoodPromptedToday(): void {
  try {
    localStorage.setItem(MOOD_PROMPT_PREFIX + localDateKey(), '1')
  } catch {
    // ignore storage failures — worst case the modal shows again next visit
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // Sanctuary scene is the heaviest dashboard read; fetch once here and pass down to
  // both LevelCard (next unlock) and SanctuaryScene (coins + garden preview).
  const [sanctuaryScene, setSanctuaryScene] = useState<SanctuarySceneType | null>(null)
  // The deeper progress detail (full level detail, weekly review) starts collapsed so the
  // landing view stays calm — the primary "start a practice" surface first, the rest one
  // tap away. The open/closed choice persists across visits.
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

  // On-open mood check-in: a calm, skippable modal that greets the user at most once per
  // day. Opened by the effect below once stats have loaded (so we can tell whether the
  // first-run card is leading the page — we don't stack the mood prompt on top of it).
  const [moodModalOpen, setMoodModalOpen] = useState(false)

  function closeMoodModal() {
    // Record the prompt for today on dismissal so it won't reappear until tomorrow,
    // whether the user picked a mood or skipped.
    markMoodPromptedToday()
    setMoodModalOpen(false)
  }

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

  // Decide whether to greet the user with the mood check-in. Runs once stats are in so we
  // know if the first-run "start here" card is leading the page. Gating rules:
  //  - at most once per local calendar day (localStorage `mood.prompted.<date>`),
  //  - never stacked on top of the first-run card — a brand-new user gets the gentler
  //    orientation card first; the mood prompt waits for a later day.
  useEffect(() => {
    if (!stats || moodModalOpen) return
    if (moodPromptedToday()) return
    const firstRunActive =
      !firstRunDismissed && shouldShowFirstRun(stats.session_count)
    if (firstRunActive) return
    setMoodModalOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, firstRunDismissed])

  function retryStats() {
    setRetrying(true)
    loadStats()
  }

  return (
    <main id="main-content" className="dashboard">
      {/* Level + coins pinned to the very top of the home — the first thing the user sees,
          above the page title and the first-run card. A clean, tidy top line (not a big
          gamified bar): calm but clearly present. Level comes from stats; coins from the
          single sanctuary-scene fetch shared with LevelCard and the garden teaser. */}
      {stats && (
        <p className="level-topline" aria-label={`Level ${stats.level}`}>
          <span className="level-topline-item">
            <span aria-hidden="true">◆</span> Level {stats.level}
          </span>
          {sanctuaryScene && (
            <span className="level-topline-item">
              <span aria-hidden="true">🪙</span> {sanctuaryScene.coins}
            </span>
          )}
        </p>
      )}

      <h1>Your practice</h1>
      <p className="zen-greeting muted">{greeting}</p>

      <RetryableError message={error} onRetry={retryStats} retrying={retrying} />

      {!stats && !error && <p>{loadingLine}</p>}

      {/* First-run orientation: leads the dashboard for genuinely new users, above the
          denser progress surfaces. Hidden once dismissed or once they've practiced. */}
      {stats && !firstRunDismissed && shouldShowFirstRun(stats.session_count) && (
        <FirstRunCard onDismiss={() => setFirstRunDismissed(true)} />
      )}

      {stats && stats.current_streak_days > 0 && (
        <p className="quest-streak muted">
          <span aria-hidden="true">🌱</span> {stats.current_streak_days}-day practice streak
          {stats.rest_day_used ? ' · 🛡️ rest day — skipping one is fine' : ''}
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

      {/* Compact quests — the day's quests as small, tappable chips (emoji + short label),
          each deep-linking to its feature. Low-chrome on purpose: no lead label, no
          descriptions, no XP numbers; done quests read muted with a check. */}
      {stats && stats.daily_quests.length > 0 && (
        <section className="quests-compact" aria-label="Today's quests">
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

      {/* Quiet, always-reachable way to log a mood — the calm fallback when the on-open
          check-in modal was skipped (or already shown today). A plain text link, not a
          button-styled control, so it stays unobtrusive on the calm home. */}
      {stats && !moodModalOpen && (
        <p className="mood-entry">
          <button type="button" className="mood-entry-link" onClick={() => setMoodModalOpen(true)}>
            How do you feel?
          </button>
        </p>
      )}

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
          drawer: the full level detail (XP bar, next unlock) and the weekly review — both
          still here, just one tap away. Totals and the activity calendar now live on the
          Analytics page (alongside the rest of the stats); quests and the garden live on
          the default home above (in compact form). */}
      {stats && (
        <section className="dashboard-more">
          {/* Subtle, link-style affordance for the progress drawer — a quiet centered text
              link with a chevron, not a chunky button. Still a real <button> with
              aria-expanded/aria-controls and full keyboard operation. */}
          <button
            type="button"
            className="show-more-toggle"
            onClick={toggleShowMore}
            aria-expanded={showMore}
            aria-controls="dashboard-more-panel"
          >
            <span className="show-more-text">{showMore ? 'Show less' : 'Show more'}</span>
            <span className="show-more-chevron" aria-hidden="true">
              {showMore ? '⌃' : '⌄'}
            </span>
          </button>

          {showMore && (
            <div id="dashboard-more-panel">
              <LevelCard stats={stats} scene={sanctuaryScene} />

              <WeeklyReview />
            </div>
          )}
        </section>
      )}

      {/* On-open mood check-in — a calm, skippable modal greeting the user at most once a
          day (see the gating effect above). Reuses the inline MoodCheckin logic/API call;
          picking a mood saves it and closes; "Skip" dismisses without pressure. Escape,
          focus trap, and focus restoration come from <Modal>. */}
      {moodModalOpen && (
        <Modal
          onClose={closeMoodModal}
          ariaLabel="How are you arriving?"
          cardClassName="mood-modal"
          closeOnBackdrop
        >
          <p className="mood-modal-kicker muted">Take a breath</p>
          <MoodCheckin
            heading="How are you arriving?"
            onLogged={closeMoodModal}
          />
          <button
            type="button"
            className="mood-modal-skip"
            onClick={closeMoodModal}
          >
            Skip for now
          </button>
        </Modal>
      )}
    </main>
  )
}
