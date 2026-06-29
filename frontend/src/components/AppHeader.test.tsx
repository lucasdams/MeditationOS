/**
 * Smoke tests for the grouped header navigation: Home + Practice / Progress / More dropdown
 * menus + a standalone Spirit link. Verifies that opening a menu reveals its destinations,
 * that the Progress menu carries stats + Settings, that the More menu carries the advanced /
 * depth features (Candle gazing, Goals, Schedule), that Admin is admin-only, and basic a11y
 * (aria-expanded toggling on the menu buttons).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const useAuthMock = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

// The header self-fetches the level on mount; keep it pending so it never resolves in tests.
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: () => new Promise(() => {}) },
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

  it('shows Home, the Practice/Progress/More menu buttons, and a standalone Spirit link', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Practice/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Progress/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument()
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
    // Candle gazing moved to the More menu — no longer a beginner Practice item.
    expect(within(dropdown).queryByRole('link', { name: /Candle gazing/ })).toBeNull()
  })

  it('opening More reveals the advanced/depth destinations (Candle gazing, Goals, Schedule)', () => {
    renderHeader()
    const moreBtn = screen.getByRole('button', { name: /More/ })
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(moreBtn)
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true')

    const dropdown = document.getElementById('nav-more-dropdown')!
    expect(dropdown).toBeInTheDocument()
    expect(within(dropdown).getByRole('link', { name: /Candle gazing/ })).toHaveAttribute('href', '/trataka')
    expect(within(dropdown).getByRole('link', { name: /Goals/ })).toHaveAttribute('href', '/goals')
    expect(within(dropdown).getByRole('link', { name: /Schedule/ })).toHaveAttribute('href', '/schedule')
  })

  it('opening Progress reveals Analytics + Settings together', () => {
    renderHeader()
    const progressBtn = screen.getByRole('button', { name: /Progress/ })
    fireEvent.click(progressBtn)

    const dropdown = document.getElementById('nav-progress-dropdown')!
    expect(within(dropdown).getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/analytics')
    expect(within(dropdown).getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings')
    // Goals + Schedule moved to the More menu — Progress is review/config only now.
    expect(within(dropdown).queryByRole('link', { name: /Goals/ })).toBeNull()
    expect(within(dropdown).queryByRole('link', { name: /Schedule/ })).toBeNull()
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
