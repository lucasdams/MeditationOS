import { describe, expect, it } from 'vitest'
import { clamp, flamePoseAt } from './flame'

describe('clamp', () => {
  it('bounds a value to [lo, hi]', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('flamePoseAt', () => {
  it('is perfectly still at intensity 0 (reduced-motion fallback)', () => {
    // No sway and no stretch at any time — the flame holds a single calm pose.
    for (const t of [0, 1.3, 7.7, 42]) {
      const pose = flamePoseAt(t, 0)
      expect(pose.sway).toBeCloseTo(0, 10)
      expect(pose.stretch).toBeCloseTo(1, 10)
    }
  })

  it('still produces a stable, bright pose when held still', () => {
    const a = flamePoseAt(0, 0)
    const b = flamePoseAt(100, 0)
    // Use toBeCloseTo to sidestep signed-zero (-0 vs 0) from the clamp at intensity 0.
    expect(a.sway).toBeCloseTo(b.sway, 10)
    expect(a.stretch).toBeCloseTo(b.stretch, 10)
    // Brightness is fixed (no flicker) at intensity 0.
    expect(a.brightness).toBe(b.brightness)
  })

  it('keeps sway/stretch/brightness within gentle bounds when animating', () => {
    // Sample across many moments; the motion must never exceed its soft envelope.
    for (let t = 0; t < 60; t += 0.13) {
      const pose = flamePoseAt(t, 1)
      expect(pose.sway).toBeGreaterThanOrEqual(-0.5)
      expect(pose.sway).toBeLessThanOrEqual(0.5)
      expect(pose.stretch).toBeGreaterThanOrEqual(0.85)
      expect(pose.stretch).toBeLessThanOrEqual(1.15)
      expect(pose.brightness).toBeGreaterThanOrEqual(0)
      expect(pose.brightness).toBeLessThanOrEqual(1)
    }
  })

  it('actually moves over time at full intensity (not a frozen frame)', () => {
    const samples = [0, 0.5, 1, 1.5, 2, 2.5].map((t) => flamePoseAt(t, 1).sway)
    const unique = new Set(samples.map((s) => s.toFixed(4)))
    expect(unique.size).toBeGreaterThan(1)
  })

  it('scales motion down with intensity', () => {
    // At a given time, partial intensity sways less than full intensity.
    const t = 1.2
    const full = Math.abs(flamePoseAt(t, 1).sway)
    const half = Math.abs(flamePoseAt(t, 0.5).sway)
    expect(half).toBeLessThanOrEqual(full)
  })
})
