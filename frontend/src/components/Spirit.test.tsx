/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022; build-order step 2).
 * These guard that the right procedural form renders per stage, that the daily glow is
 * applied as a static brightness, that the bond/stage read-out is surfaced quietly, and that
 * loading / error / empty (first-awakening) states follow the app's conventions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const getSpirit = vi.fn()
vi.mock('../services/spirit', () => ({
  spiritService: { get: (...a: unknown[]) => getSpirit(...a) },
}))

import Spirit from './Spirit'
import type { SpiritStage, SpiritState } from '../types'

function spiritState(over: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'spark',
    path: null,
    bond: { level: 1, xp_into_level: 0, xp_for_next: 100 },
    daily_glow: 1,
    coins: 0,
    cosmetics: {},
    ...over,
  }
}

beforeEach(() => {
  getSpirit.mockReset()
})
afterEach(cleanup)

describe('Spirit — procedural art per stage', () => {
  const stages: Array<{ stage: SpiritStage; label: RegExp }> = [
    { stage: 'spark', label: /spark spirit/i },
    { stage: 'wisp', label: /wisp spirit/i },
    { stage: 'fledgling', label: /fledgling spirit/i },
    { stage: 'ascendant', label: /ascendant spirit/i },
    { stage: 'radiant', label: /radiant spirit/i },
  ]

  stages.forEach(({ stage, label }) => {
    it(`renders the ${stage} form with its own labelled SVG`, () => {
      render(<Spirit spirit={spiritState({ stage })} />)
      // Each stage draws a distinct, stage-labelled procedural SVG (role="img").
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    })
  })

  it('grows more elaborate from spark to radiant (more drawn shapes each stage)', () => {
    const { container: spark } = render(<Spirit spirit={spiritState({ stage: 'spark' })} />)
    const sparkShapes = spark.querySelectorAll('.spirit-svg circle, .spirit-svg line').length
    cleanup()
    const { container: radiant } = render(<Spirit spirit={spiritState({ stage: 'radiant' })} />)
    const radiantShapes = radiant.querySelectorAll('.spirit-svg circle, .spirit-svg line').length
    // Radiant gains orbiting motes and a ray corona, so it draws strictly more shapes.
    expect(radiantShapes).toBeGreaterThan(sparkShapes)
  })

  it('frames a brand-new spark as the spirit awakening', () => {
    render(<Spirit spirit={spiritState({ stage: 'spark' })} />)
    expect(screen.getByText(/just awakening/i)).toBeInTheDocument()
    expect(screen.getByText('Spark')).toBeInTheDocument()
  })

  it('surfaces the bond level quietly (no shouted XP bar)', () => {
    render(<Spirit spirit={spiritState({ bond: { level: 7, xp_into_level: 20, xp_for_next: 100 } })} />)
    expect(screen.getByText(/bond level 7/i)).toBeInTheDocument()
    // No progress bar / meter element — the read-out stays a calm line.
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('Spirit — daily glow applied as a static brightness', () => {
  it('renders a brighter aura at full glow than at the resting floor', () => {
    const haloOpacity = (state: SpiritState): number => {
      const { container } = render(<Spirit spirit={state} />)
      const halo = container.querySelector('.spirit-svg circle') as SVGCircleElement
      const v = Number(halo.getAttribute('opacity'))
      cleanup()
      return v
    }
    const bright = haloOpacity(spiritState({ daily_glow: 1 }))
    const dim = haloOpacity(spiritState({ daily_glow: 0.4 }))
    expect(bright).toBeGreaterThan(dim)
  })

  it('floors a too-low glow so the spirit never goes dark', () => {
    // A glow below the floor is clamped; the aura still renders with positive opacity.
    const { container } = render(<Spirit spirit={spiritState({ daily_glow: 0 })} />)
    const halo = container.querySelector('.spirit-svg circle') as SVGCircleElement
    expect(Number(halo.getAttribute('opacity'))).toBeGreaterThan(0)
  })
})

describe('Spirit — loading / error states (self-fetching)', () => {
  it('shows a calm loading line while fetching its own state', () => {
    getSpirit.mockReturnValue(new Promise(() => {})) // pending forever
    render(<Spirit />)
    expect(screen.getByText(/waking your spirit/i)).toBeInTheDocument()
  })

  it('shows a retryable error and recovers on retry', async () => {
    getSpirit.mockRejectedValueOnce(new Error('boom'))
    render(<Spirit />)
    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()

    // A successful retry replaces the error with the spirit art.
    getSpirit.mockResolvedValueOnce(spiritState({ stage: 'wisp' }))
    screen.getByRole('button', { name: /try again/i }).click()
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /wisp spirit/i })).toBeInTheDocument(),
    )
  })

  it('renders the fetched spirit on success', async () => {
    getSpirit.mockResolvedValueOnce(spiritState({ stage: 'fledgling' }))
    render(<Spirit />)
    expect(await screen.findByRole('img', { name: /fledgling spirit/i })).toBeInTheDocument()
  })
})
