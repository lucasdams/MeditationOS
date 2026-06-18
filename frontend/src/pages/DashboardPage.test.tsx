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
vi.mock('../components/MoodCheckin', () => ({
  default: () => <div data-testid="mood-checkin" />,
}))
vi.mock('../components/WeeklyReview', () => ({
  default: () => <div data-testid="weekly-review" />,
}))
vi.mock('../components/ActivityHeatmap', () => ({
  default: () => <div data-testid="activity-heatmap" />,
}))

import DashboardPage from './DashboardPage'
import type { DashboardStats, SanctuaryScene } from '../types'

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
    getStats.mockResolvedValue(fakeStats)
    getScene.mockResolvedValue(fakeScene)
  })

  it('shows the slim level + coins chip once stats and scene load', async () => {
    renderPage()
    expect(await screen.findByText(/Level 7/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/142/)).toBeInTheDocument())
  })

  it('shows the feature tiles and mood check-in by default', async () => {
    renderPage()
    await screen.findByText(/Level 7/)
    expect(screen.getByRole('navigation', { name: /quick access/i })).toBeInTheDocument()
    expect(screen.getByTestId('mood-checkin')).toBeInTheDocument()
  })

  it('shows compact quests and the sanctuary teaser on the default home', async () => {
    renderPage()
    await screen.findByText(/Level 7/)

    // The quiet "Today you could…" lead and the day's quests as chips are visible by default.
    expect(screen.getByText(/Today you could/i)).toBeInTheDocument()
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

    // The toggle announces a collapsed state and points at the controlled panel.
    const toggle = screen.getByRole('button', { name: /show more/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'dashboard-more-panel')
  })
})

describe('DashboardPage — expanding the "Show more" drawer', () => {
  beforeEach(() => {
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
    expect(screen.getByRole('button', { name: /hide more/i })).toBeInTheDocument()

    expect(localStorage.getItem('dashboard.showMore')).toBe('1')
  })

  it('restores the open state from localStorage on load', async () => {
    localStorage.setItem('dashboard.showMore', '1')
    renderPage()
    await screen.findByText(/Level 7/)

    // Drawer is open on first render — the heavier progress sections are visible without a click.
    expect(screen.getByTestId('level-card')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide more/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})

describe('DashboardPage — sanctuary scene single-fetch', () => {
  it('calls getScene exactly once and passes the scene to SanctuaryScene and LevelCard', async () => {
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
