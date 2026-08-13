// Daily reading — one short, calming passage that stays stable for the calendar day (like the
// intention/journal prompts). A gentle moment of reflection on the home screen.
//
// COPYRIGHT: passages are either (a) short lines from PUBLIC-DOMAIN works (the Stoics, Lao Tzu,
// the Dhammapada, Thoreau — ancient/old-translation texts, quoted verbatim with attribution), or
// (b) ORIGINAL one-line summaries of ideas from modern, in-copyright books, written in our own
// words and marked `inspired` (attributed "Inspired by …", never the book's verbatim text). We do
// NOT reproduce copyrighted prose.
import { dailyOf } from './zen'

export interface Reading {
  /** The passage. Public-domain verbatim, or an original paraphrase when `inspired`. */
  text: string
  /** The person the thought is attributed to (or the thinker behind an `inspired` idea). */
  author: string
  /** The work, when known (shown as "Author, Work"). */
  work?: string
  /** True → an original paraphrase of a modern in-copyright idea; attribution reads "Inspired by {work}". */
  inspired?: boolean
}

// Public-domain wisdom (quoted) + a few original paraphrases of modern ideas (marked `inspired`).
export const READINGS: Reading[] = [
  // ── Stoics (public domain) ──
  { text: 'You have power over your mind — not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'Confine yourself to the present.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'Waste no more time arguing about what a good person should be. Be one.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'Men are disturbed not by things, but by the views they take of them.', author: 'Epictetus', work: 'Enchiridion' },
  { text: 'Make the best use of what is in your power, and take the rest as it happens.', author: 'Epictetus', work: 'Enchiridion' },
  { text: 'No one is free who is not master of themselves.', author: 'Epictetus' },
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'It is not that we have a short time to live, but that we waste much of it.', author: 'Seneca', work: 'On the Shortness of Life' },
  // ── Taoism & Buddhism (public domain) ──
  { text: 'Nature does not hurry, yet everything is accomplished.', author: 'Lao Tzu', work: 'Tao Te Ching' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu', work: 'Tao Te Ching' },
  { text: 'When I let go of what I am, I become what I might be.', author: 'Lao Tzu', work: 'Tao Te Ching' },
  { text: 'Peace comes from within. Do not seek it without.', author: 'Buddha' },
  { text: 'What we think, we become.', author: 'Buddha', work: 'Dhammapada' },
  // ── Others (public domain) ──
  { text: 'It is not enough to be busy; the question is what we are busy about.', author: 'Henry David Thoreau' },
  { text: 'Tension is who you think you should be. Relaxation is who you are.', author: 'Chinese proverb' },
  // ── More Stoics (public domain) ──
  { text: 'Dwell on the beauty of life. Watch the stars, and see yourself running with them.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'The soul becomes dyed with the colour of its thoughts.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'The best revenge is not to be like your enemy.', author: 'Marcus Aurelius', work: 'Meditations' },
  { text: "Loss is nothing else but change, and change is Nature's delight.", author: 'Marcus Aurelius', work: 'Meditations' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', author: 'Epictetus', work: 'Discourses' },
  { text: 'Wealth consists not in having great possessions, but in having few wants.', author: 'Epictetus' },
  { text: 'He is wise who does not grieve for what he lacks, but rejoices for what he has.', author: 'Epictetus' },
  { text: 'Difficulties strengthen the mind, as labour does the body.', author: 'Seneca' },
  { text: 'He who is brave is free.', author: 'Seneca' },
  { text: "Every new beginning comes from some other beginning's end.", author: 'Seneca' },
  // ── More Taoism (public domain) ──
  { text: 'Knowing others is wisdom; knowing yourself is enlightenment.', author: 'Lao Tzu', work: 'Tao Te Ching' },
  { text: 'Mastering others is strength; mastering yourself is true power.', author: 'Lao Tzu', work: 'Tao Te Ching' },
  { text: 'Silence is a source of great strength.', author: 'Lao Tzu' },
  { text: 'Care about what other people think and you will always be their prisoner.', author: 'Lao Tzu' },
  // ── More Buddhism & Zen (public domain) ──
  { text: 'Do not dwell in the past, do not dream of the future; concentrate the mind on the present moment.', author: 'Buddha' },
  { text: 'Better than a thousand hollow words is one word that brings peace.', author: 'Buddha', work: 'Dhammapada' },
  { text: 'Holding on to anger is like grasping a hot coal to throw at another — you are the one who gets burned.', author: 'Buddha' },
  { text: 'You, as much as anybody in the entire universe, deserve your love and affection.', author: 'Buddha' },
  { text: 'The obstacle is the path.', author: 'Zen proverb' },
  { text: 'When walking, walk. When eating, eat.', author: 'Zen proverb' },
  { text: 'Let go, or be dragged.', author: 'Zen proverb' },
  { text: 'Fall down seven times, get up eight.', author: 'Japanese proverb' },
  // ── Other public-domain voices ──
  { text: 'The wound is the place where the Light enters you.', author: 'Rumi' },
  { text: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', author: 'Rumi' },
  { text: "All of humanity's problems stem from our inability to sit quietly in a room alone.", author: 'Blaise Pascal', work: 'Pensées' },
  { text: 'Nothing can bring you peace but yourself.', author: 'Ralph Waldo Emerson' },
  { text: 'The greatest weapon against stress is our ability to choose one thought over another.', author: 'William James' },
  { text: 'It does not matter how slowly you go, so long as you do not stop.', author: 'Confucius' },
  { text: 'Your daily life is your temple and your religion.', author: 'Kahlil Gibran', work: 'The Prophet' },
  // ── Modern ideas — original paraphrases, no verbatim text (marked inspired) ──
  { text: 'Small habits compound: getting 1% better each day adds up far faster than it feels.', author: 'James Clear', work: 'Atomic Habits', inspired: true },
  { text: 'Aim less at the goal and more at the small, repeatable system that carries you toward it.', author: 'James Clear', work: 'Atomic Habits', inspired: true },
  { text: 'Each small choice is a quiet vote for the kind of person you are becoming.', author: 'James Clear', work: 'Atomic Habits', inspired: true },
  { text: 'Protect one block of undistracted attention — depth is where the real work happens.', author: 'Cal Newport', work: 'Deep Work', inspired: true },
  { text: 'You cannot calm the waves, but you can steady yourself among them.', author: 'Jon Kabat-Zinn', work: 'Wherever You Go, There You Are', inspired: true },
  { text: 'How you breathe shapes how you feel — slow the exhale and the mind follows.', author: 'James Nestor', work: 'Breath', inspired: true },
  { text: 'This moment is the only place life actually happens.', author: 'Eckhart Tolle', work: 'The Power of Now', inspired: true },
  { text: 'You are not the anxious voice in your head; you are the one who notices it.', author: 'Michael Singer', work: 'The Untethered Soul', inspired: true },
  { text: 'Rest is not the reward for the work — it is part of the work.', author: 'Matthew Walker', work: 'Why We Sleep', inspired: true },
  { text: 'Meditation is not emptying the mind; it is noticing it wandered and gently beginning again.', author: 'Dan Harris', work: '10% Happier', inspired: true },
  { text: 'Between what happens and how you respond lies a space — and your freedom lives there.', author: 'Viktor Frankl', work: "Man's Search for Meaning", inspired: true },
  { text: "You need less motivation and a smaller first step you can't talk yourself out of.", author: 'James Clear', work: 'Atomic Habits', inspired: true },
]

/** Returns the reading for the calendar day — stable across the day, rotating each day. */
export function dailyReading(date: Date): Reading {
  return dailyOf(READINGS, date)
}

/** The attribution line for a reading ("Author, Work", or "Inspired by Work" for paraphrases). */
export function readingAttribution(reading: Reading): string {
  if (reading.inspired) return `Inspired by ${reading.work ?? reading.author}`
  return reading.work ? `${reading.author}, ${reading.work}` : reading.author
}
