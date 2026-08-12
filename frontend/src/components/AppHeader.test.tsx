/**
 * Smoke tests for the grouped header navigation: Home + Practice / Progress dropdown menus.
 * Verifies that opening a menu reveals its destinations, that Practice carries the activities
 * (incl. Candle gazing), that Progress carries stats + planning + Settings (the old "More" menu
 * merged in), that Admin is admin-only, and basic a11y (aria-expanded). The Spirit companion is
 * hidden from the UI (dormant) — the header carries no Spirit link and fetches no spirit state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const useAuthMock = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

// The header self-fetches the level on mount. The level stays pending here (the level chip
// simply stays absent) — these are navigation smoke tests.
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

// In jsdom both the desktop nav and the mobile hamburger sheet render (no CSS media queries),
// so "Progress" now matches two buttons: the desktop dropdown trigger AND the mobile group
// toggle. The desktop one is the only button wired to the dropdown region via aria-controls.
function desktopProgressBtn(): HTMLElement {
  const btn = screen
    .getAllByRole('button', { name: /Progress/ })
    .find((b) => b.getAttribute('aria-controls') === 'nav-progress-dropdown')
  if (!btn) throw new Error('desktop Progress dropdown button not found')
  return btn
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

  it('shows Home, a Practice LINK, and a Progress menu (no More, no Spirit link)', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    // Practice is a direct link to the all-practices hub on desktop (no desktop dropdown button).
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practices')
    expect(desktopProgressBtn()).toBeInTheDocument()
    // On mobile the two groups collapse into hamburger-sheet toggle buttons; the only BUTTON
    // named "Practice" is that mobile group toggle (desktop Practice is a link).
    expect(screen.getByRole('button', { name: /^Practice$/ })).toHaveClass('nav-mobile-group')
    // The old "More" junk-drawer menu is gone — its items merged into Practice / Progress.
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    // The Spirit companion is hidden from the UI — no nav link to /spirit anywhere.
    expect(screen.queryByRole('link', { name: /Spirit/ })).toBeNull()
  })

  it('Practice links straight to the all-practices hub (no dropdown)', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practices')
    expect(document.getElementById('nav-practice-dropdown')).toBeNull()
    // The individual practices are reachable in the mobile hamburger sheet once its
    // Practice group is expanded (collapsed by default to keep the opened menu compact).
    fireEvent.click(screen.getByRole('button', { name: /^Practice$/ }))
    expect(screen.getAllByRole('link', { name: /Meditate/ }).length).toBeGreaterThan(0)
  })

  it('no longer has a separate More menu (merged into Progress)', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    expect(document.getElementById('nav-more-dropdown')).toBeNull()
  })

  it('opening Progress reveals stats, planning, and Settings together', () => {
    renderHeader()
    const progressBtn = desktopProgressBtn()
    fireEvent.click(progressBtn)

    const dropdown = document.getElementById('nav-progress-dropdown')!
    expect(within(dropdown).getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/analytics')
    expect(within(dropdown).getByRole('link', { name: /Timeline/ })).toHaveAttribute('href', '/timeline')
    // Goals + Schedule merged in from the old More menu.
    expect(within(dropdown).getByRole('link', { name: /Goals/ })).toHaveAttribute('href', '/goals')
    expect(within(dropdown).getByRole('link', { name: /Schedule/ })).toHaveAttribute('href', '/schedule')
    expect(within(dropdown).getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings')
  })

  it('Escape closes the open Progress menu', () => {
    renderHeader()
    const progressBtn = desktopProgressBtn()
    fireEvent.click(progressBtn)
    expect(progressBtn).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(progressBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows "Guest" for guest accounts instead of the auto-generated guest_<id> username', () => {
    useAuthMock.mockReturnValue({
      user: { username: 'guest_3f9a1b2c4d5e', is_guest: true, is_admin: false },
      logout: vi.fn(),
    })
    renderHeader()
    expect(screen.getByRole('button', { name: /Guest/ })).toBeInTheDocument()
    expect(screen.queryByText(/guest_3f9a1b2c4d5e/)).toBeNull()
  })

  it('hides Admin from non-admins and shows it to admins in Progress', () => {
    renderHeader()
    fireEvent.click(desktopProgressBtn())
    expect(within(document.getElementById('nav-progress-dropdown')!).queryByRole('link', { name: /Admin/ })).toBeNull()
    cleanup()

    useAuthMock.mockReturnValue({
      user: { username: 'boss', is_admin: true },
      logout: vi.fn(),
    })
    renderHeader()
    fireEvent.click(desktopProgressBtn())
    expect(within(document.getElementById('nav-progress-dropdown')!).getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  it('mobile hamburger sheet: Practice / Progress are collapsible group toggles (one open at a time)', () => {
    renderHeader()
    const practiceGroup = screen.getByRole('button', { name: /^Practice$/ })
    const progressGroup = screen
      .getAllByRole('button', { name: /Progress/ })
      .find((b) => b.classList.contains('nav-mobile-group'))!
    // Collapsed by default so the opened sheet stays compact — no inline group links yet.
    expect(practiceGroup).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.nav-mobile-group-links')).toBeNull()
    // Tapping Practice expands its links inline.
    fireEvent.click(practiceGroup)
    expect(practiceGroup).toHaveAttribute('aria-expanded', 'true')
    const links = document.querySelector('.nav-mobile-group-links') as HTMLElement
    expect(within(links).getByRole('link', { name: /Breathe/ })).toHaveAttribute('href', '/breathe')
    // Only one group open at a time: tapping Progress collapses Practice and opens Progress.
    fireEvent.click(progressGroup)
    expect(practiceGroup).toHaveAttribute('aria-expanded', 'false')
    expect(progressGroup).toHaveAttribute('aria-expanded', 'true')
  })
})
