/**
 * Smoke tests for the grouped header navigation: Home + Practice / Progress dropdown menus +
 * a standalone Spirit link. Verifies that opening a menu reveals its destinations, that Practice
 * carries the activities (incl. Candle gazing), that Progress carries stats + planning + Settings
 * (the old "More" menu merged in), that Admin is admin-only, and basic a11y (aria-expanded).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpiritNeed, SpiritState } from '../types'

const useAuthMock = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

// The header self-fetches the level + the spirit on mount. The level stays pending (the level chip
// simply stays absent); the spirit fetch is a controllable mock — by default pending so the
// round-out chip is absent, but individual tests can resolve it to exercise the chip.
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: () => new Promise(() => {}) },
}))
const spiritGet = vi.fn(() => new Promise(() => {}))
vi.mock('../services/spirit', () => ({
  spiritService: { get: (...a: unknown[]) => spiritGet(...a) },
}))

import AppHeader from './AppHeader'

const need = (factor: number): SpiritNeed => ({ tier: 'content', factor })

// A minimal living spirit with an UNEVEN balance (joyful lags) → the round-out chip should surface.
function spiritWith(overrides: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'fledgling',
    path: 'stillness',
    name: 'Sage',
    bond: { level: 5, xp_into_level: 0, xp_for_next: 20 },
    needs: { nourished: need(0.9), rested: need(0.9), joyful: need(0.3) },
    condition: need(0.9),
    coins: 100,
    cosmetics: {},
    available: [],
    collection: [],
    set_bonus: { active: false, kind: null, count: 0, total: 0, label: 'Signature radiance' },
    awakened_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

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
    spiritGet.mockImplementation(() => new Promise(() => {})) // spirit pending → no chip
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows Home, a Practice LINK, a Progress menu (no More), and a standalone Spirit link', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    // Practice is now a direct link to the all-practices hub, not a dropdown button.
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practices')
    expect(screen.queryByRole('button', { name: /Practice/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Progress/ })).toBeInTheDocument()
    // The old "More" junk-drawer menu is gone — its items merged into Practice / Progress.
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull()
    // Spirit stands alone as a direct link (there are mobile duplicates of menu links, so
    // assert at least one Spirit link with the right href exists at top level).
    const spirit = screen.getAllByRole('link', { name: /Spirit/ })
    expect(spirit.length).toBeGreaterThan(0)
    expect(spirit.some((a) => a.getAttribute('href') === '/spirit')).toBe(true)
  })

  it('Practice links straight to the all-practices hub (no dropdown)', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practices')
    expect(document.getElementById('nav-practice-dropdown')).toBeNull()
    // The individual practices are still reachable on the mobile inline list.
    expect(screen.getAllByRole('link', { name: /Meditate/ }).length).toBeGreaterThan(0)
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

  it('Escape closes the open Progress menu', () => {
    renderHeader()
    const progressBtn = screen.getByRole('button', { name: /Progress/ })
    fireEvent.click(progressBtn)
    expect(progressBtn).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(progressBtn).toHaveAttribute('aria-expanded', 'false')
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

// The spirit-need chip is now an OPTIONAL round-out invitation (ADR-0032), not a "Wants X" demand.
// It surfaces only for a chosen path with an uneven balance, and is easy to ignore.
describe('AppHeader — spirit round-out chip (ADR-0032)', () => {
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

  it('surfaces a gentle round-out suggestion (not "Wants") for an uneven balance', async () => {
    // joyful lags nourished/rested → the least-represented facet is Joy.
    spiritGet.mockResolvedValue(spiritWith())
    renderHeader()
    // Copy is a soft invitation ("A little Joy?"), never the old "Wants Joy" demand.
    const chip = await screen.findByText(/A little Joy\?/i)
    expect(chip).toBeInTheDocument()
    const link = chip.closest('a')!
    expect(link).toHaveAttribute('href', '/practices')
    expect(link.getAttribute('title')).toMatch(/round things out/i)
    expect(screen.queryByText(/Wants/i)).toBeNull()
  })

  it('shows no chip when the balance is even', async () => {
    spiritGet.mockResolvedValue(
      spiritWith({ needs: { nourished: need(0.9), rested: need(0.9), joyful: need(0.9) } }),
    )
    renderHeader()
    // Give the resolved fetch a tick to settle, then assert no chip appears.
    await screen.findByRole('link', { name: 'Home' })
    expect(screen.queryByText(/A little/i)).toBeNull()
    expect(screen.queryByText(/Wants/i)).toBeNull()
  })

  it('shows no chip for a pathless spark', async () => {
    spiritGet.mockResolvedValue(spiritWith({ path: null }))
    renderHeader()
    await screen.findByRole('link', { name: 'Home' })
    expect(screen.queryByText(/A little/i)).toBeNull()
  })
})
