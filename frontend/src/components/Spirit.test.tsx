/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022; build-order step 3).
 * These guard that the right path-specific procedural form renders per stage, that the path
 * is chosen by the committed `path` with a fallback to `path_lean` pre-commit, that the daily
 * glow is applied as a static brightness, that the bond/stage read-out and the quiet pre-commit
 * lean hint are surfaced calmly, and that loading / error / empty states follow conventions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const getSpirit = vi.fn()
vi.mock('../services/spirit', () => ({
  spiritService: { get: (...a: unknown[]) => getSpirit(...a) },
}))

import Spirit from './Spirit'
import type { SpiritPath, SpiritStage, SpiritState } from '../types'

function spiritState(over: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'spark',
    path: null,
    path_lean: 'stillness',
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

describe('Spirit — path-specific forms', () => {
  const paths: Array<{ path: SpiritPath; label: RegExp }> = [
    { path: 'stillness', label: /stillness spirit/i },
    { path: 'breath', label: /breath spirit/i },
    { path: 'heart', label: /heart spirit/i },
  ]

  paths.forEach(({ path, label }) => {
    it(`renders the committed ${path} form with its own labelled SVG`, () => {
      // A committed wisp (path set) draws that path's distinct, labelled form.
      render(<Spirit spirit={spiritState({ stage: 'wisp', path })} />)
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    })
  })

  it('draws visibly different shapes for each path at the same stage', () => {
    const shapesFor = (path: SpiritPath): string => {
      const { container } = render(<Spirit spirit={spiritState({ stage: 'radiant', path })} />)
      const svg = container.querySelector('.spirit-svg')!.innerHTML
      cleanup()
      return svg
    }
    const stillness = shapesFor('stillness')
    const breath = shapesFor('breath')
    const heart = shapesFor('heart')
    // Each path renders a distinct SVG body (different forms), not the same shape recoloured.
    expect(stillness).not.toEqual(breath)
    expect(breath).not.toEqual(heart)
    expect(stillness).not.toEqual(heart)
  })

  it('grows more elaborate from spark to radiant for a path (more drawn shapes each stage)', () => {
    const countShapes = (stage: SpiritStage): number => {
      const { container } = render(<Spirit spirit={spiritState({ stage, path: 'heart' })} />)
      const n = container.querySelectorAll('.spirit-svg *').length
      cleanup()
      return n
    }
    expect(countShapes('radiant')).toBeGreaterThan(countShapes('spark'))
  })
})

describe('Spirit — path chosen by committed path then lean fallback', () => {
  it('uses the committed path over the lean when both are present', () => {
    // Committed to breath even though the lean says heart — the form follows the commitment.
    render(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath', path_lean: 'heart' })} />)
    expect(screen.getByRole('img', { name: /breath spirit/i })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /heart spirit/i })).toBeNull()
  })

  it('falls back to the lean when the path is not yet committed', () => {
    // Pre-commit (path null): the form follows the suggested lean.
    render(<Spirit spirit={spiritState({ stage: 'spark', path: null, path_lean: 'heart' })} />)
    expect(screen.getByRole('img', { name: /heart spirit/i })).toBeInTheDocument()
  })

  it('shows a quiet "leaning toward" hint before commit, and drops it after', () => {
    const { rerender } = render(
      <Spirit spirit={spiritState({ stage: 'spark', path: null, path_lean: 'breath' })} />,
    )
    expect(screen.getByText(/leaning toward breath/i)).toBeInTheDocument()
    // Once committed, the hint goes away (the form speaks for itself).
    rerender(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath', path_lean: 'breath' })} />)
    expect(screen.queryByText(/leaning toward/i)).toBeNull()
  })
})

describe('Spirit — stage read-out (calm, no shouting)', () => {
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
    getSpirit.mockResolvedValueOnce(spiritState({ stage: 'wisp', path: 'breath' }))
    screen.getByRole('button', { name: /try again/i }).click()
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /breath spirit/i })).toBeInTheDocument(),
    )
  })

  it('renders the fetched spirit on success', async () => {
    getSpirit.mockResolvedValueOnce(spiritState({ stage: 'fledgling', path: 'heart' }))
    render(<Spirit />)
    expect(await screen.findByRole('img', { name: /heart spirit/i })).toBeInTheDocument()
  })
})
