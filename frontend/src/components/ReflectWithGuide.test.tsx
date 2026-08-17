/**
 * Tests for the home-page "reflect with a guide" card: it renders a guide-of-the-day with a
 * prompt and a deep-link into that guide's chat, and it degrades to nothing when the roster is
 * unavailable (an optional, non-blocking enhancement).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listPersonas = vi.fn()

vi.mock('../services/philosophers', () => ({
  philosopherService: { list: (...a: unknown[]) => listPersonas(...a) },
}))

import ReflectWithGuide from './ReflectWithGuide'

const ROSTER = [
  {
    id: 'marcus-aurelius',
    name: 'Marcus Aurelius',
    tradition: 'Stoicism',
    blurb: 'A Stoic voice.',
    openers: ['What is mine to do today?'],
  },
  { id: 'buddha', name: 'Buddha', tradition: 'Buddhism', blurb: 'A gentle voice.', openers: ['I am clinging.'] },
]

const ROSTER_IDS = ROSTER.map((p) => p.id)

function renderCard() {
  return render(
    <MemoryRouter>
      <ReflectWithGuide />
    </MemoryRouter>,
  )
}

beforeEach(() => listPersonas.mockReset())
afterEach(cleanup)

describe('ReflectWithGuide', () => {
  it('shows a guide-of-the-day with a prompt and a deep-link into that guide', async () => {
    listPersonas.mockResolvedValue(ROSTER)
    renderCard()
    expect(await screen.findByText('Reflect with a guide')).toBeInTheDocument()
    // The deep-link targets one of the roster guides via ?guide=<id>.
    const cta = screen.getByRole('link', { name: /Reflect with/ })
    const href = cta.getAttribute('href') ?? ''
    expect(ROSTER_IDS.some((id) => href === `/philosophers?guide=${id}`)).toBe(true)
  })

  it('renders nothing when the roster is unavailable', async () => {
    listPersonas.mockRejectedValueOnce(new Error('offline'))
    // act() flushes the effect and its .catch so the (handled) rejection settles inside the test.
    let container!: HTMLElement
    await act(async () => {
      ;({ container } = renderCard())
    })
    // Non-blocking: a failed fetch leaves the card absent rather than erroring the page.
    expect(listPersonas).toHaveBeenCalled()
    expect(screen.queryByText('Reflect with a guide')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty roster', async () => {
    listPersonas.mockResolvedValue([])
    let container!: HTMLElement
    await act(async () => {
      ;({ container } = renderCard())
    })
    expect(listPersonas).toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })
})
