import { describe, expect, it } from 'vitest'
import { dailyOf, GREETINGS, LOADING } from './zen'

describe('dailyOf', () => {
  it('is stable for the same calendar day', () => {
    const a = new Date('2026-06-14T08:00:00')
    const b = new Date('2026-06-14T23:30:00')
    expect(dailyOf(GREETINGS, a)).toBe(dailyOf(GREETINGS, b))
  })

  it('advances day to day and stays in range', () => {
    const picks = Array.from({ length: 14 }, (_, i) =>
      dailyOf(LOADING, new Date(2026, 5, 1 + i)),
    )
    expect(picks.every((p) => LOADING.includes(p))).toBe(true)
    expect(new Set(picks).size).toBeGreaterThan(1) // it actually rotates
  })
})
