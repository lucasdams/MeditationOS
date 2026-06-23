/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022; build-order steps 3–4).
 * These guard that the right path-specific procedural form renders per stage, that the path
 * is chosen by the committed `path` with a fallback to `path_lean` pre-commit, that the daily
 * glow is applied as a brightness, that the bond/stage read-out and the quiet pre-commit lean
 * hint are surfaced calmly, and that loading / error / empty states follow conventions.
 *
 * Step 4 adds the reactivity layer, covered at the bottom: the home spirit carries the idle
 * animation class and a `--spirit-glow` pulse factor; `prefers-reduced-motion` holds it static
 * (no animation class, no celebration); BreathePage's `paceScale` syncs the aura to the breath;
 * and a session-complete `celebrate` plays a one-shot via the Web Animations API.
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

// --- Step 4: reactivity / animation layer ------------------------------------------------

// Force a `prefers-reduced-motion` result for the duration of a test. jsdom has no matchMedia,
// so the component reads "motion on" by default; this stub flips it. Returns a restore fn.
function stubReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

describe('Spirit — idle animation (home)', () => {
  it('marks the home spirit alive so the idle float + aura pulse run', () => {
    const { container } = render(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
    const svg = container.querySelector('.spirit-svg')!
    expect(svg.classList.contains('spirit-svg--alive')).toBe(true)
  })

  it('drives the aura pulse intensity from daily_glow via --spirit-glow', () => {
    const glowVar = (state: SpiritState): string => {
      const { container } = render(<Spirit spirit={state} />)
      const svg = container.querySelector('.spirit-svg') as SVGElement
      const v = svg.style.getPropertyValue('--spirit-glow')
      cleanup()
      return v
    }
    // A bright spirit pulses with a higher glow factor than a resting (floored) one.
    expect(Number(glowVar(spiritState({ daily_glow: 1 })))).toBeGreaterThan(
      Number(glowVar(spiritState({ daily_glow: 0.4 }))),
    )
  })

  it('floors the glow factor so a dark spirit still pulses (never fully still-dark)', () => {
    const { container } = render(<Spirit spirit={spiritState({ daily_glow: 0 })} />)
    const svg = container.querySelector('.spirit-svg') as SVGElement
    expect(Number(svg.style.getPropertyValue('--spirit-glow'))).toBeGreaterThanOrEqual(0.4)
  })
})

describe('Spirit — prefers-reduced-motion holds static', () => {
  it('drops the idle animation class when reduced motion is requested', () => {
    const restore = stubReducedMotion(true)
    try {
      const { container } = render(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
      const svg = container.querySelector('.spirit-svg')!
      expect(svg.classList.contains('spirit-svg--alive')).toBe(false)
    } finally {
      restore()
    }
  })

  it('pins the pacer scale to 1 (no breath sync) under reduced motion', () => {
    const restore = stubReducedMotion(true)
    try {
      const { container } = render(
        <Spirit compact paceScale={1} spirit={spiritState({ stage: 'wisp', path: 'breath' })} />,
      )
      const svg = container.querySelector('.spirit-svg') as SVGElement
      // Held static: scale(1), regardless of the incoming pace value.
      expect(svg.style.transform).toBe('scale(1)')
    } finally {
      restore()
    }
  })

  it('does not fire the celebration one-shot under reduced motion', () => {
    const restore = stubReducedMotion(true)
    const animate = vi.fn()
    const originalAnimate = (Element.prototype as unknown as { animate?: unknown }).animate
    ;(Element.prototype as unknown as { animate: unknown }).animate = animate
    try {
      render(<Spirit compact celebrate spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
      expect(animate).not.toHaveBeenCalled()
    } finally {
      ;(Element.prototype as unknown as { animate: unknown }).animate = originalAnimate
      restore()
    }
  })
})

describe('Spirit — breathing-pacer sync (BreathePage)', () => {
  it('renders the compact spirit and syncs its scale to the pacer (no idle class)', () => {
    const { container } = render(
      <Spirit compact paceScale={1} spirit={spiritState({ stage: 'wisp', path: 'breath' })} />,
    )
    const svg = container.querySelector('.spirit-svg')!
    // Pacing mode: tracks the inline transform, not the CSS idle float.
    expect(svg.classList.contains('spirit-svg--pacing')).toBe(true)
    expect(svg.classList.contains('spirit-svg--alive')).toBe(false)
    expect(container.querySelector('.spirit-compact')).not.toBeNull()
  })

  it('expands on the inhale (high scale) and contracts on the exhale (low scale)', () => {
    const transformFor = (paceScale: number): number => {
      const { container } = render(
        <Spirit compact paceScale={paceScale} spirit={spiritState({ stage: 'wisp', path: 'breath' })} />,
      )
      const svg = container.querySelector('.spirit-svg') as SVGElement
      const m = svg.style.transform.match(/scale\(([\d.]+)\)/)
      cleanup()
      return m ? Number(m[1]) : NaN
    }
    // scaleAt's top of the breath (1) maps to a larger companion scale than its bottom (0.35).
    expect(transformFor(1)).toBeGreaterThan(transformFor(0.35))
  })
})

describe('Spirit — session-complete celebration', () => {
  it('plays a one-shot via the Web Animations API when celebrate flips true', () => {
    const animate = vi.fn(() => ({ cancel: () => {} }))
    const originalAnimate = (Element.prototype as unknown as { animate?: unknown }).animate
    ;(Element.prototype as unknown as { animate: unknown }).animate = animate
    try {
      render(<Spirit compact celebrate spirit={spiritState({ stage: 'radiant', path: 'heart' })} />)
      expect(animate).toHaveBeenCalledTimes(1)
    } finally {
      ;(Element.prototype as unknown as { animate: unknown }).animate = originalAnimate
    }
  })
})
