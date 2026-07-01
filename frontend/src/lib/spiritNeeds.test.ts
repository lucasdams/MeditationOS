import { describe, it, expect } from 'vitest'
import { roundOutFacet, leastRepresentedFacet, BALANCE_EVEN_DELTA } from './spiritNeeds'
import type { SpiritNeed, SpiritNeeds } from '../types'

// A facet at a given 0..1 factor (tier is irrelevant to the balance helpers).
const need = (factor: number): SpiritNeed => ({
  tier: factor < 0.3 ? 'restless' : 'content',
  factor,
})

const needs = (nourished: number, rested: number, joyful: number): SpiritNeeds => ({
  nourished: need(nourished),
  rested: need(rested),
  joyful: need(joyful),
})

describe('leastRepresentedFacet', () => {
  it('returns the facet with the lowest factor', () => {
    expect(leastRepresentedFacet(needs(0.9, 0.2, 0.8))).toBe('rested')
    expect(leastRepresentedFacet(needs(0.1, 0.9, 0.9))).toBe('nourished')
    expect(leastRepresentedFacet(needs(0.9, 0.9, 0.15))).toBe('joyful')
  })

  it('breaks ties toward the earlier facet in order (nourished > rested > joyful)', () => {
    expect(leastRepresentedFacet(needs(0.5, 0.5, 0.5))).toBe('nourished')
    expect(leastRepresentedFacet(needs(0.2, 0.2, 0.9))).toBe('nourished')
    expect(leastRepresentedFacet(needs(0.9, 0.3, 0.3))).toBe('rested')
  })
})

describe('roundOutFacet (ADR-0032 — optional, only when uneven)', () => {
  it('suggests the lagging facet when the mix is clearly uneven', () => {
    expect(roundOutFacet(needs(0.9, 0.2, 0.8))).toBe('rested')
    expect(roundOutFacet(needs(0.1, 0.9, 0.9))).toBe('nourished')
    expect(roundOutFacet(needs(0.9, 0.9, 0.15))).toBe('joyful')
  })

  it('returns null when the balance is even (spread within BALANCE_EVEN_DELTA)', () => {
    // All equal → nothing to round out.
    expect(roundOutFacet(needs(0.9, 0.9, 0.9))).toBeNull()
    // Spread exactly at the delta → still counts as even (inclusive bound).
    expect(roundOutFacet(needs(1, 1, 1 - BALANCE_EVEN_DELTA))).toBeNull()
    // A hair over the delta → the lagging facet surfaces.
    expect(roundOutFacet(needs(1, 1, 1 - BALANCE_EVEN_DELTA - 0.01))).toBe('joyful')
  })

  it('respects the tie-break when two facets share the minimum', () => {
    expect(roundOutFacet(needs(0.2, 0.2, 0.9))).toBe('nourished')
    expect(roundOutFacet(needs(0.9, 0.3, 0.3))).toBe('rested')
  })
})
