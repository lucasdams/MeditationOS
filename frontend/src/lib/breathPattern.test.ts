import { describe, expect, it } from 'vitest'
import {
  ENERGIZING_PATTERN,
  PRESETS,
  boxPatternForCount,
  breathEventAt,
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

describe('boxPatternForCount', () => {
  it('makes all four phases equal to the count', () => {
    expect(boxPatternForCount(4)).toEqual({ inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 })
    expect(boxPatternForCount(6)).toEqual({ inhale: 6, holdFull: 6, exhale: 6, holdEmpty: 6 })
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

  it('skips zero-length holds (a pattern with no empty-hold)', () => {
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

describe('breathEventAt', () => {
  it('alternates inhale/exhale at the right offsets, across cycles', () => {
    const box: Pattern = { inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 } // cycle 16
    expect(breathEventAt(box, 0)).toEqual({ phase: 'inhale', time: 0, duration: 4 })
    expect(breathEventAt(box, 1)).toEqual({ phase: 'exhale', time: 8, duration: 4 }) // after in+holdFull
    expect(breathEventAt(box, 2)).toEqual({ phase: 'inhale', time: 16, duration: 4 }) // next cycle
    expect(breathEventAt(box, 3)).toEqual({ phase: 'exhale', time: 24, duration: 4 })
  })

  it('places the exhale right after the inhale when there is no full-hold', () => {
    const p: Pattern = { inhale: 4, holdFull: 1, exhale: 6, holdEmpty: 1 } // resonance, cycle 12
    expect(breathEventAt(p, 1)).toEqual({ phase: 'exhale', time: 5, duration: 6 })
    expect(breathEventAt(p, 2).time).toBe(12)
  })
})

describe('PRESETS', () => {
  it('classifies presets by control, and adjustable ones derive from their control value', () => {
    const byControl = (c: string) => PRESETS.filter((x) => x.control === c).map((x) => x.key)
    expect(byControl('bpm')).toEqual(['resonance'])
    expect(byControl('count')).toEqual(['box'])
    expect(byControl('none')).toEqual(['energizing'])
    // adjustable presets (bpm/count) carry a derive fn + null pattern; 'none' carries a pattern
    for (const p of PRESETS) {
      if (p.control === 'none') {
        expect(p.pattern).not.toBeNull()
      } else {
        expect(p.pattern).toBeNull()
        expect(typeof p.derive).toBe('function')
      }
    }
  })

  it('includes the fixed energizing preset (control none, brisk no-hold pattern)', () => {
    const energizing = PRESETS.find((p) => p.key === 'energizing')
    expect(energizing).toBeDefined()
    expect(energizing!.control).toBe('none')
    expect(energizing!.pattern).toEqual(ENERGIZING_PATTERN)
    // Active inhale, quick exhale, no holds → 5s cycle (12 breaths/min).
    expect(ENERGIZING_PATTERN).toEqual({ inhale: 3, holdFull: 0, exhale: 2, holdEmpty: 0 })
    expect(cycleLength(ENERGIZING_PATTERN)).toBe(5)
  })

  it('patternSummary shows holds only when present', () => {
    expect(patternSummary({ inhale: 5, holdFull: 0, exhale: 5, holdEmpty: 0 })).toBe('5 in · 5 out')
    expect(patternSummary({ inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 4 })).toBe('4·4·4·4')
  })
})
