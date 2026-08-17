import { afterEach, describe, expect, it } from 'vitest'
import { READINGS, dailyReading, readingAttribution, readingText } from './readings'
import { setLocale } from '../i18n'

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

  describe('Japanese localization', () => {
    afterEach(() => setLocale('en'))

    it('every reading has a Japanese translation (no English fallthrough)', () => {
      setLocale('ja')
      for (const r of READINGS) {
        const ja = readingText(r)
        expect(ja, `missing JA for: ${r.text}`).not.toBe(r.text)
        expect(ja.trim().length).toBeGreaterThan(0)
      }
    })

    it('localizes attribution: 著者『作品』, and 着想 for paraphrases', () => {
      setLocale('ja')
      expect(readingAttribution({ text: 'x', author: 'Seneca' })).toBe('セネカ')
      expect(
        readingAttribution({ text: 'x', author: 'Lao Tzu', work: 'Tao Te Ching' }),
      ).toBe('老子『道徳経』')
      // Modern in-copyright title stays in its original form, with the JA "inspired" frame.
      expect(
        readingAttribution({ text: 'x', author: 'James Clear', work: 'Atomic Habits', inspired: true }),
      ).toBe('Atomic Habitsに着想を得た一節')
    })
  })
})
