/**
 * Light smoke tests for the DashboardPage.
 * Full integration coverage lives in E2E; these guard the quick-action tiles,
 * the level + coins top line, the compact quests + read-only garden preview that sit on the
 * calm default home, the single-fetch sanctuary scene optimisation, and the
 * default-collapsed "Show more" drawer that holds the heavier progress detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getStats = vi.fn()
const getScene = vi.fn()
const listMoodLogs = vi.fn()

// Mock heavy dashboard dependencies so the component renders without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: (...a: unknown[]) => getStats(...a),
  },
}))
vi.mock('../services/sanctuary', () => ({
  sanctuaryService: { getScene: (...a: unknown[]) => getScene(...a) },
}))
// Mock the mood-logs service: the home reads the single most recent mood log to decide
// whether to reflect "You felt X" or show the "How do you feel?" prompt.
vi.mock('../services/moodLogs', () => ({
  moodLogService: { list: (...a: unknown[]) => listMoodLogs(...a) },
}))

// Capture the props each child receives so we can assert the scene is passed down.
const capturedLevelCardProps: Array<Record<string, unknown>> = []
const capturedSanctuarySceneProps: Array<Record<string, unknown>> = []

vi.mock('../components/LevelCard', () => ({
  default: (props: Record<string, unknown>) => {
    capturedLevelCardProps.push(props)
    return <div data-testid="level-card" />
  },
}))
vi.mock('../components/SanctuaryScene', () => ({
  default: (props: Record<string, unknown>) => {
    capturedSanctuarySceneProps.push(props)
    return <div data-testid="sanctuary-scene" />
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
import type { DashboardStats, SanctuaryScene } from '../types'

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

const fakeScene: SanctuaryScene = {
  coins: 142,
  level: 7,
  owned: [],
  shop: [],
  vitality: 'thriving',
  current_streak: 3,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  getStats.mockReset()
  getScene.mockReset()
  listMoodLogs.mockReset()
  // Default: no mood logged today → the home shows the "How do you feel?" prompt.
  listMoodLogs.mockResolvedValue([])
  capturedLevelCardProps.length = 0
  capturedSanctuarySceneProps.length = 0
})
afterEach(cleanup)

describe('DashboardPage — quick-action feature tiles', () => {
  beforeEach(() => {
    getStats.mockReturnValue(new Promise(() => {})) // loading forever for tile tests
    getScene.mockReturnValue(new Promise(() => {})) // pending forever
    renderPage()
  })

  it('renders a nav landmark for quick access', () => {
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
  })

  const tiles = [
    { label: 'Meditate', href: '/meditate' },
    { label: 'Breathe',  href: '/breathe'  },
    { label: 'Gratitude',href: '/gratitude' },
    { label: 'Journal',  href: '/journal'   },
  ]

  tiles.forEach(({ label, href }) => {
    it(`renders a "${label}" tile linking to ${href}`, () => {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(link).toHaveAttribute('href', href)
    })
  })
})

describe('DashboardPage — default (collapsed) calm view', () => {
  beforeEach(() => {
    // Mark the mood prompt as already shown today so the on-open modal doesn't pop and
    // interfere with the calm-home assertions (its own gating is tested separately).
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getScene.mockResolvedValue(fakeScene)
  })

  it('shows the level + coins top line once stats and scene load', async () => {
    renderPage()
    expect(await screen.findByText(/Level 7/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())
  })

  it('pins the level + coins line to the very top of the home, above the page title', async () => {
    renderPage()
    const main = await screen.findByRole('main')
    await screen.findByText(/Level 7/)
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())

    // The level/coins line is the first element in <main> — ahead of the "Your practice"
    // heading and everything else (including any first-run card).
    const topline = main.querySelector('.level-topline')
    expect(topline).not.toBeNull()
    expect(main.firstElementChild).toBe(topline)

    const heading = screen.getByRole('heading', { name: /your practice/i, level: 1 })
    // The top line precedes the <h1> in document order.
    expect(
      topline!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows the feature tiles and a quiet "How do you feel?" entry point by default', async () => {
    renderPage()
    await screen.findByText(/Level 7/)
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
    // The mood check-in is no longer an inline section — only a quiet entry-point link.
    expect(screen.getByRole('button', { name: /how do you feel/i })).toBeInTheDocument()
  })

  it('shows the day\'s quests under a clear "Today\'s quests" heading, no "Today you could…" lead', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The old imperative lead is gone, replaced by a clear quest heading.
    expect(screen.queryByText(/Today you could/i)).not.toBeInTheDocument()
    const questsSection = screen.getByRole('region', { name: /today's quests/i })
    expect(questsSection).toBeInTheDocument()
    // A visible "Today's quests" heading + a done/total count make the chips read as quests.
    expect(within(questsSection).getByText(/today's quests/i)).toBeInTheDocument()
    expect(within(questsSection).getByText('0/1')).toBeInTheDocument()
    expect(
      within(questsSection).getByRole('link', { name: /meditate/i }),
    ).toHaveAttribute('href', '/meditate')

    // The garden no longer renders on the home screen — it lives at /sanctuary, reached from
    // the top nav. The dashboard should not render the inline garden preview.
    expect(screen.queryByTestId('sanctuary-scene')).not.toBeInTheDocument()

    // The spirit is the new home centrepiece, rendered on the default calm home.
    expect(screen.getByTestId('spirit')).toBeInTheDocument()
  })

  it('keeps the full level card and weekly review collapsed', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The heavier progress surfaces are not rendered until the drawer is opened.
    expect(screen.queryByTestId('level-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()

    // The toggle announces a collapsed state and points at the controlled panel — and is
    // still a real, link-styled button (aria-expanded/aria-controls intact).
    const toggle = screen.getByRole('button', { name: /show more/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'dashboard-more-panel')
  })

  it('does not render the activity calendar or the totals stat cards on the home', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The activity calendar moved to Analytics; open the drawer to confirm it isn't there either.
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(document.querySelector('.calendar')).toBeNull()
    expect(document.querySelector('.stat-cards')).toBeNull()
    // The home no longer shows the "Total practice" / "Gratitude moments" totals.
    expect(screen.queryByText(/total practice/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/gratitude moments/i)).not.toBeInTheDocument()
  })
})

describe('DashboardPage — multi-step quest progress counter', () => {
  beforeEach(() => {
    seenMoodToday()
    getScene.mockResolvedValue(fakeScene)
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
    await screen.findByText(/Level 7/)

    const questsSection = screen.getByRole('region', { name: /today's quests/i })

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
    await screen.findByText(/Level 7/)

    const questsSection = screen.getByRole('region', { name: /today's quests/i })
    const chip = within(questsSection).getByRole('link', { name: /write three gratitudes/i })
    // Full progress shows "3/3" and the chip carries the done state (muted + check).
    expect(within(questsSection).getByText('3/3')).toBeInTheDocument()
    expect(chip).toHaveClass('done')
  })
})

describe('DashboardPage — expanding the "Show more" drawer', () => {
  beforeEach(() => {
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getScene.mockResolvedValue(fakeScene)
  })

  it('reveals the heavier progress sections when opened', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    const toggle = screen.getByRole('button', { name: /show more/i })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(screen.getByTestId('weekly-review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()
  })

  it('always loads collapsed by default — even if an old persisted "open" flag exists', async () => {
    // The owner wants the drawer hidden on every load. Even a stale `dashboard.showMore=1`
    // from a previous build must NOT auto-open it; the user presses "Show more" to reveal.
    localStorage.setItem('dashboard.showMore', '1')
    renderPage()
    await screen.findByText(/Level 7/)

    expect(screen.queryByTestId('level-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show more/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

describe('DashboardPage — today\'s mood reflection', () => {
  beforeEach(() => {
    // Don't let the on-open modal interfere with the home mood-line assertions.
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getScene.mockResolvedValue(fakeScene)
  })

  it('reflects "You felt {mood}" when a mood was logged today', async () => {
    listMoodLogs.mockResolvedValue([
      { id: 'm1', mood: 'calm', created_at: new Date().toISOString() },
    ])
    renderPage()
    await screen.findByText(/Level 7/)

    // The reflection replaces the prompt; it's still a tappable button (opens the modal).
    const line = await screen.findByRole('button', { name: /you felt calm/i })
    expect(line).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /how do you feel/i })).not.toBeInTheDocument()
  })

  it('falls back to the "How do you feel?" prompt when nothing was logged today', async () => {
    // A mood log exists but it's from yesterday → not "today", so we still prompt.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    listMoodLogs.mockResolvedValue([{ id: 'm0', mood: 'low', created_at: yesterday }])
    renderPage()
    await screen.findByText(/Level 7/)

    expect(screen.getByRole('button', { name: /how do you feel/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /you felt/i })).not.toBeInTheDocument()
  })

  it('updates the line to the new mood immediately after logging in the modal', async () => {
    // No mood today → prompt shows; opening the modal and picking a mood reflects it at once.
    listMoodLogs.mockResolvedValue([])
    renderPage()
    await screen.findByText(/Level 7/)

    fireEvent.click(screen.getByRole('button', { name: /how do you feel/i }))
    // The mock check-in fires onLogged('calm').
    fireEvent.click(await screen.findByRole('button', { name: /mock-pick-mood/i }))

    // Modal closes and the home line now reflects the just-logged mood — no reload.
    expect(await screen.findByRole('button', { name: /you felt calm/i })).toBeInTheDocument()
  })
})

describe('DashboardPage — sanctuary scene single-fetch', () => {
  it('calls getScene exactly once and passes the scene to the coin chip and LevelCard', async () => {
    seenMoodToday()
    getScene.mockResolvedValue(fakeScene)
    getStats.mockResolvedValue(fakeStats)

    renderPage()
    await screen.findByText(/Level 7/)

    // The coin chip in the level header reflects the fetched scene's coin balance.
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())

    // LevelCard lives in the (default-collapsed) drawer — open it so it renders and we can
    // assert the same scene reaches it.
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))

    // Exactly one call — not two.
    expect(getScene).toHaveBeenCalledTimes(1)

    // LevelCard (rendered inside the open drawer) received the same scene.
    await waitFor(() => {
      const lcLast = capturedLevelCardProps.at(-1)
      expect(lcLast?.scene).toEqual(fakeScene)
    })
  })
})

describe('DashboardPage — on-open mood check-in (once per day)', () => {
  beforeEach(() => {
    getScene.mockResolvedValue(fakeScene)
  })

  it('shows the mood modal on the first open of the day', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await screen.findByText(/Level 7/)

    // The modal (containing the mood check-in) and its Skip affordance are on screen.
    expect(await screen.findByRole('dialog', { name: /how are you arriving/i })).toBeInTheDocument()
    expect(screen.getByTestId('mood-checkin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  it('does not show the modal again the same day after it was dismissed', async () => {
    getStats.mockResolvedValue(fakeStats)
    const { unmount } = renderPage()
    await screen.findByText(/Level 7/)

    // Skip dismisses the modal and records today's prompt.
    fireEvent.click(await screen.findByRole('button', { name: /skip for now/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(moodPromptKey())).toBe('1')

    // A fresh landing on the home the same day (remount) does not re-pop the modal.
    unmount()
    renderPage()
    await screen.findByText(/Level 7/)
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()
  })

  it('closes the modal and records the day when a mood is picked', async () => {
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await screen.findByRole('dialog', { name: /how are you arriving/i })

    // The mock check-in fires onLogged when its button is clicked.
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-mood/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(moodPromptKey())).toBe('1')
  })

  it('does not stack the modal on a brand-new user who still sees the first-run card', async () => {
    // session_count 0 and first-run not dismissed → the first-run card leads the page, so
    // the mood prompt waits for a later day rather than stacking on top of it.
    getStats.mockResolvedValue({ ...fakeStats, session_count: 0 } as unknown as DashboardStats)
    renderPage()
    await screen.findByText(/Level 7/)

    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()
  })

  it('reopens the modal from the quiet "How do you feel?" entry point after a skip', async () => {
    seenMoodToday() // already prompted today → no auto-open
    getStats.mockResolvedValue(fakeStats)
    renderPage()
    await screen.findByText(/Level 7/)
    expect(screen.queryByRole('dialog', { name: /how are you arriving/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /how do you feel/i }))
    expect(await screen.findByRole('dialog', { name: /how are you arriving/i })).toBeInTheDocument()
  })
})
