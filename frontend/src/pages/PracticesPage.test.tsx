/**
 * PracticesPage — the practices hub. Verifies the trimmed, tight core: 4 sections /
 * 16 cards render and deep-link correctly, the calm browse (chips + previews), and the
 * live search. The Spirit companion is hidden from the UI (dormant): the hub fetches no
 * spirit state and renders no spirit nudge or round-out highlight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getStats = vi.fn()
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: (...a: unknown[]) => getStats(...a) },
}))

import PracticesPage from './PracticesPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PracticesPage />
    </MemoryRouter>,
  )
}

// A practice can ALSO surface in the top "New here? Start here" / "Suggested for you" sections, so
// a name may match more than one link. This returns the link inside the main CATALOG groups —
// letting the deep-link/feed assertions target the category card regardless of which top section
// happens to be showing (which depends on the async level fetch).
function catalogLink(name: RegExp): HTMLElement {
  const links = screen.getAllByRole('link', { name })
  const inCatalog = links.filter(
    (el) => !el.closest('.practices-suggested') && !el.closest('.practices-beginner'),
  )
  return (inCatalog[0] ?? links[0]) as HTMLElement
}

// The calm "All" overview previews each shelf (first 3 cards + "See all N"); a category CHIP
// shows one full shelf. Tests that assert cards beyond a shelf's preview open its chip first.
function openGroup(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('PracticesPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    getStats.mockReset()
    getStats.mockResolvedValue({ level: 10 })
  })

  it('renders the page heading and a back link to Home', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /practices/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('renders the four category groups (Breathing, Meditation, Sleep, Reflection)', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^sleep/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /reflection/i })).toBeInTheDocument()
    // The groups cut in the trim are gone entirely.
    expect(screen.queryByRole('heading', { name: /^body/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^heart/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^steady/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^everyday/i })).toBeNull()
  })

  it('deep-links breathing cards with the right ?pattern= param', () => {
    renderPage()
    // Resonance sits in the shelf preview; the rest need the full Breathing shelf (its chip).
    expect(catalogLink(/resonance/i)).toHaveAttribute('href', '/breathe?pattern=resonance')
    openGroup(/^breathing$/i)
    expect(screen.getByRole('link', { name: /box/i })).toHaveAttribute('href', '/breathe?pattern=box')
    expect(screen.getByRole('link', { name: /energizing/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=energizing',
    )
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=alternate',
    )
  })

  it('deep-links the Meditation cards with the right route (mindfulness + 7 guided/gaze)', () => {
    renderPage()
    openGroup(/^meditation$/i)
    const medSection = screen.getByRole('heading', { name: /meditation/i }).closest('section') as HTMLElement
    expect(within(medSection).getByRole('link', { name: /mindfulness/i })).toHaveAttribute(
      'href',
      '/meditate',
    )
    expect(within(medSection).getByRole('link', { name: /focused attention/i })).toHaveAttribute(
      'href',
      '/meditate/focus',
    )
    expect(within(medSection).getByRole('link', { name: /^noting/i })).toHaveAttribute(
      'href',
      '/meditate/noting',
    )
    expect(within(medSection).getByRole('link', { name: /^mantra/i })).toHaveAttribute(
      'href',
      '/meditate/mantra',
    )
    expect(within(medSection).getByRole('link', { name: /body scan/i })).toHaveAttribute(
      'href',
      '/meditate/body-scan',
    )
    expect(within(medSection).getByRole('link', { name: /loving-kindness/i })).toHaveAttribute(
      'href',
      '/meditate/loving-kindness',
    )
    expect(within(medSection).getByRole('link', { name: /candle gazing/i })).toHaveAttribute(
      'href',
      '/trataka',
    )
    expect(within(medSection).getByRole('link', { name: /three mindful breaths/i })).toHaveAttribute(
      'href',
      '/meditate/three-breaths',
    )
  })

  it('moves body-scan, loving-kindness and three-breaths into Meditation (their old groups are gone)', () => {
    renderPage()
    openGroup(/^meditation$/i)
    const medSection = screen.getByRole('heading', { name: /meditation/i }).closest('section') as HTMLElement
    expect(within(medSection).getByRole('link', { name: /body scan/i })).toBeInTheDocument()
    expect(within(medSection).getByRole('link', { name: /loving-kindness/i })).toBeInTheDocument()
    expect(within(medSection).getByRole('link', { name: /three mindful breaths/i })).toBeInTheDocument()
  })

  it('deep-links the Rest & sleep cards (wind-down + yoga-nidra)', () => {
    renderPage()
    const sleepSection = screen.getByRole('heading', { name: /^sleep/i }).closest('section') as HTMLElement
    expect(within(sleepSection).getByRole('link', { name: /wind down/i })).toHaveAttribute(
      'href',
      '/meditate/wind-down',
    )
    expect(within(sleepSection).getByRole('link', { name: /yoga nidra/i })).toHaveAttribute(
      'href',
      '/meditate/yoga-nidra',
    )
  })

  it('links the reflection cards to their own pages', () => {
    renderPage()
    // Scope to the Reflection section (Gratitude has a matching name in no other kept group now,
    // but keep the scoping explicit and robust).
    const reflectionSection = screen
      .getByRole('heading', { name: /reflection/i })
      .closest('section') as HTMLElement
    expect(within(reflectionSection).getByRole('link', { name: /gratitude/i })).toHaveAttribute(
      'href',
      '/gratitude',
    )
    expect(within(reflectionSection).getByRole('link', { name: /journal/i })).toHaveAttribute(
      'href',
      '/journal',
    )
  })

  it('renders no spirit nudge or round-out highlight (the companion is hidden from the UI)', async () => {
    renderPage()
    await waitFor(() => expect(getStats).toHaveBeenCalled())
    expect(document.querySelector('.practices-spirit-nudge')).toBeNull()
    expect(screen.queryByText(/a little less/i)).toBeNull()
    expect(catalogLink(/resonance/i).className).not.toMatch(/practice-card--needed/)
  })
})

// ── Category chips + shelf previews (the calm browse) ────────────────────────
// The "All" overview shows each group as its first 3 cards + a quiet "See all N";
// a category chip (or the See-all button) shows that one group in full. Grid cards
// are compact — no per-card description (it still indexes for search).

describe('PracticesPage — category chips + shelf previews', () => {
  afterEach(cleanup)
  beforeEach(() => {
    getStats.mockReset()
    getStats.mockResolvedValue({ level: 10 })
  })

  it('previews each shelf on the All view: 3 cards + a "See all N" for larger groups', () => {
    renderPage()
    const medSection = screen
      .getByRole('heading', { name: /meditation/i })
      .closest('section') as HTMLElement
    // Only the first 3 of Meditation's 8 cards render in the preview…
    expect(medSection.querySelectorAll('.practice-card').length).toBe(3)
    // …with a quiet "See all 8" at the shelf's foot.
    expect(within(medSection).getByRole('button', { name: /see all 8/i })).toBeInTheDocument()
    // A small group (Reflection, 3 cards: Gratitude, Journal, Prayer) shows whole — no See-all
    // (the preview only truncates a group that runs more than one card past the preview count).
    const reflection = screen
      .getByRole('heading', { name: /reflection/i })
      .closest('section') as HTMLElement
    expect(reflection.querySelectorAll('.practice-card').length).toBe(3)
    expect(within(reflection).queryByRole('button', { name: /see all/i })).toBeNull()
  })

  it('shows one full shelf when its category chip is picked, and All restores the overview', () => {
    renderPage()
    openGroup(/^meditation$/i)
    // Only the Meditation section remains, in full (all 8 cards).
    expect(screen.queryByRole('heading', { name: /^breathing/i })).toBeNull()
    const medSection = screen
      .getByRole('heading', { name: /meditation/i })
      .closest('section') as HTMLElement
    expect(medSection.querySelectorAll('.practice-card').length).toBe(8)
    // "All" brings the calm overview back.
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByRole('heading', { name: /^breathing/i })).toBeInTheDocument()
  })

  it('expands a shelf via its "See all N" button too', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /see all 8/i }))
    const medSection = screen
      .getByRole('heading', { name: /meditation/i })
      .closest('section') as HTMLElement
    expect(medSection.querySelectorAll('.practice-card').length).toBe(8)
    expect(screen.queryByRole('heading', { name: /^breathing/i })).toBeNull()
  })

  it('keeps the Start-here on-ramp behind its chip (not stacked on the All view)', () => {
    renderPage()
    // No permanently-open beginner section on the All overview…
    expect(document.querySelector('.practices-beginner')).toBeNull()
    // …the curated shelf opens from its chip, with full (described) cards…
    fireEvent.click(screen.getByRole('button', { name: /start here/i }))
    const starter = document.querySelector('.practices-beginner') as HTMLElement
    expect(starter).not.toBeNull()
    expect(
      within(starter).getByRole('link', { name: /three mindful breaths/i }),
    ).toHaveAttribute('href', '/meditate/three-breaths')
    // …and the catalog shelves stand aside while the on-ramp is open.
    expect(screen.queryByRole('heading', { name: /^breathing/i })).toBeNull()
    // "All" returns to the overview.
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByRole('heading', { name: /^breathing/i })).toBeInTheDocument()
    expect(document.querySelector('.practices-beginner')).toBeNull()
  })

  it('keeps grid cards compact (no description), while search still matches description text', () => {
    renderPage()
    openGroup(/^breathing$/i)
    // The Alternate nostril card no longer displays its description ("Nadi Shodhana")…
    const alt = screen.getByRole('link', { name: /alternate nostril/i })
    expect(within(alt).queryByText(/nadi shodhana/i)).toBeNull()
    // …but searching that hidden text still finds the practice (name + desc stay indexed).
    fireEvent.change(screen.getByRole('searchbox', { name: /search practices/i }), {
      target: { value: 'NADI' },
    })
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toBeInTheDocument()
  })
})

// ── Programs row (nav destinations surfaced on the hub) ──────────────────────
// The nav "Practice" links straight here, so the two non-technique destinations
// (Guided paths → /paths, Log a past session → /sessions/new) must be reachable.

describe('PracticesPage — Programs row', () => {
  afterEach(cleanup)
  beforeEach(() => {
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
    // Baseline: both a matching and a non-matching card render (mindfulness is a Meditation
    // preview card and never appears in the suggested set, so it's unambiguous).
    expect(catalogLink(/resonance/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /mindfulness/i })).toBeInTheDocument()

    typeSearch('resonance')

    // The matching card is still shown; the non-matching one is gone.
    expect(catalogLink(/resonance/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /mindfulness/i })).toBeNull()
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
    expect(screen.queryByRole('link', { name: /mindfulness/i })).toBeNull()

    fireEvent.keyDown(box, { key: 'Escape' })
    // Everything is back.
    expect(screen.getByRole('link', { name: /mindfulness/i })).toBeInTheDocument()
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('clears the query via the × clear button', () => {
    renderPage()
    typeSearch('resonance')
    expect(screen.queryByRole('link', { name: /mindfulness/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(screen.getByRole('link', { name: /mindfulness/i })).toBeInTheDocument()
  })
})
