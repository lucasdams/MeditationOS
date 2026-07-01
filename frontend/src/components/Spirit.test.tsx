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

import Spirit, { optionLabel } from './Spirit'
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
    set_bonus: { active: false, kind: null, count: 0, total: 0, label: 'Signature radiance' },
    awakened_at: '2026-06-01T00:00:00Z',
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

    it('uses the airy warm-mauve palette (not the old pink bloom)', () => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path: 'heart' })} />,
      )
      const svg = container.querySelector('.spirit-svg')!.innerHTML
      // Warm-mauve body present; the retired pink bloom colour is gone.
      expect(svg).toContain('#e3cbdf')
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

describe('Spirit — body cosmetics recolour + resize the creature itself', () => {
  // The bare-creature fill check: the Pitta body uses PATH_PALETTE.breath, whose orange `glow` is
  // #fb923c. A `palette` cosmetic must SWAP the body colours (its own `glow` present, the dosha
  // default absent); no `palette` must leave the dosha default in place.
  // Scope to the floating CREATURE group only — the recolour changes the BODY, not the separate
  // decorative aura/habitat layers (the aura keeps the dosha's own glow by design).
  const bodyMarkup = (over: Partial<SpiritState>): string => {
    const { container } = renderSpirit(<Spirit spirit={spiritState({ stage: 'radiant', ...over })} />)
    const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
    cleanup()
    return html
  }

  it('recolours the body when a palette cosmetic is set (alternate fill in, dosha default out)', () => {
    // Bare Pitta: the dosha orange glow (#fb923c) is present.
    const bare = bodyMarkup({ path: 'breath' })
    expect(bare).toContain('#fb923c')
    // With the `frost` palette: its warm-teal glow (#9fded2) appears and the dosha orange is gone.
    const recoloured = bodyMarkup({ path: 'breath', cosmetics: { palette: 'frost' } })
    expect(recoloured).toContain('#9fded2')
    expect(recoloured).not.toContain('#fb923c')
    // A NEWER palette recolours the body the same way: the `ocean` glow (#60a5fa) appears and the
    // dosha orange is gone — every entry in PALETTES feeds the body ramp universally.
    const ocean = bodyMarkup({ path: 'breath', cosmetics: { palette: 'ocean' } })
    expect(ocean).toContain('#60a5fa')
    expect(ocean).not.toContain('#fb923c')
  })

  it('keeps each dosha default when no palette cosmetic is set', () => {
    // Stillness default amber glow (#fcd34d) present; Vata default warm-mauve glow (#e3cbdf) present.
    expect(bodyMarkup({ path: 'stillness' })).toContain('#fcd34d')
    expect(bodyMarkup({ path: 'heart' })).toContain('#e3cbdf')
  })

  it('scales the creature group when a size cosmetic is set, and not when it is absent', () => {
    const groupTransform = (over: Partial<SpiritState>): string | null => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path: 'breath', ...over })} />,
      )
      // The size scale lives on an inner <g> inside the floating .spirit-creature group.
      const inner = container.querySelector('.spirit-creature > g') as SVGGElement
      const t = inner.getAttribute('transform')
      cleanup()
      return t
    }
    // No size cosmetic → no scale transform on the inner group.
    expect(groupTransform({})).toBeNull()
    // `giant` → a scale transform centred on the viewBox (40,40).
    const giant = groupTransform({ cosmetics: { size: 'giant' } })
    expect(giant).toContain('scale(1.28)')
    expect(giant).toContain('translate(40 40)')
    // `tiny` shrinks below 1.
    expect(groupTransform({ cosmetics: { size: 'tiny' } })).toContain('scale(0.78)')
  })

  it('leaves a bare creature (no palette/size) identical to the dosha default look', () => {
    // A bare radiant Pitta and one with an empty cosmetics map render identical body markup.
    const bare = bodyMarkup({ path: 'breath' })
    const emptyCosmetics = bodyMarkup({ path: 'breath', cosmetics: {} })
    expect(emptyCosmetics).toBe(bare)
  })
})

describe('Spirit — the `form` (shape) cosmetic varies each creature silhouette', () => {
  // The trailing breeze "legs" are the stroked (fill:none) wisp paths in the floating creature
  // group — counting them measures how many legs the silhouette has. The `form` cosmetic offsets
  // the stage's leg count (and body width), so a Vata can wear a fuller or sleeker silhouette.
  const wispCount = (over: Partial<SpiritState>): number => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path: 'heart', ...over })} />,
    )
    const n = Array.from(container.querySelectorAll('.spirit-creature path')).filter(
      (el) => el.getAttribute('fill') === 'none',
    ).length
    cleanup()
    return n
  }

  // Pitta's layered flame (+ any accent licks) are the FILLED paths in the creature group (the eyes
  // are stroked fill:none; coals are ellipses) — counting filled paths tracks the flame body + licks.
  const flameCount = (over: Partial<SpiritState>): number => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path: 'breath', ...over })} />,
    )
    const n = Array.from(container.querySelectorAll('.spirit-creature path')).filter(
      (el) => el.getAttribute('fill') !== 'none',
    ).length
    cleanup()
    return n
  }

  // Renders a Kapha creature with the given cosmetics and returns its creature group, so a test can
  // count the SVG elements that make up the swapped-in body form (orbs, stones, orbit outlines).
  const kaphaCreature = (over: Partial<SpiritState>): SVGGElement => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path: 'stillness', ...over })} />,
    )
    const group = container.querySelector('.spirit-creature') as SVGGElement
    cleanup()
    return group
  }

  // The Vata `form` cosmetic now swaps the WHOLE silhouette for a DISTINCT air/ether OBJECT (like
  // Kapha's swapped bodies), not a wisp-count/width tweak. Each test below renders a Vata with the
  // form and asserts the object's defining elements, plus that it differs from the bare wisp.
  // Helper: the creature group for a Vata wearing the given form, for element-level assertions.
  const vataCreature = (over: Partial<SpiritState>): SVGGElement => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path: 'heart', ...over })} />,
    )
    const group = container.querySelector('.spirit-creature') as SVGGElement
    cleanup()
    return group
  }
  // The Vata palette colours (PATH_PALETTE.heart) — the object forms draw their structural parts in
  // these, so counting elements filled/stroked with each measures the object's distinctive shape.
  const VATA_GLOW = '#e3cbdf'
  const VATA_DEEP = '#9a6b9c'

  it('draws a puffy CLOUD of several pal.glow bumps + a face with form=cloud', () => {
    const cloud = vataCreature({ cosmetics: { form: 'cloud' } })
    // The cloud lump is several overlapping pal.glow body <circle> bumps (≥3 at radiant).
    const bumps = Array.from(cloud.querySelectorAll('circle')).filter(
      (el) => el.getAttribute('fill') === VATA_GLOW,
    )
    expect(bumps.length).toBeGreaterThanOrEqual(3)
    expect(creatureMarkup('heart', { form: 'cloud' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('draws a feather PLUME — a pal.deep quill + barb strokes — with form=plume', () => {
    const plume = vataCreature({ cosmetics: { form: 'plume' } })
    // The central quill is a stroked (fill:none) pal.deep path.
    const quill = Array.from(plume.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') === 'none' && el.getAttribute('stroke') === VATA_DEEP,
    )
    expect(quill.length).toBeGreaterThanOrEqual(1)
    // Plus several barb strokes (stroked fill:none paths) feathering off the spine.
    const barbs = Array.from(plume.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') === 'none',
    )
    expect(barbs.length).toBeGreaterThanOrEqual(6)
    expect(creatureMarkup('heart', { form: 'plume' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('draws a LEAF blade — a filled pal.glow almond + a pal.deep vein — with form=leaflet', () => {
    const leaf = vataCreature({ cosmetics: { form: 'leaflet' } })
    // The blade is a filled pal.glow <path> (the almond).
    const blade = Array.from(leaf.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') === VATA_GLOW,
    )
    expect(blade.length).toBeGreaterThanOrEqual(1)
    // The central vein is a stroked pal.deep path down the midrib.
    const veins = Array.from(leaf.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') === 'none' && el.getAttribute('stroke') === VATA_DEEP,
    )
    expect(veins.length).toBeGreaterThanOrEqual(1)
    expect(creatureMarkup('heart', { form: 'leaflet' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('draws a CONSTELLATION — several star dots + connector lines — with form=constellation', () => {
    const con = vataCreature({ cosmetics: { form: 'constellation' } })
    // Several small star-point <circle>s (≥5 at radiant: 4 + i).
    const stars = con.querySelectorAll('circle')
    expect(stars.length).toBeGreaterThanOrEqual(5)
    // Joined by faint connector <line>s into a loose constellation.
    expect(con.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
    expect(creatureMarkup('heart', { form: 'constellation' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('draws a DANDELION — many radiating stalks + tuft circles — with form=dandelion', () => {
    const dand = vataCreature({ cosmetics: { form: 'dandelion' } })
    // Many thin radiating stalk <line>s (≥9) forming the puff.
    expect(dand.querySelectorAll('line').length).toBeGreaterThanOrEqual(9)
    // Each tipped with a fuzzy seed-tuft <circle> — many tuft circles + the core + drifting seeds.
    expect(dand.querySelectorAll('circle').length).toBeGreaterThanOrEqual(9)
    expect(creatureMarkup('heart', { form: 'dandelion' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('draws a WHIRLWIND — stacked swirl bands narrowing down — with form=whirlwind', () => {
    const whirl = vataCreature({ cosmetics: { form: 'whirlwind' } })
    // Several stacked stroked (fill:none) swirl-band <path>s (≥5 at radiant).
    const bands = Array.from(whirl.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') === 'none',
    )
    expect(bands.length).toBeGreaterThanOrEqual(5)
    expect(creatureMarkup('heart', { form: 'whirlwind' })).not.toBe(creatureMarkup('heart', {}))
  })

  it('grows each Vata air/ether object across the 5 stages (markup differs spark → radiant)', () => {
    // Render a form at spark and at radiant; the silhouette must visibly change (it scales with i/p).
    const at = (stage: SpiritStage, form: string): string => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage, path: 'heart', cosmetics: { form } })} />,
      )
      const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
      cleanup()
      return html
    }
    for (const form of ['cloud', 'plume', 'leaflet', 'constellation', 'dandelion', 'whirlwind']) {
      expect(at('spark', form)).not.toBe(at('radiant', form))
    }
  })

  // The Pitta `form` cosmetic now swaps the WHOLE silhouette for a DISTINCT fire OBJECT (like
  // Kapha's swapped bodies), not a recoloured/resized flame. Each test below renders a Pitta with
  // the form and asserts the object's defining elements, plus that it differs from a bare blaze.
  // Helper: the creature group for a Pitta wearing the given form, for element-level assertions.
  const pittaCreature = (over: Partial<SpiritState>): SVGGElement => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path: 'breath', ...over })} />,
    )
    const group = container.querySelector('.spirit-creature') as SVGGElement
    cleanup()
    return group
  }
  // The Pitta deep base colour (pal.deep) — campfire logs, the torch handle, the lantern frame are
  // all drawn in it; counting elements filled/stroked with it measures the object's structure.
  const PITTA_DEEP = '#7c2d12'

  it('draws crossed pal.deep LOG bars + a flame with form=campfire (a campfire silhouette)', () => {
    const camp = pittaCreature({ cosmetics: { form: 'campfire' } })
    // Two or three rotated <rect> logs in the deep base colour cross at the base.
    const logs = Array.from(camp.querySelectorAll('rect')).filter(
      (el) => el.getAttribute('fill') === PITTA_DEEP && (el.getAttribute('transform') ?? '').includes('rotate'),
    )
    expect(logs.length).toBeGreaterThanOrEqual(2)
    // It still carries a layered flame above the logs (filled flame paths).
    expect(camp.querySelectorAll('.pitta-flame path').length).toBeGreaterThanOrEqual(3)
    expect(creatureMarkup('breath', { form: 'campfire' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('draws a vertical pal.deep HANDLE + a flame with form=torch (a held torch)', () => {
    const torch = pittaCreature({ cosmetics: { form: 'torch' } })
    // The handle is a tall, narrow upright <rect> in the deep base colour (height ≫ width).
    const handle = Array.from(torch.querySelectorAll('rect')).find((el) => {
      const w = Number(el.getAttribute('width'))
      const h = Number(el.getAttribute('height'))
      return el.getAttribute('fill') === PITTA_DEEP && h > w * 3
    })
    expect(handle).toBeTruthy()
    expect(torch.querySelectorAll('.pitta-flame path').length).toBeGreaterThanOrEqual(3)
    expect(creatureMarkup('breath', { form: 'torch' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('draws a round head CIRCLE + a swept TAIL path with form=fireball (a fire comet)', () => {
    const fb = pittaCreature({ cosmetics: { form: 'fireball' } })
    // The fireball head is a filled <circle> (glow body + core highlight).
    const heads = Array.from(fb.querySelectorAll('circle')).filter(
      (el) => el.getAttribute('fill') !== 'none' && Number(el.getAttribute('r')) > 3,
    )
    expect(heads.length).toBeGreaterThanOrEqual(2)
    // It trails at least one swept filled tail <path> behind the head.
    const tails = Array.from(fb.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') !== 'none',
    )
    expect(tails.length).toBeGreaterThanOrEqual(2)
    expect(creatureMarkup('breath', { form: 'fireball' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('draws a glowing DISC + several flame RAY triangles with form=sun (a rayed sun)', () => {
    const sun = pittaCreature({ cosmetics: { form: 'sun' } })
    // 6 + i rays at radiant ⇒ ≥ 11 triangular flame <path>s radiate around the disc.
    const rays = Array.from(sun.querySelectorAll('path')).filter(
      (el) => el.getAttribute('fill') !== 'none',
    )
    expect(rays.length).toBeGreaterThanOrEqual(6)
    // The central disc is a filled <circle>.
    expect(
      Array.from(sun.querySelectorAll('circle')).filter(
        (el) => el.getAttribute('fill') !== 'none' && Number(el.getAttribute('r')) > 3,
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(creatureMarkup('breath', { form: 'sun' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('draws several coal ELLIPSES and NO tall layered flame with form=coals (a low ember bed)', () => {
    const coals = pittaCreature({ cosmetics: { form: 'coals' } })
    // A heap of rounded coal stones — several <ellipse>s (3 + i ⇒ many at radiant).
    expect(coals.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(6)
    // The "resting" form has NO tall layered blaze (no .pitta-flame group).
    expect(coals.querySelectorAll('.pitta-flame').length).toBe(0)
    expect(creatureMarkup('breath', { form: 'coals' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('draws a pal.deep lantern FRAME (posts + cap + base) cradling a flame with form=lantern', () => {
    const lantern = pittaCreature({ cosmetics: { form: 'lantern' } })
    // The cage is several <rect>s in the deep base colour (cap bar, two posts, base plate).
    const frame = Array.from(lantern.querySelectorAll('rect')).filter(
      (el) => el.getAttribute('fill') === PITTA_DEEP,
    )
    expect(frame.length).toBeGreaterThanOrEqual(3)
    // A small layered flame is cradled inside the frame.
    expect(lantern.querySelectorAll('.pitta-flame path').length).toBeGreaterThanOrEqual(3)
    expect(creatureMarkup('breath', { form: 'lantern' })).not.toBe(creatureMarkup('breath', {}))
  })

  it('grows each Pitta fire object across the 5 stages (markup differs spark → radiant)', () => {
    // Render a form at spark and at radiant; the silhouette must visibly change (it scales with i/p).
    const at = (stage: SpiritStage, form: string): string => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage, path: 'breath', cosmetics: { form } })} />,
      )
      const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
      cleanup()
      return html
    }
    for (const form of ['campfire', 'torch', 'fireball', 'sun', 'coals', 'lantern']) {
      expect(at('spark', form)).not.toBe(at('radiant', form))
    }
  })

  it('swaps the Kapha body for a HUDDLE of multiple orbs with form=cluster', () => {
    // The default Kapha body is a single seated ellipse + head circle; `cluster` replaces it with a
    // huddle of several body circles, so the creature gains many more <circle> orbs.
    const bareCircles = kaphaCreature({}).querySelectorAll('circle').length
    const clusterCircles = kaphaCreature({ cosmetics: { form: 'cluster' } }).querySelectorAll(
      'circle',
    ).length
    expect(clusterCircles).toBeGreaterThan(bareCircles + 2)
  })

  it('swaps the Kapha body for ellipse OUTLINES (an atom) with form=orbital', () => {
    // The default Kapha has no fill="none" ellipses in the body; `orbital` draws orbit OUTLINES.
    const strokedEllipses = (group: SVGGElement) =>
      Array.from(group.querySelectorAll('ellipse')).filter(
        (el) => el.getAttribute('fill') === 'none',
      ).length
    expect(strokedEllipses(kaphaCreature({}))).toBe(0)
    expect(strokedEllipses(kaphaCreature({ cosmetics: { form: 'orbital' } }))).toBeGreaterThanOrEqual(
      3,
    )
  })

  it('swaps the Kapha body for a FLOWER of multiple petal ellipses with form=lotus', () => {
    // The default Kapha body has no radiating petal ellipses; `lotus` draws several (5 + i) filled
    // petal ellipses around a bright centre, so the creature gains many more <ellipse> petals.
    const bareEllipses = kaphaCreature({}).querySelectorAll('ellipse').length
    const lotusEllipses = kaphaCreature({ cosmetics: { form: 'lotus' } }).querySelectorAll(
      'ellipse',
    ).length
    expect(lotusEllipses).toBeGreaterThan(bareEllipses + 3)
  })

  it('swaps the Kapha body for concentric ring OUTLINES (≥2) with form=enso', () => {
    // `enso` draws ≥2 fill="none" ring outlines in the body — strictly more stroked circles than a
    // bare Kapha (whose only fill="none" circle is the framing halo, shared by every form).
    const strokedCircles = (group: SVGGElement) =>
      Array.from(group.querySelectorAll('circle')).filter(
        (el) => el.getAttribute('fill') === 'none',
      ).length
    const bare = strokedCircles(kaphaCreature({}))
    const enso = strokedCircles(kaphaCreature({ cosmetics: { form: 'enso' } }))
    expect(enso - bare).toBeGreaterThanOrEqual(2)
  })

  it('swaps the Kapha body for a faceted GEM (a polygon + facet lines) with form=prism', () => {
    // The default Kapha has no polygon; `prism` draws a hexagon polygon with internal facet lines.
    expect(kaphaCreature({}).querySelectorAll('polygon').length).toBe(0)
    const gem = kaphaCreature({ cosmetics: { form: 'prism' } })
    expect(gem.querySelectorAll('polygon').length).toBeGreaterThanOrEqual(1)
    expect(gem.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
  })

  // Returns the full markup of a creature group for a path + cosmetics, so a test can assert a
  // form genuinely changes the silhouette (markup differs from the bare creature).
  const creatureMarkup = (path: SpiritPath, cosmetics: Record<string, string>): string => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'radiant', path, cosmetics })} />,
    )
    const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
    cleanup()
    return html
  }

  it('streams ONE long swept tail (two at radiant) with form=meteor, differing from a bare Vata', () => {
    // `meteor` is a head + a long swept tail — fewer, far-longer stroked currents than the bare
    // trailing-leg fan, so its silhouette differs and it draws ≥1 stroked tail (2 at ascendant+).
    expect(creatureMarkup('heart', { form: 'meteor' })).not.toBe(creatureMarkup('heart', {}))
    const tails = wispCount({ cosmetics: { form: 'meteor' } })
    expect(tails).toBeGreaterThanOrEqual(1)
    // At radiant the shooting star grows a second tail, fewer than a bare radiant Vata's many legs.
    expect(tails).toBeLessThan(wispCount({}))
  })

  it('forks the Pitta blaze into TWO flame groups with form=twin (more filled paths than bare)', () => {
    // `twin` renders two side-by-side layered flames instead of one — strictly more filled flame
    // paths than the single bare flame, and a different silhouette.
    const bare = flameCount({})
    const twin = flameCount({ cosmetics: { form: 'twin' } })
    expect(twin).toBeGreaterThan(bare)
    expect(creatureMarkup('breath', { form: 'twin' })).not.toBe(creatureMarkup('breath', {}))
  })


  it('swaps the Kapha body for an organic seedling (a stem path + leaf ellipses) with form=sprout', () => {
    // `sprout` draws a slim stroked (fill:none) stem path plus several filled leaf ellipses + a bud —
    // the only organic Kapha body. The default seated Kapha has no such stroked stem in its body.
    const strokedPaths = (group: SVGGElement) =>
      Array.from(group.querySelectorAll('path')).filter(
        (el) => el.getAttribute('fill') === 'none',
      ).length
    const bareEllipses = kaphaCreature({}).querySelectorAll('ellipse').length
    const sprout = kaphaCreature({ cosmetics: { form: 'sprout' } })
    // The seedling adds at least two leaf ellipses over the bare body...
    expect(sprout.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(bareEllipses + 2)
    // ...and a stroked stem path the bare seated form never draws.
    expect(strokedPaths(sprout)).toBeGreaterThan(strokedPaths(kaphaCreature({})))
  })

  it('swaps the Kapha body for a dharma wheel (concentric ring OUTLINES + radial spoke lines) with form=wheel', () => {
    // `wheel` draws ≥2 fill="none" concentric ring outlines (like enso) PLUS several radial spoke
    // <line>s from the hub — more stroked rings AND more lines than the bare seated Kapha.
    const strokedCircles = (group: SVGGElement) =>
      Array.from(group.querySelectorAll('circle')).filter(
        (el) => el.getAttribute('fill') === 'none',
      ).length
    const bareRings = strokedCircles(kaphaCreature({}))
    const bareLines = kaphaCreature({}).querySelectorAll('line').length
    const wheel = kaphaCreature({ cosmetics: { form: 'wheel' } })
    // At least two concentric ring outlines beyond the bare body's framing halo...
    expect(strokedCircles(wheel) - bareRings).toBeGreaterThanOrEqual(2)
    // ...and several radial spoke lines (6 + i ≥ 7 at radiant) the bare seated form never draws.
    expect(wheel.querySelectorAll('line').length).toBeGreaterThan(bareLines + 4)
  })

  it('leaves a bare Vata / Pitta / Kapha (no form) pixel-identical to an empty cosmetics map', () => {
    const markup = (path: SpiritPath, over: Partial<SpiritState>): string => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path, ...over })} />,
      )
      const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
      cleanup()
      return html
    }
    expect(markup('heart', { cosmetics: {} })).toBe(markup('heart', {}))
    expect(markup('breath', { cosmetics: {} })).toBe(markup('breath', {}))
    expect(markup('stillness', { cosmetics: {} })).toBe(markup('stillness', {}))
  })

  it('each creature interprets only ITS own form keys — a foreign key leaves the body unchanged', () => {
    const markup = (path: SpiritPath, cosmetics: Record<string, string>): string => {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ stage: 'radiant', path, cosmetics })} />,
      )
      const html = (container.querySelector('.spirit-creature') as SVGGElement).innerHTML
      cleanup()
      return html
    }
    // A Vata key on Pitta/Kapha is ignored; a Pitta key on Vata/Kapha is ignored; etc.
    expect(markup('breath', { form: 'cloud' })).toBe(markup('breath', {}))
    expect(markup('stillness', { form: 'cloud' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'campfire' })).toBe(markup('heart', {}))
    expect(markup('stillness', { form: 'campfire' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'cluster' })).toBe(markup('heart', {}))
    expect(markup('breath', { form: 'cluster' })).toBe(markup('breath', {}))
    // The new Vata air/ether objects are likewise path-scoped: a Vata `whirlwind` is inert on
    // Pitta/Kapha; a Kapha `prism` is inert on Vata/Pitta.
    expect(markup('breath', { form: 'whirlwind' })).toBe(markup('breath', {}))
    expect(markup('stillness', { form: 'whirlwind' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'prism' })).toBe(markup('heart', {}))
    expect(markup('breath', { form: 'prism' })).toBe(markup('breath', {}))
    // More path-scoped checks: Vata `dandelion`, Pitta `twin`, Kapha `sprout` each only reshape
    // their own dosha — inert on the other two.
    expect(markup('breath', { form: 'dandelion' })).toBe(markup('breath', {}))
    expect(markup('stillness', { form: 'dandelion' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'twin' })).toBe(markup('heart', {}))
    expect(markup('stillness', { form: 'twin' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'sprout' })).toBe(markup('heart', {}))
    expect(markup('breath', { form: 'sprout' })).toBe(markup('breath', {}))
    // Vata `meteor` (the kept shooting-star) + Kapha `wheel` are inert elsewhere too.
    expect(markup('breath', { form: 'meteor' })).toBe(markup('breath', {}))
    expect(markup('stillness', { form: 'meteor' })).toBe(markup('stillness', {}))
    expect(markup('heart', { form: 'wheel' })).toBe(markup('heart', {}))
    expect(markup('breath', { form: 'wheel' })).toBe(markup('breath', {}))
    // Every Vata air/ether OBJECT is likewise inert on Pitta + Kapha (it only reshapes Vata).
    for (const form of ['cloud', 'plume', 'leaflet', 'constellation', 'dandelion', 'whirlwind']) {
      expect(markup('breath', { form })).toBe(markup('breath', {}))
      expect(markup('stillness', { form })).toBe(markup('stillness', {}))
    }
    // Every Pitta fire OBJECT is likewise inert on Vata + Kapha (it only reshapes Pitta).
    for (const form of ['campfire', 'torch', 'fireball', 'sun', 'coals', 'lantern']) {
      expect(markup('heart', { form })).toBe(markup('heart', {}))
      expect(markup('stillness', { form })).toBe(markup('stillness', {}))
    }
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

  it('keeps the gentle default prompt for a pathless spark before any sit (sessionCount 0)', () => {
    renderSpirit(
      <Spirit spirit={spiritState({ stage: 'spark', path: null })} sessionCount={0} />,
    )
    expect(screen.getByRole('link', { name: /choose your companion/i })).toHaveAttribute(
      'href',
      '/spirit/choose',
    )
    expect(screen.queryByText(/first breath/i)).toBeNull()
  })

  it('warms into a celebratory hatch invite once the first sit is done (sessionCount ≥ 1)', () => {
    renderSpirit(
      <Spirit spirit={spiritState({ stage: 'spark', path: null })} sessionCount={1} />,
    )
    // The post-first-sit warm invite still links to the choose page (the "hatch").
    expect(screen.getByText(/first breath/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /meet your companion/i })).toHaveAttribute(
      'href',
      '/spirit/choose',
    )
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
    expect(screen.getByText('Nourishment')).toBeInTheDocument()
    expect(screen.getByText('Rest')).toBeInTheDocument()
    expect(screen.getByText('Joy')).toBeInTheDocument()
  })

  it('gently suggests rounding out the least-represented facet when the balance is uneven', () => {
    renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath', // Pitta → balanced by gratitude & journaling (cooling)
          // nourished (0.5) lags rested/joyful (0.85) by well over the even-balance delta.
          needs: { nourished: need('restless', 0.5), rested: need('content'), joyful: need('content') },
        })}
      />,
    )
    // An optional round-out invitation (ADR-0032): names the creature + the balancing practice; no
    // "is restless" alarm, no "needs / wants" demand.
    expect(screen.getByText(/Pitta has had a little less nourishment lately/i)).toBeInTheDocument()
    expect(screen.getByText(/gratitude & journaling would round things out/i)).toBeInTheDocument()
    expect(screen.queryByText(/is restless|needs more|wants/i)).toBeNull()
  })

  it('shows no round-out suggestion when the balance is even', () => {
    renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath',
          // All within the even-balance delta → no suggestion at all.
          needs: { nourished: need('content'), rested: need('content'), joyful: need('content') },
        })}
      />,
    )
    expect(screen.queryByText(/would round things out/i)).toBeNull()
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

  it('surfaces the bond level quietly (no shouted XP/level bar)', () => {
    renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', bond: { level: 7, xp_into_level: 20, xp_for_next: 100 } })} />,
    )
    expect(screen.getByText(/bond level 7/i)).toBeInTheDocument()
    // The bond/XP stays a calm text line — never an XP/level progress bar. The gentle care-need
    // bars (Nourishment/Rest/Joy) are a separate, intended thing; assert none is an XP/level meter.
    for (const meter of screen.queryAllByRole('progressbar')) {
      expect(meter.getAttribute('aria-label') ?? '').not.toMatch(/xp|level|bond/i)
    }
  })
})

describe('Spirit — the companion is never mortal (ADR-0031)', () => {
  it('never shows ailing / passed / memorial messaging, even at a low condition', () => {
    const { container } = renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'wisp',
          path: 'breath',
          name: 'Ash',
          // The lowest the floored needs can read (content); the spirit still reads as alive.
          needs: { nourished: need('content', 0.8), rested: need('content', 0.8), joyful: need('content', 0.8) },
          condition: need('content', 0.8),
        })}
      />,
    )
    // No survival/death/sickness copy anywhere.
    expect(screen.queryByText(/ailing/i)).toBeNull()
    expect(screen.queryByText(/has passed/i)).toBeNull()
    expect(screen.queryByText(/may not make it/i)).toBeNull()
    // The art never renders the removed dead/ailing/memorial markers.
    expect(container.querySelector('.spirit-svg[data-state="ailing"]')).toBeNull()
    expect(container.querySelector('.spirit-svg[data-state="dead"]')).toBeNull()
    expect(container.querySelector('.spirit-creature--ailing')).toBeNull()
    expect(container.querySelector('.spirit-creature--dead')).toBeNull()
    expect(container.querySelector('.spirit-memorial')).toBeNull()
    // The normal calm read-out (the stage note + bond level) is shown instead.
    expect(screen.getByText(/Bond level/)).toBeInTheDocument()
  })
})

describe('Spirit — new cosmetics render on the art', () => {
  // Each new cosmetic must actually draw something — these are stable markers that an applied
  // option reaches the SVG (no dead catalog entries).
  it('draws the cottage habitat backdrop (its roof) behind the figure', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { habitat: 'cottage' } })} />,
    )
    // The cottage roof is a distinctive amber path (#d97706).
    expect(container.querySelector('.spirit-svg path[fill="#d97706"]')).not.toBeNull()
  })

  it('draws a companion (the cat) beside the figure', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'cat' } })} />,
    )
    // The curled cat body is an amber ellipse (#fbbf24).
    expect(container.querySelector('.spirit-svg ellipse[fill="#fbbf24"]')).not.toBeNull()
  })

  // The three PATH-EXCLUSIVE companions (per_path in the catalog) each draw distinctive art.
  // Each carries a signature colour marker we can assert on without coupling to exact geometry.
  it('draws the path-exclusive kitsune companion (warm fox body)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { companion: 'kitsune' } })} />,
    )
    // The fox body is an orange ellipse (#f97316).
    expect(container.querySelector('.spirit-svg ellipse[fill="#f97316"]')).not.toBeNull()
  })

  it('draws the path-exclusive tortoise companion (jade shell)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { companion: 'tortoise' } })} />,
    )
    // The domed shell is a jade path (#10b981).
    expect(container.querySelector('.spirit-svg path[fill="#10b981"]')).not.toBeNull()
  })

  it('draws the path-exclusive crane companion (red origami crown)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'crane' } })} />,
    )
    // The little crown atop the paper crane's head is a red circle (#ef4444).
    expect(container.querySelector('.spirit-svg circle[fill="#ef4444"]')).not.toBeNull()
  })

  it('wraps the companion in a .spirit-companion group that animates on its own pace', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'cat' } })} />,
    )
    // The companion sits in its own group (so it can move independently of the creature's float).
    const group = container.querySelector('.spirit-companion')
    expect(group).not.toBeNull()
    // When alive (motion on), it carries its own animating class — distinct from the creature/aura.
    expect(group!.classList.contains('spirit-companion--alive')).toBe(true)
  })

  it('holds the companion static under reduced motion', () => {
    const restore = stubReducedMotion(true)
    try {
      const { container } = renderSpirit(
        <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'cat' } })} />,
      )
      // No alive/animating class on the companion when reduced motion is requested.
      expect(container.querySelector('.spirit-companion--alive')).toBeNull()
    } finally {
      restore()
    }
  })

  it('draws a mount (the lotus pad) under the figure', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { mount: 'lotus' } })} />,
    )
    // The lotus pad is a distinctive green ellipse (#86efac).
    expect(container.querySelector('.spirit-svg ellipse[fill="#86efac"]')).not.toBeNull()
  })

  // The quirky personality/hobby accessories (universal) each draw a recognizable worn item. Each
  // carries a signature colour marker we can assert on without coupling to exact geometry.
  it('draws the gaming_headset accessory (glowing cyan RGB ear-cup accent)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { accessory: 'gaming_headset' } })} />,
    )
    // The RGB accent ring around each ear cup is a cyan stroke (#22d3ee) — the headset's marker.
    expect(container.querySelector('.spirit-svg rect[stroke="#22d3ee"]')).not.toBeNull()
  })

  it('draws the beanie accessory (cosy teal knit cap)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { accessory: 'beanie' } })} />,
    )
    // The cap dome is a teal path (#14b8a6) — the beanie's signature colour.
    expect(container.querySelector('.spirit-svg path[fill="#14b8a6"]')).not.toBeNull()
  })

  it('draws the party_hat accessory (striped magenta cone)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { accessory: 'party_hat' } })} />,
    )
    // The cone body is a magenta path (#ec4899) — unique to the party hat.
    expect(container.querySelector('.spirit-svg path[fill="#ec4899"]')).not.toBeNull()
  })

  // Six worn-accessory cosmetics with attitude — three cool/edgy, three cutesy/girly. Each draws
  // its distinctive shapes and differs from a spirit wearing no accessory.
  it('draws the shades accessory (two dark angular lenses with a glint)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { accessory: 'shades' } })} />,
    )
    const bare = renderSpirit(<Spirit spirit={spiritState({ path: 'heart' })} />)
    // Two dark lens bodies (#111827) — the cool sunglasses' signature.
    expect(container.querySelectorAll('.spirit-svg path[fill="#111827"]').length).toBeGreaterThanOrEqual(2)
    // Wearing the shades differs from wearing nothing.
    expect(bare.container.querySelector('.spirit-svg path[fill="#111827"]')).toBeNull()
  })

  it('draws the spiked_collar accessory (several silver spikes on a dark band)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { accessory: 'spiked_collar' } })} />,
    )
    // Several triangular spikes — silver fills (#e5e7eb / #cbd5e1) alternate across the band.
    const spikes = container.querySelectorAll(
      '.spirit-svg path[fill="#e5e7eb"], .spirit-svg path[fill="#cbd5e1"]',
    )
    expect(spikes.length).toBeGreaterThanOrEqual(4)
    // The dark collar band (#1f2937 stroke) is the collar's signature.
    expect(container.querySelector('.spirit-svg path[stroke="#1f2937"]')).not.toBeNull()
  })

  it('draws the backwards_cap accessory (red crown dome + brim)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { accessory: 'backwards_cap' } })} />,
    )
    // The crown dome is a deep-red path (#dc2626); the brim a darker red (#b91c1c).
    expect(container.querySelector('.spirit-svg path[fill="#dc2626"]')).not.toBeNull()
    expect(container.querySelector('.spirit-svg path[fill="#b91c1c"]')).not.toBeNull()
  })

  it('draws the bow accessory (pink ribbon loops on top of the head)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { accessory: 'bow' } })} />,
    )
    // Two pink loops (#f9a8d4) plus the deep-pink knot (#be185d) — the bow's signature.
    const loops = container.querySelectorAll('.spirit-svg path[fill="#f9a8d4"]')
    expect(loops.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('.spirit-svg rect[fill="#be185d"]')).not.toBeNull()
  })

  it('draws the tiara accessory (gold band + gem dots)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { accessory: 'tiara' } })} />,
    )
    // The gold band is a stroked path (#fcd34d); the center gem a pink circle (#f472b6).
    expect(container.querySelector('.spirit-svg path[stroke="#fcd34d"]')).not.toBeNull()
    expect(container.querySelector('.spirit-svg circle[fill="#f472b6"]')).not.toBeNull()
    // Two blue side gems (#93c5fd) flank the peak.
    expect(container.querySelectorAll('.spirit-svg circle[fill="#93c5fd"]').length).toBeGreaterThanOrEqual(2)
  })

  it('draws the heart_clip accessory (a pink heart on a clip bar)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { accessory: 'heart_clip' } })} />,
    )
    const bare = renderSpirit(<Spirit spirit={spiritState({ path: 'stillness' })} />)
    // The heart is a pink path (#f472b6) edged in deeper pink (#ec4899) on a grey clip bar.
    expect(container.querySelector('.spirit-svg path[fill="#f472b6"]')).not.toBeNull()
    expect(container.querySelector('.spirit-svg rect[fill="#9ca3af"]')).not.toBeNull()
    // The heart-clip differs from wearing nothing.
    expect(bare.container.querySelector('.spirit-svg path[fill="#f472b6"]')).toBeNull()
  })

  it('draws the dark_star accessory (a dark star with a golden glow)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { accessory: 'dark_star' } })} />,
    )
    const bare = renderSpirit(<Spirit spirit={spiritState({ path: 'breath' })} />)
    // A dark star polygon (#2e2316) edged in glowing amber (#e3a83c) — distinct from the
    // gold pentagon `star`.
    expect(container.querySelector('.spirit-svg polygon[fill="#2e2316"]')).not.toBeNull()
    expect(container.querySelector('.spirit-svg polygon[stroke="#e3a83c"]')).not.toBeNull()
    // The dark star differs from wearing nothing.
    expect(bare.container.querySelector('.spirit-svg polygon[fill="#2e2316"]')).toBeNull()
  })
})

describe('Spirit — weather + ground slots render on the art', () => {
  // The two new cosmetic slots draw their signature element. Weather is the front-most drifting
  // overlay; ground is a foreground base strip along the bottom. Each must reach the SVG.
  it('draws the petals weather overlay (drifting pink petals)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { weather: 'petals' } })} />,
    )
    // Petals are pink ellipses (#fbcfe8).
    expect(container.querySelector('.spirit-svg ellipse[fill="#fbcfe8"]')).not.toBeNull()
  })

  it('draws the rain weather overlay (slanted blue streaks)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { weather: 'rain' } })} />,
    )
    // Rain streaks are blue stroked lines (#93c5fd).
    expect(container.querySelector('.spirit-svg line[stroke="#93c5fd"]')).not.toBeNull()
  })

  it('draws the grass ground strip (blades along the bottom)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { ground: 'grass' } })} />,
    )
    // Grass blades are green rects (#22c55e).
    expect(container.querySelector('.spirit-svg rect[fill="#22c55e"]')).not.toBeNull()
  })

  it('draws the crystals ground strip (cool upright crystals)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { ground: 'crystals' } })} />,
    )
    // Crystals are cyan paths (#a5f3fc / #7dd3fc) rising from the base band.
    expect(
      container.querySelector(
        '.spirit-svg path[fill="#a5f3fc"], .spirit-svg path[fill="#7dd3fc"]',
      ),
    ).not.toBeNull()
  })
})

describe('Spirit — legendary tier-4 ultimates render on the art', () => {
  // PART 4a: each slot's single tier-4 "legendary" ultimate (the prestige endgame option) draws
  // its own signature element. Each carries a colour marker unique to that art so the test stays
  // geometry-free. A couple of representative slots are covered here (the catalog/prereq wiring is
  // exhaustively covered in the backend tests).

  it('draws the prismatic aura (rainbow radiant rings)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { aura: 'prismatic' } })} />,
    )
    // The outermost spectral ring is a violet stroked circle (#c084fc) — unique to the prismatic art.
    expect(container.querySelector('.spirit-svg circle[stroke="#c084fc"]')).not.toBeNull()
  })

  it('draws the dragon companion (golden back-spines)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { companion: 'dragon' } })} />,
    )
    // The ridge of golden back-spines is a yellow path (#fde047) — the dragon's signature marker.
    expect(container.querySelector('.spirit-svg path[fill="#fde047"]')).not.toBeNull()
  })

  // The quirky HOBBY companions are little props (gym/coffee/reading/gaming/music) that float
  // beside the figure. Each carries a signature colour marker we can assert on.
  it('draws the dumbbell companion (slate weight-bells)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'dumbbell' } })} />,
    )
    // The weight-bells are slate rects (#475569) — the dumbbell's signature marker.
    expect(container.querySelector('.spirit-svg rect[fill="#475569"]')).not.toBeNull()
  })

  it('draws the game_controller companion (teal D-pad)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'game_controller' } })} />,
    )
    // The D-pad cross is a teal path (#2dd4bf) — the controller's signature marker.
    expect(container.querySelector('.spirit-svg path[fill="#2dd4bf"]')).not.toBeNull()
  })

  it('draws the boombox companion (drifting pink music note)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { companion: 'boombox' } })} />,
    )
    // A drifting music note is a pink ellipse (#f472b6) — the boombox's signature marker.
    expect(container.querySelector('.spirit-svg ellipse[fill="#f472b6"]')).not.toBeNull()
  })

  it('draws the nebula habitat backdrop (warm stellar gas)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { habitat: 'nebula' } })} />,
    )
    // One billowing nebula gas cloud is a warm dusty-rose ellipse (#bd6b6b) — unique to the nebula art.
    expect(container.querySelector('.spirit-svg ellipse[fill="#bd6b6b"]')).not.toBeNull()
  })

  it('draws the comet mount (blazing white star-core)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { mount: 'comet' } })} />,
    )
    // The bright comet core is a near-white circle (#fffbeb) — the comet's signature marker.
    expect(container.querySelector('.spirit-svg circle[fill="#fffbeb"]')).not.toBeNull()
  })

  it('labels each legendary ultimate in sentence case (OPTION_LABEL coverage)', () => {
    // The tree/preview reads each option via optionLabel; the legendary keys must resolve to their
    // own sentence-case labels (not the titleized fallback).
    expect(optionLabel('prismatic')).toBe('Prismatic halo')
    expect(optionLabel('star_crown')).toBe('Star crown')
    expect(optionLabel('nebula')).toBe('Cosmic nebula')
    expect(optionLabel('dragon')).toBe('Curled dragon')
    expect(optionLabel('comet')).toBe('Radiant comet')
    expect(optionLabel('aurora_storm')).toBe('Aurora storm')
    expect(optionLabel('mandala')).toBe('Sacred mandala')
  })
})

describe('Spirit — path-exclusive weather + ground capstones render on the art', () => {
  // Each new slot's three per-dosha tier-3 capstones draw their own signature element on their
  // dosha palette: weather is a front overlay (FIRE / EARTH-GROVE / AIR-SKY), ground a foreground
  // floor strip. Each carries a colour marker unique to that art so the test stays geometry-free.

  // Weather capstones (the front-most drifting overlay).
  it('draws the ember_drift weather (Pitta / fire — drifting embers)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { weather: 'ember_drift' } })} />,
    )
    // The hot ember spark tops each drift (#fed7aa, the only such circle).
    expect(container.querySelector('.spirit-svg circle[fill="#fed7aa"]')).not.toBeNull()
  })

  it('draws the pollenfall weather (Kapha / grove — golden pollen)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { weather: 'pollenfall' } })} />,
    )
    // Golden pollen motes are amber-gold circles (#d9c45a).
    expect(container.querySelector('.spirit-svg circle[fill="#d9c45a"]')).not.toBeNull()
  })

  it('draws the galeswirl weather (Vata / sky — swirling gusts)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { weather: 'galeswirl' } })} />,
    )
    // A soft white mote rides each gust arc (#f0f9ff).
    expect(container.querySelector('.spirit-svg circle[fill="#f0f9ff"]')).not.toBeNull()
  })

  // Ground capstones (the foreground floor strip).
  it('draws the emberbed ground (Pitta / fire — glowing coals)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { ground: 'emberbed' } })} />,
    )
    // The dark coal-bed base band (#7c2d12 rect).
    expect(container.querySelector('.spirit-svg rect[fill="#7c2d12"]')).not.toBeNull()
  })

  it('draws the stonegarden ground (Kapha / grove — raked zen sand)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'stillness', cosmetics: { ground: 'stonegarden' } })} />,
    )
    // The pale raked-sand base band (#d6d3c4, unique).
    expect(container.querySelector('.spirit-svg rect[fill="#d6d3c4"]')).not.toBeNull()
  })

  it('draws the cloudfloor ground (Vata / sky — soft cloud floor)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'heart', cosmetics: { ground: 'cloudfloor' } })} />,
    )
    // The faint warm-mauve cloud-floor base shadow (#e3cbdf rect).
    expect(container.querySelector('.spirit-svg rect[fill="#e3cbdf"]')).not.toBeNull()
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
