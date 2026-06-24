import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardService } from '../services/dashboard'
import { spiritService } from '../services/spirit'
import { moodLogService } from '../services/moodLogs'
import LevelCard from '../components/LevelCard'
import Spirit from '../components/Spirit'
import FirstRunCard, { shouldShowFirstRun, isFirstRunDismissed } from '../components/FirstRunCard'
import MoodCheckin from '../components/MoodCheckin'
import Modal from '../components/Modal'
import WeeklyReview from '../components/WeeklyReview'
import CoinIcon from '../components/CoinIcon'
import { ACTIVITY_COLORS, ACTIVITY_META, MOOD_COLORS, MOOD_META, TILE_COLORS, TILE_COLORS_DARK, type Activity } from '../lib/colors'
import { RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { GREETINGS, LOADING, dailyOf, randomOf, localDateKey } from '../lib/zen'
import type { DashboardStats, Mood, SpiritState } from '../types'

// Where each daily-quest card deep-links — keyed by the backend quest key.
const QUEST_LINKS: Record<string, string> = {
  meditate: '/meditate',
  breathe: '/breathe',
  gratitude: '/gratitude',
  journal: '/journal',
}

// Quick-action tiles — one tap to the five main features from the dashboard. These are the
// home screen's primary focal point: each is a bold, full-colour box (saturated fill from
// TILE_COLORS, white icon + label) so the actions clearly pop. The four activity tiles read
// their emoji/label from the shared ACTIVITY_META. `tile` keys into TILE_COLORS for the box fill.
const FEATURE_TILES = [
  { ...ACTIVITY_META.meditate, to: '/meditate', tile: 'meditate' as const },
  { ...ACTIVITY_META.breathe, to: '/breathe', tile: 'breathe' as const },
  { ...ACTIVITY_META.gratitude, to: '/gratitude', tile: 'gratitude' as const },
  { ...ACTIVITY_META.journal, to: '/journal', tile: 'journal' as const },
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
  // The home-screen spirit, fetched once here and shared: it drives both the top-line coin
  // chip (its derived spendable balance) and the <Spirit/> companion below (passed as a prop,
  // so the companion doesn't fire a second GET /spirit). null until loaded / on a quiet failure.
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The deeper progress detail (full level detail, weekly review) is shown by default
  // beneath the primary "start a practice" surface (no Show more drawer).
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

  // The mood the user most recently logged *today* (local calendar day), if any. Drives the
  // home's mood line: when set we reflect "You felt {mood} {emoji}" instead of prompting.
  // null = nothing logged today yet → fall back to the "How do you feel?" prompt.
  const [todayMood, setTodayMood] = useState<Mood | null>(null)

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
    spiritService
      .get()
      .then((s) => setSpirit(s))
      .catch(() => {}) // non-critical; the coin chip + companion simply stay hidden on failure
  }, [])

  // Today's latest mood for the home reflection. Stats/weekly-review expose only aggregate
  // mood data (no "today's latest"), so fetch the single most recent mood log (the list is
  // newest-first) and keep it only if it was logged today. Non-critical: on failure we just
  // fall back to the "How do you feel?" prompt.
  useEffect(() => {
    moodLogService
      .list({ limit: 1 })
      .then((logs) => {
        const latest = logs[0]
        if (latest && localDateKey(new Date(latest.created_at)) === localDateKey()) {
          setTodayMood(latest.mood)
        }
      })
      .catch(() => {})
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
          spirit (its derived spendable balance). */}
      {stats && (
        <p className="level-topline" aria-label={`Level ${stats.level}`}>
          <span className="level-topline-item">
            <span aria-hidden="true">◆</span> Level {stats.level}
          </span>
          {spirit && (
            <span className="level-topline-item">
              <CoinIcon /> {spirit.coins}
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

      {/* The spirit — the home-screen centrepiece (docs/design/spirit.md, ADR-0022). A calm,
          static glowing companion that grows with practice. We fetch it once above (for the coin
          chip) and pass it down, so the companion doesn't fire a second GET /spirit; it waits
          quietly while the prop is still null. */}
      <Spirit spirit={spirit} />

      {/* Quick-access tiles — the primary purpose of the home screen: one tap to start
          a practice. Kept prominent and always visible. */}
      <nav className="feature-tiles" aria-label="Quick access">
        {FEATURE_TILES.map(({ label, emoji, to, tile }) => (
          <Link
            key={to}
            to={to}
            className="feature-tile"
            style={{
              ['--tile-fill' as string]: TILE_COLORS[tile],
              ['--tile-fill-dark' as string]: TILE_COLORS_DARK[tile],
            }}
          >
            <span className="feature-tile-emoji" aria-hidden="true">{emoji}</span>
            <span className="feature-tile-label">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Today's quests — small, tappable chips (emoji + short label), each deep-linking to
          its feature. A quiet "Today's quests" heading with a target motif makes it clear
          these are the day's completable tasks; done quests read muted with a check. Still
          low-chrome: no descriptions, no XP numbers, calm not grindy. */}
      {stats && stats.daily_quests.length > 0 && (
        <section className="quests-compact" aria-labelledby="quests-heading">
          {(() => {
            const doneCount = stats.daily_quests.filter((q) => q.done).length
            return (
              <p className="quests-heading" id="quests-heading">
                <span className="quests-heading-icon" aria-hidden="true">🎯</span>
                <span className="quests-heading-text">Today's quests</span>
                <span className="quests-heading-count">
                  {doneCount}/{stats.daily_quests.length}
                </span>
              </p>
            )
          })()}
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
                    aria-label={`${q.label}${
                      q.target > 1
                        ? ` — ${Math.min(q.progress, q.target)} of ${q.target}`
                        : ''
                    }${q.done ? ' — done' : ''}`}
                  >
                    <span className="quest-chip-emoji" aria-hidden="true">
                      {meta?.emoji ?? '⭐'}
                    </span>
                    <span className="quest-chip-label">{q.label}</span>
                    {/* Multi-step quests (e.g. "Meditate twice", target=2) show a quiet
                        "X/Y" counter so partial progress is visible — single-step quests
                        (target 1) stay clean with just the done check. */}
                    {q.target > 1 && (
                      <span className="quest-chip-progress" aria-hidden="true">
                        {Math.min(q.progress, q.target)}/{q.target}
                      </span>
                    )}
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

      {/* Quiet, always-reachable mood line. If the user already logged a mood today we reflect
          it back calmly — "You felt {mood} {emoji}" with a small colour accent — instead of
          prompting again; otherwise we show the gentle "How do you feel?" prompt. Either way
          it's a plain text link that opens the same mood modal to (re-)log. */}
      {stats && !moodModalOpen && (
        <p className="mood-entry">
          <button
            type="button"
            className={todayMood ? 'mood-entry-link mood-entry-reflect' : 'mood-entry-link'}
            onClick={() => setMoodModalOpen(true)}
            style={
              todayMood
                ? { ['--mood-accent' as string]: MOOD_COLORS[todayMood] }
                : undefined
            }
          >
            {todayMood ? (
              <>
                You felt {MOOD_META[todayMood].label.toLowerCase()}{' '}
                <span aria-hidden="true">{MOOD_META[todayMood].emoji}</span>
              </>
            ) : (
              'How do you feel?'
            )}
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
          Analytics page (alongside the rest of the stats); quests live on the default home
          above (in compact form). */}
      {stats && (
        <section className="dashboard-more">
          {/* Progress detail — the level card and weekly review, shown by default
              (no Show more drawer). */}
          <div id="dashboard-more-panel">
            <LevelCard stats={stats} />

            <WeeklyReview />
          </div>
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
            onLogged={(mood) => {
              // Reflect the just-logged mood on the home line immediately (no reload),
              // then close the modal.
              setTodayMood(mood)
              closeMoodModal()
            }}
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
