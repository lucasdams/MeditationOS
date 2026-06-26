import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SpiritAvailableSlot, SpiritState } from '../types'

const get = vi.fn()
const choose = vi.fn()
const buyCosmetic = vi.fn()
const resetName = vi.fn()
const resetCosmetics = vi.fn()
const awaken = vi.fn()

vi.mock('../services/spirit', () => ({
  spiritService: {
    get: (...a: unknown[]) => get(...a),
    choose: (...a: unknown[]) => choose(...a),
    buyCosmetic: (...a: unknown[]) => buyCosmetic(...a),
    resetName: (...a: unknown[]) => resetName(...a),
    resetCosmetics: (...a: unknown[]) => resetCosmetics(...a),
    awaken: (...a: unknown[]) => awaken(...a),
  },
}))

import SpiritPage from './SpiritPage'
import { ToastProvider } from '../context/ToastContext'

// An OPEN (unapplied, ADR-0024) single-slot "aura" catalog with three differently-stated
// options: a plain buyable one, another buyable one, and a level-locked one. Lets a single
// fixture exercise buyable / level-locked / affordable rendering on an open slot.
const auraSlot: SpiritAvailableSlot = {
  slot: 'aura',
  applied: null,
  locked: false,
  options: [
    { option: 'soft', cost: 30, unlocked: true, unlock_hint: null, affordable: true, applied: false, available: true },
    { option: 'warm', cost: 45, unlocked: true, unlock_hint: null, affordable: true, applied: false, available: true },
    {
      option: 'starlit',
      cost: 70,
      unlocked: false,
      unlock_hint: 'Reach level 5',
      affordable: true,
      applied: false,
      available: true,
    },
  ],
}

// A LOCKED "aura" slot (ADR-0024): `soft` is applied, so the slot is locked and its other
// options can't be bought until upgrades are reset.
const lockedAuraSlot: SpiritAvailableSlot = {
  slot: 'aura',
  applied: 'soft',
  locked: true,
  options: [
    { option: 'soft', cost: 30, unlocked: true, unlock_hint: null, affordable: true, applied: true, available: true },
    { option: 'warm', cost: 45, unlocked: true, unlock_hint: null, affordable: false, applied: false, available: true },
  ],
}

const okNeed = (tier: SpiritState['condition']['tier'] = 'content', factor = 0.85) => ({
  tier,
  factor,
})

function spiritWith(overrides: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'fledgling',
    path: 'stillness',
    name: null,
    bond: { level: 7, xp_into_level: 10, xp_for_next: 40 },
    needs: { nourished: okNeed(), rested: okNeed(), joyful: okNeed() },
    condition: okNeed('content', 0.9),
    coins: 120,
    cosmetics: {},
    available: [auraSlot],
    collection: [],
    ...overrides,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SpiritPage />
      </ToastProvider>
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('SpiritPage personalize panel', () => {
  beforeEach(() => {
    get.mockReset()
    buyCosmetic.mockReset()
  })

  it('renders option state on an open slot — buyable prices and a level-locked option', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    // Two buyable options on the open slot state their coin price in the accessible name.
    expect(await screen.findByRole('button', { name: /Soft glow — 30 coins/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Warm glow — 45 coins/ })).toBeInTheDocument()

    // A level-locked option is rendered (not disabled, so it can still preview); its name
    // states the locked status + the unlock reason.
    const locked = screen.getByRole('button', { name: /Starlit — locked, reach level 5/i })
    expect(locked).not.toBeDisabled()
  })

  it('locks a slot once an option is applied — its other options cannot be bought (ADR-0024)', async () => {
    get.mockResolvedValue(
      spiritWith({ cosmetics: { aura: 'soft' }, available: [lockedAuraSlot] }),
    )

    renderPage()

    // The applied option reads as done and is disabled.
    const applied = await screen.findByRole('button', { name: /Soft glow — applied/ })
    expect(applied).toBeDisabled()

    // The other option in the now-locked slot is shown but NOT buyable (disabled, no purchase).
    const warm = screen.getByRole('button', { name: /Warm glow — locked, reset upgrades/i })
    expect(warm).toBeDisabled()
    fireEvent.click(warm)
    expect(buyCosmetic).not.toHaveBeenCalled()
  })

  it('buys a cosmetic via a before/after confirm — clicking the option opens the modal, Confirm buys', async () => {
    get.mockResolvedValue(spiritWith())
    buyCosmetic.mockResolvedValue(
      spiritWith({ coins: 75, cosmetics: { aura: 'warm' } }),
    )

    renderPage()

    // Clicking a buyable option no longer buys directly — it opens the before/after confirm.
    fireEvent.click(await screen.findByRole('button', { name: /Warm glow — 45 coins/ }))
    expect(buyCosmetic).not.toHaveBeenCalled()

    // The confirm modal shows a before/after preview ("Now" + "With Warm glow") and two arts.
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Now')).toBeInTheDocument()
    expect(dialog.getByText(/With Warm glow/)).toBeInTheDocument()
    expect(document.querySelectorAll('.spirit-buy-art .spirit-svg').length).toBe(2)

    // Confirm → the purchase goes through and the success toast shows.
    fireEvent.click(dialog.getByRole('button', { name: /Confirm/ }))
    await waitFor(() => expect(buyCosmetic).toHaveBeenCalledWith({ slot: 'aura', option: 'warm' }))
    await waitFor(() =>
      expect(screen.getByText(/Warm glow added — your spirit is delighted/)).toBeInTheDocument(),
    )
  })

  it('cancels the buy confirm without purchasing', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Warm glow — 45 coins/ }))
    const dialog = within(await screen.findByRole('dialog'))

    // Cancel closes the modal and nothing is bought.
    fireEvent.click(dialog.getByRole('button', { name: /Cancel/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(buyCosmetic).not.toHaveBeenCalled()
  })

  it('never buys a locked option on click, but gives quiet feedback (no silent no-op)', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    const locked = await screen.findByRole('button', { name: /Starlit — locked/ })
    fireEvent.click(locked)
    expect(buyCosmetic).not.toHaveBeenCalled()
    // The click is acknowledged with the unlock reason in a toast (not a silent no-op). The
    // requirement also shows on the locked chip itself; target the toast message specifically.
    await waitFor(() => {
      const toast = document.querySelector('.toast-message')
      expect(toast?.textContent).toMatch(/Reach level 5/)
    })
  })

  it('shows an error toast when a buy fails', async () => {
    get.mockResolvedValue(spiritWith())
    buyCosmetic.mockRejectedValue(new Error('nope'))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Warm glow — 45 coins/ }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /Confirm/ }))
    await waitFor(() => expect(screen.getByText(/Could not apply that yet/)).toBeInTheDocument())
  })
})

describe('SpiritPage cosmetics on the art (preview)', () => {
  beforeEach(() => {
    get.mockReset()
    buyCosmetic.mockReset()
  })

  // The "night" habitat draws a dark backdrop rect (fill #1e293b). It's a stable marker that an
  // applied/previewed habitat cosmetic actually renders on the art.
  const habitatSlot: SpiritAvailableSlot = {
    slot: 'habitat',
    applied: null,
    locked: false,
    options: [
      { option: 'night', cost: 80, unlocked: true, unlock_hint: null, affordable: true, applied: false, available: true },
    ],
  }

  // The live spirit now renders on the centered customize STAGE (the hero is a compact status
  // line). Count the night-habitat backdrop rects on that stage's art.
  const nightRectsInHero = () => {
    const stage = document.querySelector('.spirit-stage-art')
    return stage ? stage.querySelectorAll('rect[fill="#1e293b"]').length : 0
  }

  it('renders an applied cosmetic on the centered customize stage', async () => {
    get.mockResolvedValue(
      spiritWith({ cosmetics: { habitat: 'night' }, available: [habitatSlot] }),
    )

    renderPage()
    await screen.findByRole('button', { name: /Night sky/ })

    // The applied night habitat draws its dark backdrop on the centered stage art.
    expect(nightRectsInHero()).toBeGreaterThan(0)
  })

  it('previews an unowned cosmetic on hover, then restores on leave (no purchase)', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [habitatSlot] }))

    renderPage()
    const nightBtn = await screen.findByRole('button', { name: /Night sky/ })

    // Nothing owned/previewed yet → no night backdrop, no Preview badge.
    expect(nightRectsInHero()).toBe(0)
    expect(screen.queryByText('Preview')).toBeNull()

    fireEvent.mouseEnter(nightBtn)
    expect(nightRectsInHero()).toBeGreaterThan(0)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(buyCosmetic).not.toHaveBeenCalled() // view-only

    fireEvent.mouseLeave(nightBtn)
    expect(nightRectsInHero()).toBe(0)
    expect(screen.queryByText('Preview')).toBeNull()
  })

  it('renders a SpiritArt on the centered customize stage reflecting a focused option', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [habitatSlot] }))

    renderPage()
    const nightBtn = await screen.findByRole('button', { name: /Night sky/ })

    // The stage hosts its own SpiritArt (the prominent, live-previewing render).
    const stage = document.querySelector('.spirit-stage-art .spirit-svg')
    expect(stage).not.toBeNull()
    expect(nightRectsInHero()).toBe(0)

    // Keyboard focus on a side option previews it on the centered stage (not just hover).
    fireEvent.focus(nightBtn)
    expect(nightRectsInHero()).toBeGreaterThan(0)
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })
})

describe('SpiritPage name (immutable; paid reset — ADR-0024)', () => {
  beforeEach(() => {
    get.mockReset()
    resetName.mockReset()
  })

  it('shows the name read-only on the hero (no editable nickname field)', async () => {
    get.mockResolvedValue(spiritWith({ name: 'Ember' }))

    renderPage()

    await screen.findByText('Personalize')
    // The name shows on the hero, read-only.
    expect(document.querySelector('.spirit-hero-name')?.textContent).toBe('Ember')
    // There is no free editable nickname input anymore.
    expect(screen.queryByPlaceholderText(/Give your spirit a name/)).toBeNull()
  })

  it('changes the name via the paid reset flow (confirm → input → resetName)', async () => {
    get.mockResolvedValue(spiritWith({ name: 'Ember', coins: 400 }))
    resetName.mockResolvedValue(spiritWith({ name: 'Aster', coins: 150 }))

    renderPage()

    // Open the reset-name modal, type a new name, and confirm.
    fireEvent.click(await screen.findByRole('button', { name: /Reset name/ }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByPlaceholderText(/A new name/), { target: { value: 'Aster' } })
    fireEvent.click(dialog.getByRole('button', { name: /Change name/ }))

    await waitFor(() => expect(resetName).toHaveBeenCalledWith({ name: 'Aster' }))
  })

  it('disables the reset-name action when coins are below the reset cost', async () => {
    get.mockResolvedValue(spiritWith({ name: 'Ember', coins: 100 }))

    renderPage()

    const btn = await screen.findByRole('button', { name: /Reset name/ })
    expect(btn).toBeDisabled()
  })
})

describe('SpiritPage reset upgrades (paid, no refund — ADR-0024)', () => {
  beforeEach(() => {
    get.mockReset()
    resetCosmetics.mockReset()
  })

  it('offers reset-upgrades only when something is applied, and resets after confirmation', async () => {
    get.mockResolvedValue(
      spiritWith({ cosmetics: { aura: 'soft' }, available: [lockedAuraSlot], coins: 400 }),
    )
    resetCosmetics.mockResolvedValue(spiritWith({ cosmetics: {}, available: [auraSlot] }))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Reset upgrades/ }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /Reset upgrades/ }))

    await waitFor(() => expect(resetCosmetics).toHaveBeenCalledTimes(1))
  })

  it('hides the reset-upgrades action when no upgrades are applied', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [auraSlot] }))

    renderPage()
    await screen.findByText('Personalize')

    expect(screen.queryByRole('button', { name: /Reset upgrades/ })).toBeNull()
  })

  it('disables the reset-upgrades action when coins are below the reset cost', async () => {
    get.mockResolvedValue(
      spiritWith({ cosmetics: { aura: 'soft' }, available: [lockedAuraSlot], coins: 100 }),
    )

    renderPage()

    const btn = await screen.findByRole('button', { name: /Reset upgrades/ })
    expect(btn).toBeDisabled()
  })
})

describe('SpiritPage collection gallery', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('renders retired spirits from the collection', async () => {
    get.mockResolvedValue(
      spiritWith({
        collection: [
          { id: 'r1', stage: 'radiant', path: 'breath', name: 'Zephyr' },
          { id: 'r2', stage: 'radiant', path: 'heart', name: null },
        ],
      }),
    )

    renderPage()

    expect(await screen.findByText('Zephyr')).toBeInTheDocument()
    // An unnamed retired spirit falls back to a stage label.
    expect(screen.getByText(/Radiant spirit/)).toBeInTheDocument()
  })

  it('shows a concise empty-collection note when there are no retired spirits', async () => {
    get.mockResolvedValue(spiritWith({ collection: [] }))

    renderPage()

    // The empty-state line is shortened to a single non-redundant line (ADR-0024 copy fix).
    expect(await screen.findByText('None yet.')).toBeInTheDocument()
  })
})

describe('SpiritPage awaken (radiant only)', () => {
  beforeEach(() => {
    get.mockReset()
    awaken.mockReset()
  })

  it('hides the awaken action below radiant', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'ascendant' }))

    renderPage()
    await screen.findByText('Personalize')

    expect(screen.queryByRole('button', { name: /Awaken a new spark/ })).toBeNull()
  })

  it('shows the awaken action at radiant and awakens after confirmation', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'radiant' }))
    awaken.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()

    // The action is offered at radiant; clicking opens a confirmation.
    fireEvent.click(await screen.findByRole('button', { name: /Awaken a new spark/ }))
    const dialog = within(await screen.findByRole('dialog'))

    // Confirm → the service is called.
    fireEvent.click(dialog.getByRole('button', { name: /Awaken a new spark/ }))
    await waitFor(() => expect(awaken).toHaveBeenCalledTimes(1))
  })
})

// --- ADR-0023: dosha picker, needs/care, level-gated upgrades ----------------------------

describe('SpiritPage dosha picker (pathless spark)', () => {
  beforeEach(() => {
    get.mockReset()
    choose.mockReset()
  })

  it('redirects a pathless spark to the dedicated choose page (no inline picker here)', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()

    // The picker moved to its own /spirit/choose page; a pathless spark redirects there, so
    // neither the picker nor the Personalize panel renders on /spirit.
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByText('Choose your creature')).toBeNull()
    expect(screen.queryByText('Personalize')).toBeNull()
  })

  it('hides the picker once a creature is chosen', async () => {
    get.mockResolvedValue(spiritWith({ path: 'stillness' }))

    renderPage()
    await screen.findByText('Personalize')

    expect(screen.queryByText('Choose your creature')).toBeNull()
  })
})

describe('SpiritPage care needs (ADR-0023)', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('shows the three needs and a kind care nudge when a need is low', async () => {
    get.mockResolvedValue(
      spiritWith({
        path: 'breath', // Pitta → balanced by gratitude & journaling (cooling)
        needs: {
          nourished: okNeed('restless', 0.5),
          rested: okNeed('content'),
          joyful: okNeed('content'),
        },
      }),
    )

    renderPage()

    await screen.findByText('Care')
    expect(screen.getByText('Nourishment')).toBeInTheDocument()
    expect(screen.getByText('Rest')).toBeInTheDocument()
    expect(screen.getByText('Joy')).toBeInTheDocument()
    // The nudge names the creature (Pitta) and its reviving practice (gratitude & journaling).
    expect(screen.getByText(/Pitta is restless/i)).toBeInTheDocument()
    expect(screen.getByText(/gratitude & journaling would revive it/i)).toBeInTheDocument()
  })

  // (A pathless spark now redirects to /spirit/choose, covered by the dosha-picker describe and
  // SpiritChoosePage.test — so there's no inline pathless state to assert here.)
})

describe('SpiritPage level-gated upgrades shown, not hidden (ADR-0023 / task #4)', () => {
  beforeEach(() => {
    get.mockReset()
    buyCosmetic.mockReset()
  })

  it('surfaces a locked option with its level requirement visibly (a lock + "Reach level N")', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    // The locked Starlit option is shown (not hidden) with its unlock requirement on the chip.
    const locked = await screen.findByRole('button', { name: /Starlit — locked, reach level 5/i })
    expect(locked).toBeInTheDocument()
    // The requirement text is rendered in the panel, so the user can see what to work toward.
    expect(within(locked).getByText(/Reach level 5/)).toBeInTheDocument()
    // It stays non-buyable (a locked click never buys).
    expect(buyCosmetic).not.toHaveBeenCalled()
  })
})
