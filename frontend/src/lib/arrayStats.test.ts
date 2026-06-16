import { describe, it, expect } from 'vitest'

// Mirror the reduce pattern used in AnalyticsPage to verify it's safe and correct.
const reduceMin = (arr: number[]) => arr.reduce((a, b) => Math.min(a, b), arr[0])
const reduceMax = (arr: number[]) => arr.reduce((a, b) => Math.max(a, b), arr[0])

describe('reduce-based min/max (safe alternative to spread)', () => {
  it('returns correct min for a small array', () => {
    expect(reduceMin([60, 72, 55, 80])).toBe(55)
  })

  it('returns correct max for a small array', () => {
    expect(reduceMax([60, 72, 55, 80])).toBe(80)
  })

  it('handles a single-element array', () => {
    expect(reduceMin([65])).toBe(65)
    expect(reduceMax([65])).toBe(65)
  })

  it('handles a large array without stack overflow', () => {
    const big = Array.from({ length: 100_000 }, (_, i) => i + 40)
    expect(reduceMin(big)).toBe(40)
    expect(reduceMax(big)).toBe(100_039)
  })
})
