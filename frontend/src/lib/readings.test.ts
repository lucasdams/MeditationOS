import { describe, expect, it } from 'vitest'
import { READINGS, dailyReading, readingAttribution } from './readings'

describe('readings', () => {
  it('is stable for a given calendar day and rotates day to day', () => {
    const d1 = new Date('2026-07-05T09:00:00')
    const d1later = new Date('2026-07-05T23:30:00')
    expect(dailyReading(d1).text).toBe(dailyReading(d1later).text)

    // Over a full cycle of days, more than one distinct reading is surfaced.
    const seen = new Set<string>()
    for (let i = 0; i < READINGS.length; i++) {
      const d = new Date(2026, 6, 5 + i)
      seen.add(dailyReading(d).text)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('every reading is well-formed (non-empty text + author)', () => {
    for (const r of READINGS) {
      expect(r.text.trim().length).toBeGreaterThan(0)
      expect(r.author.trim().length).toBeGreaterThan(0)
      // Paraphrased modern ideas must name the work they're inspired by (for correct attribution).
      if (r.inspired) expect((r.work ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('attributes public-domain quotes and inspired paraphrases distinctly', () => {
    expect(readingAttribution({ text: 'x', author: 'Seneca' })).toBe('Seneca')
    expect(readingAttribution({ text: 'x', author: 'Lao Tzu', work: 'Tao Te Ching' })).toBe(
      'Lao Tzu, Tao Te Ching',
    )
    expect(
      readingAttribution({ text: 'x', author: 'James Clear', work: 'Atomic Habits', inspired: true }),
    ).toBe('Inspired by Atomic Habits')
  })
})
