import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SpiritAvailableSlot, SpiritSlotOption, SpiritState } from '../types'

const get = vi.fn()
const choose = vi.fn()
const unlock = vi.fn()
const equip = vi.fn()
const resetName = vi.fn()
const awaken = vi.fn()

vi.mock('../services/spirit', () => ({
  spiritService: {
    get: (...a: unknown[]) => get(...a),
    choose: (...a: unknown[]) => choose(...a),
    unlock: (...a: unknown[]) => unlock(...a),
    equip: (...a: unknown[]) => equip(...a),
    resetName: (...a: unknown[]) => resetName(...a),
    awaken: (...a: unknown[]) => awaken(...a),
  },
}))

import SpiritPage from './SpiritPage'
import { ToastProvider } from '../context/ToastContext'

// A node-builder so each test states only the flags it cares about; the rest fall to sensible
// defaults (a tier-1, universal, unowned option). Mirrors the backend SpiritSlotOption (ADR-0027).
function opt(over: Partial<SpiritSlotOption> & { option: string }): SpiritSlotOption {
  return {
    cost: 30,
    unlock_level: 1,
    unlock_hint: null,
    tier: 1,
    affordable: true,
    owned: false,
    equipped: false,
    unlockable: true,
    available: true,
    need: 'rested',
    ...over,
  }
}

// A single-slot "aura" tree exercising all five node states at once:
//   warm     — owned + equipped → worn
//   soft     — owned, not equipped → Equip (free)
//   frost    — unlockable + affordable → Unlock · cost (auto-equips)
//   rose     — unlockable but too few coins → Unlock disabled + a coin hint
//   starlit  — locked (level not met) → greyed, "Reach level 5"
const auraTree: SpiritAvailableSlot = {
  slot: 'aura',
  equipped: 'warm',
  options: [
    opt({ option: 'warm', tier: 1, owned: true, equipped: true, unlockable: false, need: 'nourished' }),
    opt({ option: 'soft', tier: 1, cost: 30, owned: true, unlockable: false }),
    opt({ option: 'frost', tier: 1, cost: 45, affordable: true, need: 'nourished' }),
    opt({ option: 'rose', tier: 1, cost: 999, affordable: false }),
    opt({
      option: 'starlit',
      tier: 2,
      cost: 70,
      unlock_level: 5,
      unlock_hint: 'Reach level 5',
      unlockable: false,
      affordable: true,
    }),
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
    cosmetics: { aura: 'warm' },
    available: [auraTree],
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

describe('SpiritPage skill tree — the five node states (ADR-0027)', () => {
  beforeEach(() => {
    get.mockReset()
    unlock.mockReset()
    equip.mockReset()
  })

  it('shows an equipped option as worn (a badge, not an action) with a free Remove', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    await screen.findByText('Customize')
    // The equipped option reads as worn — a badge, not an Equip/Unlock button.
    const node = document.querySelector('.spirit-node--equipped')
    expect(node).not.toBeNull()
    expect(within(node as HTMLElement).getByText(/Worn/)).toBeInTheDocument()
    expect(within(node as HTMLElement).getByText('Warm glow')).toBeInTheDocument()
    // A free Remove clears the slot (equip(slot, null)).
    expect(within(node as HTMLElement).getByRole('button', { name: /Remove Warm glow/ })).toBeInTheDocument()
  })

  it('shows an owned-but-unequipped option as a free Equip', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    // `soft` is owned but not equipped → a free Equip button.
    expect(await screen.findByRole('button', { name: /Equip Soft glow/ })).toBeInTheDocument()
  })

  it('shows an unlockable + affordable option as Unlock · cost', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    // `frost` is unlockable and affordable → an Unlock button stating its cost.
    expect(
      await screen.findByRole('button', { name: /Unlock Frost glow for 45 coins/ }),
    ).toBeInTheDocument()
  })

  it('shows an unlockable but unaffordable option as a disabled Unlock with a coin hint', async () => {
    get.mockResolvedValue(spiritWith({ coins: 50 }))

    renderPage()

    // `rose` is unlockable but the balance (50) is below its 999 cost → Unlock disabled + a hint.
    const btn = await screen.findByRole('button', {
      name: /Unlock Rose glow for 999 coins — need more coins/,
    })
    expect(btn).toBeDisabled()
    // The shortfall hint is shown (999 − 50 = 949).
    expect(screen.getByText(/need 949 more coins/)).toBeInTheDocument()
  })

  it('shows a level-locked option greyed with its reason ("Reach level 5")', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    await screen.findByText('Customize')
    // `starlit` is locked (level not met) → no Unlock/Equip button, just the reason.
    expect(screen.queryByRole('button', { name: /Starlit/ })).toBeNull()
    const locked = document.querySelector('.spirit-node--locked')
    expect(locked).not.toBeNull()
    expect(within(locked as HTMLElement).getByText(/Reach level 5/)).toBeInTheDocument()
  })

  it('shows the tier-prereq reason for a locked higher-tier option whose level IS met', async () => {
    // A tier-2 option whose level is met but tier prereq is not (unlockable=false, no unlock_hint)
    // → the reason is the tier prerequisite, not a level.
    const tieredTree: SpiritAvailableSlot = {
      slot: 'aura',
      equipped: null,
      options: [
        opt({ option: 'soft', tier: 1, unlockable: true }),
        opt({ option: 'starlit', tier: 2, unlockable: false, unlock_hint: null }),
      ],
    }
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [tieredTree] }))

    renderPage()

    await screen.findByText('Customize')
    const locked = document.querySelector('.spirit-node--locked')
    expect(locked).not.toBeNull()
    expect(within(locked as HTMLElement).getByText(/Unlock a tier-1 option first/)).toBeInTheDocument()
  })

  it('lays out the slot by tier (tier rows in ascending order)', async () => {
    const tieredTree: SpiritAvailableSlot = {
      slot: 'aura',
      equipped: null,
      options: [
        opt({ option: 'starlit', tier: 2, unlockable: false, unlock_hint: 'Reach level 5' }),
        opt({ option: 'soft', tier: 1, unlockable: true }),
      ],
    }
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [tieredTree] }))

    renderPage()

    await screen.findByText('Customize')
    const tiers = Array.from(document.querySelectorAll('.spirit-tier')).map((el) =>
      el.getAttribute('data-tier'),
    )
    // Two tier rows, ascending (1 then 2) regardless of option order.
    expect(tiers).toEqual(['1', '2'])
  })
})

describe('SpiritPage unlock flow (ADR-0027)', () => {
  beforeEach(() => {
    get.mockReset()
    unlock.mockReset()
  })

  it('unlocks via a before/after confirm — clicking Unlock opens the modal, Confirm unlocks', async () => {
    get.mockResolvedValue(spiritWith())
    unlock.mockResolvedValue(spiritWith({ coins: 75, cosmetics: { aura: 'frost' } }))

    renderPage()

    // Clicking an unlockable node opens the before/after confirm (it does not unlock directly).
    fireEvent.click(await screen.findByRole('button', { name: /Unlock Frost glow for 45 coins/ }))
    expect(unlock).not.toHaveBeenCalled()

    // The confirm modal shows the before/after preview ("Now" + "With Frost glow") and two arts.
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Now')).toBeInTheDocument()
    expect(dialog.getByText(/With Frost glow/)).toBeInTheDocument()
    expect(document.querySelectorAll('.spirit-buy-art .spirit-svg').length).toBe(2)

    // Confirm → the unlock goes through and a success toast shows.
    fireEvent.click(dialog.getByRole('button', { name: /^Unlock$/ }))
    await waitFor(() => expect(unlock).toHaveBeenCalledWith({ slot: 'aura', option: 'frost' }))
    await waitFor(() =>
      expect(screen.getByText(/Frost glow unlocked — your spirit is delighted/)).toBeInTheDocument(),
    )
  })

  it('cancels the unlock confirm without unlocking', async () => {
    get.mockResolvedValue(spiritWith())

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Unlock Frost glow for 45 coins/ }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.click(dialog.getByRole('button', { name: /Cancel/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(unlock).not.toHaveBeenCalled()
  })

  it('shows an error toast when an unlock fails', async () => {
    get.mockResolvedValue(spiritWith())
    unlock.mockRejectedValue(new Error('nope'))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Unlock Frost glow for 45 coins/ }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /^Unlock$/ }))
    await waitFor(() => expect(screen.getByText(/Could not unlock that yet/)).toBeInTheDocument())
  })
})

describe('SpiritPage equip flow (ADR-0027 — free)', () => {
  beforeEach(() => {
    get.mockReset()
    equip.mockReset()
  })

  it('equips an owned option for free (no confirm modal)', async () => {
    get.mockResolvedValue(spiritWith())
    equip.mockResolvedValue(spiritWith({ cosmetics: { aura: 'soft' } }))

    renderPage()

    // Equipping an owned option is immediate and free — no confirmation modal.
    fireEvent.click(await screen.findByRole('button', { name: /Equip Soft glow/ }))
    await waitFor(() => expect(equip).toHaveBeenCalledWith({ slot: 'aura', option: 'soft' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(screen.getByText(/Soft glow equipped/)).toBeInTheDocument())
  })

  it('clears a slot via the equipped option Remove (equip(slot, null))', async () => {
    get.mockResolvedValue(spiritWith())
    equip.mockResolvedValue(spiritWith({ cosmetics: {} }))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Remove Warm glow/ }))
    await waitFor(() => expect(equip).toHaveBeenCalledWith({ slot: 'aura', option: null }))
  })
})

describe('SpiritPage cosmetics on the art (preview)', () => {
  beforeEach(() => {
    get.mockReset()
    unlock.mockReset()
  })

  // The "night" habitat draws a dark backdrop rect (fill #1e293b). It's a stable marker that an
  // equipped/previewed habitat cosmetic actually renders on the art.
  const habitatTree: SpiritAvailableSlot = {
    slot: 'habitat',
    equipped: null,
    options: [opt({ option: 'night', cost: 80, tier: 1, unlockable: true })],
  }

  // The live spirit renders on the centered customize STAGE (the hero is a compact status line).
  const nightRectsInHero = () => {
    const stage = document.querySelector('.spirit-stage-art')
    return stage ? stage.querySelectorAll('rect[fill="#1e293b"]').length : 0
  }

  it('renders an equipped cosmetic on the centered customize stage', async () => {
    const equippedHabitat: SpiritAvailableSlot = {
      slot: 'habitat',
      equipped: 'night',
      options: [opt({ option: 'night', cost: 80, tier: 1, owned: true, equipped: true, unlockable: false })],
    }
    get.mockResolvedValue(
      spiritWith({ cosmetics: { habitat: 'night' }, available: [equippedHabitat] }),
    )

    renderPage()
    await screen.findByText('Customize')

    // The equipped night habitat draws its dark backdrop on the centered stage art.
    expect(nightRectsInHero()).toBeGreaterThan(0)
  })

  it('previews an unowned cosmetic on hover, then restores on leave (no purchase)', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [habitatTree] }))

    renderPage()
    const nightBtn = await screen.findByRole('button', { name: /Unlock Night sky/ })

    // Nothing owned/previewed yet → no night backdrop, no Preview badge.
    expect(nightRectsInHero()).toBe(0)
    expect(screen.queryByText('Preview')).toBeNull()

    fireEvent.mouseEnter(nightBtn)
    expect(nightRectsInHero()).toBeGreaterThan(0)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(unlock).not.toHaveBeenCalled() // view-only

    fireEvent.mouseLeave(nightBtn)
    expect(nightRectsInHero()).toBe(0)
    expect(screen.queryByText('Preview')).toBeNull()
  })

  it('previews on keyboard focus on the centered stage (not just hover)', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: {}, available: [habitatTree] }))

    renderPage()
    const nightBtn = await screen.findByRole('button', { name: /Unlock Night sky/ })

    const stage = document.querySelector('.spirit-stage-art .spirit-svg')
    expect(stage).not.toBeNull()
    expect(nightRectsInHero()).toBe(0)

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

    await screen.findByText('Customize')
    expect(document.querySelector('.spirit-hero-name')?.textContent).toBe('Ember')
    expect(screen.queryByPlaceholderText(/Give your spirit a name/)).toBeNull()
  })

  it('changes the name via the paid reset flow (confirm → input → resetName)', async () => {
    get.mockResolvedValue(spiritWith({ name: 'Ember', coins: 400 }))
    resetName.mockResolvedValue(spiritWith({ name: 'Aster', coins: 150 }))

    renderPage()

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

describe('SpiritPage no longer has a paid upgrades-reset (ADR-0027)', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('does not render any reset-upgrades action', async () => {
    get.mockResolvedValue(spiritWith({ cosmetics: { aura: 'warm' }, coins: 400 }))

    renderPage()
    await screen.findByText('Customize')

    // The paid upgrades-reset (ADR-0024) is removed — only the name reset remains.
    expect(screen.queryByRole('button', { name: /Reset upgrades/ })).toBeNull()
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
    expect(screen.getByText(/Radiant spirit/)).toBeInTheDocument()
  })

  it('shows a concise empty-collection note when there are no retired spirits', async () => {
    get.mockResolvedValue(spiritWith({ collection: [] }))

    renderPage()

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
    await screen.findByText('Customize')

    expect(screen.queryByRole('button', { name: /Awaken a new spark/ })).toBeNull()
  })

  it('shows the awaken action at radiant and awakens after confirmation', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'radiant' }))
    awaken.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Awaken a new spark/ }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.click(dialog.getByRole('button', { name: /Awaken a new spark/ }))
    await waitFor(() => expect(awaken).toHaveBeenCalledTimes(1))
  })
})

// --- ADR-0023: dosha picker, needs/care ---------------------------------------------------

describe('SpiritPage dosha picker (pathless spark)', () => {
  beforeEach(() => {
    get.mockReset()
    choose.mockReset()
  })

  it('redirects a pathless spark to the dedicated choose page (no inline picker here)', async () => {
    get.mockResolvedValue(spiritWith({ stage: 'spark', path: null }))

    renderPage()

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByText('Choose your creature')).toBeNull()
    expect(screen.queryByText('Customize')).toBeNull()
  })

  it('hides the picker once a creature is chosen', async () => {
    get.mockResolvedValue(spiritWith({ path: 'stillness' }))

    renderPage()
    await screen.findByText('Customize')

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
    // Scope the need-label assertions to the Care read-out: the same labels (Nourishment / Rest /
    // Joy) also tag the tree's options (ADR-0026), so a page-wide getByText would match more.
    const care = screen.getByRole('region', { name: 'Care' })
    expect(within(care).getByText('Nourishment')).toBeInTheDocument()
    expect(within(care).getByText('Rest')).toBeInTheDocument()
    expect(within(care).getByText('Joy')).toBeInTheDocument()
    expect(screen.getByText(/Pitta is restless/i)).toBeInTheDocument()
    expect(screen.getByText(/gratitude & journaling would revive it/i)).toBeInTheDocument()
  })
})
