/**
 * PracticesPage — the practices hub. Verifies the grouped sections render and deep-link correctly,
 * AND the spirit-aware overlay (ADR-0029): each card shows what need it feeds, and the practices
 * that fill the spirit's weakest need are highlighted. The spirit fetch is mocked; by default it
 * rejects (no creature) so the list-only assertions match the non-spirit render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpiritNeed, SpiritState } from '../types'

const get = vi.fn()
vi.mock('../services/spirit', () => ({ spiritService: { get: (...a: unknown[]) => get(...a) } }))

const getStats = vi.fn()
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: (...a: unknown[]) => getStats(...a) },
}))

import PracticesPage from './PracticesPage'

const need = (factor: number): SpiritNeed => ({
  tier: factor < 0.3 ? 'unwell' : 'content',
  factor,
})

// A minimal living Kapha spirit whose weakest need is RESTED (so the sit practices get highlighted).
function spiritWith(overrides: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'fledgling',
    path: 'stillness',
    name: 'Sage',
    bond: { level: 5, xp_into_level: 0, xp_for_next: 20 },
    needs: { nourished: need(0.9), rested: need(0.2), joyful: need(0.9) },
    condition: need(0.2),
    coins: 100,
    cosmetics: {},
    available: [],
    collection: [],
    set_bonus: { active: false, kind: null, count: 0, total: 0, label: 'Signature radiance' },
    awakened_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PracticesPage />
    </MemoryRouter>,
  )
}

describe('PracticesPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    // Default: no creature reachable → the list renders without the spirit overlay.
    get.mockRejectedValue(new Error('no spirit'))
    getStats.mockReset()
    // Default: a high level so gated cards (Chakra Om) render as normal links.
    getStats.mockResolvedValue({ level: 10 })
  })

  it('renders the page heading and a back link to Home', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /practices/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('renders all three category groups', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /reflection/i })).toBeInTheDocument()
  })

  it('deep-links breathing cards with the right ?pattern= param', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /resonance/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=resonance',
    )
    expect(screen.getByRole('link', { name: /box/i })).toHaveAttribute('href', '/breathe?pattern=box')
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=alternate',
    )
  })

  it('deep-links guided meditation cards with the right ?guided= param', async () => {
    renderPage()
    expect(screen.getByRole('link', { name: /body scan/i })).toHaveAttribute(
      'href',
      '/meditate?guided=body-scan',
    )
    expect(screen.getByRole('link', { name: /loving-kindness/i })).toHaveAttribute(
      'href',
      '/meditate?guided=loving-kindness',
    )
    expect(screen.getByRole('link', { name: /mindfulness/i })).toHaveAttribute('href', '/meditate')
    expect(screen.getByRole('link', { name: /name what you feel/i })).toHaveAttribute(
      'href',
      '/meditate?guided=name-feelings',
    )
    expect(screen.getByRole('link', { name: /mindful stretching/i })).toHaveAttribute(
      'href',
      '/meditate?guided=stretching',
    )
    // Chakra Om is gated but level 10 (default) unlocks it → a real link.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /chakra om/i })).toHaveAttribute(
        'href',
        '/meditate?guided=chakra-om',
      ),
    )
  })

  it('links the reflection cards to their own pages', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /gratitude/i })).toHaveAttribute('href', '/gratitude')
    expect(screen.getByRole('link', { name: /journal/i })).toHaveAttribute('href', '/journal')
    expect(screen.getByRole('link', { name: /candle gazing/i })).toHaveAttribute('href', '/trataka')
  })

  it('nudges toward the spirit’s weakest need and highlights the practices that feed it', async () => {
    get.mockResolvedValue(spiritWith()) // rested is weakest
    renderPage()
    // The banner names the weakest need (Rest) and the creature.
    const nudge = await screen.findByText(/needs more/i)
    expect(within(nudge).getByText(/Rest/)).toBeInTheDocument()
    expect(nudge.textContent).toMatch(/Sage/)
    // Every sit (breathing + meditation) feeds rested → each gets the quiet "needed" highlight
    // (the .practice-card--needed class); reflection (joyful) does not.
    expect(screen.getByRole('link', { name: /resonance/i }).className).toMatch(/practice-card--needed/)
    expect(screen.getByRole('link', { name: /journal/i }).className).not.toMatch(/practice-card--needed/)
  })

  it('shows what each practice gives the spirit (feed badges)', async () => {
    get.mockResolvedValue(spiritWith())
    renderPage()
    await screen.findByText(/needs more/i)
    // Kapha (stillness): breathwork is the signature → feeds Nourishment; sits feed Rest; reflection
    // feeds Joy. All three need labels appear as badges across the cards.
    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Joy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Nourishment').length).toBeGreaterThan(0)
  })

  it('shows no spirit nudge for a pathless spark (list still renders)', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByText(/needs more/i)).toBeNull()
    // No "needed" highlight for a pathless spark.
    expect(screen.getByRole('link', { name: /resonance/i }).className).not.toMatch(/practice-card--needed/)
    expect(screen.getByRole('link', { name: /resonance/i })).toBeInTheDocument()
  })
})

// ── Chakra Om level gate ─────────────────────────────────────────────────────
// Chakra Om unlocks at level 5. Below it the card is a non-interactive, locked
// <div> (not a <Link>) showing "Reach level 5 to unlock"; at/above level 5 it's a
// normal deep-link card.

describe('PracticesPage — Chakra Om level gate', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    get.mockRejectedValue(new Error('no spirit'))
    getStats.mockReset()
  })

  it('renders Chakra Om locked (non-link, "Reach level 5") below level 5', async () => {
    getStats.mockResolvedValue({ level: 3 })
    renderPage()
    await waitFor(() => expect(getStats).toHaveBeenCalled())
    // Not a link while locked.
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /chakra om/i })).toBeNull(),
    )
    // The card text is present with the unlock hint.
    expect(screen.getByText(/chakra om/i)).toBeInTheDocument()
    expect(screen.getByText(/reach level 5 to unlock/i)).toBeInTheDocument()
  })

  it('renders Chakra Om as a real deep-link at level 5+', async () => {
    getStats.mockResolvedValue({ level: 5 })
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /chakra om/i })).toHaveAttribute(
        'href',
        '/meditate?guided=chakra-om',
      ),
    )
    expect(screen.queryByText(/reach level 5 to unlock/i)).toBeNull()
  })

  it('keeps Chakra Om locked when the level fetch fails (fail safe)', async () => {
    getStats.mockRejectedValue(new Error('network'))
    renderPage()
    await waitFor(() => expect(getStats).toHaveBeenCalled())
    // level stays null → gated card stays locked.
    expect(screen.queryByRole('link', { name: /chakra om/i })).toBeNull()
    expect(screen.getByText(/reach level 5 to unlock/i)).toBeInTheDocument()
  })
})
