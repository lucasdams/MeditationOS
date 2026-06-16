// Soft rotating suggestions for the pre-session intention field.
// Shown as placeholder text — a gentle nudge, never a requirement.

import { dailyOf } from './zen'

export const INTENTION_SUGGESTIONS: string[] = [
  'Arrive just as I am.',
  'Notice without judging.',
  'Return to the breath.',
  'Let thoughts pass like clouds.',
  'Be here, right now.',
  'Rest in this moment.',
  'Soften around whatever arises.',
  'Release what I cannot control.',
  'Meet myself with kindness.',
  'Open to what this moment holds.',
  'Breathe. Settle. Arrive.',
  'Nothing to fix, nowhere to be.',
]

/** Returns a suggestion that stays stable for the calendar day. */
export function dailySuggestion(date: Date): string {
  return dailyOf(INTENTION_SUGGESTIONS, date)
}
