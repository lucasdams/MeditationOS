import type { PathDay } from '../types'

// Where a path day's "Start" launches, by its prescribed practice (beginner-first revision §8).
// Shared by PathsPage and the home CTA so the mapping can't drift between them.
//   breathe  → the Phase-1b guided first-sit flow, pre-set to the day's length
//   meditate → the meditation page
//   gratitude→ the gratitude page
// Breathing carries the day's `min_minutes` as a guided duration (seconds); meditate/gratitude
// are open-ended, so no duration is appended.
export function pathDayHref(day: Pick<PathDay, 'practice' | 'min_minutes'>): string {
  switch (day.practice) {
    case 'breathe':
      return `/breathe?guided=1&duration=${day.min_minutes * 60}`
    case 'meditate':
      return '/meditate'
    case 'gratitude':
      return '/gratitude'
  }
}
