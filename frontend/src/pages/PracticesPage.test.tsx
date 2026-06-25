/**
 * PracticesPage — the practices hub. Verifies the grouped sections render and that a few
 * representative cards deep-link into the right routes (the deep-link params are the whole
 * point of the hub, so they're asserted explicitly).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import PracticesPage from './PracticesPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PracticesPage />
    </MemoryRouter>,
  )
}

describe('PracticesPage', () => {
  afterEach(cleanup)

  it('renders the page heading and a back link to Home', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /practices/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('renders all three category groups', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /breathing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /meditation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /reflection/i })).toBeInTheDocument()
  })

  it('deep-links breathing cards with the right ?pattern= param', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /resonance/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=resonance',
    )
    expect(screen.getByRole('link', { name: /box/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=box',
    )
    expect(screen.getByRole('link', { name: /alternate nostril/i })).toHaveAttribute(
      'href',
      '/breathe?pattern=alternate',
    )
  })

  it('deep-links guided meditation cards with the right ?guided= param', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /body scan/i })).toHaveAttribute(
      'href',
      '/meditate?guided=body-scan',
    )
    expect(screen.getByRole('link', { name: /loving-kindness/i })).toHaveAttribute(
      'href',
      '/meditate?guided=loving-kindness',
    )
    // Mindfulness = plain unguided sitting (no param).
    expect(screen.getByRole('link', { name: /mindfulness/i })).toHaveAttribute(
      'href',
      '/meditate',
    )
  })

  it('links the reflection cards to their own pages', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /gratitude/i })).toHaveAttribute('href', '/gratitude')
    expect(screen.getByRole('link', { name: /journal/i })).toHaveAttribute('href', '/journal')
    expect(screen.getByRole('link', { name: /candle gazing/i })).toHaveAttribute(
      'href',
      '/trataka',
    )
  })
})
