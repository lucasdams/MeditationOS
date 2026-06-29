/**
 * Tests for the Phase 4 "graduation depth" card: its show/hide logic (hidden for beginners,
 * shown once the user has stuck around, dismissal persistence) and the dismiss interaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import GraduationCard, { shouldShowGraduation, isGraduationDismissed } from './GraduationCard'

const DISMISS_KEY = 'dashboard.graduationDismissed'

describe('shouldShowGraduation — show/hide logic', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('stays hidden for a beginner (few sessions)', () => {
    expect(shouldShowGraduation(0)).toBe(false)
    expect(shouldShowGraduation(5)).toBe(false)
    expect(shouldShowGraduation(20)).toBe(false)
  })

  it('appears once the user has stuck around (>= the graduation threshold)', () => {
    expect(shouldShowGraduation(21)).toBe(true)
    expect(shouldShowGraduation(100)).toBe(true)
  })

  it('stays hidden once dismissed (persisted), even for a graduated user', () => {
    localStorage.setItem(DISMISS_KEY, '1')
    expect(isGraduationDismissed()).toBe(true)
    expect(shouldShowGraduation(50)).toBe(false)
  })
})

describe('GraduationCard — depth links + dismiss interaction', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  function renderCard(onDismiss = vi.fn()) {
    render(
      <MemoryRouter>
        <GraduationCard onDismiss={onDismiss} />
      </MemoryRouter>,
    )
    return onDismiss
  }

  it('resurfaces the three depth surfaces (HRV, analytics, customization)', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /HRV/i })).toHaveAttribute('href', '/biometrics/new')
    expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute('href', '/analytics')
    expect(screen.getByRole('link', { name: /customize/i })).toHaveAttribute('href', '/spirit')
  })

  it('persists dismissal and calls onDismiss when "Got it" is clicked', () => {
    const onDismiss = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(isGraduationDismissed()).toBe(true)
  })

  it('persists dismissal and calls onDismiss when the ✕ is clicked', () => {
    const onDismiss = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(isGraduationDismissed()).toBe(true)
  })
})
