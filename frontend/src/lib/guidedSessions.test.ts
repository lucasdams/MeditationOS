import { describe, it, expect } from 'vitest'
import {
  buildSchedule,
  currentPhaseIndex,
  getStructure,
  GUIDED_STRUCTURES,
} from './guidedSessions'

// ── Structural integrity ─────────────────────────────────────────────────────

describe('GUIDED_STRUCTURES', () => {
  it('exports body-scan and loving-kindness', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    expect(ids).toContain('body-scan')
    expect(ids).toContain('loving-kindness')
  })

  it('each structure has at least 2 phases with positive weights', () => {
    for (const s of GUIDED_STRUCTURES) {
      expect(s.phases.length).toBeGreaterThanOrEqual(2)
      for (const p of s.phases) {
        expect(p.weight).toBeGreaterThan(0)
        expect(typeof p.cue).toBe('string')
        expect(p.cue.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('getStructure', () => {
  it('returns the correct structure by id', () => {
    expect(getStructure('body-scan').id).toBe('body-scan')
    expect(getStructure('loving-kindness').id).toBe('loving-kindness')
  })

  it('throws for an unknown id', () => {
    // @ts-expect-error intentional invalid id
    expect(() => getStructure('unknown')).toThrow()
  })
})

// ── buildSchedule ────────────────────────────────────────────────────────────

describe('buildSchedule', () => {
  it('covers the full duration — first window starts at 0, last ends at durationSec', () => {
    const structure = getStructure('body-scan')
    const schedule = buildSchedule(structure, 600) // 10 min
    expect(schedule[0].startSec).toBe(0)
    expect(schedule[schedule.length - 1].endSec).toBe(600)
  })

  it('produces one window per phase', () => {
    const structure = getStructure('loving-kindness')
    const schedule = buildSchedule(structure, 1800)
    expect(schedule.length).toBe(structure.phases.length)
  })

  it('windows are contiguous — each window starts where the previous ended', () => {
    const structure = getStructure('body-scan')
    const schedule = buildSchedule(structure, 300)
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].startSec).toBeCloseTo(schedule[i - 1].endSec, 5)
    }
  })

  it('allocates time proportionally to weights', () => {
    // Build a synthetic two-phase structure via the real data structures
    const structure = getStructure('body-scan')
    const schedule = buildSchedule(structure, 3300) // 55 min
    // Each window length should be (weight / totalWeight) * durationSec
    const totalWeight = structure.phases.reduce((s, p) => s + p.weight, 0)
    structure.phases.forEach((phase, i) => {
      const expected = (phase.weight / totalWeight) * 3300
      const actual = schedule[i].endSec - schedule[i].startSec
      expect(actual).toBeCloseTo(expected, 4)
    })
  })

  it('scales correctly for a short 5-min sit', () => {
    const structure = getStructure('body-scan')
    const schedule = buildSchedule(structure, 300) // 5 min
    expect(schedule[0].startSec).toBe(0)
    expect(schedule[schedule.length - 1].endSec).toBe(300)
    // All phase durations must be positive
    for (const w of schedule) {
      expect(w.endSec).toBeGreaterThan(w.startSec)
    }
  })

  it('scales correctly for a long 30-min sit', () => {
    const structure = getStructure('loving-kindness')
    const schedule = buildSchedule(structure, 1800) // 30 min
    expect(schedule[0].startSec).toBe(0)
    expect(schedule[schedule.length - 1].endSec).toBe(1800)
  })

  it('uses a 20-min reference duration for open-ended sits (durationSec === 0)', () => {
    const structure = getStructure('body-scan')
    const schedule = buildSchedule(structure, 0)
    expect(schedule[schedule.length - 1].endSec).toBe(1200) // 20 * 60
  })
})

// ── currentPhaseIndex ────────────────────────────────────────────────────────

describe('currentPhaseIndex', () => {
  const structure = getStructure('body-scan')
  const schedule = buildSchedule(structure, 600) // 10 min

  it('returns 0 at t=0', () => {
    expect(currentPhaseIndex(schedule, 0)).toBe(0)
  })

  it('returns the last phase index at the end of the sit', () => {
    expect(currentPhaseIndex(schedule, 600)).toBe(structure.phases.length - 1)
  })

  it('returns the last phase index beyond the sit end', () => {
    expect(currentPhaseIndex(schedule, 9999)).toBe(structure.phases.length - 1)
  })

  it('returns 0 for an empty schedule', () => {
    expect(currentPhaseIndex([], 100)).toBe(0)
  })

  it('advances to the next phase exactly at the boundary', () => {
    // Find the boundary between phase 0 and phase 1
    const boundary = schedule[1].startSec
    // Just before the boundary: still phase 0
    expect(currentPhaseIndex(schedule, boundary - 0.001)).toBe(0)
    // At the boundary: phase 1
    expect(currentPhaseIndex(schedule, boundary)).toBe(1)
  })

  it('with loop=true, wraps past the reference span instead of pinning on the last phase', () => {
    // Open-ended sit: schedule built against the 20-min reference.
    const open = buildSchedule(structure, 0)
    const span = open[open.length - 1].endSec // 1200s
    // Without looping, anything past the span parks on the closing phase.
    expect(currentPhaseIndex(open, span + 5)).toBe(structure.phases.length - 1)
    // With looping, just past the span we cycle back to the opening phase.
    expect(currentPhaseIndex(open, span + 5, true)).toBe(0)
    // And the wrapped index matches the same offset within the first cycle.
    const offset = 300
    expect(currentPhaseIndex(open, span + offset, true)).toBe(
      currentPhaseIndex(open, offset, true),
    )
  })

  it('produces consistent results across 5-min and 30-min durations', () => {
    const short = buildSchedule(structure, 300)
    const long = buildSchedule(structure, 1800)

    // At 50% through each sit, we should be in the same relative phase
    const shortMid = currentPhaseIndex(short, 150)
    const longMid = currentPhaseIndex(long, 900)
    expect(shortMid).toBe(longMid)
  })
})
