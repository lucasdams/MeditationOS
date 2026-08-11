/**
 * PracticesPage — the practices hub. Verifies the grouped sections render and deep-link
 * correctly, the level gates, the calm browse (chips + previews), and the live search.
 * The Spirit companion is hidden from the UI (dormant): the hub fetches no spirit state
 * and renders no spirit nudge or round-out highlight.
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
    // Default: a high level so gated cards (Chakra Om) render as normal links.
    getStats.mockResolvedValue({ level: 10 })
  })

  it('renders the page heading and a back link to Home', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /practices/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('renders all category groups (Breathing, Meditation, Body, Heart, Sleep, Steady, Everyday, Reflection)', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^body/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^heart/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^sleep/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^steady/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^everyday/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /reflection/i })).toBeInTheDocument()
  })

  it('deep-links breathing cards with the right ?pattern= param', () => {
    renderPage()
    // Resonance sits in the shelf preview; the rest need the full Breathing shelf (its chip).
    expect(catalogLink(/resonance/i)).toHaveAttribute(
      'href',
      '/breathe?pattern=resonance',
    )
    openGroup(/^breathing$/i)
    expect(screen.getByRole('link', { name: /box/i })).toHaveAttribute('href', '/breathe?pattern=box')
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=alternate',
    )
  })

  it('deep-links guided meditation cards with the right ?guided= param', async () => {
    renderPage()
    // Cross-shelf assertions: open each shelf's chip for the cards beyond its preview.
    expect(catalogLink(/body scan/i)).toHaveAttribute(
      'href',
      '/meditate?guided=body-scan',
    )
    expect(screen.getByRole('link', { name: /loving-kindness/i })).toHaveAttribute(
      'href',
      '/meditate?guided=loving-kindness',
    )
    openGroup(/^meditation$/i)
    expect(screen.getByRole('link', { name: /mindfulness/i })).toHaveAttribute('href', '/meditate')
    expect(screen.getByRole('link', { name: /name what you feel/i })).toHaveAttribute(
      'href',
      '/meditate?guided=name-feelings',
    )
    // Chakra Om is gated but level 10 (default) unlocks it → a real link.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /chakra om/i })).toHaveAttribute(
        'href',
        '/meditate?guided=chakra-om',
      ),
    )
    openGroup(/^body$/i)
    expect(screen.getByRole('link', { name: /mindful stretching/i })).toHaveAttribute(
      'href',
      '/meditate?guided=stretching',
    )
  })

  it('renders the Body group with Body scan + Mindful stretching moved out of Meditation', () => {
    renderPage()
    // Open the full Body shelf and assert its membership.
    openGroup(/^body$/i)
    const bodyHeading = screen.getByRole('heading', { name: /^body/i })
    const bodySection = bodyHeading.closest('section') as HTMLElement
    // Body scan and Mindful stretching now live in Body, not Meditation.
    expect(within(bodySection).getByRole('link', { name: /body scan/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /mindful stretching/i })).toBeInTheDocument()
    // The new Body-only practices are here too.
    expect(within(bodySection).getByRole('link', { name: /yoga nidra/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /muscle release/i })).toBeInTheDocument()
    expect(within(bodySection).getByRole('link', { name: /mindful walking/i })).toBeInTheDocument()

    // The full Meditation shelf must NOT carry them.
    openGroup(/^meditation$/i)
    const medHeading = screen.getByRole('heading', { name: /meditation/i })
    const medSection = medHeading.closest('section') as HTMLElement
    expect(within(medSection).queryByRole('link', { name: /body scan/i })).toBeNull()
    expect(within(medSection).queryByRole('link', { name: /mindful stretching/i })).toBeNull()
  })

  it('deep-links the Body cards with the right ?guided= param', () => {
    renderPage()
    openGroup(/^body$/i)
    expect(catalogLink(/body scan/i)).toHaveAttribute(
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
    openGroup(/^meditation$/i)
    expect(catalogLink(/focused attention/i)).toHaveAttribute(
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

  it('deep-links the added Meditation cards (Count the breath, Noting, Sound meditation)', () => {
    renderPage()
    openGroup(/^meditation$/i)
    expect(screen.getByRole('link', { name: /count the breath/i })).toHaveAttribute(
      'href',
      '/meditate?guided=count-breath',
    )
    expect(screen.getByRole('link', { name: /^noting/i })).toHaveAttribute(
      'href',
      '/meditate?guided=noting',
    )
    expect(screen.getByRole('link', { name: /sound meditation/i })).toHaveAttribute(
      'href',
      '/meditate?guided=sound-bath',
    )
  })

  it('renders the Heart section with Loving-kindness moved into it', () => {
    renderPage()
    openGroup(/^heart$/i)
    const heartHeading = screen.getByRole('heading', { name: /^heart/i })
    const heartSection = heartHeading.closest('section') as HTMLElement
    // Loving-kindness now lives in Heart, not Meditation.
    expect(within(heartSection).getByRole('link', { name: /loving-kindness/i })).toBeInTheDocument()
    openGroup(/^meditation$/i)
    const medHeading = screen.getByRole('heading', { name: /meditation/i })
    const medSection = medHeading.closest('section') as HTMLElement
    expect(within(medSection).queryByRole('link', { name: /loving-kindness/i })).toBeNull()
  })

  it('deep-links the Heart cards (loving-kindness + 4 new joy practices)', () => {
    renderPage()
    openGroup(/^heart$/i)
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

  it('deep-links the added Heart cards (Forgiveness, Gratitude meditation, Sympathetic joy, Awe)', () => {
    renderPage()
    openGroup(/^heart$/i)
    expect(screen.getByRole('link', { name: /forgiveness/i })).toHaveAttribute(
      'href',
      '/meditate?guided=forgiveness',
    )
    expect(screen.getByRole('link', { name: /gratitude meditation/i })).toHaveAttribute(
      'href',
      '/meditate?guided=gratitude-sit',
    )
    expect(screen.getByRole('link', { name: /sympathetic joy/i })).toHaveAttribute(
      'href',
      '/meditate?guided=sympathetic-joy',
    )
    expect(screen.getByRole('link', { name: /awe & wonder/i })).toHaveAttribute(
      'href',
      '/meditate?guided=awe',
    )
  })

  it('deep-links the new Sleep section cards', () => {
    renderPage()
    const sleepHeading = screen.getByRole('heading', { name: /^sleep/i })
    const sleepSection = sleepHeading.closest('section') as HTMLElement
    expect(within(sleepSection).getByRole('link', { name: /wind down/i })).toHaveAttribute(
      'href',
      '/meditate?guided=wind-down',
    )
    expect(within(sleepSection).getByRole('link', { name: /4-7-8 breath/i })).toHaveAttribute(
      'href',
      '/meditate?guided=four-seven-eight',
    )
    expect(within(sleepSection).getByRole('link', { name: /set down the day/i })).toHaveAttribute(
      'href',
      '/meditate?guided=set-down-day',
    )
  })

  it('deep-links the new Steady section cards', () => {
    renderPage()
    openGroup(/^steady$/i)
    const steadyHeading = screen.getByRole('heading', { name: /^steady/i })
    const steadySection = steadyHeading.closest('section') as HTMLElement
    expect(
      within(steadySection).getByRole('link', { name: /physiological sigh/i }),
    ).toHaveAttribute('href', '/meditate?guided=physiological-sigh')
    expect(
      within(steadySection).getByRole('link', { name: /ground in your senses/i }),
    ).toHaveAttribute('href', '/meditate?guided=steady-senses')
    expect(
      within(steadySection).getByRole('link', { name: /feet on the ground/i }),
    ).toHaveAttribute('href', '/meditate?guided=steady-feet')
    expect(
      within(steadySection).getByRole('link', { name: /soften, soothe, allow/i }),
    ).toHaveAttribute('href', '/meditate?guided=steady-soothe')
  })

  it('deep-links the new Everyday section cards', () => {
    renderPage()
    openGroup(/^everyday$/i)
    const everydayHeading = screen.getByRole('heading', { name: /^everyday/i })
    const everydaySection = everydayHeading.closest('section') as HTMLElement
    expect(
      within(everydaySection).getByRole('link', { name: /three mindful breaths/i }),
    ).toHaveAttribute('href', '/meditate?guided=three-breaths')
    expect(
      within(everydaySection).getByRole('link', { name: /pause & stop/i }),
    ).toHaveAttribute('href', '/meditate?guided=stop-pause')
    expect(
      within(everydaySection).getByRole('link', { name: /body check-in/i }),
    ).toHaveAttribute('href', '/meditate?guided=body-checkin')
    expect(
      within(everydaySection).getByRole('link', { name: /arriving/i }),
    ).toHaveAttribute('href', '/meditate?guided=arriving')
  })

  it('links the reflection cards to their own pages', () => {
    renderPage()
    // Scope to the Reflection section: "Gratitude" (reflection) and "Gratitude meditation" (Heart)
    // both match /gratitude/i, so target the Reflection card explicitly.
    const reflectionHeading = screen.getByRole('heading', { name: /reflection/i })
    const reflectionSection = reflectionHeading.closest('section') as HTMLElement
    expect(
      within(reflectionSection).getByRole('link', { name: /gratitude/i }),
    ).toHaveAttribute('href', '/gratitude')
    expect(screen.getByRole('link', { name: /journal/i })).toHaveAttribute('href', '/journal')
    // Candle gazing lives deep in the Meditation shelf → open its chip.
    openGroup(/^meditation$/i)
    expect(screen.getByRole('link', { name: /candle gazing/i })).toHaveAttribute('href', '/trataka')
  })

  it('renders no spirit nudge or round-out highlight (the companion is hidden from the UI)', async () => {
    renderPage()
    await waitFor(() => expect(getStats).toHaveBeenCalled())
    expect(document.querySelector('.practices-spirit-nudge')).toBeNull()
    expect(screen.queryByText(/a little less/i)).toBeNull()
    expect(catalogLink(/resonance/i).className).not.toMatch(/practice-card--needed/)
  })
})

// ── Chakra Om level gate ─────────────────────────────────────────────────────
// Chakra Om unlocks at level 5. Below it the card is a non-interactive, locked
// <div> (not a <Link>) showing "Reach level 5 to unlock"; at/above level 5 it's a
// normal deep-link card.

describe('PracticesPage — Chakra Om level gate', () => {
  afterEach(cleanup)
  beforeEach(() => {
    getStats.mockReset()
  })

  it('renders Chakra Om locked (non-link, "Reach level 5") below level 5', async () => {
    getStats.mockResolvedValue({ level: 3 })
    renderPage()
    await waitFor(() => expect(getStats).toHaveBeenCalled())
    // Chakra Om sits deep in the Meditation shelf — open its chip to see the full shelf.
    openGroup(/^meditation$/i)
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
    openGroup(/^meditation$/i)
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
    openGroup(/^meditation$/i)
    // level stays null → gated card stays locked.
    expect(screen.queryByRole('link', { name: /chakra om/i })).toBeNull()
    expect(screen.getByText(/reach level 5 to unlock/i)).toBeInTheDocument()
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
    // Only the first 3 of Meditation's 10 cards render in the preview…
    expect(medSection.querySelectorAll('.practice-card').length).toBe(3)
    // …with a quiet "See all 10" at the shelf's foot.
    expect(within(medSection).getByRole('button', { name: /see all 10/i })).toBeInTheDocument()
    // A small group (Reflection, 2 cards) shows whole — no See-all.
    const reflection = screen
      .getByRole('heading', { name: /reflection/i })
      .closest('section') as HTMLElement
    expect(reflection.querySelectorAll('.practice-card').length).toBe(2)
    expect(within(reflection).queryByRole('button', { name: /see all/i })).toBeNull()
  })

  it('shows one full shelf when its category chip is picked, and All restores the overview', () => {
    renderPage()
    openGroup(/^meditation$/i)
    // Only the Meditation section remains, in full (all 10 cards).
    expect(screen.queryByRole('heading', { name: /^breathing/i })).toBeNull()
    const medSection = screen
      .getByRole('heading', { name: /meditation/i })
      .closest('section') as HTMLElement
    expect(medSection.querySelectorAll('.practice-card').length).toBe(10)
    // "All" brings the calm overview back.
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByRole('heading', { name: /^breathing/i })).toBeInTheDocument()
  })

  it('expands a shelf via its "See all N" button too', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /see all 10/i }))
    const medSection = screen
      .getByRole('heading', { name: /meditation/i })
      .closest('section') as HTMLElement
    expect(medSection.querySelectorAll('.practice-card').length).toBe(10)
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
    ).toHaveAttribute('href', '/meditate?guided=three-breaths')
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
// The nav "Practice" now links straight here, so the two non-technique destinations
// that used to live in the dropdown (Guided paths → /paths, Log a past session →
// /sessions/new) must be reachable from the hub itself.

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
    // Baseline: both a matching and a non-matching card render.
    expect(catalogLink(/resonance/i)).toBeInTheDocument()
    expect(catalogLink(/body scan/i)).toBeInTheDocument()

    typeSearch('resonance')

    // The matching card is still shown; the non-matching one is gone.
    expect(catalogLink(/resonance/i)).toBeInTheDocument()
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
    expect(catalogLink(/body scan/i)).toBeInTheDocument()
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('clears the query via the × clear button', () => {
    renderPage()
    typeSearch('resonance')
    expect(screen.queryByRole('link', { name: /body scan/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(catalogLink(/body scan/i)).toBeInTheDocument()
  })
})
