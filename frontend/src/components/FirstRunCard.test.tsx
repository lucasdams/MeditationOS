/**
 * Tests for the first-run "start here" card: its show/hide logic (new vs. practiced
 * users, dismissal persistence) and the dismiss interaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import FirstRunCard, { shouldShowFirstRun, isFirstRunDismissed } from './FirstRunCard'

const DISMISS_KEY = 'dashboard.firstRunDismissed'

describe('shouldShowFirstRun — show/hide logic', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('shows for a brand-new user with zero sessions', () => {
    expect(shouldShowFirstRun(0)).toBe(true)
  })

  it('still shows after a session or two (survives the onboarding hand-off)', () => {
    expect(shouldShowFirstRun(1)).toBe(true)
    expect(shouldShowFirstRun(2)).toBe(true)
  })

  it('auto-retires once the user has practiced a few times', () => {
    expect(shouldShowFirstRun(3)).toBe(false)
    expect(shouldShowFirstRun(10)).toBe(false)
  })

  it('stays hidden for a new user once dismissed (persisted)', () => {
    localStorage.setItem(DISMISS_KEY, '1')
    expect(isFirstRunDismissed()).toBe(true)
    expect(shouldShowFirstRun(0)).toBe(false)
  })
})

describe('FirstRunCard — dismiss interaction', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  function renderCard(onDismiss = vi.fn()) {
    render(
      <MemoryRouter>
        <FirstRunCard onDismiss={onDismiss} />
      </MemoryRouter>,
    )
    return onDismiss
  }

  it('leads with the "first 2-minute sit" hero CTA (a zero-config guided first sit)', () => {
    renderCard()
    // The single unmissable primary action → the fixed 2-min guided breathe first sit.
    expect(
      screen.getByRole('link', { name: /your first 2-minute sit/i }),
    ).toHaveAttribute('href', '/breathe?guided=1&duration=120')
  })

  it('keeps a quiet "log a session" fallback beneath the hero', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /log a session/i })).toHaveAttribute(
      'href',
      '/sessions/new',
    )
  })

  it('persists dismissal and calls onDismiss when the ✕ is clicked', () => {
    const onDismiss = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /dismiss getting started/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(isFirstRunDismissed()).toBe(true)
  })
})
