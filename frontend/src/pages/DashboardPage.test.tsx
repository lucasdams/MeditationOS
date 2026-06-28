/**
 * Light smoke tests for the DashboardPage.
 * Full integration coverage lives in E2E; these guard the quick-action tiles, the slim
 * coins/streak pills, the companion + single "today's action" CTA + gentle nudges that lead
 * the Today tab, the single-fetch spirit (coins) optimisation, and the Progress tab that holds
 * the heavier level/weekly-review detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getStats = vi.fn()
const getSpirit = vi.fn()
const listMoodLogs = vi.fn()

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

// Capture the props LevelCard receives.
const capturedLevelCardProps: Array<Record<string, unknown>> = []

vi.mock('../components/LevelCard', () => ({
  default: (props: Record<string, unknown>) => {
    capturedLevelCardProps.push(props)
    return <div data-testid="level-card" />
  },
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
import type { DashboardStats, SpiritState } from '../types'

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

// Stats-loaded anchor: the home tab bar (Today / Progress) renders only once stats resolve.
// The level/XP no longer live on the Today tab, so we wait on the Today tab instead.
const findLoaded = () => screen.findByRole('tab', { name: /today/i })

// The level detail + weekly review live on the Progress tab now; switch to it before asserting.
async function gotoProgress() {
  fireEvent.click(await screen.findByRole('tab', { name: /progress/i }))
}

beforeEach(() => {
  localStorage.clear()
  getStats.mockReset()
  getSpirit.mockReset()
  listMoodLogs.mockReset()
  // Default: no mood logged today → the home shows the "How do you feel?" prompt.
  listMoodLogs.mockResolvedValue([])
  capturedLevelCardProps.length = 0
})
afterEach(cleanup)

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

describe('DashboardPage — Today tab (calm default view)', () => {
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

  it('keeps the page title above the tabs', async () => {
    renderPage()
    await findLoaded()

    const heading = screen.getByRole('heading', { name: /your practice/i, level: 1 })
    const tablist = screen.getByRole('tablist', { name: /home sections/i })
    // The title precedes the tab bar in document order.
    expect(
      heading.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows the feature tiles and a quiet "Log today\'s mood" entry point by default', async () => {
    renderPage()
    await findLoaded()
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
    // The mood check-in is a quiet, optional entry-point link — never an auto-popped modal.
    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
  })

  it('leads with the single "today\'s action" CTA linking to /breathe', async () => {
    renderPage()
    await findLoaded()

    // One prominent primary action (breathing is the hero practice).
    const cta = screen.getByRole('link', { name: /take a slow minute to breathe/i })
    expect(cta).toHaveAttribute('href', '/breathe')
    expect(cta).toHaveClass('today-action')
  })

  it('shows the day\'s quests as gentle nudges with no "Daily missions X/Y" count or meter', async () => {
    renderPage()
    await findLoaded()

    // The grindy "Daily missions" count + completion meter are gone, replaced by a soft lead.
    expect(screen.queryByText('0/1')).not.toBeInTheDocument()
    expect(document.querySelector('.missions-meter')).toBeNull()
    const questsSection = screen.getByRole('region', { name: /a nudge or two for today/i })
    expect(questsSection).toBeInTheDocument()
    // The quest chips + their deep links are unchanged.
    expect(
      within(questsSection).getByRole('link', { name: /meditate/i }),
    ).toHaveAttribute('href', '/meditate')

    // The spirit is the home-screen centrepiece, rendered on the Today tab.
    expect(screen.getByTestId('spirit')).toBeInTheDocument()
  })

  it('keeps the level card and weekly review off the Today tab (they live under Progress)', async () => {
    renderPage()
    await findLoaded()

    // Today stays calm: the heavier progress detail is one tab away, not on the default view.
    expect(screen.queryByTestId('level-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument()
  })
})

describe('DashboardPage — Progress tab', () => {
  beforeEach(() => {
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getSpirit.mockResolvedValue(fakeSpirit)
  })

  it('reveals the level card + weekly review when the Progress tab is clicked', async () => {
    renderPage()
    await findLoaded()

    // The detail isn't on the default Today view…
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()

    await gotoProgress()

    // …but appears once the Progress tab is selected.
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(screen.getByTestId('weekly-review')).toBeInTheDocument()
    // Plus a quiet link out to the full analytics page.
    expect(screen.getByRole('link', { name: /see full analytics/i })).toHaveAttribute(
      'href',
      '/analytics',
    )
  })

  it('does not render the activity calendar or the totals stat cards under Progress', async () => {
    renderPage()
    await findLoaded()
    await gotoProgress()

    // The level card shows; the activity calendar / totals moved to the Analytics page.
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
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

    const questsSection = screen.getByRole('region', { name: /a nudge or two for today/i })

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

    const questsSection = screen.getByRole('region', { name: /a nudge or two for today/i })
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

    // The coin pill on the Today tab reflects the spirit's derived coin balance.
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())

    // Exactly one fetch — not two.
    expect(getSpirit).toHaveBeenCalledTimes(1)

    // LevelCard renders under the Progress tab (no longer takes a scene prop).
    await gotoProgress()
    await waitFor(() => expect(capturedLevelCardProps.length).toBeGreaterThan(0))
    expect(capturedLevelCardProps.at(-1)).not.toHaveProperty('scene')
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
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()
  })

  it('opens the modal when the inline mood line is clicked', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))

    // The modal (containing the mood check-in) and its Skip affordance are on screen.
    expect(await screen.findByRole('dialog', { name: /how are you arriving/i })).toBeInTheDocument()
    expect(screen.getByTestId('mood-checkin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  it('closes the modal when a mood is picked', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await findLoaded()

    fireEvent.click(screen.getByRole('button', { name: /log today's mood/i }))
    await screen.findByRole('dialog', { name: /how are you arriving/i })

    // The mock check-in fires onLogged when its button is clicked.
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-mood/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument(),
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
      expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument(),
    )
    // Still no auto-reopen; the inline prompt remains for an opt-in retry.
    expect(screen.getByRole('button', { name: /log today's mood/i })).toBeInTheDocument()
  })

  it('does not auto-open the modal for a brand-new user with the first-run card', async () => {
    getStats.mockResolvedValue({ ...fakeStats, session_count: 0 } as unknown as DashboardStats)
    renderPage()
    await findLoaded()

    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()
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
