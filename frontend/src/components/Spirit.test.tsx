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

import Spirit, { lifespanCopy, optionLabel } from './Spirit'
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
    // Tamagotchi survival state (ADR-0029) — alive + healthy by default; ailing/dead tests override.
    awakened_at: '2026-06-01T00:00:00Z',
    ailing: false,
    dead: false,
    died_at: null,
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
    expect(screen.getByText('Nourishment')).toBeInTheDocument()
    expect(screen.getByText('Rest')).toBeInTheDocument()
    expect(screen.getByText('Joy')).toBeInTheDocument()
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

describe('lifespanCopy (ADR-0029)', () => {
  it('rounds to whole days and pluralizes', () => {
    expect(lifespanCopy('2026-06-01T00:00:00Z', '2026-06-06T00:00:00Z')).toBe('Lived 5 days')
    expect(lifespanCopy('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toBe('Lived 1 day')
  })

  it('reads "less than a day" under 24h and defends bad/negative ranges', () => {
    expect(lifespanCopy('2026-06-06T08:00:00Z', '2026-06-06T20:00:00Z')).toBe(
      'Lived less than a day',
    )
    // A death-before-birth (clock skew) and a malformed date both fall back gently.
    expect(lifespanCopy('2026-06-06T00:00:00Z', '2026-06-01T00:00:00Z')).toBe(
      'Lived less than a day',
    )
    expect(lifespanCopy('not-a-date', 'also-bad')).toBe('Lived less than a day')
  })
})

describe('Spirit — survival states on the home widget (ADR-0029)', () => {
  it('shows an ailing nudge and an unwell look (data-state="ailing") when ailing', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ stage: 'wisp', path: 'breath', name: 'Ash', ailing: true })} />,
    )
    // A legible-but-calm nudge leads, and the art is flagged unwell.
    expect(screen.getByText(/Ash is ailing — feed it or practice today/)).toBeInTheDocument()
    expect(container.querySelector('.spirit-svg[data-state="ailing"]')).not.toBeNull()
    // The unwell creature carries the wilt class (and is NOT running the lively float).
    expect(container.querySelector('.spirit-creature--ailing')).not.toBeNull()
    expect(container.querySelector('.spirit-creature--alive')).toBeNull()
  })

  it('shows a small memorial + a pointer to begin again when dead', () => {
    const { container } = renderSpirit(
      <Spirit
        spirit={spiritState({
          stage: 'fledgling',
          path: 'heart',
          name: 'Sol',
          dead: true,
          awakened_at: '2026-06-01T00:00:00Z',
          died_at: '2026-06-04T00:00:00Z', // three days
        })}
      />,
    )
    expect(screen.getByText(/Sol has passed/)).toBeInTheDocument()
    expect(screen.getByText('Lived 3 days')).toBeInTheDocument()
    // A clear link points to the spirit page to awaken a new spark.
    const link = screen.getByRole('link', { name: /awaken a new spark/i })
    expect(link).toHaveAttribute('href', '/spirit')
    // The art renders as a passed memorial (data-state + the resting creature class), no float.
    expect(container.querySelector('.spirit-svg[data-state="dead"]')).not.toBeNull()
    expect(container.querySelector('.spirit-creature--dead')).not.toBeNull()
    expect(container.querySelector('.spirit-creature--alive')).toBeNull()
    // The memorial scene (headstone group) is drawn.
    expect(container.querySelector('.spirit-memorial')).not.toBeNull()
  })

  it('does not crash and renders the normal read-out for a healthy alive spirit', () => {
    renderSpirit(<Spirit spirit={spiritState({ stage: 'wisp', path: 'breath' })} />)
    // No ailing/dead messaging when healthy.
    expect(screen.queryByText(/ailing/i)).toBeNull()
    expect(screen.queryByText(/has passed/i)).toBeNull()
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

  it('draws the nebula habitat backdrop (pink stellar gas)', () => {
    const { container } = renderSpirit(
      <Spirit spirit={spiritState({ path: 'breath', cosmetics: { habitat: 'nebula' } })} />,
    )
    // One billowing nebula gas cloud is a magenta ellipse (#db2777) — unique to the nebula art.
    expect(container.querySelector('.spirit-svg ellipse[fill="#db2777"]')).not.toBeNull()
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
    // The faint blue cloud-floor base shadow (#bae6fd rect).
    expect(container.querySelector('.spirit-svg rect[fill="#bae6fd"]')).not.toBeNull()
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
