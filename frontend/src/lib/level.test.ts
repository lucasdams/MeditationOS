import { describe, expect, it } from 'vitest'
import { levelProgress } from './level'

describe('levelProgress', () => {
  it('starts at level 1 with no XP', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 20 })
  })

  it('crosses to level 2 at the 20-XP threshold (10·L·(L−1))', () => {
    expect(levelProgress(19).level).toBe(1)
    expect(levelProgress(20).level).toBe(2)
  })

  it('reports progress into the current level', () => {
    // Level 2 starts at 20 XP; 25 XP is 5 into it.
    const p = levelProgress(25)
    expect(p.level).toBe(2)
    expect(p.xpIntoLevel).toBe(5)
    expect(p.xpForNextLevel).toBe(40)
  })

  it('is monotonic in level as XP grows', () => {
    let last = 0
    for (let xp = 0; xp <= 1000; xp += 7) {
      const lvl = levelProgress(xp).level
      expect(lvl).toBeGreaterThanOrEqual(last)
      last = lvl
    }
  })
})
