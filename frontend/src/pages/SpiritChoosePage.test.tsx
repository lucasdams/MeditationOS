import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpiritPreview, SpiritSlotPreview, SpiritState } from '../types'

const get = vi.fn()
const choose = vi.fn()
const preview = vi.fn()
vi.mock('../services/spirit', () => ({
  spiritService: {
    get: (...a: unknown[]) => get(...a),
    choose: (...a: unknown[]) => choose(...a),
    preview: (...a: unknown[]) => preview(...a),
  },
}))

// A minimal per-path preview: one slot per path, a universal tier-1 option plus that path's own
// exclusive tier-3 capstone (and, for the cross-path test, another path's capstone we must NOT
// show). Mirrors the GET /spirit/preview shape.
function slotsFor(
  exclusiveOption: string,
  extra: SpiritSlotPreview['options'] = [],
): SpiritSlotPreview[] {
  return [
    {
      slot: 'companion',
      options: [
        { option: 'firefly', tier: 1, cost: 100, unlock_level: 1, need: 'joyful', exclusive: false },
        { option: exclusiveOption, tier: 3, cost: 220, unlock_level: 6, need: 'joyful', exclusive: true },
        ...extra,
      ],
    },
  ]
}

const PREVIEW: SpiritPreview = {
  stillness: slotsFor('tortoise'),
  breath: slotsFor('kitsune'),
  heart: slotsFor('crane'),
}

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

import SpiritChoosePage from './SpiritChoosePage'
import { ToastProvider } from '../context/ToastContext'

const need = { tier: 'content' as const, factor: 0.8 }
function spiritWith(overrides: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'spark',
    path: null,
    name: null,
    bond: { level: 1, xp_into_level: 0, xp_for_next: 20 },
    needs: { nourished: need, rested: need, joyful: need },
    condition: need,
    coins: 80,
    cosmetics: {},
    available: [],
    collection: [],
    set_bonus: { active: false, kind: null, count: 0, total: 0, label: 'Signature radiance' },
    ...overrides,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SpiritChoosePage />
      </ToastProvider>
    </MemoryRouter>,
  )

describe('SpiritChoosePage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    choose.mockReset()
    preview.mockReset()
    navigate.mockReset()
    localStorage.clear()
    // Default: the grows-into preview resolves. Tests that don't care still get a clean render.
    preview.mockResolvedValue(PREVIEW)
  })

  it('shows the three dosha choices for a pathless spark', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    await screen.findByRole('button', { name: /Choose Kapha/ })
    expect(screen.getByRole('button', { name: /Choose Pitta/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose Vata/ })).toBeInTheDocument()
  })

  it('names the creature AFTER choosing it; awaken is disabled until named (ADR-0024)', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    // Step 1: picking a creature needs no name — it advances to the naming step.
    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    // Step 2: the name step appears; awaken is disabled until a non-empty name is entered.
    const awaken = screen.getByRole('button', { name: /Awaken Pitta/ })
    expect(awaken).toBeDisabled()
    expect(choose).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText(/Ember/), { target: { value: 'Ember' } })
    expect(awaken).not.toBeDisabled()
  })

  it('awakens the chosen creature with the entered name and navigates to /spirit', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    choose.mockResolvedValue(spiritWith({ path: 'breath', name: 'Ember' }))
    renderPage()
    // Step 1: choose the creature; step 2: name it (trimmed) and awaken → choose sends {path, name}.
    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    fireEvent.change(screen.getByPlaceholderText(/Ember/), { target: { value: '  Ember  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Awaken Pitta/ }))
    await waitFor(() =>
      expect(choose).toHaveBeenCalledWith({ path: 'breath', name: 'Ember' }),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/spirit'))
  })

  it('redirects to /spirit when a creature is already chosen (nothing to pick)', async () => {
    get.mockResolvedValue(spiritWith({ path: 'stillness' }))
    renderPage()
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Choose Kapha/ })).toBeNull()
  })

  it('shows each creature its favoured practice + a "try a random look" button', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    await screen.findByRole('button', { name: /Choose Kapha/ })
    // The real basis for the choice: each creature shows its favoured practice.
    expect(screen.getAllByText(/Favours/)).toHaveLength(3)
    await waitFor(() => expect(preview).toHaveBeenCalled())
    // Each creature offers a "Try a random look" button (replaces the old one-at-a-time chips).
    const rolls = await screen.findAllByRole('button', { name: /Try a random look/ })
    expect(rolls).toHaveLength(3)
    // Rolling one swaps it to a re-roll + a Clear (and applies a full random look to that card).
    fireEvent.click(rolls[0])
    expect(screen.getByRole('button', { name: /Roll a new look/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Clear$/ })).toBeInTheDocument()
  })

  it('shows the chosen creature and its favoured-practice reason on the name step', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    // The name step focuses the choice: a name field + the creature's favoured practice and the
    // plain-language reason it suits it — no repetitive "grows into" tree.
    expect(await screen.findByPlaceholderText(/Ember/)).toBeInTheDocument()
    expect(screen.getByText(/Favours/)).toBeInTheDocument()
    expect(screen.getByText(/cooling, reflective gratitude/)).toBeInTheDocument() // Pitta's "why"
  })

  it('still works when the preview fetch fails (non-blocking enhancement)', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    preview.mockRejectedValue(new Error('nope'))
    renderPage()
    // The pick flow is unaffected — the cards render, just without the grows-into highlights.
    await screen.findByRole('button', { name: /Choose Kapha/ })
    fireEvent.click(screen.getByRole('button', { name: /Choose Pitta/ }))
    expect(screen.getByRole('button', { name: /Awaken Pitta/ })).toBeInTheDocument()
  })

  // ── Onboarding hatch (§5) ────────────────────────────────────────────────────
  // Arriving straight from the first guided breath (onboarding.intent set) reframes the page as a
  // celebratory "hatch" and gently SUGGESTS a matching dosha. A normal later visit is unchanged.
  describe('onboarding hatch', () => {
    it('shows a celebratory header + suggested dosha when arriving from onboarding', async () => {
      localStorage.setItem('onboarding.intent', 'calm') // calm → stillness / Kapha
      get.mockResolvedValue(spiritWith({ path: null }))
      renderPage()
      await screen.findByRole('button', { name: /Choose Kapha/ })
      // Celebratory hatch framing rather than the plain "Choose your creature".
      expect(screen.getByText(/took your first breath/i)).toBeInTheDocument()
      // A gentle, named suggestion (never forced — all three stay pickable).
      expect(screen.getByText(/Kapha might suit you/i)).toBeInTheDocument()
      expect(screen.getByText(/Suggested for you/i)).toBeInTheDocument()
      // All three creatures remain choosable.
      expect(screen.getByRole('button', { name: /Choose Pitta/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Choose Vata/ })).toBeInTheDocument()
    })

    it('clears the onboarding flags after a successful choose', async () => {
      localStorage.setItem('onboarding.intent', 'calm')
      localStorage.setItem('onboarding.pendingHatch', '1')
      get.mockResolvedValue(spiritWith({ path: null }))
      choose.mockResolvedValue(spiritWith({ path: 'stillness', name: 'Pebble' }))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: /Choose Kapha/ }))
      fireEvent.change(screen.getByPlaceholderText(/Ember/), { target: { value: 'Pebble' } })
      fireEvent.click(screen.getByRole('button', { name: /Awaken Kapha/ }))
      await waitFor(() => expect(choose).toHaveBeenCalled())
      await waitFor(() => expect(localStorage.getItem('onboarding.intent')).toBeNull())
      expect(localStorage.getItem('onboarding.pendingHatch')).toBeNull()
    })

    it('shows the normal "Choose your creature" header on a later (non-onboarding) visit', async () => {
      get.mockResolvedValue(spiritWith({ path: null }))
      renderPage()
      await screen.findByRole('button', { name: /Choose Kapha/ })
      expect(screen.getByText(/Choose your creature/i)).toBeInTheDocument()
      expect(screen.queryByText(/took your first breath/i)).toBeNull()
      expect(screen.queryByText(/Suggested for you/i)).toBeNull()
    })
  })
})
