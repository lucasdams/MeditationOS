// Warm, reflective journaling prompts — an optional nudge to ease blank-page friction.
// Grouped by theme; helpers mirror zen.ts so the daily prompt is stable within a day.

import { dailyOf, randomOf } from './zen'
import { getLocale } from '../i18n'

export type PromptTheme = 'gratitude' | 'practice' | 'emotional' | 'intention'

export interface JournalPrompt {
  // English is the source of truth + stable identity (randomPrompt excludes by `text`).
  text: string
  // Japanese rendering, shown via promptText() when the UI locale is ja.
  textJa: string
  theme: PromptTheme
}

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  // Gratitude
  { text: "What's one small thing you're grateful for right now?", textJa: 'いま、感謝できるちいさなことは何ですか？', theme: 'gratitude' },
  { text: 'Who made your day a little easier — and how?', textJa: 'あなたの一日を少し楽にしてくれたのは誰？どんなふうに？', theme: 'gratitude' },
  { text: 'What moment today felt unexpectedly good?', textJa: '今日、思いがけずよかった瞬間は？', theme: 'gratitude' },
  { text: 'What simple pleasure did you notice today?', textJa: '今日気づいた、ささやかな喜びは？', theme: 'gratitude' },
  { text: 'What about your body are you quietly thankful for today?', textJa: '今日、自分のからだのどこに、そっと感謝していますか？', theme: 'gratitude' },

  // Reflection on practice
  { text: 'How did your practice feel today — in body, in mind?', textJa: '今日のプラクティスは——からだで、心で、どんな感じでしたか？', theme: 'practice' },
  { text: 'Was there a moment of stillness today, however brief?', textJa: 'たとえ一瞬でも、静けさの瞬間はありましたか？', theme: 'practice' },
  { text: 'What did you notice during or after your sit?', textJa: '瞑想の最中や、そのあとに気づいたことは？', theme: 'practice' },
  { text: 'Did anything come up during practice that surprised you?', textJa: 'プラクティス中に、驚いたことはありましたか？', theme: 'practice' },
  { text: "What would you carry from today's practice into the rest of your day?", textJa: '今日のプラクティスから、一日に持っていきたいものは？', theme: 'practice' },

  // Emotional check-in
  { text: 'What emotion has been most present for you today?', textJa: '今日、いちばん強く感じていた感情は？', theme: 'emotional' },
  { text: 'If your current mood were weather, what would it be?', textJa: '今の気分を天気にたとえると？', theme: 'emotional' },
  { text: "What's weighing on you, and what might help lighten it?", textJa: '心に重くのしかかっているものは？何があれば少し軽くなりそう？', theme: 'emotional' },
  { text: "Is there something you're avoiding feeling? What's underneath it?", textJa: '感じるのを避けているものはありますか？その奥には何が？', theme: 'emotional' },
  { text: "What would you say to a friend feeling what you're feeling right now?", textJa: '同じ気持ちでいる友だちに、あなたなら何と声をかけますか？', theme: 'emotional' },

  // Intention
  { text: "What's one intention you want to carry into tomorrow?", textJa: '明日へ持っていきたい、ひとつの意図は？', theme: 'intention' },
  { text: 'What does "enough" look like for you today?', textJa: 'あなたにとって「これで十分」とは、今日どんな姿ですか？', theme: 'intention' },
  { text: 'What would you like to let go of before you sleep tonight?', textJa: '眠る前に手放したいものは？', theme: 'intention' },
  { text: "What's one small act of kindness you could offer — to yourself or another?", textJa: '自分か誰かに贈れる、ちいさな親切をひとつ挙げるなら？', theme: 'intention' },
  { text: 'If today had a lesson, what would it be?', textJa: '今日に教訓があるとしたら、それは何？', theme: 'intention' },
]

// The prompt's text in the current UI locale (Japanese where the locale is ja).
export function promptText(prompt: JournalPrompt): string {
  return getLocale() === 'ja' ? prompt.textJa : prompt.text
}

export function dailyPrompt(date: Date): JournalPrompt {
  return dailyOf(JOURNAL_PROMPTS, date)
}

export function randomPrompt(exclude?: JournalPrompt): JournalPrompt {
  if (JOURNAL_PROMPTS.length <= 1) return JOURNAL_PROMPTS[0]
  if (!exclude) return randomOf(JOURNAL_PROMPTS)
  const pool = JOURNAL_PROMPTS.filter((p) => p.text !== exclude.text)
  return randomOf(pool)
}
