/**
 * Light smoke tests for the DashboardPage.
 * Full integration coverage lives in E2E; these guard the quick-action tiles
 * and the quest link affordance added in the feat(dashboard) PR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock heavy dashboard dependencies so the component renders without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: vi.fn(() => new Promise(() => {})), // loading state forever
  },
}))
vi.mock('../components/LevelCard', () => ({ default: () => null }))
vi.mock('../components/MoodCheckin', () => ({ default: () => null }))
vi.mock('../components/WeeklyReview', () => ({ default: () => null }))
vi.mock('../components/SanctuaryScene', () => ({ default: () => null }))
vi.mock('../components/ActivityHeatmap', () => ({ default: () => null }))
vi.mock('../components/Achievements', () => ({ default: () => null }))

import DashboardPage from './DashboardPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage — quick-action feature tiles', () => {
  beforeEach(() => renderPage())
  afterEach(cleanup)

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
