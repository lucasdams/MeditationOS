// A small "Suggested for you" set for the Practices hub — a few gentle, optional picks shown at the
// top of the list. Same philosophy as the home recommendation (see ./recommendation.ts, ADR-0032):
// a legible, ignorable suggestion from clear signals, NOT a personalisation engine. We pick from:
//   1. the companion's least-represented facet, when its balance is uneven (a personal round-out),
//   2. the time of day (the strongest low-friction context signal), and
//   3. a short anytime on-ramp,
// de-duplicated and capped at three. Every route is UNGATED and exists in the Practices catalog, so
// we never suggest something the user can't open (or that the hub can't resolve to a card).
import type { SpiritNeedKey } from '../types'
import { slotForHour } from './recommendation'

export interface SuggestionSet {
  /** A gentle one-line reason shown under the "Suggested for you" heading. */
  subtitle: string
  /** Ordered practice routes (mirror the Practices-hub hrefs); resolved to cards by the page. */
  picks: string[]
}

// Time-of-day primary pick — used always, and as the sole basis when the balance is even.
const TIME_PICK: Record<ReturnType<typeof slotForHour>, string> = {
  morning: '/meditate?guided=focus',
  afternoon: '/breathe?pattern=resonance',
  evening: '/meditate?guided=wind-down',
  night: '/meditate?guided=yoga-nidra',
}

const TIME_SUBTITLE: Record<ReturnType<typeof slotForHour>, string> = {
  morning: 'A steady way into the morning.',
  afternoon: 'A small reset for the middle of the day.',
  evening: 'A gentle way to wind down this evening.',
  night: 'Something to ease toward sleep.',
}

// When the companion's balance is uneven, lead with a pick that rounds out its weakest facet.
const FACET_PICK: Record<SpiritNeedKey, string> = {
  joyful: '/meditate?guided=loving-kindness',
  rested: '/meditate?guided=body-scan',
  nourished: '/meditate?guided=focus',
}

const FACET_WORD: Record<SpiritNeedKey, string> = {
  joyful: 'joy',
  rested: 'rest',
  nourished: 'grounding',
}

// A short, always-safe on-ramp — rounds the set out to three without ever feeling demanding.
const ANYTIME = '/meditate?guided=three-breaths'

/**
 * A few gentle practice suggestions for the top of the Practices hub. Leads with the companion's
 * least-represented `facet` when its balance is uneven (pass `null` for an even balance or a spark
 * with no path yet); otherwise leans on the time of day. All picks are ungated and de-duplicated.
 */
export function suggestedPractices(opts: { hour: number; facet: SpiritNeedKey | null }): SuggestionSet {
  const slot = slotForHour(opts.hour)
  const picks: string[] = []
  const add = (to: string) => {
    if (to && !picks.includes(to)) picks.push(to)
  }
  if (opts.facet) add(FACET_PICK[opts.facet])
  add(TIME_PICK[slot])
  add(ANYTIME)
  const subtitle = opts.facet
    ? `A little more ${FACET_WORD[opts.facet]} would round things out.`
    : TIME_SUBTITLE[slot]
  return { subtitle, picks: picks.slice(0, 3) }
}
