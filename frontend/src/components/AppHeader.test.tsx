/**
 * Smoke tests for the header navigation: Home + Practice link + Philosophers link + Progress menu.
 * Practice links straight to the all-practices hub (the hub owns the practice list — the nav no
 * longer duplicates each practice); Philosophers links to the philosopher chat, outside the practice
 * catalog; Progress carries stats + planning + Settings (the old "More" menu merged in), is the
 * one collapsible group on mobile, and Admin is admin-only. The Spirit companion is hidden from
 * the UI (dormant) — the header carries no Spirit link and fetches no spirit state.
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

  it('shows Home, Practice + Philosophers links, and a Progress menu (no More, no Spirit link)', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    // Practice is a direct link to the all-practices hub. It renders in both the desktop nav and
    // the mobile sheet (jsdom has no media queries), so there are two — both point at /practices.
    const practiceLinks = screen.getAllByRole('link', { name: 'Practice' })
    expect(practiceLinks.length).toBeGreaterThan(0)
    practiceLinks.forEach((l) => expect(l).toHaveAttribute('href', '/practices'))
    // Philosophers is its own link to the philosopher chat — outside the practice catalog.
    screen
      .getAllByRole('link', { name: 'Philosophers' })
      .forEach((l) => expect(l).toHaveAttribute('href', '/philosophers'))
    expect(desktopProgressBtn()).toBeInTheDocument()
    // Practice is a link everywhere now — there is no Practice group toggle button.
    expect(screen.queryByRole('button', { name: /^Practice$/ })).toBeNull()
    // The old "More" junk-drawer menu is gone — its items merged into Progress.
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    // The Spirit companion is hidden from the UI — no nav link to /spirit anywhere.
    expect(screen.queryByRole('link', { name: /Spirit/ })).toBeNull()
  })

  it('offers a one-tap quick-start linking into a practice', () => {
    renderHeader()
    // The header's "Start" pill jumps into the time-of-day recommended practice (an ungated
    // /meditate/* or /breathe route). Target varies by hour, so assert the link + a valid href.
    const start = screen.getByRole('link', { name: /Start/ })
    expect(start.getAttribute('href')).toMatch(/^\/(meditate|breathe)/)
  })

  it('Practice links straight to the all-practices hub (no dropdown, no per-practice items)', () => {
    renderHeader()
    screen
      .getAllByRole('link', { name: 'Practice' })
      .forEach((l) => expect(l).toHaveAttribute('href', '/practices'))
    expect(document.getElementById('nav-practice-dropdown')).toBeNull()
    // The nav no longer lists individual practices (Meditate/Breathe/…) — the hub owns that list.
    expect(screen.queryByRole('link', { name: /Meditate/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Breathe/ })).toBeNull()
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

  it('mobile hamburger sheet: Practice + Philosophers are direct links; Progress is the one collapsible group', () => {
    renderHeader()
    // Practice + Philosophers are plain links in the sheet — no group toggle button for them.
    expect(screen.queryByRole('button', { name: /^Practice$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Philosophers$/ })).toBeNull()
    const progressGroup = screen
      .getAllByRole('button', { name: /Progress/ })
      .find((b) => b.classList.contains('nav-mobile-group'))!
    // Collapsed by default so the opened sheet stays compact — no inline group links yet.
    expect(progressGroup).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.nav-mobile-group-links')).toBeNull()
    // Tapping Progress expands its links inline.
    fireEvent.click(progressGroup)
    expect(progressGroup).toHaveAttribute('aria-expanded', 'true')
    const links = document.querySelector('.nav-mobile-group-links') as HTMLElement
    expect(within(links).getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/analytics')
  })
})
