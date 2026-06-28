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

// A plain-language criteria line per quest VARIANT — what exactly completes it (and what
// counts vs not), so a terse label like "Breathe for 5+ minutes" isn't ambiguous. Note the
// meditate/breathe split: meditation quests don't count breathing (it has its own), and any
// breathing pattern (incl. alternate-nostril / energizing) counts toward the breathe quests.
const QUEST_DETAIL: Record<string, string> = {
  meditate: 'Any non-breathing meditation, 1 min+',
  long_sit: 'One meditation sit of 10 min+',
  double_sit: 'Two separate meditation sits today',
  breathe: 'Any breathing pattern, 1 min+',
  deep_breathe: '5 min+ of breathing in total today',
  slow_breathe: 'Breathing at 5 breaths/min or slower',
  gratitude: 'One gratitude note',
  gratitude_three: 'Three gratitude notes today',
  journal: 'One journal entry',
  mood_journal: 'A journal entry with a mood set',
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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // The home-screen spirit, fetched once here and shared: it drives both the top-line coin
  // chip (its derived spendable balance) and the <Spirit/> companion below (passed as a prop,
  // so the companion doesn't fire a second GET /spirit). null until loaded / on a quiet failure.
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The home is split into two tabs: "Today" (companion + the single primary action +
  // gentle nudges — the everyday view) and "Progress" (the heavier level/weekly-review
  // retrospective). Defaults to Today so the warm, low-pressure surface leads.
  const [tab, setTab] = useState<'today' | 'progress'>('today')
  // A gentle daily greeting (stable through the day) and a mindful loading line.
  const [greeting] = useState(() => dailyOf(GREETINGS, new Date()))
  const [loadingLine] = useState(() => randomOf(LOADING))
  // First-run "start here" card: track manual dismissal in component state (seeded
  // from localStorage) so dismissing hides it immediately, and it stays hidden across
  // visits. It also auto-retires once the user has logged a few sessions.
  const [firstRunDismissed, setFirstRunDismissed] = useState(() => isFirstRunDismissed())

  // Manual mood check-in: a calm, skippable modal the user opens themselves from the quiet
  // inline mood line. It never auto-opens — logging a mood is always an opt-in action.
  const [moodModalOpen, setMoodModalOpen] = useState(false)

  // The mood the user most recently logged *today* (local calendar day), if any. Drives the
  // home's mood line: when set we reflect "You felt {mood} {emoji}" instead of prompting.
  // null = nothing logged today yet → fall back to the "How do you feel?" prompt.
  const [todayMood, setTodayMood] = useState<Mood | null>(null)

  function closeMoodModal() {
    setMoodModalOpen(false)
  }

  function loadStats() {
    dashboardService
      .getStats()
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, "Couldn't load your stats.")))
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
          tabs. Hidden once dismissed or once they've practiced. */}
      {stats && !firstRunDismissed && shouldShowFirstRun(stats.session_count) && (
        <FirstRunCard onDismiss={() => setFirstRunDismissed(true)} />
      )}

      {/* Two-tab home (mirrors the spirit page's segmented control): "Today" leads with the
          companion + the single primary action + gentle nudges; "Progress" holds the heavier
          level/weekly-review detail. Shown only once stats have loaded. */}
      {stats && (
        <nav className="dashboard-tabs" role="tablist" aria-label="Home sections">
          <button
            type="button"
            role="tab"
            id="dashboard-tab-today"
            aria-selected={tab === 'today'}
            aria-controls="dashboard-panel-today"
            className={`dashboard-tab${tab === 'today' ? ' dashboard-tab--active' : ''}`}
            onClick={() => setTab('today')}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            id="dashboard-tab-progress"
            aria-selected={tab === 'progress'}
            aria-controls="dashboard-panel-progress"
            className={`dashboard-tab${tab === 'progress' ? ' dashboard-tab--active' : ''}`}
            onClick={() => setTab('progress')}
          >
            Progress
          </button>
        </nav>
      )}

      {/* TODAY — the everyday, low-pressure home: a slim coins/streak pill row, the companion
          hero, the single "what do I do now" CTA, then secondary tiles + gentle nudges. */}
      {stats && tab === 'today' && (
        <div role="tabpanel" id="dashboard-panel-today" aria-labelledby="dashboard-tab-today">
          {/* Slim pill row — only coins + streak. The big level badge and XP bar moved off the
              home (XP now lives quietly under the Progress tab), so the everyday view doesn't
              read as a scoreboard. Reuses the HUD pill classes for a consistent look. */}
          {(spirit || stats.current_streak_days > 0) && (
            <div className="dashboard-pills hud-pills">
              {spirit && (
                <span className="hud-pill hud-pill-coins">
                  <CoinIcon /> {spirit.coins}
                </span>
              )}
              {stats.current_streak_days > 0 && (
                <span
                  className="hud-pill hud-pill-streak"
                  aria-label={`${stats.current_streak_days} day streak`}
                >
                  <span aria-hidden="true">🔥</span> {stats.current_streak_days}
                </span>
              )}
            </div>
          )}

          {/* The spirit — the home-screen centrepiece (docs/design/spirit.md, ADR-0022). A calm,
              static glowing companion that grows with practice. We fetch it once above (for the
              coin chip) and pass it down, so the companion doesn't fire a second GET /spirit; it
              waits quietly while the prop is still null. */}
          <Spirit spirit={spirit} />

          {/* The quiet rest-day reassurance, when it applies, so the gentle "skipping one is
              fine" message isn't lost now that the streak is a small pill. */}
          {stats.current_streak_days > 0 && stats.rest_day_used && (
            <p className="quest-streak muted">
              <span aria-hidden="true">🛡️</span> Rest day used — skipping one is fine.
            </p>
          )}

          {/* The single primary action — "what do I do now". Breathing is the hero practice,
              so the one prominent CTA leads there. The four feature tiles below are secondary. */}
          <Link to="/breathe" className="today-action">
            Take a slow minute to breathe →
          </Link>

          {/* Quick-access tiles — secondary now, a quiet row beneath the primary CTA: one tap
              to start any of the practices. */}
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

          {/* Today's nudges — the old daily quests, reframed as a few gentle, optional nudges
              rather than a "X/Y" grind. The completion count + meter are gone; only a soft lead
              line remains. Each chip still deep-links to its feature (QUEST_LINKS) and keeps its
              `.quest-chip` / `.quest-chip-progress` / `.done` classes so existing behaviour holds. */}
          {stats.daily_quests.length > 0 && (
            <section className="quests-compact missions" aria-labelledby="quests-heading">
              <p className="quests-heading" id="quests-heading">
                <span className="quests-heading-icon" aria-hidden="true">🌱</span>
                <span className="quests-heading-text">A nudge or two for today</span>
              </p>
              <ul className="quest-chips">
            {stats.daily_quests.map((q) => {
              const to = QUEST_LINKS[q.key] ?? '/sessions/new'
              const meta = ACTIVITY_META[q.key as Activity]
              const accent = ACTIVITY_COLORS[q.key as Activity]
              const detail = QUEST_DETAIL[q.variant]
              return (
                <li key={q.key}>
                  <Link
                    to={to}
                    className={q.done ? 'quest-chip done' : 'quest-chip'}
                    style={accent ? { ['--activity-accent' as string]: accent } : undefined}
                    aria-label={`${q.label}${detail ? `. ${detail}` : ''}${
                      q.target > 1
                        ? ` — ${Math.min(q.progress, q.target)} of ${q.target}`
                        : ''
                    }${q.xp > 0 ? ` — reward ${q.xp} XP` : ''}${q.done ? ' — done' : ''}`}
                  >
                    <span className="quest-chip-emoji" aria-hidden="true">
                      {meta?.emoji ?? '⭐'}
                    </span>
                    <span className="quest-chip-body">
                      <span className="quest-chip-label">{q.label}</span>
                      {detail && (
                        <span className="quest-chip-detail" aria-hidden="true">
                          {detail}
                        </span>
                      )}
                    </span>
                    <span className="quest-chip-meta">
                      {/* Multi-step quests (e.g. "Meditate twice", target=2) show a quiet
                          "X/Y" counter so partial progress is visible — single-step quests
                          (target 1) stay clean. */}
                      {q.target > 1 && (
                        <span className="quest-chip-progress" aria-hidden="true">
                          {Math.min(q.progress, q.target)}/{q.target}
                        </span>
                      )}
                      {/* Reward chip — the per-quest XP the backend already exposes
                          (DailyQuest.xp). A small badge, not a shouted number. */}
                      {q.xp > 0 && (
                        <span className="quest-chip-reward" aria-hidden="true">
                          +{q.xp}
                        </span>
                      )}
                      {q.done && (
                        <span className="quest-chip-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

          {/* Quiet, always-reachable mood line. If the user already logged a mood today we
              reflect it back calmly — "You felt {mood} {emoji}" with a small colour accent;
              otherwise we show a quiet, optional "Log today's mood" affordance. Either way it's
              a plain text link that opens the mood modal to (re-)log — never auto-opened. */}
          {!moodModalOpen && (
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
                  "Log today's mood"
                )}
              </button>
            </p>
          )}

          {/* Quiet fallback for the no-sessions state — only when the richer first-run card
              isn't on screen (dismissed), so the user never sees two "get started" prompts.
              Kept on the Today view so a brand-new user always has a clear "start here". */}
          {stats.session_count === 0 &&
            (firstRunDismissed || !shouldShowFirstRun(stats.session_count)) && (
              <p className="muted">
                You're just getting started. <Link to="/sessions/new">Log a session</Link> or{' '}
                <Link to="/breathe">breathe</Link> to earn your first coins.
              </p>
            )}
        </div>
      )}

      {/* PROGRESS — the heavier retrospective: the full level detail (XP bar, next unlock) and
          the weekly review, plus a quiet link out to full analytics. One tap away under the
          Progress tab so the everyday Today view stays calm. */}
      {stats && tab === 'progress' && (
        <div
          role="tabpanel"
          id="dashboard-panel-progress"
          aria-labelledby="dashboard-tab-progress"
        >
          <section className="dashboard-more">
            <div id="dashboard-more-panel">
              <LevelCard stats={stats} />

              <WeeklyReview />

              <p className="dashboard-more-link">
                <Link to="/analytics">See full analytics →</Link>
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Manual mood check-in — a calm, skippable modal opened only from the inline mood
          line (never auto-opened). Reuses the MoodCheckin logic/API call; picking a mood
          saves it and closes; "Skip" dismisses without pressure. Escape, focus trap, and
          focus restoration come from <Modal>. */}
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
