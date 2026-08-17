// Soft rotating suggestions for the pre-session intention field.
// Shown as placeholder text — a gentle nudge, never a requirement.

import { dailyOf } from './zen'
import { getLocale } from '../i18n'

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

// Japanese, in the SAME order so a given day maps to the same suggestion in either language.
export const INTENTION_SUGGESTIONS_JA: string[] = [
  'ありのままの自分で、ここに。',
  '判断せずに、気づく。',
  '息へ戻る。',
  '思いは雲のように流す。',
  '今、ここにいる。',
  'この瞬間に休む。',
  '起きてくるものを、やわらかく包む。',
  '思いどおりにならないことは手放す。',
  '自分にやさしく向き合う。',
  'この瞬間が差し出すものに、心を開く。',
  '息をして、落ち着いて、ここへ。',
  '直すことも、行く先もない。',
]

/** Returns a suggestion that stays stable for the calendar day, in the current UI locale. */
export function dailySuggestion(date: Date): string {
  const pool = getLocale() === 'ja' ? INTENTION_SUGGESTIONS_JA : INTENTION_SUGGESTIONS
  return dailyOf(pool, date)
}
