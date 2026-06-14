import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  cycleLength,
  patternForBpm,
  patternSummary,
  scaleAt,
  segmentAt,
  MIN_SCALE,
  MAX_SCALE,
  type Pattern,
} from './breathPattern'

describe('patternForBpm', () => {
  it('derives a ~2:3 longer-exhale split with 1s holds', () => {
    // 6 bpm → 10s total → 4 in / 6 out.
    expect(patternForBpm(6)).toEqual({ inhale: 4, holdFull: 1, exhale: 6, holdEmpty: 1 })
    expect(patternForBpm(3).exhale).toBeGreaterThan(patternForBpm(3).inhale)
  })
})

describe('segmentAt', () => {
  const box: Pattern = { inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 } // cycle 16
  it('walks inhale → hold-full → exhale → hold-empty', () => {
    expect(segmentAt(0, box)).toBe('inhale')
    expect(segmentAt(4, box)).toBe('hold-full')
    expect(segmentAt(8, box)).toBe('exhale')
    expect(segmentAt(12, box)).toBe('hold-empty')
    expect(cycleLength(box)).toBe(16)
  })

  it('skips zero-length holds (4·7·8 has no empty-hold)', () => {
    const p: Pattern = { inhale: 4, holdFull: 7, exhale: 8, holdEmpty: 0 } // cycle 19
    expect(cycleLength(p)).toBe(19)
    expect(segmentAt(4, p)).toBe('hold-full')
    expect(segmentAt(11, p)).toBe('exhale')
    // At 19 (== cycle) we've wrapped; just before it we're still exhaling, never an
    // empty-hold, so the next breath rolls straight into an inhale.
    expect(segmentAt(18.9, p)).toBe('exhale')
  })
})

describe('scaleAt', () => {
  const p: Pattern = { inhale: 4, holdFull: 1, exhale: 6, holdEmpty: 1 }
  it('grows over inhale, holds full, shrinks over exhale, holds empty', () => {
    expect(scaleAt(0, p)).toBeCloseTo(MIN_SCALE)
    expect(scaleAt(4, p)).toBeCloseTo(MAX_SCALE) // top of inhale
    expect(scaleAt(4.5, p)).toBeCloseTo(MAX_SCALE) // hold-full
    expect(scaleAt(11, p)).toBeCloseTo(MIN_SCALE) // end of exhale
    expect(scaleAt(11.5, p)).toBeCloseTo(MIN_SCALE) // hold-empty
  })
})

describe('PRESETS', () => {
  it('has a resonance (bpm-driven) option plus fixed cadences', () => {
    const resonance = PRESETS.find((x) => x.key === 'resonance')
    expect(resonance?.pattern).toBeNull()
    const fixed = PRESETS.filter((x) => x.pattern !== null)
    expect(fixed.length).toBeGreaterThanOrEqual(3)
    // every fixed preset has a positive inhale and exhale
    expect(fixed.every((x) => x.pattern!.inhale > 0 && x.pattern!.exhale > 0)).toBe(true)
  })

  it('patternSummary shows holds only when present', () => {
    expect(patternSummary({ inhale: 5, holdFull: 0, exhale: 5, holdEmpty: 0 })).toBe('5 in · 5 out')
    expect(patternSummary({ inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 })).toBe('4·4·4·4')
  })
})
