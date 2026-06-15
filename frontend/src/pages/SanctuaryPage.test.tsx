import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { SanctuaryScene } from '../types'

const getScene = vi.fn()
const buy = vi.fn()
const customize = vi.fn()
const playReward = vi.fn()

vi.mock('../services/sanctuary', () => ({
  sanctuaryService: {
    getScene: (...a: unknown[]) => getScene(...a),
    buy: (...a: unknown[]) => buy(...a),
    customize: (...a: unknown[]) => customize(...a),
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
    variant: null,
    customizations: {},
    available: [],
  },
])

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SanctuaryPage />
      </ToastProvider>
    </MemoryRouter>,
  )

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
