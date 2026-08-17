import { describe, it, expect } from 'vitest'
import { recommendedPractice, slotForHour } from './recommendation'

describe('slotForHour', () => {
  it('buckets the day into morning / afternoon / evening / night', () => {
    expect(slotForHour(7)).toBe('morning')
    expect(slotForHour(5)).toBe('morning')
    expect(slotForHour(11)).toBe('afternoon')
    expect(slotForHour(14)).toBe('afternoon')
    expect(slotForHour(17)).toBe('evening')
    expect(slotForHour(21)).toBe('evening')
    expect(slotForHour(22)).toBe('night')
    expect(slotForHour(3)).toBe('night')
  })
})

describe('recommendedPractice', () => {
  it('picks by time of day when there is no facet to round out', () => {
    expect(recommendedPractice({ hour: 8, facet: null }).to).toBe('/meditate/focus')
    expect(recommendedPractice({ hour: 14, facet: null }).to).toBe('/breathe')
    expect(recommendedPractice({ hour: 19, facet: null }).to).toBe('/meditate/yoga-nidra')
    expect(recommendedPractice({ hour: 23, facet: null }).to).toBe('/meditate/yoga-nidra')
  })

  it('keeps the long-standing breathe invite for the afternoon default', () => {
    const rec = recommendedPractice({ hour: 14, facet: null })
    // cta/blurb are i18n keys (resolved with t() at render); assert the key + link.
    expect(rec.cta).toBe('home.recommend.afternoon.cta')
    expect(rec.to).toBe('/breathe')
  })

  it('overrides the time pick with a facet-rounding practice when the balance is uneven', () => {
    // Facet wins regardless of the hour — it is the more personal signal.
    expect(recommendedPractice({ hour: 14, facet: 'joyful' }).to).toBe(
      '/meditate/loving-kindness',
    )
    expect(recommendedPractice({ hour: 8, facet: 'rested' }).to).toBe('/meditate/body-scan')
    expect(recommendedPractice({ hour: 19, facet: 'nourished' }).to).toBe('/meditate/focus')
  })

  it('gives newcomers (level ≤ 3) the easiest time-appropriate pick, over facet and the fuller set', () => {
    // Morning: gentle Three mindful breaths instead of the 10-min focus sit.
    expect(recommendedPractice({ hour: 8, facet: null, level: 1 }).to).toBe('/meditate/three-breaths')
    // Evening/night: a body scan instead of the 20-min Yoga Nidra.
    expect(recommendedPractice({ hour: 19, facet: null, level: 3 }).to).toBe('/meditate/body-scan')
    expect(recommendedPractice({ hour: 23, facet: null, level: 2 }).to).toBe('/meditate/body-scan')
    // The beginner pick wins even when a facet would otherwise apply.
    expect(recommendedPractice({ hour: 14, facet: 'joyful', level: 1 }).to).toBe('/breathe?pattern=resonance')
  })

  it('returns the normal (non-beginner) picks once past the newcomer levels, or when level is unknown', () => {
    // Level above the cutoff → the fuller time-of-day set.
    expect(recommendedPractice({ hour: 8, facet: null, level: 4 }).to).toBe('/meditate/focus')
    expect(recommendedPractice({ hour: 19, facet: null, level: 10 }).to).toBe('/meditate/yoga-nidra')
    // Unknown level (null / omitted) is NOT treated as a beginner — avoids flashing the easy pick.
    expect(recommendedPractice({ hour: 8, facet: null, level: null }).to).toBe('/meditate/focus')
    expect(recommendedPractice({ hour: 8, facet: null }).to).toBe('/meditate/focus')
  })

  it('always returns a non-empty cta + blurb + link', () => {
    for (const hour of [3, 8, 14, 19, 23]) {
      for (const facet of [null, 'joyful', 'rested', 'nourished'] as const) {
        for (const level of [null, 1, 3, 5, 20]) {
          const rec = recommendedPractice({ hour, facet, level })
          expect(rec.cta.length).toBeGreaterThan(0)
          expect(rec.blurb.length).toBeGreaterThan(0)
          expect(rec.to).toMatch(/^\//)
        }
      }
    }
  })
})
