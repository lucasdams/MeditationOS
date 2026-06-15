import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SanctuaryScene } from '../types'

const getScene = vi.fn()
const buy = vi.fn()
const customize = vi.fn()
const move = vi.fn()
const playReward = vi.fn()

vi.mock('../services/sanctuary', () => ({
  sanctuaryService: {
    getScene: (...a: unknown[]) => getScene(...a),
    buy: (...a: unknown[]) => buy(...a),
    customize: (...a: unknown[]) => customize(...a),
    move: (...a: unknown[]) => move(...a),
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
    expect(buy).toHaveBeenCalledWith('tree', null)
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
