// Home "recommended practice" — one gentle, optional suggestion for the home hero.
//
// Deliberately a small, transparent rule, NOT a personalisation engine: the research behind
// ADR-0032 warns that inferred/pushy recommendations mistime and annoy, while a calm app wants a
// legible, ignorable suggestion. So we pick from two clear signals only:
//   1. the companion's least-represented facet (roundOutFacet) when its balance is uneven — a
//      personal nudge that ties the home to the spirit, and
//   2. otherwise the time of day (the single strongest, lowest-friction context signal).
// Every pick is an UNGATED practice, so we never recommend something the user can't open yet.
import type { SpiritNeedKey } from '../types'

export interface Recommendation {
  /** An inviting call-to-action for the hero button (a full phrase, not a bare label). */
  cta: string
  /** A short, gentle reason shown beneath the button. */
  blurb: string
  /** Deep link to the practice (mirrors the Practices-hub hrefs; all ungated). */
  to: string
}

type Slot = 'morning' | 'afternoon' | 'evening' | 'night'

// Which time-of-day bucket an hour (0..23) falls in.
export function slotForHour(hour: number): Slot {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

// The time-of-day fallback — used when the companion's balance is even (or it has no path yet).
const BY_TIME: Record<Slot, Recommendation> = {
  morning: {
    cta: 'Start clear with focused attention',
    blurb: 'A steady way into the morning.',
    to: '/meditate?guided=focus',
  },
  // Afternoon keeps the app's long-standing default breathe invite.
  afternoon: {
    cta: 'Take a slow minute to breathe',
    blurb: 'A small reset for the middle of the day.',
    to: '/breathe',
  },
  evening: {
    cta: 'Wind down with Yoga Nidra',
    blurb: 'A deep rest for the evening.',
    to: '/meditate?guided=yoga-nidra',
  },
  night: {
    cta: 'Ease toward sleep with Yoga Nidra',
    blurb: 'Let the day soften.',
    to: '/meditate?guided=yoga-nidra',
  },
}

// When the companion's balance is uneven, lean toward the least-represented facet — a personal,
// ungated pick that "rounds it out" (matching the ADR-0032 balance language).
const BY_FACET: Record<SpiritNeedKey, Recommendation> = {
  joyful: {
    cta: 'Warm the heart with loving-kindness',
    blurb: 'A little more joy would round things out.',
    to: '/meditate?guided=loving-kindness',
  },
  rested: {
    cta: 'Settle with a body scan',
    blurb: 'A little rest would round things out.',
    to: '/meditate?guided=body-scan',
  },
  nourished: {
    cta: 'Steady yourself with focused attention',
    blurb: 'A grounding practice to round things out.',
    to: '/meditate?guided=focus',
  },
}

/**
 * One gentle, optional practice suggestion for the home hero. Personalised to the companion's
 * least-represented `facet` when its balance is uneven (pass `null` for an even balance or a
 * spark with no path yet); otherwise a sensible pick for the time of day. All picks are ungated.
 */
export function recommendedPractice(opts: {
  hour: number
  facet: SpiritNeedKey | null
}): Recommendation {
  if (opts.facet) return BY_FACET[opts.facet]
  return BY_TIME[slotForHour(opts.hour)]
}
