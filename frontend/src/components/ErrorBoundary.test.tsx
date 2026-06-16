/**
 * Tests for ErrorBoundary.
 *
 * Verified:
 * - Shows children when nothing throws.
 * - Shows a calm fallback UI (not a white screen) when a child throws.
 * - Does NOT re-throw the error (the boundary swallows it).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// Silence the expected console.error during "throws" tests.
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  cleanup()
  consoleError.mockClear()
})

// Mock @sentry/react so the boundary test never needs a real SDK.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}))

// A component that unconditionally throws so we can trigger the boundary.
function Bomb(): never {
  throw new Error('test explosion')
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <span>all good</span>
      </ErrorBoundary>,
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('shows a calm fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    // The heading from the existing fallback UI.
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    // A message guiding the user — not a blank screen.
    expect(screen.getByText(/reloading usually fixes it/i)).toBeInTheDocument()
    // A reload button.
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('does not show the child content after an error', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('test explosion')).not.toBeInTheDocument()
  })
})
