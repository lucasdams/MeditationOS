/**
 * PracticesPage — the practices hub. Verifies the grouped sections render and deep-link correctly,
 * AND the spirit-aware overlay (ADR-0032): each card shows what facet it feeds, and — when the
 * recent-practice balance is uneven — the practices that round out the least-represented facet get
 * a gentle highlight + suggestion. The spirit fetch is mocked; by default it rejects (no creature)
 * so the list-only assertions match the non-spirit render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('renders all category groups (Breathing, Meditation, Body, Heart, Reflection)', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^body/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^heart/i })).toBeInTheDocument()
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

  it('renders the Body group with Body scan + Mindful stretching moved out of Meditation', () => {
    renderPage()
    const bodyHeading = screen.getByRole('heading', { name: /^body/i })
    const bodySection = bodyHeading.closest('section') as HTMLElement
    // Body scan and Mindful stretching now live in Body, not Meditation.
    expect(within(bodySection).getByRole('link', { name: /body scan/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /mindful stretching/i })).toBeInTheDocument()
    // The new Body-only practices are here too.
    expect(within(bodySection).getByRole('link', { name: /yoga nidra/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /muscle release/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /mindful walking/i })).toBeInTheDocument()

    const medHeading = screen.getByRole('heading', { name: /meditation/i })
    const medSection = medHeading.closest('section') as HTMLElement
    expect(within(medSection).queryByRole('link', { name: /body scan/i })).toBeNull()
    expect(within(medSection).queryByRole('link', { name: /mindful stretching/i })).toBeNull()
  })

  it('deep-links the Body cards with the right ?guided= param', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /body scan/i })).toHaveAttribute(
      'href',
      '/meditate?guided=body-scan',
    )
    expect(screen.getByRole('link', { name: /yoga nidra/i })).toHaveAttribute(
      'href',
      '/meditate?guided=yoga-nidra',
    )
    expect(screen.getByRole('link', { name: /muscle release/i })).toHaveAttribute(
      'href',
      '/meditate?guided=pmr',
    )
    expect(screen.getByRole('link', { name: /mindful stretching/i })).toHaveAttribute(
      'href',
      '/meditate?guided=stretching',
    )
    expect(screen.getByRole('link', { name: /mindful walking/i })).toHaveAttribute(
      'href',
      '/meditate?guided=walking',
    )
  })

  it('deep-links the new Meditation cards (Focused attention, Mantra, Dopamine reset)', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /focused attention/i })).toHaveAttribute(
      'href',
      '/meditate?guided=focus',
    )
    expect(screen.getByRole('link', { name: /^mantra/i })).toHaveAttribute(
      'href',
      '/meditate?guided=mantra',
    )
    expect(screen.getByRole('link', { name: /dopamine reset/i })).toHaveAttribute(
      'href',
      '/meditate?guided=just-sit',
    )
  })

  it('renders the Heart section with Loving-kindness moved into it', () => {
    renderPage()
    const heartHeading = screen.getByRole('heading', { name: /^heart/i })
    const heartSection = heartHeading.closest('section') as HTMLElement
    // Loving-kindness now lives in Heart, not Meditation.
    expect(within(heartSection).getByRole('link', { name: /loving-kindness/i })).toBeInTheDocument()
    const medHeading = screen.getByRole('heading', { name: /meditation/i })
    const medSection = medHeading.closest('section') as HTMLElement
    expect(within(medSection).queryByRole('link', { name: /loving-kindness/i })).toBeNull()
  })

  it('deep-links the Heart cards (loving-kindness + 4 new joy practices)', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /loving-kindness/i })).toHaveAttribute(
      'href',
      '/meditate?guided=loving-kindness',
    )
    expect(screen.getByRole('link', { name: /self-compassion/i })).toHaveAttribute(
      'href',
      '/meditate?guided=self-compassion',
    )
    expect(screen.getByRole('link', { name: /recount a good memory/i })).toHaveAttribute(
      'href',
      '/meditate?guided=recall-good',
    )
    expect(screen.getByRole('link', { name: /savor something good/i })).toHaveAttribute(
      'href',
      '/meditate?guided=savoring',
    )
    expect(screen.getByRole('link', { name: /celebrate a win/i })).toHaveAttribute(
      'href',
      '/meditate?guided=celebrate-win',
    )
  })

  it('links the reflection cards to their own pages', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /gratitude/i })).toHaveAttribute('href', '/gratitude')
    expect(screen.getByRole('link', { name: /journal/i })).toHaveAttribute('href', '/journal')
    expect(screen.getByRole('link', { name: /candle gazing/i })).toHaveAttribute('href', '/trataka')
  })

  it('gently suggests rounding out the least-represented facet and highlights its practices', async () => {
    get.mockResolvedValue(spiritWith()) // rested is the least-represented facet (uneven balance)
    renderPage()
    // The banner names the lagging facet (Rest) and the creature, framed as a round-out suggestion.
    const nudge = await screen.findByText(/a little less/i)
    expect(within(nudge).getByText(/Rest/)).toBeInTheDocument()
    expect(nudge.textContent).toMatch(/Sage/)
    // It is a suggestion, not a demand — no "needs" / "wants" pressure copy.
    expect(nudge.textContent).not.toMatch(/needs more|wants/i)
    expect(nudge.textContent).toMatch(/round things out/i)
    // Every sit (breathing + meditation) feeds rested → each gets the quiet "round-out" highlight
    // (the .practice-card--needed class); reflection (joyful) does not.
    expect(screen.getByRole('link', { name: /resonance/i }).className).toMatch(/practice-card--needed/)
    expect(screen.getByRole('link', { name: /journal/i }).className).not.toMatch(/practice-card--needed/)
  })

  it('shows what each practice gives the spirit (feed badges)', async () => {
    get.mockResolvedValue(spiritWith())
    renderPage()
    await screen.findByText(/a little less/i)
    // Kapha (stillness): breathwork is the signature → feeds Nourishment; sits feed Rest; reflection
    // feeds Joy. All three need labels appear as badges across the cards.
    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Joy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Nourishment').length).toBeGreaterThan(0)
  })

  it('feeds Joy from the Heart practices via the per-card feeds override (Kapha spirit)', async () => {
    // Kapha (stillness): meditation is NOT its signature, so a heart practice's `feeds:'joyful'`
    // override stands alone → it shows only a Joy badge, never Rest.
    get.mockResolvedValue(spiritWith()) // stillness, rested weakest
    renderPage()
    await screen.findByText(/a little less/i)
    const lk = screen.getByRole('link', { name: /loving-kindness/i })
    expect(within(lk).getByText('Joy')).toBeInTheDocument()
    expect(within(lk).queryByText('Rest')).toBeNull()
    expect(within(lk).queryByText('Nourishment')).toBeNull()
    // Weakest need is Rest, and Loving-kindness no longer feeds Rest → not highlighted.
    expect(lk.className).not.toMatch(/practice-card--needed/)
  })

  it('feeds Joy AND Nourishment from the Heart practices for a Vata/heart spirit', async () => {
    // Vata (heart): meditation IS the path signature, so a heart practice feeds `nourished` too —
    // alongside the `feeds:'joyful'` override base. Both badges appear on the card.
    get.mockResolvedValue(
      spiritWith({
        path: 'heart',
        needs: { nourished: need(0.2), rested: need(0.9), joyful: need(0.9) },
      }),
    )
    renderPage()
    await screen.findByText(/a little less/i)
    const lk = screen.getByRole('link', { name: /loving-kindness/i })
    expect(within(lk).getByText('Joy')).toBeInTheDocument()
    expect(within(lk).getByText('Nourishment')).toBeInTheDocument()
    expect(within(lk).queryByText('Rest')).toBeNull()
    // Vata's weakest need is Nourishment, which this signature heart practice feeds → highlighted.
    expect(lk.className).toMatch(/practice-card--needed/)
  })

  it('keeps the rest-feeding meditations (Body scan, Mindfulness) feeding Rest, not Joy', async () => {
    // Sanity: only the Heart cards carry the override. Plain meditations still feed Rest.
    get.mockResolvedValue(spiritWith()) // stillness, rested weakest
    renderPage()
    await screen.findByText(/a little less/i)
    const bodyScan = screen.getByRole('link', { name: /body scan/i })
    expect(within(bodyScan).getByText('Rest')).toBeInTheDocument()
    expect(within(bodyScan).queryByText('Joy')).toBeNull()
    const mindfulness = screen.getByRole('link', { name: /mindfulness/i })
    expect(within(mindfulness).getByText('Rest')).toBeInTheDocument()
    expect(within(mindfulness).queryByText('Joy')).toBeNull()
  })

  it('shows no spirit nudge for a pathless spark (list still renders)', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByText(/a little less/i)).toBeNull()
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

// ── Programs row (nav destinations surfaced on the hub) ──────────────────────
// The nav "Practice" now links straight here, so the two non-technique destinations
// that used to live in the dropdown (Guided paths → /paths, Log a past session →
// /sessions/new) must be reachable from the hub itself.

describe('PracticesPage — Programs row', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    get.mockRejectedValue(new Error('no spirit'))
    getStats.mockReset()
    getStats.mockResolvedValue({ level: 10 })
  })

  it('surfaces a Guided paths link to /paths and a Log-a-session link to /sessions/new', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /guided paths/i })).toHaveAttribute('href', '/paths')
    expect(screen.getByRole('link', { name: /log a past session/i })).toHaveAttribute(
      'href',
      '/sessions/new',
    )
  })
})

// ── Live search / filter ─────────────────────────────────────────────────────
// A calm search input filters the practice cards live (name + description, case-
// insensitive). Empty groups drop out; a gentle empty state shows when nothing
// matches; Escape and the × button clear the query.

describe('PracticesPage — search filter', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    get.mockRejectedValue(new Error('no spirit'))
    getStats.mockReset()
    getStats.mockResolvedValue({ level: 10 })
  })

  function typeSearch(value: string) {
    fireEvent.change(screen.getByRole('searchbox', { name: /search practices/i }), {
      target: { value },
    })
  }

  it('filters cards live: a matching card stays, non-matching cards are hidden', () => {
    renderPage()
    // Baseline: both a matching and a non-matching card render.
    expect(screen.getByRole('link', { name: /resonance/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /body scan/i })).toBeInTheDocument()

    typeSearch('resonance')

    // The matching card is still shown; the non-matching one is gone.
    expect(screen.getByRole('link', { name: /resonance/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /body scan/i })).toBeNull()
  })

  it('matches the description too, case-insensitively', () => {
    renderPage()
    // "Nadi Shodhana" only appears in Alternate nostril's description.
    typeSearch('NADI')
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /resonance/i })).toBeNull()
  })

  it('hides empty groups while a query is active', () => {
    renderPage()
    typeSearch('resonance')
    // Reflection has no "resonance" match → its heading drops out; Breathing stays.
    expect(screen.queryByRole('heading', { name: /reflection/i })).toBeNull()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
  })

  it('shows a gentle empty state when nothing matches', () => {
    renderPage()
    typeSearch('zzznope')
    expect(screen.getByText(/no practices match/i)).toBeInTheDocument()
    expect(screen.getByText(/zzznope/)).toBeInTheDocument()
    // No practice cards left.
    expect(screen.queryByRole('link', { name: /resonance/i })).toBeNull()
  })

  it('clears the query on Escape', () => {
    renderPage()
    const box = screen.getByRole('searchbox', { name: /search practices/i })
    fireEvent.change(box, { target: { value: 'resonance' } })
    expect(screen.queryByRole('link', { name: /body scan/i })).toBeNull()

    fireEvent.keyDown(box, { key: 'Escape' })
    // Everything is back.
    expect(screen.getByRole('link', { name: /body scan/i })).toBeInTheDocument()
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('clears the query via the × clear button', () => {
    renderPage()
    typeSearch('resonance')
    expect(screen.queryByRole('link', { name: /body scan/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(screen.getByRole('link', { name: /body scan/i })).toBeInTheDocument()
  })

  it('keeps the spirit-need highlight working on the filtered results', async () => {
    // A living Kapha spirit whose weakest need is Rest → sit practices get the "needed" class.
    get.mockResolvedValue(spiritWith())
    renderPage()
    await screen.findByText(/needs more/i)

    typeSearch('resonance')
    const resonance = screen.getByRole('link', { name: /resonance/i })
    expect(resonance).toBeInTheDocument()
    // Still highlighted after filtering (filter is presentational; highlight keys off the need).
    expect(resonance.className).toMatch(/practice-card--needed/)
  })
})
