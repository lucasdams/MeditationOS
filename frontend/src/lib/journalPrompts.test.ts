import { describe, expect, it } from 'vitest'
import { dailyPrompt, JOURNAL_PROMPTS, randomPrompt } from './journalPrompts'

describe('dailyPrompt', () => {
  it('returns a prompt from the list', () => {
    const p = dailyPrompt(new Date())
    expect(JOURNAL_PROMPTS).toContain(p)
  })

  it('is stable for the same calendar day', () => {
    const a = new Date('2026-06-14T08:00:00')
    const b = new Date('2026-06-14T23:30:00')
    expect(dailyPrompt(a)).toBe(dailyPrompt(b))
  })

  it('advances day to day', () => {
    const picks = Array.from({ length: 14 }, (_, i) =>
      dailyPrompt(new Date(2026, 5, 1 + i)),
    )
    expect(picks.every((p) => JOURNAL_PROMPTS.includes(p))).toBe(true)
    expect(new Set(picks).size).toBeGreaterThan(1)
  })
})

describe('randomPrompt', () => {
  it('returns a prompt from the list', () => {
    const p = randomPrompt()
    expect(JOURNAL_PROMPTS).toContain(p)
  })

  it('excludes the current prompt when shuffling', () => {
    const current = JOURNAL_PROMPTS[0]
    // Run many times — the excluded prompt should never appear.
    for (let i = 0; i < 50; i++) {
      expect(randomPrompt(current)).not.toBe(current)
    }
  })
})
