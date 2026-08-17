import { describe, it, expect } from 'vitest'
import {
  buildSchedule,
  currentPhaseIndex,
  getStructure,
  tryGetStructure,
  isGuidedUnlocked,
  localizedCue,
  localizedDescription,
  localizedLabel,
  GUIDED_MIN_LEVEL,
  GUIDED_STRUCTURES,
  type GuidedStructureId,
} from './guidedSessions'

// The full guided-session catalog after the practices trim (chore/trim-practices):
// a tight core of 8 runnable scripts. Every one must be reachable (via getStructure
// / tryGetStructure) and be a real, runnable script.
const STRUCTURE_IDS: GuidedStructureId[] = [
  'body-scan',
  'loving-kindness',
  'focus',
  'noting',
  'mantra',
  'yoga-nidra',
  'wind-down',
  'three-breaths',
]

// ── Structural integrity ─────────────────────────────────────────────────────

describe('GUIDED_STRUCTURES', () => {
  it('exports exactly the trimmed core of guided structures', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id).sort()
    expect(ids).toEqual([...STRUCTURE_IDS].sort())
  })

  it('no longer exports the cut structures', () => {
    const ids = GUIDED_STRUCTURES.map((s) => s.id)
    for (const cut of [
      'name-feelings',
      'chakra-om',
      'stretching',
      'walking',
      'pmr',
      'sound-bath',
      'count-breath',
      'awe',
      'four-seven-eight',
      'physiological-sigh',
      'arriving',
    ]) {
      expect(ids).not.toContain(cut)
    }
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

  it('never ships an empty cue string in any structure', () => {
    for (const s of GUIDED_STRUCTURES) {
      for (const p of s.phases) {
        expect(p.cue.trim().length).toBeGreaterThan(0)
      }
    }
  })
})

// ── Catalog resolution ───────────────────────────────────────────────────────
// Every kept guided id must resolve from the array via getStructure and
// tryGetStructure, and be a real script: at least 3 phases, each with a
// non-empty cue. This is what makes a `?guided=<id>` deep-link "just work".

describe('guided structure catalog', () => {
  it.each(STRUCTURE_IDS)('resolves %s via getStructure + tryGetStructure', (id) => {
    expect(getStructure(id).id).toBe(id)
    expect(tryGetStructure(id)?.id).toBe(id)
  })

  it.each(STRUCTURE_IDS)('%s has ≥3 phases, each with a non-empty cue', (id) => {
    const s = getStructure(id)
    expect(s.phases.length).toBeGreaterThanOrEqual(3)
    for (const p of s.phases) {
      expect(p.cue.trim().length).toBeGreaterThan(0)
      expect(p.weight).toBeGreaterThan(0)
    }
  })

  it.each(STRUCTURE_IDS)('%s carries no level gate (always unlocked)', (id) => {
    expect(GUIDED_MIN_LEVEL[id]).toBeUndefined()
    expect(isGuidedUnlocked(id, null)).toBe(true)
  })
})

describe('Japanese localization', () => {
  it('every structure has a Japanese label, description, and one cue per phase', () => {
    for (const s of GUIDED_STRUCTURES) {
      // ja label/description differ from the English (i.e. a real translation exists).
      expect(localizedLabel(s, 'ja')).not.toBe('')
      expect(localizedLabel(s, 'ja')).not.toBe(s.label)
      expect(localizedDescription(s, 'ja')).not.toBe(s.description)
      // A Japanese cue for every phase — no gaps that would fall back to English mid-sit.
      s.phases.forEach((p, i) => {
        const ja = localizedCue(s.id, i, p.cue, 'ja')
        expect(ja).not.toBe(p.cue)
        expect(ja.trim().length).toBeGreaterThan(0)
      })
    }
  })

  it('returns the English text for the en locale (and as a fallback)', () => {
    const s = GUIDED_STRUCTURES[0]
    expect(localizedLabel(s, 'en')).toBe(s.label)
    expect(localizedDescription(s, 'en')).toBe(s.description)
    expect(localizedCue(s.id, 0, s.phases[0].cue, 'en')).toBe(s.phases[0].cue)
    // Out-of-range phase index falls back to the provided English cue.
    expect(localizedCue(s.id, 999, 'fallback', 'ja')).toBe('fallback')
  })
})

describe('getStructure', () => {
  it('returns the correct structure by id', () => {
    for (const id of STRUCTURE_IDS) {
      expect(getStructure(id).id).toBe(id)
    }
  })

  it('throws for an unknown id', () => {
    // @ts-expect-error intentional invalid id
    expect(() => getStructure('unknown')).toThrow()
  })
})

// ── Level gates ──────────────────────────────────────────────────────────────

describe('GUIDED_MIN_LEVEL + isGuidedUnlocked', () => {
  it('ships no level-gated structures after the trim', () => {
    expect(Object.keys(GUIDED_MIN_LEVEL)).toHaveLength(0)
  })

  it('every structure is unlocked, even with a null level', () => {
    for (const id of STRUCTURE_IDS) {
      expect(isGuidedUnlocked(id, null)).toBe(true)
    }
  })

  it('an absent gate keeps a structure unlocked at any level', () => {
    expect(isGuidedUnlocked('body-scan', 1)).toBe(true)
    expect(isGuidedUnlocked('focus', 100)).toBe(true)
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
