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
  /** i18n key for the hero button's call-to-action (resolved with t() at render). */
  cta: string
  /** i18n key for the short, gentle reason shown beneath the button. */
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
    cta: 'home.recommend.morning.cta',
    blurb: 'home.recommend.morning.blurb',
    to: '/meditate/focus',
  },
  // Afternoon keeps the app's long-standing default breathe invite.
  afternoon: {
    cta: 'home.recommend.afternoon.cta',
    blurb: 'home.recommend.afternoon.blurb',
    to: '/breathe',
  },
  evening: {
    cta: 'home.recommend.evening.cta',
    blurb: 'home.recommend.evening.blurb',
    to: '/meditate/yoga-nidra',
  },
  night: {
    cta: 'home.recommend.night.cta',
    blurb: 'home.recommend.night.blurb',
    to: '/meditate/yoga-nidra',
  },
}

// Newcomers (low level) get the gentlest, most basic pick for the time of day — short, unintimidating
// practices ahead of the fuller default set (e.g. Three mindful breaths instead of a 10-min focus sit,
// a body scan instead of a 20-min Yoga Nidra). Keeps the first sits easy so the habit can take hold.
// The cutoff mirrors the Practices-hub "newcomer" heuristic (level ≤ 3).
export const BEGINNER_MAX_LEVEL = 3

const BY_TIME_BEGINNER: Record<Slot, Recommendation> = {
  morning: {
    cta: 'home.recommend.beginner.morning.cta',
    blurb: 'home.recommend.beginner.morning.blurb',
    to: '/meditate/three-breaths',
  },
  afternoon: {
    cta: 'home.recommend.beginner.afternoon.cta',
    blurb: 'home.recommend.beginner.afternoon.blurb',
    to: '/breathe?pattern=resonance',
  },
  evening: {
    cta: 'home.recommend.beginner.evening.cta',
    blurb: 'home.recommend.beginner.evening.blurb',
    to: '/meditate/body-scan',
  },
  night: {
    cta: 'home.recommend.beginner.night.cta',
    blurb: 'home.recommend.beginner.night.blurb',
    to: '/meditate/body-scan',
  },
}

// When the companion's balance is uneven, lean toward the least-represented facet — a personal,
// ungated pick that "rounds it out" (matching the ADR-0032 balance language).
const BY_FACET: Record<SpiritNeedKey, Recommendation> = {
  joyful: {
    cta: 'home.recommend.joyful.cta',
    blurb: 'home.recommend.joyful.blurb',
    to: '/meditate/loving-kindness',
  },
  rested: {
    cta: 'home.recommend.rested.cta',
    blurb: 'home.recommend.rested.blurb',
    to: '/meditate/body-scan',
  },
  nourished: {
    cta: 'home.recommend.nourished.cta',
    blurb: 'home.recommend.nourished.blurb',
    to: '/meditate/focus',
  },
}

/**
 * One gentle, optional practice suggestion for the home hero + header quick-start. For newcomers
 * (known `level` ≤ BEGINNER_MAX_LEVEL) it's the easiest time-appropriate pick, so early sits stay
 * basic. Otherwise it's personalised to the companion's least-represented `facet` when its balance
 * is uneven (pass `null` for an even balance or a spark with no path yet), else a sensible pick for
 * the time of day. `level` unknown (`null`/omitted) is NOT treated as a beginner, so the target
 * doesn't flash for returning practitioners while the level loads. All picks are ungated.
 */
export function recommendedPractice(opts: {
  hour: number
  facet: SpiritNeedKey | null
  level?: number | null
}): Recommendation {
  if (opts.level != null && opts.level <= BEGINNER_MAX_LEVEL) {
    return BY_TIME_BEGINNER[slotForHour(opts.hour)]
  }
  if (opts.facet) return BY_FACET[opts.facet]
  return BY_TIME[slotForHour(opts.hour)]
}
