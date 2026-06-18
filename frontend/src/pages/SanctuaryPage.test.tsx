import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SanctuaryScene } from '../types'

const getScene = vi.fn()
const buy = vi.fn()
const customize = vi.fn()
const move = vi.fn()
const personalize = vi.fn()
const resetUpgrades = vi.fn()
const playReward = vi.fn()

vi.mock('../services/sanctuary', () => ({
  sanctuaryService: {
    getScene: (...a: unknown[]) => getScene(...a),
    buy: (...a: unknown[]) => buy(...a),
    customize: (...a: unknown[]) => customize(...a),
    move: (...a: unknown[]) => move(...a),
    personalize: (...a: unknown[]) => personalize(...a),
    resetUpgrades: (...a: unknown[]) => resetUpgrades(...a),
  },
}))
vi.mock('../lib/sfx', () => ({ playReward: (...a: unknown[]) => playReward(...a) }))

import SanctuaryPage from './SanctuaryPage'
import { ToastProvider } from '../context/ToastContext'

const treeShop = {
  item_key: 'tree',
  track: 'nature',
  cost: 30,
  unlocked: true,
  hint: null,
  variants: [],
  blurb: 'A patient old soul.',
  suggested_names: [],
}

function sceneWith(coins: number, owned: SanctuaryScene['owned']): SanctuaryScene {
  return {
    coins,
    level: 3,
    owned,
    shop: [treeShop],
    vitality: 'thriving',
    current_streak: 2,
  }
}

const before = sceneWith(70, [])
const after = sceneWith(40, [
  {
    id: 'new-1',
    item_key: 'tree',
    track: 'nature',
    position: 0,
    cell: 0,
    variant: null,
    customizations: {},
    available: [],
    name: null,
    note: null,
    favorite: false,
  },
])

function ownedItem(id: string, cell: number): SanctuaryScene['owned'][number] {
  return {
    id,
    item_key: 'tree',
    track: 'nature',
    position: cell,
    cell,
    variant: null,
    customizations: {},
    available: [],
    name: null,
    note: null,
    favorite: false,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SanctuaryPage />
      </ToastProvider>
    </MemoryRouter>,
  )

// Unmount between tests so queries don't see a prior test's DOM (the grid renders many
// empty cells, which would otherwise collide across renders).
afterEach(cleanup)

describe('SanctuaryPage buy feedback', () => {
  beforeEach(() => {
    getScene.mockReset()
    buy.mockReset()
    playReward.mockReset()
  })

  it('shows a rich toast with spent/left, plays the cue, and pops the new item in', async () => {
    getScene.mockResolvedValue(before)
    buy.mockResolvedValue(after)

    renderPage()

    const buyBtn = await screen.findByRole('button', { name: /Buy · 🪙 30/ })
    fireEvent.click(buyBtn)

    // Rich success toast: what + spent + left.
    await waitFor(() =>
      expect(screen.getByText(/Tree added · 30 🪙 spent, 40 left/)).toBeInTheDocument(),
    )
    // No name typed → buys with a null variant and a null name.
    expect(buy).toHaveBeenCalledWith('tree', null, null)
    // Sound cue fired through the shared sfx module (honours the user's setting).
    expect(playReward).toHaveBeenCalledTimes(1)

    // Only the newly bought item animates into the garden.
    const card = document.querySelector('.sanctuary-card.just-bought')
    expect(card).not.toBeNull()
  })

  it('keeps the existing error toast on failure', async () => {
    getScene.mockResolvedValue(before)
    buy.mockRejectedValue(new Error('nope'))

    renderPage()

    const buyBtn = await screen.findByRole('button', { name: /Buy · 🪙 30/ })
    fireEvent.click(buyBtn)

    await waitFor(() => expect(screen.getByText(/Could not buy that/)).toBeInTheDocument())
    expect(playReward).not.toHaveBeenCalled()
  })

  it("shows an item's flavour blurb quietly in the shop (ADR-0016)", async () => {
    getScene.mockResolvedValue(before)

    renderPage()

    // The blurb renders as a quiet line under the item's name.
    await waitFor(() =>
      expect(screen.getByText('A patient old soul.')).toBeInTheDocument(),
    )
  })
})

describe('SanctuaryPage naming (ADR-0015)', () => {
  beforeEach(() => {
    getScene.mockReset()
    buy.mockReset()
    personalize.mockReset()
    playReward.mockReset()
  })

  it('buys an unnamed item — the buy flow sends no name (naming is owned-only)', async () => {
    getScene.mockResolvedValue(before)
    buy.mockResolvedValue(after)

    renderPage()

    // Single-variant items buy in one tap; no name is sent (null name).
    fireEvent.click(await screen.findByRole('button', { name: /Buy · 🪙 30/ }))
    await waitFor(() => expect(buy).toHaveBeenCalledWith('tree', null, null))
  })

  it('offers no name input in the shop or buy flow (naming is an owned-item action)', async () => {
    // A multi-variant tree so the buy modal opens (the "Choose" path); the modal is a
    // variant picker / confirmation only — no "name it…" affordance, no name field.
    const variantScene: SanctuaryScene = {
      ...before,
      shop: [
        {
          ...treeShop,
          suggested_names: ['Bramblewick'],
          variants: [
            { variant: 'oak', cost_delta: 0, unlocked: true, unlock_hint: null },
            { variant: 'pine', cost_delta: 0, unlocked: true, unlock_hint: null },
          ],
        },
      ],
    }
    getScene.mockResolvedValue(variantScene)

    renderPage()

    // The shop offers no "name it…" affordance any more.
    await screen.findByRole('button', { name: /Choose · 🪙 30/ })
    expect(screen.queryByRole('button', { name: /name it/ })).toBeNull()

    // Opening the buy modal shows the variant picker but no name input.
    fireEvent.click(screen.getByRole('button', { name: /Choose · 🪙 30/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.queryByRole('textbox')).toBeNull()
    expect(dialog.queryByLabelText(/Name/i)).toBeNull()
  })

  it('renames an owned item from the personalize panel (naming still works once owned)', async () => {
    const start = sceneWith(40, [ownedItem('a', 0)])
    const renamed = sceneWith(40, [{ ...ownedItem('a', 0), name: 'Willow' }])
    getScene.mockResolvedValue(start)
    personalize.mockResolvedValue(renamed)

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    const nameInput = view.getByPlaceholderText(/Give it a name/)
    fireEvent.change(nameInput, { target: { value: 'Willow' } })
    fireEvent.blur(nameInput)

    await waitFor(() => expect(personalize).toHaveBeenCalledWith('a', { name: 'Willow' }))
  })

  it('toggles the favourite flag from the personalize panel', async () => {
    const start = sceneWith(40, [ownedItem('a', 0)])
    getScene.mockResolvedValue(start)
    personalize.mockResolvedValue(
      sceneWith(40, [{ ...ownedItem('a', 0), favorite: true }]),
    )

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    fireEvent.click(view.getByRole('button', { name: /Mark favourite/ }))

    await waitFor(() => expect(personalize).toHaveBeenCalledWith('a', { favorite: true }))
  })
})

describe('SanctuaryPage reset upgrades (ADR-0019)', () => {
  beforeEach(() => {
    getScene.mockReset()
    resetUpgrades.mockReset()
  })

  // An owned item carrying a customization, so the panel offers the reset action.
  const grownItem = (id: string) => ({
    ...ownedItem(id, 0),
    customizations: { grown: 'grown' },
  })

  it('confirms the fee, then resets and toasts the refund', async () => {
    const start = sceneWith(40, [grownItem('a')])
    // After reset: customizations cleared and the sunk cost refunded minus the fee.
    const reset = sceneWith(85, [ownedItem('a', 0)])
    getScene.mockResolvedValue(start)
    resetUpgrades.mockResolvedValue(reset)

    const { container } = renderPage()
    const view = within(container)

    // Open the panel (the toggle shows the customization count), then start the reset flow.
    fireEvent.click(await view.findByRole('button', { name: /^Personalize \(1\)$/ }))
    fireEvent.click(view.getByRole('button', { name: /Reset upgrades/ }))

    // The confirm states the fee before anything is charged.
    expect(view.getByText(/10 🪙 fee/)).toBeInTheDocument()

    // Confirm → the service is called and the refund toast surfaces.
    fireEvent.click(view.getByRole('button', { name: /Reset · −10 🪙/ }))
    await waitFor(() => expect(resetUpgrades).toHaveBeenCalledWith('a'))
    await waitFor(() =>
      expect(screen.getByText(/Upgrades cleared from your tree/)).toBeInTheDocument(),
    )
  })

  it('can be cancelled without calling the service', async () => {
    getScene.mockResolvedValue(sceneWith(40, [grownItem('a')]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize \(1\)$/ }))
    fireEvent.click(view.getByRole('button', { name: /Reset upgrades/ }))
    fireEvent.click(view.getByRole('button', { name: /Keep them/ }))

    // Back to the quiet toggle; the service was never called.
    expect(view.getByRole('button', { name: /Reset upgrades/ })).toBeInTheDocument()
    expect(resetUpgrades).not.toHaveBeenCalled()
  })

  it('shows an error toast when the reset fails', async () => {
    getScene.mockResolvedValue(sceneWith(40, [grownItem('a')]))
    resetUpgrades.mockRejectedValue(new Error('nope'))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize \(1\)$/ }))
    fireEvent.click(view.getByRole('button', { name: /Reset upgrades/ }))
    fireEvent.click(view.getByRole('button', { name: /Reset · −10 🪙/ }))

    await waitFor(() =>
      expect(screen.getByText(/Could not reset that/)).toBeInTheDocument(),
    )
  })

  it('offers no reset action for an item with no upgrades', async () => {
    getScene.mockResolvedValue(sceneWith(40, [ownedItem('a', 0)]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    expect(view.queryByRole('button', { name: /Reset upgrades/ })).toBeNull()
  })
})

describe('SanctuaryPage upgrade preview (see-it-before-you-buy)', () => {
  beforeEach(() => {
    getScene.mockReset()
    customize.mockReset()
  })

  // An owned tree offering an unbought "fruit" foliage upgrade. When applied, the Tree renderer
  // draws red fruit circles (fill #ef4444) — a stable marker that the preview merged the option.
  const treeWithFoliage = (id: string) => ({
    ...ownedItem(id, 0),
    available: [
      {
        slot: 'foliage',
        applied: null,
        options: [
          { option: 'fruit', cost: 8, unlocked: true, unlock_hint: null, affordable: true, applied: false },
        ],
      },
    ],
  })

  // Count the fruit markers inside the dedicated preview stage only (not the garden card plant).
  const fruitInPreview = () => {
    const stage = document.querySelector('.sanctuary-preview-stage')
    return stage ? stage.querySelectorAll('circle[fill="#ef4444"]').length : 0
  }

  it('previews an option on hover, then restores the current look on leave', async () => {
    getScene.mockResolvedValue(sceneWith(40, [treeWithFoliage('a')]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))

    // Before exploring: the preview shows the item as-is (no fruit, no "Preview" badge).
    expect(fruitInPreview()).toBe(0)
    expect(view.queryByText('Preview')).toBeNull()

    // Hover the unbought fruit option → the preview redraws the tree WITH fruit, no purchase.
    const fruitBtn = view.getByRole('button', { name: /Fruit/ })
    fireEvent.mouseEnter(fruitBtn)
    expect(fruitInPreview()).toBeGreaterThan(0)
    expect(view.getByText('Preview')).toBeInTheDocument()
    expect(customize).not.toHaveBeenCalled() // view-only — nothing bought

    // Leaving the option restores the current (un-upgraded) look.
    fireEvent.mouseLeave(fruitBtn)
    expect(fruitInPreview()).toBe(0)
    expect(view.queryByText('Preview')).toBeNull()
  })

  it('previews on keyboard focus too (not hover-only), and restores on blur', async () => {
    getScene.mockResolvedValue(sceneWith(40, [treeWithFoliage('a')]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    const fruitBtn = view.getByRole('button', { name: /Fruit/ })

    fireEvent.focus(fruitBtn)
    expect(fruitInPreview()).toBeGreaterThan(0)
    expect(view.getByText('Preview')).toBeInTheDocument()

    fireEvent.blur(fruitBtn)
    expect(fruitInPreview()).toBe(0)
    expect(view.queryByText('Preview')).toBeNull()
    // Still view-only: focusing/blurring never bought anything.
    expect(customize).not.toHaveBeenCalled()
  })

  // An owned tree offering a LOCKED (level-gated) and an UNAFFORDABLE fruit option, so we can
  // assert both still preview (ADR-0021) yet never purchase when clicked.
  const treeWithGatedFruit = (gate: 'locked' | 'poor') => ({
    ...ownedItem('a', 0),
    available: [
      {
        slot: 'foliage',
        applied: null,
        options: [
          {
            option: 'fruit',
            cost: 999,
            unlocked: gate !== 'locked',
            unlock_hint: gate === 'locked' ? 'Reach level 9' : null,
            affordable: gate !== 'poor',
            applied: false,
          },
        ],
      },
    ],
  })

  it('previews a LOCKED option on hover but never buys it on click (ADR-0021)', async () => {
    getScene.mockResolvedValue(sceneWith(40, [treeWithGatedFruit('locked')]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    // The locked option is NOT a disabled button, so it emits hover/focus and previews.
    const lockedBtn = view.getByRole('button', { name: /🔒/ })
    expect(lockedBtn).not.toBeDisabled()

    fireEvent.mouseEnter(lockedBtn)
    expect(fruitInPreview()).toBeGreaterThan(0) // the goal look previews…
    expect(view.getByText('Preview')).toBeInTheDocument()

    // …but clicking a gated option never purchases (it would 409 server-side anyway).
    fireEvent.click(lockedBtn)
    expect(customize).not.toHaveBeenCalled()

    fireEvent.mouseLeave(lockedBtn)
    expect(fruitInPreview()).toBe(0)
  })

  it('previews an UNAFFORDABLE option on focus but never buys it on click (ADR-0021)', async () => {
    getScene.mockResolvedValue(sceneWith(40, [treeWithGatedFruit('poor')]))

    const { container } = renderPage()
    const view = within(container)

    fireEvent.click(await view.findByRole('button', { name: /^Personalize$/ }))
    const poorBtn = view.getByRole('button', { name: /earn more/i })
    expect(poorBtn).not.toBeDisabled()

    fireEvent.focus(poorBtn)
    expect(fruitInPreview()).toBeGreaterThan(0)
    expect(view.getByText('Preview')).toBeInTheDocument()

    fireEvent.click(poorBtn)
    expect(customize).not.toHaveBeenCalled()

    fireEvent.blur(poorBtn)
    expect(fruitInPreview()).toBe(0)
  })
})

describe('SanctuaryPage shop — track grouping', () => {
  beforeEach(() => {
    getScene.mockReset()
  })

  it('renders one section header per track, in catalog order', async () => {
    const multiTrackScene: SanctuaryScene = {
      coins: 200,
      level: 5,
      owned: [],
      vitality: 'thriving',
      current_streak: 3,
      shop: [
        { item_key: 'tree',         track: 'nature',    cost: 30, unlocked: true,  hint: null, variants: [], blurb: '', suggested_names: [] },
        { item_key: 'flower',       track: 'nature',    cost: 20, unlocked: true,  hint: null, variants: [], blurb: '', suggested_names: [] },
        { item_key: 'hut',          track: 'structure', cost: 45, unlocked: true,  hint: null, variants: [], blurb: '', suggested_names: [] },
        { item_key: 'garden_gnome', track: 'whimsy',    cost: 26, unlocked: false, hint: 'Reach level 2', variants: [], blurb: '', suggested_names: [] },
      ],
    }
    getScene.mockResolvedValue(multiTrackScene)
    renderPage()

    // Track headers appear with the correct emoji + label.
    await screen.findByRole('heading', { name: /🌿 Nature/i,     level: 3 })
    screen.getByRole('heading',        { name: /🏡 Structure/i,  level: 3 })
    screen.getByRole('heading',        { name: /✨ Whimsy/i,     level: 3 })

    // Companion track is absent — no header rendered for it.
    expect(screen.queryByRole('heading', { name: /🐾 Companions/i, level: 3 })).toBeNull()
  })
})

describe('SanctuaryPage move (grid layout)', () => {
  beforeEach(() => {
    getScene.mockReset()
    move.mockReset()
  })

  it('tap-to-pick then tap an empty cell calls move with the target cell', async () => {
    const start = sceneWith(40, [ownedItem('a', 0)])
    const moved = sceneWith(40, [ownedItem('a', 5)])
    getScene.mockResolvedValue(start)
    move.mockResolvedValue(moved)

    const { container } = renderPage()
    const view = within(container)

    // Pick up the item (its plant doubles as the move handle).
    const grab = await view.findByRole('button', { name: /Move Tree/ })
    fireEvent.click(grab)
    expect(grab).toHaveAttribute('aria-pressed', 'true')

    // Tap an empty spot → moves there. Cell 1 is "Empty spot 2" (1-indexed label).
    const spot = view.getByRole('button', { name: 'Empty spot 2' })
    fireEvent.click(spot)

    await waitFor(() => expect(move).toHaveBeenCalledWith('a', 1))
  })

  it('reverts and shows an error toast when the move fails', async () => {
    const start = sceneWith(40, [ownedItem('a', 0)])
    getScene.mockResolvedValue(start)
    move.mockRejectedValue(new Error('nope'))

    const { container } = renderPage()
    const view = within(container)

    const grab = await view.findByRole('button', { name: /Move Tree/ })
    fireEvent.click(grab)
    const spot = view.getByRole('button', { name: 'Empty spot 2' })
    fireEvent.click(spot)

    await waitFor(() => expect(screen.getByText(/Could not move that item/)).toBeInTheDocument())
  })
})
