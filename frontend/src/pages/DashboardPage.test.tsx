/**
 * Light smoke tests for the DashboardPage.
 * Full integration coverage lives in E2E; these guard the quick-action tiles, the slim
 * coins/streak pills, the companion + single "today's action" CTA + gentle nudges that lead
 * the calm single-view home, the single-fetch spirit (coins) optimisation, and the quiet
 * "this week" glance inlined at the foot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getStats = vi.fn()
const getSpirit = vi.fn()
const listMoodLogs = vi.fn()
const listPaths = vi.fn()

// Mock heavy dashboard dependencies so the component renders without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: (...a: unknown[]) => getStats(...a),
  },
}))
vi.mock('../services/spirit', () => ({
  spiritService: { get: (...a: unknown[]) => getSpirit(...a) },
}))
// Mock the mood-logs service: the home reads the single most recent mood log to decide
// whether to reflect "You felt X" or show the "How do you feel?" prompt.
vi.mock('../services/moodLogs', () => ({
  moodLogService: { list: (...a: unknown[]) => listMoodLogs(...a) },
}))
// The Today CTA is path-aware: the dashboard fetches the user's paths to decide whether to show
// the current-day CTA or the generic breathe CTA. Mock it so non-path tests are unaffected
// (default: no enrolled path → the breathe CTA leads).
vi.mock('../services/paths', () => ({
  pathsService: { list: (...a: unknown[]) => listPaths(...a) },
}))

// The spirit is the home-screen centrepiece (docs/design/spirit.md, ADR-0022). It self-fetches
// its state; mock it to a marker so the dashboard test stays backend-free and can assert the
// spirit renders on the home (its own art/states are covered in Spirit.test.tsx).
vi.mock('../components/Spirit', () => ({
  default: () => <div data-testid="spirit" />,
}))
// Mock MoodCheckin: render a marker plus a "pick" button that fires onLogged, so tests
// can exercise the "picking a mood closes the modal" path without the real API call.
vi.mock('../components/MoodCheckin', () => ({
  default: ({ onLogged }: { onLogged?: (m: string) => void }) => (
    <div data-testid="mood-checkin">
      <button type="button" onClick={() => onLogged?.('calm')}>
        mock-pick-mood
      </button>
    </div>
  ),
}))
vi.mock('../components/WeeklyReview', () => ({
  default: () => <div data-testid="weekly-review" />,
}))

import DashboardPage from './DashboardPage'
import { localDateKey } from '../lib/zen'
import type { DashboardStats, PathSummary, SpiritState } from '../types'

// The once-per-day mood prompt is keyed by the local date. Helpers to read/seed that gate.
const moodPromptKey = () => `mood.prompted.${localDateKey()}`
const seenMoodToday = () => localStorage.setItem(moodPromptKey(), '1')

const fakeStats = {
  total_seconds: 3600,
  session_count: 5,
  gratitude_count: 2,
  current_streak_days: 3,
  longest_streak_days: 4,
  rest_day_used: false,
  daily_quests: [
    { key: 'meditate', label: 'Meditate', progress: 0, target: 1, done: false, xp: 10 },
  ],
  xp: 120,
  level: 7,
  xp_into_level: 20,
  xp_for_next_level: 100,
  coins: 0,
  streak_bonus_xp: 0,
} as unknown as DashboardStats

// The dashboard only reads `coins` from the spirit for the home top-line chip; the rest of
// SpiritState is irrelevant here, so cast a minimal coins-only fake.
const fakeSpirit = { coins: 142 } as unknown as SpiritState

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

// Stats-loaded anchor: the quick-access tiles nav renders only once stats resolve, so waiting
// on it reliably means the home's data-dependent content is on screen. (There are no tabs.)
const findLoaded = () => screen.findByRole('navigation', { name: /quick access/i })

beforeEach(() => {
  localStorage.clear()
  getStats.mockReset()
  getSpirit.mockReset()
  listMoodLogs.mockReset()
  listPaths.mockReset()
  // Default: no mood logged today → the home shows the "How do you feel?" prompt.
  listMoodLogs.mockResolvedValue([])
  // Default: not enrolled in any path → the recommended-practice CTA leads.
  listPaths.mockResolvedValue({ paths: [] })
  // Pin the clock to the afternoon so the time-of-day recommendation is deterministic — the
  // afternoon default is the app's long-standing "take a slow minute to breathe" invite, which
  // the non-path CTA tests assert. (Only getHours is stubbed, so timers/waitFor stay real.)
  vi.spyOn(Date.prototype, 'getHours').mockReturnValue(14)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DashboardPage — quick-action feature tiles', () => {
  // The tiles now live on the Today tab, which renders once stats load — so resolve stats
  // and wait for the tab before asserting on them.
  beforeEach(() => {
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
    seenMoodToday()
    renderPage()
  })

  it('renders a nav landmark for quick access', async () => {
    await findLoaded()
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
  })

  const tiles = [
    { label: 'Meditate', href: '/meditate' },
    { label: 'Breathe',  href: '/breathe'  },
    { label: 'Gratitude',href: '/gratitude' },
    { label: 'Journal',  href: '/journal'   },
  ]

  tiles.forEach(({ label, href }) => {
    it(`renders a "${label}" tile linking to ${href}`, async () => {
      await findLoaded()
      const nav = screen.getByRole('navigation', { name: /quick access/i })
      const link = within(nav).getByRole('link', { name: new RegExp(label, 'i') })
      expect(link).toHaveAttribute('href', href)
    })
  })
})

describe('DashboardPage — home (calm default view)', () => {
  beforeEach(() => {
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('shows the slim coins + streak pills on the Today tab once stats and spirit load', async () => {
    renderPage()
    await findLoaded()
    // Coins come from the spirit; the streak reads as a quiet 🔥 pill. No level/XP scoreboard.
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())
    expect(screen.getByLabelText(/3 day streak/i)).toBeInTheDocument()
  })

  it('quiets the XP: no level badge or XP bar on the Today tab', async () => {
    renderPage()
    await findLoaded()

    // The home no longer carries the big level topline / XP bar — that detail moved to Progress.
    expect(document.querySelector('.level-topline')).toBeNull()
    expect(screen.queryByRole('progressbar', { name: /xp to next level/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Level 7/)).not.toBeInTheDocument()
  })

  it('shows the page title at the top and has no tab bar', async () => {
    renderPage()
    await findLoaded()

    const heading = screen.getByRole('heading', { name: /your practice/i, level: 1 })
    const nav = screen.getByRole('navigation', { name: /quick access/i })
    // The title precedes the home content in document order…
    expect(
      heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // …and the old Today/Progress segmented control is gone.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('shows the feature tiles and a quiet "Log today\'s mood" entry point by default', async () => {
    renderPage()
    await findLoaded()
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
    // The mood check-in is a quiet, optional entry-point link — never an auto-popped modal.
    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
  })

  it('leads with the single "today\'s action" CTA linking to /breathe when not enrolled in a path', async () => {
    renderPage()
    await findLoaded()

    // One prominent primary action (breathing is the hero practice).
    const cta = screen.getByRole('link', { name: /take a slow minute to breathe/i })
    expect(cta).toHaveAttribute('href', '/breathe')
    expect(cta).toHaveClass('today-action')

    // …plus the gentle secondary invite into Paths.
    expect(screen.getByRole('link', { name: /try a guided path/i })).toHaveAttribute(
      'href',
      '/paths',
    )
  })

  it('shows the day\'s quests as gentle nudges with no "Daily missions X/Y" count or meter', async () => {
    renderPage()
    await findLoaded()

    // The grindy "Daily missions" count + completion meter are gone, replaced by a soft lead.
    expect(screen.queryByText('0/1')).not.toBeInTheDocument()
    expect(document.querySelector('.missions-meter')).toBeNull()
    const questsSection = screen.getByRole('region', { name: /today.s nudges/i })
    expect(questsSection).toBeInTheDocument()
    // The quest chips + their deep links are unchanged.
    expect(
      within(questsSection).getByRole('link', { name: /meditate/i }),
    ).toHaveAttribute('href', '/meditate')

    // The spirit is the home-screen centrepiece, rendered on the Today tab.
    expect(screen.getByTestId('spirit')).toBeInTheDocument()
  })

  it('drops the level/XP card entirely and inlines the weekly review at the foot', async () => {
    renderPage()
    await findLoaded()

    // The level/XP scoreboard is no longer on the home at all — it lives on the Analytics page.
    expect(screen.queryByTestId('level-card')).not.toBeInTheDocument()
    // The quiet "this week" glance is inlined once there's practice to summarise (session_count 5),
    // with a link out to full analytics.
    expect(await screen.findByTestId('weekly-review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see full analytics/i })).toHaveAttribute(
      'href',
      '/analytics',
    )
  })
})

describe('DashboardPage — path-aware Today CTA', () => {
  beforeEach(() => {
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  // An enrolled, unfinished path whose current day (Day 3) is a 3-min breathe → guided 180s.
  const enrolledPath = {
    id: 'first-7',
    title: 'Your First 7 Days',
    blurb: '',
    total_days: 7,
    enrolled: true,
    started_on: '2026-06-25',
    current_day: 3,
    completed: false,
    completed_days: 2,
    days: [
      { index: 1, title: 'a', practice: 'breathe', min_minutes: 1, cue: '', status: 'done' },
      { index: 2, title: 'b', practice: 'breathe', min_minutes: 2, cue: '', status: 'done' },
      {
        index: 3,
        title: 'Shoulders drop',
        practice: 'breathe',
        min_minutes: 3,
        cue: 'drop your shoulders',
        status: 'current',
      },
      { index: 4, title: 'd', practice: 'meditate', min_minutes: 3, cue: '', status: 'locked' },
    ],
  } as unknown as PathSummary

  it('shows the current-day CTA (label + practice href) when enrolled in an unfinished path', async () => {
    listPaths.mockResolvedValue({ paths: [enrolledPath] })
    renderPage()
    await findLoaded()

    // "Day 3 · Shoulders drop →" launching the day's guided breathe (3 min → 180s).
    const cta = await screen.findByRole('link', { name: /day 3 · shoulders drop/i })
    expect(cta).toHaveAttribute('href', '/breathe?guided=1&duration=180')
    expect(cta).toHaveClass('today-action')

    // The generic breathe CTA + the "ease in with a guided path" invite are replaced by the path CTA.
    expect(
      screen.queryByRole('link', { name: /take a slow minute to breathe/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /try a guided path/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps the generic breathe CTA + Paths invite when not enrolled in any path', async () => {
    listPaths.mockResolvedValue({ paths: [{ ...enrolledPath, enrolled: false }] })
    renderPage()
    await findLoaded()

    expect(
      await screen.findByRole('link', { name: /take a slow minute to breathe/i }),
    ).toHaveAttribute('href', '/breathe')
    expect(screen.getByRole('link', { name: /try a guided path/i })).toHaveAttribute(
      'href',
      '/paths',
    )
  })

  it('falls back to the breathe CTA when the enrolled path is already completed', async () => {
    listPaths.mockResolvedValue({ paths: [{ ...enrolledPath, completed: true }] })
    renderPage()
    await findLoaded()

    // A finished path no longer drives the CTA — the calm everyday breathe action returns.
    expect(
      await screen.findByRole('link', { name: /take a slow minute to breathe/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /day 3 · shoulders drop/i })).not.toBeInTheDocument()
  })
})

describe('DashboardPage — "this week" glance (inline, no tabs)', () => {
  beforeEach(() => {
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('inlines the weekly review + a link to full analytics once there is practice to summarise', async () => {
    renderPage()
    await findLoaded()

    // No tabs any more — the weekly review sits inline at the foot of the single-view home.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(await screen.findByTestId('weekly-review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see full analytics/i })).toHaveAttribute(
      'href',
      '/analytics',
    )
  })

  it('hides the weekly glance for a brand-new user with no sessions', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 0 } as unknown as DashboardStats)
    renderPage()
    await findLoaded()

    // Nothing to summarise yet → the foot stays quiet (no weekly review, no analytics link).
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /see full analytics/i })).not.toBeInTheDocument()
  })

  it('does not render the activity calendar or the totals stat cards on the home', async () => {
    renderPage()
    await findLoaded()

    // The heavier analytics visuals (calendar / totals) live on the Analytics page, not the home.
    expect(document.querySelector('.calendar')).toBeNull()
    expect(document.querySelector('.stat-cards')).toBeNull()
    expect(screen.queryByText(/total practice/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/gratitude moments/i)).not.toBeInTheDocument()
  })
})

describe('DashboardPage — multi-step quest progress counter', () => {
  beforeEach(() => {
    seenMoodToday()
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('shows an "X/Y" counter on multi-step quests and none on single-step quests', async () => {
    // A target>1 quest at progress 1 reads "1/2"; a target=1 quest shows no counter.
    getStats.mockResolvedValue({
      ...fakeStats,
      daily_quests: [
        { key: 'meditate', label: 'Meditate twice', progress: 1, target: 2, done: false, xp: 10 },
        { key: 'journal', label: 'Write a journal', progress: 0, target: 1, done: false, xp: 10 },
      ],
    } as unknown as DashboardStats)
    renderPage()
    await findLoaded()

    const questsSection = screen.getByRole('region', { name: /today.s nudges/i })

    // The multi-step quest shows its partial progress as "1/2".
    expect(within(questsSection).getByText('1/2')).toBeInTheDocument()

    // The single-step quest's chip carries no counter pill.
    const singleStep = within(questsSection).getByRole('link', { name: /write a journal/i })
    expect(singleStep.querySelector('.quest-chip-progress')).toBeNull()
  })

  it('reads as done when a multi-step quest reaches its target', async () => {
    getStats.mockResolvedValue({
      ...fakeStats,
      daily_quests: [
        { key: 'gratitude', label: 'Write three gratitudes', progress: 3, target: 3, done: true, xp: 10 },
      ],
    } as unknown as DashboardStats)
    renderPage()
    await findLoaded()

    const questsSection = screen.getByRole('region', { name: /today.s nudges/i })
    const chip = within(questsSection).getByRole('link', { name: /write three gratitudes/i })
    // Full progress shows "3/3" and the chip carries the done state (muted + check).
    expect(within(questsSection).getByText('3/3')).toBeInTheDocument()
    expect(chip).toHaveClass('done')
  })
})

describe('DashboardPage — today\'s mood reflection', () => {
  beforeEach(() => {
    // Don't let the on-open modal interfere with the home mood-line assertions.
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('reflects "You felt {mood}" when a mood was logged today', async () => {
    listMoodLogs.mockResolvedValue([
      { id: 'm1', mood: 'calm', created_at: new Date().toISOString() },
    ])
    renderPage()
    await findLoaded()

    // The reflection replaces the prompt; it's still a tappable button (opens the modal).
    const line = await screen.findByRole('button', { name: /you felt calm/i })
    expect(line).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log today's mood/i })).not.toBeInTheDocument()
  })

  it('falls back to the "Log today\'s mood" prompt when nothing was logged today', async () => {
    // A mood log exists but it's from yesterday → not "today", so we still prompt.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    listMoodLogs.mockResolvedValue([{ id: 'm0', mood: 'low', created_at: yesterday }])
    renderPage()
    await findLoaded()

    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /you felt/i })).not.toBeInTheDocument()
  })

  it('updates the line to the new mood immediately after logging in the modal', async () => {
    // No mood today → prompt shows; opening the modal and picking a mood reflects it at once.
    listMoodLogs.mockResolvedValue([])
    renderPage()
    await findLoaded()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))
    // The mock check-in fires onLogged('calm').
    fireEvent.click(await screen.findByRole('button', { name: /mock-pick-mood/i }))

    // Modal closes and the home line now reflects the just-logged mood — no reload.
    expect(await screen.findByRole('button', { name: /you felt calm/i })).toBeInTheDocument()
  })
})

describe('DashboardPage — spirit (coins) single-fetch', () => {
  it('calls the spirit fetch exactly once and shows its coin balance in the pill row', async () => {
    seenMoodToday()
    getSpirit.mockResolvedValue(fakeSpirit)
    getStats.mockResolvedValue(fakeStats)

    renderPage()
    await findLoaded()

    // The coin pill reflects the spirit's derived coin balance.
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())

    // Exactly one fetch — not two.
    expect(getSpirit).toHaveBeenCalledTimes(1)
  })
})

describe('DashboardPage — manual mood check-in (no auto-open)', () => {
  beforeEach(() => {
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('does NOT auto-open the mood modal on load', async () => {
    // No prior-prompt seeding — the modal must still stay closed; it never auto-pops now.
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())

    // The quiet inline mood line is present, but the modal is not auto-opened.
    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /how are you feeling/i })).not.toBeInTheDocument()
  })

  it('opens the modal when the inline mood line is clicked', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()
    expect(screen.queryByRole('dialog', { name: /how are you feeling/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))

    // The modal (containing the mood check-in) and its Skip affordance are on screen.
    expect(await screen.findByRole('dialog', { name: /how are you feeling/i })).toBeInTheDocument()
    expect(screen.getByTestId('mood-checkin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  it('closes the modal when a mood is picked', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))
    await screen.findByRole('dialog', { name: /how are you feeling/i })

    // The mock check-in fires onLogged when its button is clicked.
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-mood/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /how are you feeling/i })).not.toBeInTheDocument(),
    )
    // The just-logged mood is reflected on the inline line.
    expect(await screen.findByRole('button', { name: /you felt calm/i })).toBeInTheDocument()
  })

  it('closes the modal on Skip without re-opening', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))
    fireEvent.click(await screen.findByRole('button', { name: /skip for now/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /how are you feeling/i })).not.toBeInTheDocument(),
    )
    // Still no auto-reopen; the inline prompt remains for an opt-in retry.
    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
  })

  it('does not auto-open the modal for a brand-new user with the first-run card', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 0 } as unknown as DashboardStats)
    renderPage()
    await findLoaded()

    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /how are you feeling/i })).not.toBeInTheDocument()
  })
})

// First-run / hatch de-conflict (onboarding §5): a just-onboarded, still-pathless user (first
// sit done, no companion chosen) shouldn't see BOTH the first-run card and the companion's warm
// hatch invite. The first-run card stands down so the hatch leads.
describe('DashboardPage — first-run vs hatch de-conflict', () => {
  const pathlessSpirit = { coins: 0, path: null } as unknown as SpiritState

  it('hides the first-run card for a pathless user who has logged their first sit', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 1 } as unknown as DashboardStats)
    getSpirit.mockResolvedValue(pathlessSpirit)
    renderPage()
    await findLoaded()
    // The hatch invite (in the real <Spirit>) leads; the first-run card stands down.
    expect(screen.queryByRole('region', { name: /getting started/i })).toBeNull()
  })

  it('still shows the first-run card before the first sit (session_count 0)', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 0 } as unknown as DashboardStats)
    getSpirit.mockResolvedValue(pathlessSpirit)
    renderPage()
    await findLoaded()
    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
  })

  it('still shows the first-run card when the user has already chosen a companion', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 1 } as unknown as DashboardStats)
    getSpirit.mockResolvedValue({ coins: 0, path: 'stillness' } as unknown as SpiritState)
    renderPage()
    await findLoaded()
    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
  })
})
