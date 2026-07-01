import { describe, it, expect } from 'vitest'
import { weakestNeed } from './spiritNeeds'
import type { SpiritNeed, SpiritNeeds } from '../types'

// A need at a given 0..1 factor (tier is irrelevant to weakestNeed).
const need = (factor: number): SpiritNeed => ({
  tier: factor < 0.3 ? 'restless' : 'content',
  factor,
})

const needs = (nourished: number, rested: number, joyful: number): SpiritNeeds => ({
  nourished: need(nourished),
  rested: need(rested),
  joyful: need(joyful),
})

describe('weakestNeed', () => {
  it('returns the need with the lowest factor', () => {
    expect(weakestNeed(needs(0.9, 0.2, 0.8))).toBe('rested')
    expect(weakestNeed(needs(0.1, 0.9, 0.9))).toBe('nourished')
    expect(weakestNeed(needs(0.9, 0.9, 0.15))).toBe('joyful')
  })

  it('breaks ties toward the earlier need in order (nourished > rested > joyful)', () => {
    // All equal → nourished (first in the fixed order).
    expect(weakestNeed(needs(0.5, 0.5, 0.5))).toBe('nourished')
    // nourished ties rested at the minimum → nourished wins.
    expect(weakestNeed(needs(0.2, 0.2, 0.9))).toBe('nourished')
    // rested ties joyful at the minimum → rested wins.
    expect(weakestNeed(needs(0.9, 0.3, 0.3))).toBe('rested')
  })

  it('handles all-thriving (max) needs deterministically', () => {
    expect(weakestNeed(needs(1, 1, 1))).toBe('nourished')
  })
})
