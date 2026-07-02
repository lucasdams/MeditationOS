/**
 * Tests for the shared EmptyState building block: it stays the original quiet muted
 * line for plain callers, and promotes to the richer on-brand card (title + primary
 * CTA that routes to the action which fills the view) when given `title` / `icon` /
 * an action. Also a light check of RetryableError's retry affordance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sprout } from 'lucide-react'

import { EmptyState, RetryableError } from './StateViews'

afterEach(cleanup)

function renderInRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('EmptyState', () => {
  it('renders the plain quiet line (no card) when given only children', () => {
    renderInRouter(<EmptyState>No archived goals.</EmptyState>)
    const line = screen.getByText('No archived goals.')
    expect(line).toBeInTheDocument()
    // Unenriched: it's the original muted paragraph, not the richer card.
    expect(line).toHaveClass('muted')
    expect(document.querySelector('.empty-state')).toBeNull()
  })

  it('promotes to the rich card with a warm title and body', () => {
    renderInRouter(
      <EmptyState icon={Sprout} title="Your patterns start with one sit">
        Nothing to chart yet.
      </EmptyState>,
    )
    expect(document.querySelector('.empty-state')).not.toBeNull()
    expect(screen.getByText(/your patterns start with one sit/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing to chart yet/i)).toBeInTheDocument()
  })

  it('renders a primary CTA that routes to the action which fills the view', () => {
    renderInRouter(
      <EmptyState title="Empty" actionTo="/meditate" actionLabel="Start a session">
        Nothing here yet.
      </EmptyState>,
    )
    expect(screen.getByRole('link', { name: /start a session/i })).toHaveAttribute(
      'href',
      '/meditate',
    )
  })

  it('omits the CTA unless both actionTo and actionLabel are provided', () => {
    renderInRouter(
      <EmptyState title="Empty" actionTo="/meditate">
        Nothing here yet.
      </EmptyState>,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('RetryableError', () => {
  it('renders nothing when there is no message', () => {
    const { container } = renderInRouter(
      <RetryableError message={null} onRetry={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message and calls onRetry when the button is clicked', () => {
    const onRetry = vi.fn()
    renderInRouter(<RetryableError message="Couldn't load." onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
