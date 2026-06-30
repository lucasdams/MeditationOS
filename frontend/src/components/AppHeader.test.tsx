/**
 * Smoke tests for the grouped header navigation: Home + Practice / Progress dropdown menus +
 * a standalone Spirit link. Verifies that opening a menu reveals its destinations, that Practice
 * carries the activities (incl. Candle gazing), that Progress carries stats + planning + Settings
 * (the old "More" menu merged in), that Admin is admin-only, and basic a11y (aria-expanded).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const useAuthMock = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

// The header self-fetches the level + the spirit on mount; keep both pending so they never
// resolve in tests (the spirit-need chip + level chip simply stay absent).
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: () => new Promise(() => {}) },
}))
vi.mock('../services/spirit', () => ({
  spiritService: { get: () => new Promise(() => {}) },
}))

import AppHeader from './AppHeader'

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('AppHeader — grouped navigation', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { username: 'aria', is_admin: false },
      logout: vi.fn(),
    })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows Home, the Practice/Progress menu buttons (no More), and a standalone Spirit link', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Practice/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Progress/ })).toBeInTheDocument()
    // The old "More" junk-drawer menu is gone — its items merged into Practice / Progress.
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    // Spirit stands alone as a direct link (there are mobile duplicates of menu links, so
    // assert at least one Spirit link with the right href exists at top level).
    const spirit = screen.getAllByRole('link', { name: /Spirit/ })
    expect(spirit.length).toBeGreaterThan(0)
    expect(spirit.some((a) => a.getAttribute('href') === '/spirit')).toBe(true)
  })

  it('opening Practice reveals the activity destinations (e.g. Meditate)', () => {
    renderHeader()
    const practiceBtn = screen.getByRole('button', { name: /Practice/ })
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(practiceBtn)
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'true')

    const dropdown = document.getElementById('nav-practice-dropdown')!
    expect(dropdown).toBeInTheDocument()
    expect(within(dropdown).getByRole('link', { name: /Meditate/ })).toHaveAttribute('href', '/meditate')
    expect(within(dropdown).getByRole('link', { name: /Breathe/ })).toBeInTheDocument()
    expect(within(dropdown).getByRole('link', { name: /Log a session/ })).toBeInTheDocument()
    // Candle gazing now lives in Practice (a focal meditation, not a "more" extra).
    expect(within(dropdown).getByRole('link', { name: /Candle gazing/ })).toHaveAttribute('href', '/trataka')
  })

  it('no longer has a separate More menu (merged into Progress)', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    expect(document.getElementById('nav-more-dropdown')).toBeNull()
  })

  it('opening Progress reveals stats, planning, and Settings together', () => {
    renderHeader()
    const progressBtn = screen.getByRole('button', { name: /Progress/ })
    fireEvent.click(progressBtn)

    const dropdown = document.getElementById('nav-progress-dropdown')!
    expect(within(dropdown).getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/analytics')
    expect(within(dropdown).getByRole('link', { name: /Timeline/ })).toHaveAttribute('href', '/timeline')
    // Goals + Schedule merged in from the old More menu.
    expect(within(dropdown).getByRole('link', { name: /Goals/ })).toHaveAttribute('href', '/goals')
    expect(within(dropdown).getByRole('link', { name: /Schedule/ })).toHaveAttribute('href', '/schedule')
    expect(within(dropdown).getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings')
  })

  it('opening one menu closes the other (single open menu at a time)', () => {
    renderHeader()
    const practiceBtn = screen.getByRole('button', { name: /Practice/ })
    const progressBtn = screen.getByRole('button', { name: /Progress/ })

    fireEvent.click(practiceBtn)
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(progressBtn)
    expect(progressBtn).toHaveAttribute('aria-expanded', 'true')
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape closes an open menu', () => {
    renderHeader()
    const practiceBtn = screen.getByRole('button', { name: /Practice/ })
    fireEvent.click(practiceBtn)
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(practiceBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('hides Admin from non-admins and shows it to admins in Progress', () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: /Progress/ }))
    expect(within(document.getElementById('nav-progress-dropdown')!).queryByRole('link', { name: /Admin/ })).toBeNull()
    cleanup()

    useAuthMock.mockReturnValue({
      user: { username: 'boss', is_admin: true },
      logout: vi.fn(),
    })
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: /Progress/ }))
    expect(within(document.getElementById('nav-progress-dropdown')!).getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })
})
