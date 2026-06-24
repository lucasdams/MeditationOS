import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SpiritAvailableSlot, SpiritState } from '../types'

const get = vi.fn()
const choose = vi.fn()
const buyCosmetic = vi.fn()
const rename = vi.fn()
const awaken = vi.fn()

vi.mock('../services/spirit', () => ({
  spiritService: {
    get: (...a: unknown[]) => get(...a),
    choose: (...a: unknown[]) => choose(...a),
    buyCosmetic: (...a: unknown[]) => buyCosmetic(...a),
    rename: (...a: unknown[]) => rename(...a),
    awaken: (...a: unknown[]) => awaken(...a),
  },
}))

import SpiritPage from './SpiritPage'
import { ToastProvider } from '../context/ToastContext'

// A single-slot "aura" catalog with three differently-stated options: applied, locked, and a
// plain buyable one. Lets a single fixture exercise applied / locked / affordable rendering.
const auraSlot: SpiritAvailableSlot = {
  slot: 'aura',
  applied: 'soft',
  options: [
    { option: 'soft', cost: 30, unlocked: true, unlock_hint: null, affordable: true, applied: true },
    { option: 'warm', cost: 45, unlocked: true, unlock_hint: null, affordable: true, applied: false },
    {
      option: 'starlit',
      cost: 70,
      unlocked: false,
      unlock_hint: 'Reach level 5',
      affordable: true,
      applied: false,
    },
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
    cosmetics: { aura: 'soft' },
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

  it('renders option state — applied (✓), locked (🔒), and an affordable price', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    // Applied option reads as done and is disabled (nothing to buy). The accessible name now
    // carries the full state ("Soft glow — applied") for SR/keyboard, not just the ✓ glyph.
    const applied = await screen.findByRole('button', { name: /Soft glow — applied/ })
    expect(applied).toBeDisabled()

    // A locked option is rendered (not disabled, so it can still preview); its name states the
    // locked status + the unlock reason.
    const locked = screen.getByRole('button', { name: /Starlit — locked, reach level 5/i })
    expect(locked).not.toBeDisabled()

    // A plain buyable option's name states its coin price.
    expect(screen.getByRole('button', { name: /Warm glow — 45 coins/ })).toBeInTheDocument()
  })

  it('buys a cosmetic via the service and swaps in the returned state', async () => {
    get.mockResolvedValue(spiritWith())
    buyCosmetic.mockResolvedValue(
      spiritWith({ coins: 75, cosmetics: { aura: 'warm' } }),
    )

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Warm glow — 45 coins/ }))

    await waitFor(() => expect(buyCosmetic).toHaveBeenCalledWith({ slot: 'aura', option: 'warm' }))
    await waitFor(() =>
      expect(screen.getByText(/Warm glow added to your spirit/)).toBeInTheDocument(),
    )
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
    options: [
      { option: 'night', cost: 80, unlocked: true, unlock_hint: null, affordable: true, applied: false },
    ],
  }

  const nightRectsInHero = () => {
    const hero = document.querySelector('.spirit-hero-art')
    return hero ? hero.querySelectorAll('rect[fill="#1e293b"]').length : 0
  }

  it('renders an applied cosmetic on the hero art', async () => {
    get.mockResolvedValue(
      spiritWith({ cosmetics: { habitat: 'night' }, available: [habitatSlot] }),
    )

    renderPage()
    await screen.findByRole('button', { name: /Night sky/ })

    // The applied night habitat draws its dark backdrop on the hero art.
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
})

describe('SpiritPage nickname', () => {
  beforeEach(() => {
    get.mockReset()
    rename.mockReset()
  })

  it('saves a nickname on blur (PATCH)', async () => {
    get.mockResolvedValue(spiritWith())
    rename.mockResolvedValue(spiritWith())

    renderPage()

    const input = await screen.findByPlaceholderText(/Give your spirit a name/)
    fireEvent.change(input, { target: { value: 'Ember' } })
    fireEvent.blur(input)

    await waitFor(() => expect(rename).toHaveBeenCalledWith({ name: 'Ember' }))
  })

  it('pre-fills the input from the saved name and shows it on the hero', async () => {
    get.mockResolvedValue(spiritWith({ name: 'Ember' }))

    renderPage()

    const input = (await screen.findByPlaceholderText(
      /Give your spirit a name/,
    )) as HTMLInputElement
    expect(input.value).toBe('Ember')
    // The saved name also shows on the hero.
    expect(document.querySelector('.spirit-hero-name')?.textContent).toBe('Ember')
  })

  it('clears the nickname when emptied (sends null)', async () => {
    get.mockResolvedValue(spiritWith())
    rename.mockResolvedValue(spiritWith())

    renderPage()

    const input = await screen.findByPlaceholderText(/Give your spirit a name/)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    await waitFor(() => expect(rename).toHaveBeenCalledWith({ name: null }))
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

  it('shows an empty-collection note when there are no retired spirits', async () => {
    get.mockResolvedValue(spiritWith({ collection: [] }))

    renderPage()

    expect(await screen.findByText(/No past spirits yet/)).toBeInTheDocument()
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

  it('shows the three dosha choices (Kapha / Pitta / Vata) for a pathless spark', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()

    await screen.findByText('Choose your creature')
    expect(screen.getByRole('button', { name: /Choose Kapha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose Pitta/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose Vata/ })).toBeInTheDocument()
    // The hero reads as a pathless spark, not a creature.
    expect(screen.getByText(/a pathless spark/i)).toBeInTheDocument()
  })

  it('chooses a creature via the service and swaps in the returned state', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))
    // Choosing Pitta (breath) returns the spirit now committed to that path.
    choose.mockResolvedValue(spiritWith({ stage: 'spark', path: 'breath' }))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    await waitFor(() => expect(choose).toHaveBeenCalledWith({ path: 'breath' }))
    // After choosing, the picker is gone (the spirit now has a path).
    await waitFor(() => expect(screen.queryByText('Choose your creature')).toBeNull())
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
        path: 'breath', // Pitta → breathwork
        needs: {
          nourished: okNeed('restless', 0.5),
          rested: okNeed('content'),
          joyful: okNeed('content'),
        },
      }),
    )

    renderPage()

    await screen.findByText('Care')
    expect(screen.getByText('Nourished')).toBeInTheDocument()
    expect(screen.getByText('Rested')).toBeInTheDocument()
    expect(screen.getByText('Joyful')).toBeInTheDocument()
    // The nudge names the creature (Pitta) and its reviving practice (breathwork), never shaming.
    expect(screen.getByText(/Pitta is restless/i)).toBeInTheDocument()
    expect(screen.getByText(/breathwork would revive it/i)).toBeInTheDocument()
  })

  it('shows no care panel for a pathless spark (no needs yet)', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()
    await screen.findByText('Choose your creature')

    expect(screen.queryByText('Care')).toBeNull()
  })
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
