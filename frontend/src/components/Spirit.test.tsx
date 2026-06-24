/**
 * Spirit — the home-screen companion (docs/design/spirit.md, ADR-0022, ADR-0023).
 * These guard that the right path-specific procedural form renders per stage, that the form is
 * chosen by the CHOSEN `path` (with a NEUTRAL pathless-spark when `path` is null), that the
 * overall condition is applied as a brightness, that the bond/stage + care read-out are surfaced
 * calmly, and that loading / error / empty states follow conventions.
 *
 * The reactivity layer is covered at the bottom (ADR-0023 layer split): the render is two layers
 * — a STATIC background `.spirit-svg` carrying `--spirit-glow` (driven by `condition.factor`), a
 * FLOATING `.spirit-creature` group (the only part that drifts / follows the pacer), and an
 * independently-glowing `.spirit-aura` group. `prefers-reduced-motion` holds every layer static
 * (no animation class, no celebration); BreathePage's `paceScale` syncs the CREATURE (not the
 * background) to the breath; a session-complete `celebrate` plays a one-shot via the Web
 * Animations API on the creature group.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getSpirit = vi.fn()
vi.mock('../services/spirit', () => ({
  spiritService: { get: (...a: unknown[]) => getSpirit(...a) },
}))

import Spirit from './Spirit'
import type {
  SpiritNeedTier,
  SpiritPath,
  SpiritStage,
  SpiritState,
} from '../types'

// A tier+factor pair for a need/condition fixture. `content` maps to a healthy mid factor.
function need(tier: SpiritNeedTier = 'content', factor = 0.85) {
  return { tier, factor }
}

function spiritState(over: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'spark',
    path: null,
    name: null,
    bond: { level: 1, xp_into_level: 0, xp_for_next: 100 },
    needs: { nourished: need(), rested: need(), joyful: need() },
    condition: need('content', 1),
    coins: 0,
    cosmetics: {},
    available: [],
    collection: [],
    ...over,
  }
}

// The home Spirit now links to /spirit (the pathless choose prompt), so it needs a router.
const renderSpirit = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  getSpirit.mockReset()
})
afterEach(cleanup)

describe('Spirit — path-specific forms', () => {
  // The chosen path is labelled in the UI as its dosha (Kapha / Pitta / Vata).
  const paths: Array<{ path: SpiritPath; label: RegExp }> = [
    { path: 'stillness', label: /kapha spirit/i },
    { path: 'breath', label: /pitta spirit/i },
    { path: 'heart', label: /vata spirit/i },
  ]

  paths.forEach(({ path, label }) => {
    it(`renders the chosen ${path} form with its own labelled SVG`, () => {
      // A chosen wisp (path set) draws that path's distinct, labelled form.
      renderSpirit(<Spirit spirit={spiritState({ stage: 'wisp', path })} />)
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    })
  })

  it('draws visibly different shapes for each path at the same stage', () => {
    const shapesFor = (path: SpiritPath): string => {
      const { container } = renderSpirit(<Spirit spirit={spiritState({ stage: 'radiant', path })} />)
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

  it('grows more elaborate from spark to radiant for every path (more drawn shapes each stage)', () => {
    const countShapes = (path: SpiritPath, stage: SpiritStage): number => {
      const { container } = renderSpirit(<Spirit spirit={spiritState({ stage, path })} />)
      const n = container.querySelectorAll('.spirit-svg *').length
      cleanup()
      return n
    }
    // Each creature (Kapha / Pitta / Vata) gains structure from its spark to its radiant form.
    ;(['stillness', 'breath', 'heart'] as SpiritPath[]).forEach((path) => {
      expect(countShapes(path, 'radiant')).toBeGreaterThan(countShapes(path, 'spark'))
    })
  })

  // The `heart` path is the airy Vata creature (ADR-0023 phase 4) — air + ether, light and
  // mobile, drawn with curling breeze currents and drifting motes/leaves across five stages.
  describe('heart → Vata (air) creature', () => {
    const vataShapes = (stage: SpiritStage): number => {
      const { container } = renderSpirit(<Spirit spirit={spiritState({ stage, path: 'heart' })} />)
      const n = container.querySelectorAll('.spirit-svg *').length
      cleanup()
      return n
    }

    it('is labelled a Vata spirit (the dosha) for the heart path', () => {
      renderSpirit(<Spirit spirit={spiritState({ stage: 'radiant', path: 'heart' })} />)
      expect(screen.getByRole('img', { name: /vata spirit/i })).toBeInTheDocument()
    })

    it('grows visibly more developed at every stage along the ladder (spark → radiant)', () => {
      // Monotonic structure growth across all five stages, not just spark vs radiant.
      const counts = (['spark', 'wisp', 'fledgling', 'ascendant', 'radiant'] as SpiritStage[]).map(
        vataShapes,
      )
      for (let s = 1; s < counts.length; s++) {
        expect(counts[s]).toBeGreaterThanOrEqual(counts[s - 1])
      }
      expect(counts[counts.length - 1]).toBeGreaterThan(counts[0])
    })

    it('draws curling breeze currents (stroked paths) — the airy silhouette, not a bloom', () => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path: 'heart' })} />,
      )
      // The trailing air-currents are stroked (fill:none) paths — the Vata defining feature.
      const strokedPaths = Array.from(container.querySelectorAll('.spirit-svg path')).filter(
        (el) => el.getAttribute('fill') === 'none',
      )
      expect(strokedPaths.length).toBeGreaterThan(0)
    })

    it('uses the airy sky/lavender palette (not the old pink bloom)', () => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path: 'heart' })} />,
      )
      const svg = container.querySelector('.spirit-svg')!.innerHTML
      // Airy sky-blue body present; the retired pink bloom colour is gone.
      expect(svg).toContain('#bae6fd')
      expect(svg).not.toContain('#f9a8d4')
    })

    it('renders a brighter Vata at full condition than at a depleted (floored) one', () => {
      const bodyOpacity = (state: SpiritState): number => {
        const { container } = renderSpirit(<Spirit spirit={state} />)
        // The flowing body path (a filled, not stroked, path) carries condition as opacity.
        const body = Array.from(
          container.querySelectorAll('.spirit-creature path'),
        ).find((el) => el.getAttribute('fill') !== 'none') as SVGPathElement
        const v = Number(body.getAttribute('opacity'))
        cleanup()
        return v
      }
      const bright = bodyOpacity(spiritState({ path: 'heart', condition: need('thriving', 1) }))
      const faded = bodyOpacity(spiritState({ path: 'heart', condition: need('unwell', 0.4) }))
      expect(bright).toBeGreaterThan(faded)
    })
  })
})

describe('Spirit — pathless spark vs chosen creature (ADR-0023)', () => {
  it('renders a neutral pathless spark (no creature form) when the path is null', () => {
    renderSpirit(<Spirit spirit={spiritState({ stage: 'spark', path: null })} />)
    // The pathless spark is labelled as an awakening spark, not any creature.
    expect(screen.getByRole('img', { name: /awakening spark/i })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /kapha|pitta|vata/i })).toBeNull()
  })

  it('shows a "choose your companion" prompt (linking to /spirit/choose) for a pathless spark', () => {
    renderSpirit(<Spirit spirit={spiritState({ stage: 'spark', path: null })} />)
    const link = screen.getByRole('link', { name: /choose your companion/i })
    expect(link).toHaveAttribute('href', '/spirit/choose')
  })

  it('renders the chosen creature form once a path is set (and drops the choose prompt)', () => {
    renderSpirit(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
    expect(screen.getByRole('img', { name: /pitta spirit/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /choose your companion/i })).toBeNull()
  })
})

describe('Spirit — care needs read-out (ADR-0023)', () => {
  it('shows the three needs as tier pills for a chosen creature', () => {
    renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath',
          needs: { nourished: need('thriving'), rested: need('content'), joyful: need('content') },
        })}
      />,
    )
    expect(screen.getByText('Nourished')).toBeInTheDocument()
    expect(screen.getByText('Rested')).toBeInTheDocument()
    expect(screen.getByText('Joyful')).toBeInTheDocument()
  })

  it('shows a kind, never-shaming care nudge naming the reviving practice when a need is low', () => {
    renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath', // Pitta → balanced by gratitude & journaling (cooling)
          needs: { nourished: need('restless', 0.5), rested: need('content'), joyful: need('content') },
        })}
      />,
    )
    // Names the creature (Pitta) and the reviving practice (gratitude & journaling); calm, no alarm.
    expect(screen.getByText(/Pitta is restless/i)).toBeInTheDocument()
    expect(screen.getByText(/gratitude & journaling would revive it/i)).toBeInTheDocument()
  })

  it('shows no care nudge when every need is content-or-better', () => {
    renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath',
          needs: { nourished: need('thriving'), rested: need('content'), joyful: need('content') },
        })}
      />,
    )
    expect(screen.queryByText(/would revive it|would settle it|would lift it/i)).toBeNull()
  })
})

describe('Spirit — stage read-out (calm, no shouting)', () => {
  it('frames a brand-new spark as the spirit awakening', () => {
    // A CHOSEN creature at spark stage shows the stage framing (a pathless spark leads with the
    // "choose your companion" prompt instead).
    renderSpirit(<Spirit spirit={spiritState({ stage: 'spark', path: 'stillness' })} />)
    expect(screen.getByText(/just awakening/i)).toBeInTheDocument()
    expect(screen.getByText('Spark')).toBeInTheDocument()
  })

  it('surfaces the bond level quietly (no shouted XP bar)', () => {
    renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', bond: { level: 7, xp_into_level: 20, xp_for_next: 100 } })} />,
    )
    expect(screen.getByText(/bond level 7/i)).toBeInTheDocument()
    // No progress bar / meter element — the read-out stays a calm line.
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('Spirit — condition applied as a static brightness (ADR-0023)', () => {
  it('renders a brighter aura at full condition than at a depleted one', () => {
    const haloOpacity = (state: SpiritState): number => {
      const { container } = renderSpirit(<Spirit spirit={state} />)
      const halo = container.querySelector('.spirit-svg circle') as SVGCircleElement
      const v = Number(halo.getAttribute('opacity'))
      cleanup()
      return v
    }
    const bright = haloOpacity(spiritState({ path: 'heart', condition: need('thriving', 1) }))
    const dim = haloOpacity(spiritState({ path: 'heart', condition: need('unwell', 0.4) }))
    expect(bright).toBeGreaterThan(dim)
  })

  it('floors a too-low condition so the spirit never goes dark', () => {
    // A condition factor below the floor is clamped; the aura still renders with positive opacity.
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', condition: need('unwell', 0) })} />,
    )
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
      expect(screen.getByRole('img', { name: /pitta spirit/i })).toBeInTheDocument(),
    )
  })

  it('renders the fetched spirit on success', async () => {
    getSpirit.mockResolvedValueOnce(spiritState({ stage: 'fledgling', path: 'heart' }))
    render(<Spirit />)
    expect(await screen.findByRole('img', { name: /vata spirit/i })).toBeInTheDocument()
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
  it('floats the creature layer (not the static background) and glows the aura independently', () => {
    const { container } = render(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
    // The outer SVG is the STATIC background — it does NOT carry the float class.
    const svg = container.querySelector('.spirit-svg')!
    expect(svg.classList.contains('spirit-creature--alive')).toBe(false)
    // Only the inner creature group floats; the aura glows on its own independent timeline.
    expect(container.querySelector('.spirit-creature.spirit-creature--alive')).not.toBeNull()
    expect(container.querySelector('.spirit-aura.spirit-aura--alive')).not.toBeNull()
  })

  it('drives the aura pulse intensity from the condition factor via --spirit-glow', () => {
    const glowVar = (state: SpiritState): string => {
      const { container } = render(<Spirit spirit={state} />)
      const svg = container.querySelector('.spirit-svg') as SVGElement
      const v = svg.style.getPropertyValue('--spirit-glow')
      cleanup()
      return v
    }
    // A well-tended spirit pulses with a higher condition factor than a depleted (floored) one.
    expect(
      Number(glowVar(spiritState({ path: 'heart', condition: need('thriving', 1) }))),
    ).toBeGreaterThan(
      Number(glowVar(spiritState({ path: 'heart', condition: need('unwell', 0.4) }))),
    )
  })

  it('floors the condition factor so a depleted spirit still pulses (never fully still-dark)', () => {
    const { container } = render(
      <Spirit spirit={spiritState({ path: 'heart', condition: need('unwell', 0) })} />,
    )
    const svg = container.querySelector('.spirit-svg') as SVGElement
    expect(Number(svg.style.getPropertyValue('--spirit-glow'))).toBeGreaterThanOrEqual(0.4)
  })
})

describe('Spirit — prefers-reduced-motion holds static', () => {
  it('drops the float + aura-glow animation classes when reduced motion is requested', () => {
    const restore = stubReducedMotion(true)
    try {
      const { container } = render(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
      // Neither the creature nor the aura carries its alive/animating class.
      expect(container.querySelector('.spirit-creature--alive')).toBeNull()
      expect(container.querySelector('.spirit-aura--alive')).toBeNull()
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
      // The pacer transform lives on the CREATURE group; held static at scale(1) here.
      const creature = container.querySelector('.spirit-creature') as SVGElement
      expect(creature.style.transform).toBe('scale(1)')
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
  it('syncs the CREATURE (not the static background) to the pacer (no idle float)', () => {
    const { container } = render(
      <Spirit compact paceScale={1} spirit={spiritState({ stage: 'wisp', path: 'breath' })} />,
    )
    // The creature group paces; the background SVG and the creature both drop the idle float.
    const creature = container.querySelector('.spirit-creature')!
    expect(creature.classList.contains('spirit-creature--pacing')).toBe(true)
    expect(creature.classList.contains('spirit-creature--alive')).toBe(false)
    // The aura holds steady during the pacer moment (breath is the motion, no double-pulse).
    expect(container.querySelector('.spirit-aura--alive')).toBeNull()
    expect(container.querySelector('.spirit-compact')).not.toBeNull()
  })

  it('expands on the inhale (high scale) and contracts on the exhale (low scale)', () => {
    const transformFor = (paceScale: number): number => {
      const { container } = render(
        <Spirit compact paceScale={paceScale} spirit={spiritState({ stage: 'wisp', path: 'breath' })} />,
      )
      const creature = container.querySelector('.spirit-creature') as SVGElement
      const m = creature.style.transform.match(/scale\(([\d.]+)\)/)
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
