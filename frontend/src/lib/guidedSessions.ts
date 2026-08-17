// Guided-session cue scripts — pure data + scheduler.
//
// Each structure is an ordered list of phases. A phase has a short, calm cue
// text shown during that portion of the sit, and an optional bell flag that
// fires on transition INTO that phase. The scheduler distributes phases across
// the user's chosen duration so the script works for both a 5-min sit and a
// 30-min sit.
//
// IMPORTANT: no audio is produced here — the caller (GuidedCues) is responsible
// for ringing the bell when `bell: true` on a phase transition.

export type GuidedStructureId =
  | 'body-scan'
  | 'loving-kindness'
  | 'focus'
  | 'noting'
  | 'mantra'
  | 'yoga-nidra'
  | 'wind-down'
  | 'three-breaths'

export interface GuidedPhase {
  /** Short, calm cue text shown on screen. Keep to one or two lines. */
  cue: string
  /** If true, ring a soft bell when this phase starts. */
  bell: boolean
  /**
   * Relative weight for time allocation. Phases with higher weight receive
   * proportionally more of the total session duration. All weights in a
   * structure should sum to a round number for predictable mental math, but
   * the scheduler normalises them automatically.
   */
  weight: number
}

export interface GuidedStructure {
  id: GuidedStructureId
  label: string
  description: string
  phases: GuidedPhase[]
}

// ── Body Scan ────────────────────────────────────────────────────────────────
// Moves attention head-to-toe through major body regions. A closing phase of
// resting in whole-body awareness follows. The opening settle phase is short
// (weight 1) and the body regions each get equal time. The final rest phase
// gets a touch more space.

const BODY_SCAN: GuidedStructure = {
  id: 'body-scan',
  label: 'Body scan',
  description: 'Gently move awareness through the body from head to toe.',
  phases: [
    { cue: 'Settle in. Let your eyes close.', bell: false, weight: 1 },
    { cue: 'Breathe naturally. Notice the rhythm of your breath.', bell: false, weight: 1 },
    { cue: 'Bring attention to the top of your head. Scalp, forehead, jaw.', bell: true, weight: 2 },
    { cue: 'Move to your neck and shoulders. Let them soften.', bell: true, weight: 2 },
    { cue: 'Notice your chest and upper back. Feel each breath here.', bell: true, weight: 2 },
    { cue: 'Shift to your belly and lower back. Allow any tension to release.', bell: true, weight: 2 },
    { cue: 'Bring awareness to your hips and seat. Feel the support beneath you.', bell: true, weight: 2 },
    { cue: 'Notice your thighs and knees. No need to change anything.', bell: true, weight: 2 },
    { cue: 'Shift attention to your calves, ankles, and feet.', bell: true, weight: 2 },
    { cue: 'Rest in the whole body at once — held, breathing, complete.', bell: true, weight: 3 },
    { cue: "When you're ready, take one fuller breath and let your eyes open.", bell: false, weight: 1 },
  ],
}

// ── Loving-kindness / Metta ──────────────────────────────────────────────────
// Cycles gentle phrases toward self → loved one → neutral person → all beings.
// Each target gets equal weight; settle and close phases are shorter.

const LOVING_KINDNESS: GuidedStructure = {
  id: 'loving-kindness',
  label: 'Loving-kindness',
  description: 'Send warm wishes to yourself and outward to others.',
  phases: [
    { cue: 'Settle in. Let your heart be at ease.', bell: false, weight: 1 },
    { cue: 'Breathe gently. Let any tension soften.', bell: false, weight: 1 },
    // Self
    { cue: 'Bring yourself to mind. Offer these wishes inward:\nMay I be safe. May I be well. May I be happy. May I live with ease.', bell: true, weight: 6 },
    // Loved one
    { cue: 'Bring to mind someone you love. See their face clearly.', bell: true, weight: 3 },
    { cue: 'May you be safe. May you be well. May you be happy. May you live with ease.', bell: false, weight: 3 },
    // Neutral person
    { cue: 'Bring to mind someone you barely know — a neighbour, a stranger passed on the street.', bell: true, weight: 3 },
    { cue: 'May you be safe. May you be well. May you be happy. May you live with ease.', bell: false, weight: 3 },
    // All beings
    { cue: 'Expand your awareness outward — your city, the world, all living beings.', bell: true, weight: 3 },
    { cue: 'May all beings be safe. May all beings be well. May all beings be happy. May all beings live with ease.', bell: false, weight: 3 },
    // Close
    { cue: 'Rest here in open-hearted awareness. Nothing more to do.', bell: false, weight: 2 },
    { cue: 'Gently return to the breath. Carry this warmth with you.', bell: false, weight: 1 },
  ],
}

// ── Focused attention ─────────────────────────────────────────────────────────
// Single-pointed concentration: rest all attention on one anchor and return to it
// each time the mind wanders. The anchoring + return phases carry the most weight;
// settle and close phases are shorter.

const FOCUS: GuidedStructure = {
  id: 'focus',
  label: 'Focused attention',
  description: 'Single-pointed concentration — steady a scattered mind.',
  phases: [
    { cue: 'Settle in. Sit tall, eyes closed or softly lowered.', bell: false, weight: 1 },
    { cue: "Choose one anchor — the breath at the nostrils, or the belly's rise and fall.", bell: true, weight: 2 },
    { cue: 'Rest your full attention there. Just this one point.', bell: true, weight: 3 },
    { cue: 'When the mind wanders — and it will — notice, and gently return. No frustration.', bell: true, weight: 5 },
    { cue: "Each return is the rep. That's how concentration grows.", bell: false, weight: 3 },
    { cue: 'Stay with the anchor, breath after breath. Let everything else fade to the background.', bell: true, weight: 4 },
    { cue: "When you're ready, widen your attention out again, and open your eyes.", bell: false, weight: 1 },
  ],
}

// ── Mantra ────────────────────────────────────────────────────────────────────
// Rest the mind on a simple repeated word or sound, returning to it whenever thoughts
// drift. The repetition + return phases carry the most weight; settle and close phases
// are shorter.

const MANTRA: GuidedStructure = {
  id: 'mantra',
  label: 'Mantra',
  description: 'A word to rest the mind on — an anchor for a busy head.',
  phases: [
    { cue: 'Settle in. Let the body be still.', bell: false, weight: 1 },
    { cue: 'Choose a simple word or sound — "peace", "so-ham", or just "one".', bell: true, weight: 2 },
    { cue: 'Silently repeat it, at a pace that feels easy. Let it be almost effortless.', bell: true, weight: 3 },
    { cue: 'When the mind drifts, come back to the word. Softly, again and again.', bell: true, weight: 4 },
    { cue: 'Let the mantra fill the space thoughts used to.', bell: false, weight: 3 },
    { cue: 'If it fades, rest in the quiet, then pick it up again.', bell: false, weight: 3 },
    { cue: 'No need to tie the word to the breath — let it settle into whatever rhythm it wants.', bell: false, weight: 3 },
    { cue: "When you're ready, let the word dissolve and open your eyes.", bell: false, weight: 1 },
  ],
}

// ── Yoga Nidra ────────────────────────────────────────────────────────────────
// Non-sleep deep rest: lie back and rotate awareness through the body, then rest in
// whole-body stillness. Each body-region phase gets equal weight; the whole-body
// rest gets a touch more, and settle + close phases are shorter.

const YOGA_NIDRA: GuidedStructure = {
  id: 'yoga-nidra',
  label: 'Yoga Nidra',
  description: 'Non-sleep deep rest — lie back and let the body unwind.',
  phases: [
    { cue: 'Lie on your back, arms at your sides, palms up. Let the floor hold you.', bell: true, weight: 1 },
    { cue: 'Take a few slow breaths. Nothing to do now but rest.', bell: false, weight: 1 },
    { cue: 'Bring awareness to your right hand — thumb, fingers, palm, wrist.', bell: false, weight: 2 },
    { cue: 'Up the right arm — forearm, elbow, shoulder. Now the whole left arm and hand, the same way.', bell: false, weight: 3 },
    { cue: 'Your face — forehead, eyes, jaw. Your throat and chest.', bell: false, weight: 2 },
    { cue: 'Your belly, your back, your hips. Sinking, softening.', bell: false, weight: 2 },
    { cue: 'Both legs — thighs, knees, calves, feet. Completely at rest.', bell: false, weight: 2 },
    { cue: 'Feel the whole body at once, heavy and still. Awake, but deeply at ease.', bell: true, weight: 3 },
    { cue: 'Rest here. No effort, no reaching — just being breathed.', bell: false, weight: 3 },
    { cue: "When you're ready, wiggle your fingers and toes, and slowly return.", bell: false, weight: 1 },
  ],
}

// ── Noting ────────────────────────────────────────────────────────────────────
// Give whatever arises a soft one-word label — "thinking", "hearing", "feeling" —
// and let it pass, returning to the breath. The labelling phases carry the most
// weight; settle and close phases are shorter.

const NOTING: GuidedStructure = {
  id: 'noting',
  label: 'Noting',
  description: 'Give whatever arises a soft one-word label, and let it pass.',
  phases: [
    { cue: 'Settle in. Let the body arrive and the breath find its own pace.', bell: false, weight: 1 },
    { cue: 'Rest attention lightly on the breath as a home base.', bell: false, weight: 1 },
    { cue: 'Now, whatever pulls your attention away, greet it with one soft word.', bell: true, weight: 2 },
    { cue: 'A thought appears? Note "thinking", quietly, and let it pass.', bell: true, weight: 3 },
    { cue: 'A sound? "Hearing." A sensation? "Feeling." One gentle label, no story.', bell: true, weight: 3 },
    { cue: 'Keep the labels light — a whisper, not a verdict. Then return to the breath.', bell: false, weight: 3 },
    { cue: 'Notice the tiny gap the label makes — a half-step back from the thought.', bell: true, weight: 3 },
    { cue: 'If several things arise at once, just note the loudest — "planning", "restless" — and let the rest go by.', bell: false, weight: 4 },
    { cue: 'Let the labels soften and fade. Rest in plain, open noticing.', bell: true, weight: 2 },
    { cue: "When you're ready, open your eyes. Carry that light noticing with you.", bell: false, weight: 1 },
  ],
}

// ── Wind down ─────────────────────────────────────────────────────────────────
// A sleep practice: let the body grow heavy, region by region, and give yourself
// permission to drift. Softer voice, bells taper off, no bright end. The
// softening phases carry the most weight; settle phases are shorter.

const WIND_DOWN: GuidedStructure = {
  id: 'wind-down',
  label: 'Wind down',
  description: 'Let the body grow heavy, and let yourself drift.',
  phases: [
    { cue: 'Lie down and get comfortable. Let the bed take your full weight.', bell: true, weight: 1 },
    { cue: 'Nothing to finish tonight. You can let go of the day now.', bell: false, weight: 1 },
    { cue: 'Feel your body settling — a little heavier with each breath out.', bell: true, weight: 2 },
    { cue: 'Let your legs grow heavy. Sinking down, warm and loose.', bell: false, weight: 2 },
    { cue: 'Let your arms grow heavy. Your hands, completely soft.', bell: false, weight: 2 },
    { cue: 'Let your shoulders melt down and back, away from your ears.', bell: false, weight: 2 },
    { cue: 'Let your face soften — jaw, eyes, the space between your brows.', bell: false, weight: 2 },
    { cue: 'The whole body, heavy and still. Held. Nowhere to be.', bell: false, weight: 3 },
    { cue: "Each out-breath, a little deeper. You don't have to stay awake.", bell: false, weight: 3 },
    { cue: "If you drift off, that's welcome. Just rest here.", bell: false, weight: 3 },
    { cue: 'Just the breath now, slower and slower. Let it carry you under.', bell: false, weight: 2 },
  ],
}

// ── Three mindful breaths ─────────────────────────────────────────────────────
// The smallest practice: a one-minute reset of just three breaths, anywhere, with
// no setup. The three breaths carry the most weight; the bookend phases are short.

const THREE_BREATHS: GuidedStructure = {
  id: 'three-breaths',
  label: 'Three mindful breaths',
  description: 'Three breaths, fully felt — the smallest practice.',
  phases: [
    { cue: 'Wherever you are, let this be enough. Nothing to change.', bell: true, weight: 1 },
    { cue: 'First breath — just feel it come in, and go out. That\'s all.', bell: false, weight: 2 },
    { cue: 'Second breath — a little slower. Let your shoulders drop.', bell: false, weight: 2 },
    { cue: 'Third breath — the fullest one. Breathe in, and let it all go.', bell: false, weight: 2 },
    { cue: 'That was a practice. Carry the pause with you.', bell: true, weight: 1 },
  ],
}

export const GUIDED_STRUCTURES: GuidedStructure[] = [
  BODY_SCAN,
  LOVING_KINDNESS,
  FOCUS,
  NOTING,
  MANTRA,
  YOGA_NIDRA,
  WIND_DOWN,
  THREE_BREATHS,
]

// ── Japanese localization ──────────────────────────────────────────────────────
// The English structures above are the source of truth (data + scheduling weights). This
// parallel table holds the Japanese label/description and the cue lines in the SAME order
// as each structure's `phases`, so `localizedCue(id, i)` maps 1:1. Keeping it separate
// leaves the English data (and the weights/bells) untouched. Fallback: any missing entry
// uses the English text.
interface GuidedTranslation {
  label: string
  description: string
  cues: string[] // same length + order as the structure's phases
}

const GUIDED_JA: Record<GuidedStructureId, GuidedTranslation> = {
  'body-scan': {
    label: 'ボディスキャン',
    description: '頭からつま先まで、体をやさしく見わたしていきます。',
    cues: [
      '楽な姿勢で。そっと目を閉じましょう。',
      '自然に呼吸します。息のリズムに気づきましょう。',
      '頭のてっぺんに注意を向けます。頭皮、額、あご。',
      '首と肩へ。ゆるめていきましょう。',
      '胸と背中の上のほうへ。ここで一呼吸ごとに感じます。',
      'お腹と腰へ。こわばりがあれば、ほどいていきます。',
      '骨盤と、座っている土台へ。下から支えられている感じを。',
      '太ももと膝へ。何も変えなくて大丈夫です。',
      'ふくらはぎ、足首、足へと注意を移します。',
      '体全体を一度に感じて休みます——支えられ、呼吸し、満ちて。',
      '準備ができたら、深く一息ついて、目を開けましょう。',
    ],
  },
  'loving-kindness': {
    label: '慈悲の瞑想',
    description: '自分に、そして周りの人へ、あたたかな願いを送ります。',
    cues: [
      '楽な姿勢で。心をやすらがせましょう。',
      'やさしく呼吸します。こわばりをほどいていきます。',
      '自分自身を思い浮かべ、内側へ願いを送ります。\n私が安らかでありますように。健やかでありますように。幸せでありますように。楽に生きられますように。',
      '大切な人を思い浮かべます。その顔をはっきりと。',
      'あなたが安らかでありますように。健やかで、幸せで、楽に生きられますように。',
      'あまり知らない人を思い浮かべます——ご近所の人、道ですれ違った人を。',
      'あなたが安らかでありますように。健やかで、幸せで、楽に生きられますように。',
      '気づきを外へ広げます——あなたの街、世界、すべての生きものへ。',
      'すべての生きものが安らかで、健やかで、幸せで、楽に生きられますように。',
      'ここで、開かれた心のまま休みます。もう何もすることはありません。',
      'そっと呼吸へ戻ります。このあたたかさを持って。',
    ],
  },
  focus: {
    label: '集中の瞑想',
    description: '一点に心を集める——散らばった心を落ち着けます。',
    cues: [
      '楽な姿勢で。背をのばし、目は閉じるか、そっと伏せて。',
      'ひとつの拠りどころを選びます——鼻先の息、またはお腹のふくらみとしぼみ。',
      'そこに注意をぜんぶ置きます。ただこの一点に。',
      '心がさまよったら——きっとさまよいます——気づいて、そっと戻ります。いらだたずに。',
      '戻るたびが一回の稽古。そうして集中は育ちます。',
      '一息ごとに拠りどころにとどまります。ほかはすべて背景へ。',
      '準備ができたら、注意を外へ広げ、目を開けましょう。',
    ],
  },
  noting: {
    label: 'ラベリング',
    description: '起きてくるものにやさしく一語をそえて、通りすぎるにまかせます。',
    cues: [
      '楽な姿勢で。体を落ち着け、息が自分のペースを見つけるままに。',
      '拠りどころとして、息に軽く注意を置きます。',
      'さて、注意を引くものが来たら、ひと言でそっと迎えます。',
      '考えが現れた? 心の中で「考えている」とそえ、通りすぎさせます。',
      '音なら「聞いている」。感覚なら「感じている」。やさしいひと言、物語はなしで。',
      'ラベルは軽く——判定ではなく、ささやきのように。そして息へ戻ります。',
      'ラベルが作る小さな隙間に気づきます——考えから半歩うしろへ。',
      'いくつも同時に来たら、いちばん大きいものだけ——「計画」「落ち着かない」——あとは流します。',
      'ラベルをやわらげ、消していきます。ただ開かれた気づきに休みます。',
      '準備ができたら目を開けます。その軽い気づきを持って。',
    ],
  },
  mantra: {
    label: 'マントラ',
    description: '心を置く一語——忙しい頭のための拠りどころ。',
    cues: [
      '楽な姿勢で。体を静かに。',
      'かんたんな言葉や音をひとつ選びます——「やすらぎ」「ソーハム」、ただ「ひとつ」でも。',
      '楽な速さで、心の中でくり返します。ほとんど努力せずに。',
      '心がそれたら、その言葉へ戻ります。やさしく、何度でも。',
      'その言葉に、思考のあった隙間を満たしてもらいます。',
      '消えていったら、静けさに休み、また拾い直します。',
      '言葉を息に合わせなくて大丈夫。なりたいリズムに任せましょう。',
      '準備ができたら、言葉を溶かし、目を開けましょう。',
    ],
  },
  'yoga-nidra': {
    label: 'ヨガニドラ',
    description: '眠らない深い休息——横になり、体をほどいていきます。',
    cues: [
      'あお向けに寝て、腕は体の横、手のひらは上へ。床に身をあずけます。',
      'ゆっくり数呼吸。今はただ休むだけ。',
      '右手に気づきを向けます——親指、指、手のひら、手首。',
      '右腕を上へ——前腕、ひじ、肩。同じように左腕と手も。',
      '顔——額、目、あご。のどと胸。',
      'お腹、背中、腰。沈み、やわらいで。',
      '両脚——太もも、膝、ふくらはぎ、足。すっかり休ませて。',
      '体全体を一度に感じます。重く、静かに。目覚めたまま、深く安らいで。',
      'ここで休みます。努力も、求めることもなく——ただ呼吸されるままに。',
      '準備ができたら、指とつま先を動かし、ゆっくり戻ってきましょう。',
    ],
  },
  'wind-down': {
    label: '眠りへ',
    description: '体を重く沈め、そのまままどろみにゆだねます。',
    cues: [
      '横になって、楽にします。ベッドに全体重をあずけて。',
      '今夜、やり終えることは何もありません。もう一日を手放して大丈夫。',
      '体が沈んでいくのを感じます——息を吐くごとに少し重く。',
      '脚を重くします。あたたかく、ゆるく、沈んで。',
      '腕を重くします。手は、すっかりやわらかく。',
      '肩を、耳から遠くへ、下へとろけさせます。',
      '顔をやわらげます——あご、目、眉のあいだ。',
      '体全体が、重く静かに。支えられ、どこへ行く必要もなく。',
      '吐く息ごとに、少し深く。起きていなくて大丈夫。',
      'まどろんでしまっても、それでいいのです。ただここで休んで。',
      '今はただ息だけ。ゆっくり、もっとゆっくり。それにまかせて、眠りへ。',
    ],
  },
  'three-breaths': {
    label: '3回のマインドフルな呼吸',
    description: '3回の呼吸を、ていねいに感じる——いちばん小さな習慣。',
    cues: [
      'どこにいても、今のままで十分。何も変えなくていい。',
      '一呼吸目——ただ入ってきて、出ていくのを感じて。それだけ。',
      '二呼吸目——少しゆっくり。肩の力を落として。',
      '三呼吸目——いちばん深く。吸って、ぜんぶ手放して。',
      'これでひと区切り。この落ち着きを持って行きましょう。',
    ],
  },
}

// The structure's label / description for the given locale (Japanese where available).
export function localizedLabel(structure: GuidedStructure, locale: string): string {
  return locale === 'ja' ? GUIDED_JA[structure.id]?.label ?? structure.label : structure.label
}
export function localizedDescription(structure: GuidedStructure, locale: string): string {
  return locale === 'ja'
    ? GUIDED_JA[structure.id]?.description ?? structure.description
    : structure.description
}
// The cue for a phase index in the given locale, falling back to `fallback` (the English cue).
export function localizedCue(
  id: GuidedStructureId,
  phaseIndex: number,
  fallback: string,
  locale: string,
): string {
  if (locale !== 'ja') return fallback
  return GUIDED_JA[id]?.cues[phaseIndex] ?? fallback
}

// ── Level gates ───────────────────────────────────────────────────────────────
// Some guided structures can unlock at a level, mirroring the spirit cosmetic
// unlocks ("Reach level N"). A single source of truth so MeditatePage and
// PracticesPage agree on what's locked. Structures absent from this map (currently
// all of them) are always available.

export const GUIDED_MIN_LEVEL: Partial<Record<GuidedStructureId, number>> = {}

/**
 * Whether a guided structure is unlocked for the given user level. Unlocked when
 * the structure has no minimum level, or the level is known and meets the minimum.
 * A null/unknown level treats a gated structure as locked (fail safe).
 */
export function isGuidedUnlocked(
  id: GuidedStructureId,
  level: number | null,
): boolean {
  const min = GUIDED_MIN_LEVEL[id]
  if (min == null) return true
  return level != null && level >= min
}

export function getStructure(id: GuidedStructureId): GuidedStructure {
  const s = tryGetStructure(id)
  if (!s) throw new Error(`Unknown guided structure: ${id}`)
  return s
}

/**
 * Like getStructure but returns null for an unknown id instead of throwing. For
 * callers that render during React's render phase (e.g. GuidedCues), where an
 * exception would blow up the tree — they can fall back to a plain timer instead.
 */
export function tryGetStructure(id: GuidedStructureId): GuidedStructure | null {
  return GUIDED_STRUCTURES.find((g) => g.id === id) ?? null
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export interface PhaseWindow {
  /** Index into the structure's phases array. */
  phaseIndex: number
  /** Absolute second within the session when this phase starts. */
  startSec: number
  /** Absolute second when this phase ends (= next phase's startSec, or durationSec). */
  endSec: number
}

/**
 * Distribute the given structure's phases across `durationSec` seconds using
 * each phase's `weight` for proportional time allocation. The first phase
 * always starts at t=0; the last phase ends at `durationSec`.
 *
 * For open-ended sits (durationSec === 0) we fall back to a 20-minute
 * reference duration so the cues still cycle meaningfully.
 */
export function buildSchedule(
  structure: GuidedStructure,
  durationSec: number,
): PhaseWindow[] {
  const effectiveDuration = durationSec > 0 ? durationSec : 20 * 60
  if (structure.phases.length === 0) return []
  // Every shipped structure has positive weights (enforced by a test), but guard the divide so a
  // future all-zero-weight structure degrades gracefully (finite windows, last phase spans the
  // duration) instead of emitting NaN start/end seconds.
  const summedWeight = structure.phases.reduce((sum, p) => sum + p.weight, 0)
  const totalWeight = summedWeight > 0 ? summedWeight : structure.phases.length
  const windows: PhaseWindow[] = []
  let cursor = 0

  structure.phases.forEach((phase, i) => {
    const phaseSec = (phase.weight / totalWeight) * effectiveDuration
    const startSec = cursor
    const endSec = i === structure.phases.length - 1 ? effectiveDuration : cursor + phaseSec
    windows.push({ phaseIndex: i, startSec, endSec })
    cursor = endSec
  })

  return windows
}

/**
 * Return the index of the current phase given elapsed time and a pre-built
 * schedule. Returns 0 if elapsed is before the first phase (shouldn't happen
 * in practice but safe).
 *
 * For a timed sit the caller stops the clock at the target, so elapsed never
 * runs meaningfully past the last window and this returns the closing phase.
 *
 * For an open-ended sit (`loop: true`) the schedule is built against a 20-minute
 * reference; once elapsed runs past that reference we wrap elapsed back over the
 * schedule so the cues keep cycling instead of parking permanently on the
 * closing phase.
 */
export function currentPhaseIndex(
  schedule: PhaseWindow[],
  elapsedSec: number,
  loop = false,
): number {
  if (schedule.length === 0) return 0
  const total = schedule[schedule.length - 1].endSec
  // Open-ended sits cycle the schedule rather than freezing on the final phase.
  const t = loop && total > 0 ? elapsedSec % total : elapsedSec
  // Walk backwards: the last window whose startSec <= t is the active one.
  for (let i = schedule.length - 1; i >= 0; i--) {
    if (t >= schedule[i].startSec) return i
  }
  return 0
}
