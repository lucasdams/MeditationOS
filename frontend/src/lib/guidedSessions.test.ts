import { describe, it, expect } from 'vitest'
import {
  buildSchedule,
  currentPhaseIndex,
  getStructure,
  isGuidedUnlocked,
  GUIDED_MIN_LEVEL,
  GUIDED_STRUCTURES,
} from './guidedSessions'

// ── Structural integrity ─────────────────────────────────────────────────────

describe('GUIDED_STRUCTURES', () => {
  it('exports body-scan, loving-kindness, name-feelings, chakra-om, and stretching', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    expect(ids).toContain('body-scan')
    expect(ids).toContain('loving-kindness')
    expect(ids).toContain('name-feelings')
    expect(ids).toContain('chakra-om')
    expect(ids).toContain('stretching')
  })

  it('exports the joy/heart structures (recall-good, self-compassion, savoring, celebrate-win)', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    expect(ids).toContain('recall-good')
    expect(ids).toContain('self-compassion')
    expect(ids).toContain('savoring')
    expect(ids).toContain('celebrate-win')
  })

  it('exports the new mind/body structures (focus, yoga-nidra, just-sit, mantra, walking, pmr)', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    expect(ids).toContain('focus')
    expect(ids).toContain('yoga-nidra')
    expect(ids).toContain('just-sit')
    expect(ids).toContain('mantra')
    expect(ids).toContain('walking')
    expect(ids).toContain('pmr')
  })

  it('no longer exports the old "acceptance" id (renamed to name-feelings)', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    expect(ids).not.toContain('acceptance')
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
    expect(getStructure('name-feelings').id).toBe('name-feelings')
    expect(getStructure('chakra-om').id).toBe('chakra-om')
    expect(getStructure('stretching').id).toBe('stretching')
    expect(getStructure('recall-good').id).toBe('recall-good')
    expect(getStructure('self-compassion').id).toBe('self-compassion')
    expect(getStructure('savoring').id).toBe('savoring')
    expect(getStructure('celebrate-win').id).toBe('celebrate-win')
    expect(getStructure('focus').id).toBe('focus')
    expect(getStructure('yoga-nidra').id).toBe('yoga-nidra')
    expect(getStructure('just-sit').id).toBe('just-sit')
    expect(getStructure('mantra').id).toBe('mantra')
    expect(getStructure('walking').id).toBe('walking')
    expect(getStructure('pmr').id).toBe('pmr')
  })

  it('throws for an unknown id', () => {
    // @ts-expect-error intentional invalid id
    expect(() => getStructure('unknown')).toThrow()
  })
})

// ── Level gates ──────────────────────────────────────────────────────────────

describe('GUIDED_MIN_LEVEL + isGuidedUnlocked', () => {
  it('gates chakra-om behind level 5', () => {
    expect(GUIDED_MIN_LEVEL['chakra-om']).toBe(5)
  })

  it('ungated structures are always unlocked, even with a null level', () => {
    expect(isGuidedUnlocked('body-scan', null)).toBe(true)
    expect(isGuidedUnlocked('name-feelings', 1)).toBe(true)
    expect(isGuidedUnlocked('stretching', null)).toBe(true)
    // The joy/heart structures carry no level gate.
    expect(isGuidedUnlocked('recall-good', null)).toBe(true)
    expect(isGuidedUnlocked('self-compassion', null)).toBe(true)
    expect(isGuidedUnlocked('savoring', null)).toBe(true)
    expect(isGuidedUnlocked('celebrate-win', null)).toBe(true)
    // The new mind/body structures carry no level gate either.
    expect(isGuidedUnlocked('focus', null)).toBe(true)
    expect(isGuidedUnlocked('yoga-nidra', null)).toBe(true)
    expect(isGuidedUnlocked('just-sit', null)).toBe(true)
    expect(isGuidedUnlocked('mantra', null)).toBe(true)
    expect(isGuidedUnlocked('walking', null)).toBe(true)
    expect(isGuidedUnlocked('pmr', null)).toBe(true)
  })

  it('a gated structure is locked below its minimum level', () => {
    expect(isGuidedUnlocked('chakra-om', 1)).toBe(false)
    expect(isGuidedUnlocked('chakra-om', 4)).toBe(false)
  })

  it('a gated structure unlocks at or above its minimum level', () => {
    expect(isGuidedUnlocked('chakra-om', 5)).toBe(true)
    expect(isGuidedUnlocked('chakra-om', 10)).toBe(true)
  })

  it('a null/unknown level keeps a gated structure locked (fail safe)', () => {
    expect(isGuidedUnlocked('chakra-om', null)).toBe(false)
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
