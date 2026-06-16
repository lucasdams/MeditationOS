import { describe, expect, it } from 'vitest'
import { dailySuggestion, INTENTION_SUGGESTIONS } from './intentionPrompts'

describe('dailySuggestion', () => {
  it('returns a string from the suggestions list', () => {
    const s = dailySuggestion(new Date())
    expect(INTENTION_SUGGESTIONS).toContain(s)
  })

  it('is stable within the same calendar day', () => {
    const morning = new Date('2026-06-16T06:00:00')
    const evening = new Date('2026-06-16T22:45:00')
    expect(dailySuggestion(morning)).toBe(dailySuggestion(evening))
  })

  it('advances day to day', () => {
    const picks = Array.from({ length: 14 }, (_, i) =>
      dailySuggestion(new Date(2026, 5, 1 + i)),
    )
    expect(picks.every((p) => INTENTION_SUGGESTIONS.includes(p))).toBe(true)
    expect(new Set(picks).size).toBeGreaterThan(1)
  })
})
