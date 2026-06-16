// Warm, reflective journaling prompts — an optional nudge to ease blank-page friction.
// Grouped by theme; helpers mirror zen.ts so the daily prompt is stable within a day.

import { dailyOf, randomOf } from './zen'

export type PromptTheme = 'gratitude' | 'practice' | 'emotional' | 'intention'

export interface JournalPrompt {
  text: string
  theme: PromptTheme
}

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  // Gratitude
  { text: "What's one small thing you're grateful for right now?", theme: 'gratitude' },
  { text: 'Who made your day a little easier — and how?', theme: 'gratitude' },
  { text: 'What moment today felt unexpectedly good?', theme: 'gratitude' },
  { text: 'What simple pleasure did you notice today?', theme: 'gratitude' },
  { text: 'What about your body are you quietly thankful for today?', theme: 'gratitude' },

  // Reflection on practice
  { text: 'How did your practice feel today — in body, in mind?', theme: 'practice' },
  { text: 'Was there a moment of stillness today, however brief?', theme: 'practice' },
  { text: 'What did you notice during or after your sit?', theme: 'practice' },
  { text: 'Did anything come up during practice that surprised you?', theme: 'practice' },
  { text: "What would you carry from today's practice into the rest of your day?", theme: 'practice' },

  // Emotional check-in
  { text: 'What emotion has been most present for you today?', theme: 'emotional' },
  { text: "If your current mood were weather, what would it be?", theme: 'emotional' },
  { text: "What's weighing on you, and what might help lighten it?", theme: 'emotional' },
  { text: "Is there something you're avoiding feeling? What's underneath it?", theme: 'emotional' },
  { text: "What would you say to a friend feeling what you're feeling right now?", theme: 'emotional' },

  // Intention
  { text: "What's one intention you want to carry into tomorrow?", theme: 'intention' },
  { text: 'What does "enough" look like for you today?', theme: 'intention' },
  { text: 'What would you like to let go of before you sleep tonight?', theme: 'intention' },
  { text: "What's one small act of kindness you could offer — to yourself or another?", theme: 'intention' },
  { text: 'If today had a lesson, what would it be?', theme: 'intention' },
]

export function dailyPrompt(date: Date): JournalPrompt {
  return dailyOf(JOURNAL_PROMPTS, date)
}

export function randomPrompt(exclude?: JournalPrompt): JournalPrompt {
  if (JOURNAL_PROMPTS.length <= 1) return JOURNAL_PROMPTS[0]
  if (!exclude) return randomOf(JOURNAL_PROMPTS)
  const pool = JOURNAL_PROMPTS.filter((p) => p.text !== exclude.text)
  return randomOf(pool)
}
