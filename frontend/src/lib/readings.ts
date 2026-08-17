// Daily reading — one short, calming passage that stays stable for the calendar day (like the
// intention/journal prompts). A gentle moment of reflection on the home screen.
//
// COPYRIGHT: passages are either (a) short lines from PUBLIC-DOMAIN works (the Stoics, Lao Tzu,
// the Dhammapada, Thoreau — ancient/old-translation texts, quoted verbatim with attribution), or
// (b) ORIGINAL one-line summaries of ideas from modern, in-copyright books, written in our own
// words and marked `inspired` (attributed "Inspired by …", never the book's verbatim text). We do
// NOT reproduce copyrighted prose.
import { getLocale } from '../i18n'
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

// ── Japanese ───────────────────────────────────────────────────────────────
// Content localization (see i18n-shipped memory): the passages are keyed by their English
// text so READINGS stays the single source of truth and untranslated entries fall back to
// English rather than going blank. A drift-guard test asserts every reading has a JA text.

// The passages, keyed by the exact English `text`.
const READING_TEXT_JA: Record<string, string> = {
  'You have power over your mind — not outside events. Realize this, and you will find strength.':
    '力が及ぶのは自分の心であり、外の出来事ではない。そう気づいたとき、強さが見つかる。',
  'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.':
    '幸せな人生に必要なものはごくわずか。そのすべては自分の中、考え方の中にある。',
  'Confine yourself to the present.': '今このときにとどまりなさい。',
  'Waste no more time arguing about what a good person should be. Be one.':
    '善い人とは何かを論じて時を無駄にするな。善い人であれ。',
  'Men are disturbed not by things, but by the views they take of them.':
    '人を乱すのは物事そのものではなく、それをどう見るかである。',
  'Make the best use of what is in your power, and take the rest as it happens.':
    '自分の力の及ぶことを最大限に活かし、あとは起こるがままに受け入れよ。',
  'No one is free who is not master of themselves.': '自分を治められない者に自由はない。',
  'We suffer more often in imagination than in reality.':
    '私たちは現実よりも、想像の中でより多く苦しむ。',
  'It is not that we have a short time to live, but that we waste much of it.':
    '人生が短いのではない。その多くを浪費しているのだ。',
  'Nature does not hurry, yet everything is accomplished.':
    '自然は急がない。それでいて、すべては成し遂げられる。',
  'A journey of a thousand miles begins with a single step.': '千里の道も一歩から始まる。',
  'When I let go of what I am, I become what I might be.':
    '今の自分を手放したとき、なり得る自分になる。',
  'Peace comes from within. Do not seek it without.':
    '平安は内から生まれる。外に求めてはならない。',
  'What we think, we become.': '思うことが、そのまま自分になる。',
  'It is not enough to be busy; the question is what we are busy about.':
    '忙しいだけでは足りない。問題は、何に忙しいかだ。',
  'Tension is who you think you should be. Relaxation is who you are.':
    '緊張とは「こうあるべき」と思う自分。くつろぎとは、ありのままの自分。',
  'Dwell on the beauty of life. Watch the stars, and see yourself running with them.':
    '人生の美しさに心をとめよ。星を眺め、その中を共に駆ける自分を見よ。',
  'The soul becomes dyed with the colour of its thoughts.':
    '魂は、その思いの色に染まっていく。',
  'The best revenge is not to be like your enemy.':
    '最良の復讐は、敵のようにならないことだ。',
  "Loss is nothing else but change, and change is Nature's delight.":
    '失うこととは変化にほかならず、変化こそ自然の喜びである。',
  'First say to yourself what you would be; and then do what you have to do.':
    'まず、どうありたいかを自分に告げよ。それから、なすべきことをなせ。',
  'Wealth consists not in having great possessions, but in having few wants.':
    '豊かさとは多くを持つことではなく、望みが少ないことにある。',
  'He is wise who does not grieve for what he lacks, but rejoices for what he has.':
    '賢い人は、ないものを嘆かず、あるものを喜ぶ。',
  'Difficulties strengthen the mind, as labour does the body.':
    '労苦が体を鍛えるように、困難は心を強くする。',
  'He who is brave is free.': '勇気ある者は自由である。',
  "Every new beginning comes from some other beginning's end.":
    'あらゆる新しい始まりは、別の何かの終わりから生まれる。',
  'Knowing others is wisdom; knowing yourself is enlightenment.':
    '人を知る者は智、自らを知る者は明。',
  'Mastering others is strength; mastering yourself is true power.':
    '人に勝つ者は力あり、自らに勝つ者こそ真に強い。',
  'Silence is a source of great strength.': '静けさは、大きな強さの源である。',
  'Care about what other people think and you will always be their prisoner.':
    '人の思惑を気にすれば、いつまでもその囚人でいることになる。',
  'Do not dwell in the past, do not dream of the future; concentrate the mind on the present moment.':
    '過去にとどまらず、未来を夢見ず、心を今このときに注ぎなさい。',
  'Better than a thousand hollow words is one word that brings peace.':
    '千の空虚な言葉よりも、平安をもたらす一つの言葉のほうがよい。',
  'Holding on to anger is like grasping a hot coal to throw at another — you are the one who gets burned.':
    '怒りを抱え続けるのは、人に投げつけようと燃える炭を握るようなもの。やけどをするのは自分だ。',
  'You, as much as anybody in the entire universe, deserve your love and affection.':
    '全宇宙の誰にも劣らず、あなた自身もまた、自らの愛と慈しみに値する。',
  'The obstacle is the path.': '障害こそが道である。',
  'When walking, walk. When eating, eat.': '歩くときは歩き、食べるときは食べる。',
  'Let go, or be dragged.': '手放すか、引きずられるか。',
  'Fall down seven times, get up eight.': '七転び八起き。',
  'The wound is the place where the Light enters you.':
    '傷こそ、光が差し込む場所である。',
  'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.':
    '昨日の私は賢く、世界を変えたいと願った。今日の私は聡く、自分を変えている。',
  "All of humanity's problems stem from our inability to sit quietly in a room alone.":
    '人類のあらゆる問題は、一人静かに部屋に座っていられないことから生じる。',
  'Nothing can bring you peace but yourself.':
    'あなたに平安をもたらせるのは、あなた自身のほかにない。',
  'The greatest weapon against stress is our ability to choose one thought over another.':
    'ストレスに対する最大の武器は、ある思いを別の思いより選び取る力である。',
  'It does not matter how slowly you go, so long as you do not stop.':
    'どれほどゆっくりでも構わない。止まりさえしなければ。',
  'Your daily life is your temple and your religion.':
    '日々の暮らしそのものが、あなたの寺院であり、信仰である。',
  'Small habits compound: getting 1% better each day adds up far faster than it feels.':
    '小さな習慣は積み重なる。毎日1%の改善は、思うよりずっと速く大きな差になる。',
  'Aim less at the goal and more at the small, repeatable system that carries you toward it.':
    '目標そのものより、そこへ運んでくれる小さく繰り返せる仕組みに目を向けよう。',
  'Each small choice is a quiet vote for the kind of person you are becoming.':
    '小さな選択の一つひとつが、なりつつある自分への静かな一票になる。',
  'Protect one block of undistracted attention — depth is where the real work happens.':
    '妨げのない集中の時間をひとつ守ろう。本当の仕事は、その深さの中で生まれる。',
  'You cannot calm the waves, but you can steady yourself among them.':
    '波を静めることはできないが、その中で自分を落ち着かせることはできる。',
  'How you breathe shapes how you feel — slow the exhale and the mind follows.':
    '呼吸のしかたが感じ方を形づくる。息を長く吐けば、心もそれに従う。',
  'This moment is the only place life actually happens.':
    'この瞬間だけが、人生が実際に起こる唯一の場所である。',
  'You are not the anxious voice in your head; you are the one who notices it.':
    'あなたは頭の中の不安な声ではない。それに気づいている者である。',
  'Rest is not the reward for the work — it is part of the work.':
    '休息は仕事へのご褒美ではない。仕事の一部である。',
  'Meditation is not emptying the mind; it is noticing it wandered and gently beginning again.':
    '瞑想とは心を空にすることではない。さまよったことに気づき、そっともう一度始めることだ。',
  'Between what happens and how you respond lies a space — and your freedom lives there.':
    '出来事と、それにどう応えるかの間には、ひとつの隙間がある。あなたの自由は、そこに宿る。',
  "You need less motivation and a smaller first step you can't talk yourself out of.":
    '必要なのは、より多くのやる気ではなく、言い訳のしようがないほど小さな第一歩だ。',
}

// Author names in Japanese (classical figures get their established name; modern authors,
// katakana). Any unmapped author falls back to the English name.
const AUTHOR_JA: Record<string, string> = {
  'Marcus Aurelius': 'マルクス・アウレリウス',
  Epictetus: 'エピクテトス',
  Seneca: 'セネカ',
  'Lao Tzu': '老子',
  Buddha: 'ブッダ',
  'Henry David Thoreau': 'ヘンリー・デイヴィッド・ソロー',
  'Chinese proverb': '中国のことわざ',
  'Zen proverb': '禅のことわざ',
  'Japanese proverb': '日本のことわざ',
  Rumi: 'ルーミー',
  'Blaise Pascal': 'ブレーズ・パスカル',
  'Ralph Waldo Emerson': 'ラルフ・ワルド・エマーソン',
  'William James': 'ウィリアム・ジェームズ',
  Confucius: '孔子',
  'Kahlil Gibran': 'カリール・ジブラン',
  'James Clear': 'ジェームズ・クリア',
  'Cal Newport': 'カル・ニューポート',
  'Jon Kabat-Zinn': 'ジョン・カバット・ジン',
  'James Nestor': 'ジェームズ・ネスター',
  'Eckhart Tolle': 'エックハルト・トール',
  'Michael Singer': 'マイケル・シンガー',
  'Matthew Walker': 'マシュー・ウォーカー',
  'Dan Harris': 'ダン・ハリス',
  'Viktor Frankl': 'ヴィクトール・フランクル',
}

// Japanese titles for the public-domain classics (established renderings). Modern in-copyright
// books are left in their original title (unmapped → English) to avoid mis-citing.
const WORK_JA: Record<string, string> = {
  Meditations: '自省録',
  Enchiridion: '提要',
  Discourses: '語録',
  'On the Shortness of Life': '人生の短さについて',
  'Tao Te Ching': '道徳経',
  Dhammapada: 'ダンマパダ',
  Pensées: 'パンセ',
  'The Prophet': '預言者',
}

/** Returns the reading for the calendar day — stable across the day, rotating each day. */
export function dailyReading(date: Date): Reading {
  return dailyOf(READINGS, date)
}

/** The passage in the active UI language (falls back to the English text). */
export function readingText(reading: Reading): string {
  if (getLocale() === 'ja') return READING_TEXT_JA[reading.text] ?? reading.text
  return reading.text
}

/** The attribution line for a reading ("Author, Work", or "Inspired by Work" for paraphrases). */
export function readingAttribution(reading: Reading): string {
  if (getLocale() === 'ja') {
    const author = AUTHOR_JA[reading.author] ?? reading.author
    const work = reading.work ? WORK_JA[reading.work] ?? reading.work : undefined
    if (reading.inspired) return `${work ?? author}に着想を得た一節`
    return work ? `${author}『${work}』` : author
  }
  if (reading.inspired) return `Inspired by ${reading.work ?? reading.author}`
  return reading.work ? `${reading.author}, ${reading.work}` : reading.author
}
