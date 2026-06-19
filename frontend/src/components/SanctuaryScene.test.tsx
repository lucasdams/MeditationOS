/**
 * SanctuaryScene — focused on the expanded, READ-ONLY garden preview that sits on the calm
 * default home. These guard that the preview lays out the user's owned plants (their existing
 * art + aria-labels), exposes a "Tend it →" link to /sanctuary, carries NO interactive controls
 * (no buy/move/customize), shows no coin count, and degrades to a calm empty state.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SanctuaryScene from './SanctuaryScene'
import type { OwnedItem, SanctuaryScene as Scene } from '../types'

function ownedItem(over: Partial<OwnedItem> = {}): OwnedItem {
  return {
    id: 'i1',
    item_key: 'tree',
    track: 'nature',
    position: 0,
    cell: 0,
    variant: 'oak',
    customizations: {},
    available: [],
    name: null,
    note: null,
    favorite: false,
    ...over,
  }
}

function scene(over: Partial<Scene> = {}): Scene {
  return {
    coins: 42,
    level: 5,
    owned: [],
    shop: [],
    vitality: 'thriving',
    current_streak: 3,
    ...over,
  }
}

function renderPreview(s: Scene) {
  return render(
    <MemoryRouter>
      <SanctuaryScene scene={s} preview />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('SanctuaryScene — read-only garden preview', () => {
  it('lays out the owned plants with their existing aria-labels', () => {
    renderPreview(
      scene({
        owned: [
          ownedItem({ id: 'a', item_key: 'tree', variant: 'oak', cell: 0 }),
          ownedItem({ id: 'b', item_key: 'flower', variant: 'rose', cell: 1 }),
        ],
      }),
    )

    const region = screen.getByRole('region', { name: /your garden/i })
    // Each plant keeps the SanctuaryPlant SVG's own aria-label (role="img").
    expect(within(region).getByRole('img', { name: /tree \(oak\)/i })).toBeInTheDocument()
    expect(within(region).getByRole('img', { name: /flower \(rose\)/i })).toBeInTheDocument()
  })

  it('exposes a "Tend it" link to the full /sanctuary page', () => {
    renderPreview(scene({ owned: [ownedItem()] }))
    expect(screen.getByRole('link', { name: /tend it/i })).toHaveAttribute('href', '/sanctuary')
  })

  it('has NO interactive controls — no buy, move, or customize buttons', () => {
    renderPreview(
      scene({
        owned: [ownedItem({ id: 'a' }), ownedItem({ id: 'b', cell: 1 })],
      }),
    )
    // The read-only preview renders no buttons at all (the full page's grab/buy/personalize
    // buttons all live on /sanctuary).
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /move|buy|personalize|customize/i })).toBeNull()
  })

  it('does not show a coin count (the level chip already shows coins)', () => {
    renderPreview(scene({ coins: 99, owned: [ownedItem()] }))
    expect(screen.queryByText(/🪙/)).toBeNull()
    expect(screen.queryByText('99')).toBeNull()
  })

  it('shows a calm empty state with a link into the Sanctuary when nothing is owned', () => {
    renderPreview(scene({ owned: [] }))
    expect(screen.getByText(/your garden is empty/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /start it in the sanctuary/i })
    expect(link).toHaveAttribute('href', '/sanctuary')
    // No plant art and no controls in the empty state.
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
