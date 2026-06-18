/**
 * Light smoke tests for the DashboardPage.
 * Full integration coverage lives in E2E; these guard the quick-action tiles,
 * the slim level chip, the compact quests + sanctuary teaser that sit on the calm
 * default home, the single-fetch sanctuary scene optimisation, and the
 * default-collapsed "Show more" drawer that holds the heavier progress detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getStats = vi.fn()
const getScene = vi.fn()

// Mock heavy dashboard dependencies so the component renders without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: (...a: unknown[]) => getStats(...a),
  },
}))
vi.mock('../services/sanctuary', () => ({
  sanctuaryService: { getScene: (...a: unknown[]) => getScene(...a) },
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
vi.mock('../components/ActivityHeatmap', () => ({
  default: () => <div data-testid="activity-heatmap" />,
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
    { label: 'Sanctuary',href: '/sanctuary' },
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

  it('shows the slim level + coins chip once stats and scene load', async () => {
    renderPage()
    expect(await screen.findByText(/Level 7/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())
  })

  it('shows the feature tiles and a quiet "How do you feel?" entry point by default', async () => {
    renderPage()
    await screen.findByText(/Level 7/)
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
    // The mood check-in is no longer an inline section — only a quiet entry-point link.
    expect(screen.getByRole('button', { name: /how do you feel/i })).toBeInTheDocument()
  })

  it('shows the day\'s quests as chips with no "Today you could…" lead', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The old imperative lead is gone; the chips render cleanly.
    expect(screen.queryByText(/Today you could/i)).not.toBeInTheDocument()
    const questsSection = screen.getByRole('region', { name: /today's quests/i })
    expect(questsSection).toBeInTheDocument()
    expect(
      within(questsSection).getByRole('link', { name: /meditate/i }),
    ).toHaveAttribute('href', '/meditate')

    // The sanctuary teaser (compact variant) renders on the default view.
    const teaser = screen.getByTestId('sanctuary-scene')
    expect(teaser).toBeInTheDocument()
    expect(capturedSanctuarySceneProps.at(-1)?.compact).toBe(true)
  })

  it('keeps the full level card, totals, heatmap, and weekly review collapsed', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The heavier progress surfaces are not rendered until the drawer is opened.
    expect(screen.queryByTestId('level-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activity-heatmap')).not.toBeInTheDocument()
    expect(screen.queryByTestId('weekly-review')).not.toBeInTheDocument()

    // The toggle announces a collapsed state and points at the controlled panel — and is
    // still a real, link-styled button (aria-expanded/aria-controls intact).
    const toggle = screen.getByRole('button', { name: /show more/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'dashboard-more-panel')
  })
})

describe('DashboardPage — expanding the "Show more" drawer', () => {
  beforeEach(() => {
    seenMoodToday()
    getStats.mockResolvedValue(fakeStats)
    getScene.mockResolvedValue(fakeScene)
  })

  it('reveals the heavier progress sections and persists the open state to localStorage', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    const toggle = screen.getByRole('button', { name: /show more/i })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(screen.getByTestId('activity-heatmap')).toBeInTheDocument()
    expect(screen.getByTestId('weekly-review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()

    expect(localStorage.getItem('dashboard.showMore')).toBe('1')
  })

  it('restores the open state from localStorage on load', async () => {
    localStorage.setItem('dashboard.showMore', '1')
    renderPage()
    await screen.findByText(/Level 7/)

    // Drawer is open on first render — the heavier progress sections are visible without a click.
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})

describe('DashboardPage — sanctuary scene single-fetch', () => {
  it('calls getScene exactly once and passes the scene to SanctuaryScene and LevelCard', async () => {
    seenMoodToday()
    getScene.mockResolvedValue(fakeScene)
    getStats.mockResolvedValue(fakeStats)
    // The compact SanctuaryScene sits on the default home; LevelCard lives in the drawer —
    // open it so both children render and we can assert the shared scene reaches each.
    localStorage.setItem('dashboard.showMore', '1')

    renderPage()

    await waitFor(() => {
      const last = capturedSanctuarySceneProps.at(-1)
      expect(last?.scene).toEqual(fakeScene)
    })

    // Exactly one call — not two.
    expect(getScene).toHaveBeenCalledTimes(1)

    // LevelCard (rendered inside the open drawer) also received the same scene.
    const lcLast = capturedLevelCardProps.at(-1)
    expect(lcLast?.scene).toEqual(fakeScene)
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
    await waitFor(() => expect(screen.getByTestId('sanctuary-scene')).toBeInTheDocument())
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
