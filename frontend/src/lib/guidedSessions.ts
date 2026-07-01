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
  | 'name-feelings'
  | 'chakra-om'
  | 'stretching'
  | 'recall-good'
  | 'self-compassion'
  | 'savoring'
  | 'celebrate-win'
  | 'focus'
  | 'yoga-nidra'
  | 'just-sit'
  | 'mantra'
  | 'walking'
  | 'pmr'

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
    { cue: 'Rest in awareness of your whole body, all at once.', bell: true, weight: 3 },
    { cue: 'When you\'re ready, gently return your attention to the breath.', bell: false, weight: 2 },
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
    { cue: 'Bring yourself to mind. Offer these wishes inward:\nMay I be safe. May I be well.', bell: true, weight: 3 },
    { cue: 'May I be happy. May I live with ease.', bell: false, weight: 3 },
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
    { cue: 'Rest here in open-hearted awareness. Nothing more to do.', bell: true, weight: 2 },
    { cue: 'Gently return to the breath. Carry this warmth with you.', bell: false, weight: 1 },
  ],
}

// ── Name what you feel ────────────────────────────────────────────────────────
// An emotional-naming practice (the alexithymia angle): notice a feeling, name it
// as precisely as you can — not just "good" or "bad" — locate it in the body, and
// let it be there without being taken over by it. The settle and close phases are
// shorter; the naming + locating phases carry the most weight.

const NAME_FEELINGS: GuidedStructure = {
  id: 'name-feelings',
  label: 'Name what you feel',
  description: 'Notice a feeling, name it as precisely as you can, and let it be.',
  phases: [
    { cue: 'Settle in. Let your eyes close and your body arrive.', bell: false, weight: 1 },
    { cue: 'Breathe naturally. Feel the ground holding you.', bell: false, weight: 1 },
    { cue: "Turn inward. What's here right now — a mood, a charge, a texture of feeling?", bell: true, weight: 3 },
    { cue: 'Name it as precisely as you can. Not just "bad" or "fine" — is it tense? restless? heavy? tender?', bell: true, weight: 4 },
    { cue: 'If a clearer word arrives, use it. Anxious. Lonely. Frustrated. Calm. Let the name fit.', bell: false, weight: 3 },
    { cue: 'Now find it in the body. Where does this feeling live — chest, throat, gut, jaw?', bell: true, weight: 3 },
    { cue: "Let it be there, exactly as it is. You don't have to fix it — just keep it company.", bell: true, weight: 3 },
    { cue: "Notice: it can be named and felt without taking you over. You're the one who's aware of it.", bell: false, weight: 2 },
    { cue: "When you're ready, return to the breath. You can always come back and name what's here.", bell: false, weight: 2 },
  ],
}

// ── Chakra Om ─────────────────────────────────────────────────────────────────
// Chant "Om" up through the seven chakras, base to crown, then rest in the whole
// channel humming. Each chakra gets equal weight; settle and close phases are
// shorter, the final rest gets a touch more. LEVEL-GATED (see GUIDED_MIN_LEVEL).

const CHAKRA_OM: GuidedStructure = {
  id: 'chakra-om',
  label: 'Chakra Om',
  description: 'Chant Om up through the seven chakras, from base to crown.',
  phases: [
    { cue: 'Sit tall, spine long. Let your breath settle.', bell: false, weight: 1 },
    { cue: 'Breathe in, and on the out-breath, a soft "Ommm." Feel it hum in your chest.', bell: true, weight: 1 },
    { cue: 'Root — base of the spine. "Om." Feel it ground you.', bell: true, weight: 2 },
    { cue: 'Sacral — just below the navel. "Om." Let it loosen and warm.', bell: true, weight: 2 },
    { cue: 'Solar plexus — above the navel. "Om." A steady, settled strength.', bell: true, weight: 2 },
    { cue: 'Heart — center of the chest. "Om." Let it open and soften.', bell: true, weight: 2 },
    { cue: 'Throat — base of the throat. "Om." Let breath and voice flow freely.', bell: true, weight: 2 },
    { cue: 'Third eye — between the brows. "Om." Quiet and clear.', bell: true, weight: 2 },
    { cue: 'Crown — top of the head. "Om." Let the sound dissolve into stillness.', bell: true, weight: 2 },
    { cue: 'Rest. Feel the whole channel humming, base to crown. Nothing to do.', bell: true, weight: 3 },
    { cue: 'Let the breath return to normal. Carry the stillness with you.', bell: false, weight: 1 },
  ],
}

// ── Mindful stretching ────────────────────────────────────────────────────────
// Gentle guided stretches moving with the breath — neck, side body, twists, a
// forward fold and roll-up. Each stretch gets a couple of beats; the forward fold
// gets a touch more. Opening + closing phases are shorter.

const STRETCHING: GuidedStructure = {
  id: 'stretching',
  label: 'Mindful stretching',
  description: 'Gentle guided stretches — move with the breath.',
  phases: [
    { cue: 'Sit or stand tall. Roll your shoulders back and take a slow breath.', bell: false, weight: 1 },
    { cue: 'Gently drop your right ear toward your right shoulder. Breathe into your neck.', bell: true, weight: 2 },
    { cue: 'Slowly lift, and tilt to the left. Let the breath lengthen the other side.', bell: true, weight: 2 },
    { cue: 'Reach both arms up overhead. Lengthen your spine, fingertips to the ceiling.', bell: true, weight: 2 },
    { cue: 'Lower your arms and gently twist to the right. Breathe.', bell: true, weight: 2 },
    { cue: 'Return to center, and twist to the left. Soft — no forcing.', bell: true, weight: 2 },
    { cue: 'Fold forward from the hips. Let your head and arms hang heavy.', bell: true, weight: 3 },
    { cue: 'Slowly roll up, one vertebra at a time, head last.', bell: true, weight: 2 },
    { cue: 'Sit tall again. Notice how your body feels now — looser, more here.', bell: true, weight: 2 },
    { cue: "One more easy breath. You're ready.", bell: false, weight: 1 },
  ],
}

// ── Recount a good memory ─────────────────────────────────────────────────────
// Relive a happy memory in vivid sensory detail and let its warmth return — a
// joy-feeding savouring practice. The recall + sensory-detail phases carry the
// most weight; settle and close phases are shorter.

const RECALL_GOOD: GuidedStructure = {
  id: 'recall-good',
  label: 'Recount a good memory',
  description: 'Relive a happy memory in vivid detail.',
  phases: [
    { cue: 'Settle in. Let your eyes close and your breath slow.', bell: false, weight: 1 },
    { cue: 'Bring to mind a good memory — a time you felt happy, proud, loved, or at peace.', bell: true, weight: 2 },
    { cue: 'Picture it clearly. Where were you? Who was there? What did you see and hear?', bell: true, weight: 3 },
    { cue: 'Let the feeling of it return — notice it warming your chest, your face, your body.', bell: true, weight: 3 },
    { cue: 'Stay with the best moment a little longer. Let yourself enjoy it fully.', bell: true, weight: 3 },
    { cue: 'Know that this is yours. You carry it with you, always available.', bell: false, weight: 2 },
    { cue: 'Gently return to the breath, keeping a little of that warmth.', bell: false, weight: 1 },
  ],
}

// ── Self-compassion ───────────────────────────────────────────────────────────
// Turn kindness inward (the self-compassion break): acknowledge a struggle,
// recognise common humanity, and offer yourself the warmth you'd give a friend.
// The acknowledgement + kindness phases carry the most weight.

const SELF_COMPASSION: GuidedStructure = {
  id: 'self-compassion',
  label: 'Self-compassion',
  description: 'Turn kindness inward — meet yourself like a good friend.',
  phases: [
    { cue: 'Settle in. Rest a hand on your heart if you like.', bell: false, weight: 1 },
    { cue: "Bring to mind something you've been hard on yourself about.", bell: true, weight: 2 },
    { cue: 'Acknowledge it gently: "This is hard. This is a moment of struggle."', bell: true, weight: 3 },
    { cue: "Remember you're not alone — everyone struggles. This is part of being human.", bell: true, weight: 3 },
    { cue: 'Offer yourself the kindness you\'d give a good friend: "May I be kind to myself."', bell: true, weight: 3 },
    { cue: '"May I give myself what I need. May I be at ease."', bell: false, weight: 3 },
    { cue: "Rest in that warmth. Return to the breath when you're ready.", bell: false, weight: 1 },
  ],
}

// ── Savor something good ──────────────────────────────────────────────────────
// Slow down and soak in a simple good thing, letting the good feeling grow rather
// than rushing past it (positive savouring). The holding + soaking phases carry the
// most weight, with the central "let it grow" phase heaviest.

const SAVORING: GuidedStructure = {
  id: 'savoring',
  label: 'Savor something good',
  description: 'Slow down and soak in a simple good thing.',
  phases: [
    { cue: 'Settle in. Take a slow, easy breath.', bell: false, weight: 1 },
    { cue: 'Bring to mind something good in your life right now — small is fine. A person, a comfort, a simple pleasure.', bell: true, weight: 3 },
    { cue: 'Hold it in attention. Really let yourself appreciate it.', bell: true, weight: 3 },
    { cue: "Notice what it gives you. Let the good feeling grow — don't rush past it.", bell: true, weight: 4 },
    { cue: 'Soak it in. Let it land fully, the way you\'d savour a good meal.', bell: true, weight: 3 },
    { cue: 'Carry this noticing with you. The good is always worth slowing down for.', bell: false, weight: 1 },
  ],
}

// ── Celebrate a win ───────────────────────────────────────────────────────────
// Acknowledge something you did — big or small — and let yourself feel the pride
// without brushing past it. The acknowledgement + savour-the-pride phases carry the
// most weight.

const CELEBRATE_WIN: GuidedStructure = {
  id: 'celebrate-win',
  label: 'Celebrate a win',
  description: 'Acknowledge something you did — big or small.',
  phases: [
    { cue: 'Settle in. Sit a little taller.', bell: false, weight: 1 },
    { cue: 'Bring to mind something you did recently — finished, showed up for, or handled. Big or small, it counts.', bell: true, weight: 3 },
    { cue: 'Don\'t brush past it. Let yourself fully acknowledge: "I did that."', bell: true, weight: 3 },
    { cue: 'Notice any pride or satisfaction. Let it be okay to feel good about this.', bell: true, weight: 3 },
    { cue: "Offer yourself a quiet word of credit — the way you'd cheer on a friend.", bell: true, weight: 2 },
    { cue: 'Carry that sense of "I can" with you. Return to the breath.', bell: false, weight: 1 },
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
    { cue: 'When the mind wanders — and it will — notice, and gently return. No frustration.', bell: true, weight: 4 },
    { cue: "Each return is the rep. That's how concentration grows.", bell: false, weight: 3 },
    { cue: 'Narrow in. Let everything else fade to the background.', bell: true, weight: 3 },
    { cue: 'Stay with the anchor, breath after breath.', bell: false, weight: 3 },
    { cue: "When you're ready, widen your attention and open your eyes.", bell: false, weight: 1 },
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
    { cue: 'Bring awareness to your right hand — thumb, fingers, palm, wrist.', bell: true, weight: 2 },
    { cue: 'Up the right arm — forearm, elbow, shoulder. Then the same on the left.', bell: true, weight: 2 },
    { cue: 'Your face — forehead, eyes, jaw. Your throat and chest.', bell: true, weight: 2 },
    { cue: 'Your belly, your back, your hips. Sinking, softening.', bell: true, weight: 2 },
    { cue: 'Both legs — thighs, knees, calves, feet. Completely at rest.', bell: true, weight: 2 },
    { cue: 'Feel the whole body at once, heavy and still. Awake, but deeply at ease.', bell: true, weight: 3 },
    { cue: 'Rest here. Nothing to reach for.', bell: false, weight: 3 },
    { cue: "When you're ready, wiggle your fingers and toes, and slowly return.", bell: false, weight: 1 },
  ],
}

// ── Dopamine reset ────────────────────────────────────────────────────────────
// Sit with nothing — no input, no stimulation — and watch the pull to be entertained
// without acting on it, rebuilding tolerance for stillness. The watching-the-urge and
// sinking-toward-quiet phases carry the most weight.

const JUST_SIT: GuidedStructure = {
  id: 'just-sit',
  label: 'Dopamine reset',
  description: 'Sit with nothing — rebuild your tolerance for stillness.',
  phases: [
    { cue: 'Sit down. No music, no phone, nothing to reach for. Just you.', bell: true, weight: 1 },
    { cue: 'Let your eyes close. Notice the pull to check something, to be entertained.', bell: true, weight: 2 },
    { cue: "You don't have to act on it. Just watch the urge rise.", bell: true, weight: 3 },
    { cue: "Boredom isn't a problem to solve. Let it be here.", bell: true, weight: 3 },
    { cue: "Under the restlessness, there's a quiet. Sink toward it.", bell: true, weight: 3 },
    { cue: 'Nothing needs to happen. This IS the practice.', bell: false, weight: 3 },
    { cue: 'Stay a little longer than is comfortable.', bell: false, weight: 2 },
    { cue: "When you're ready, open your eyes — carry a little of this calm with you.", bell: false, weight: 1 },
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
    { cue: 'Silently repeat it, in your own rhythm. No need to force it to the breath.', bell: true, weight: 3 },
    { cue: 'When the mind drifts, come back to the word. Softly, again and again.', bell: true, weight: 4 },
    { cue: 'Let the mantra fill the space thoughts used to.', bell: false, weight: 3 },
    { cue: 'If it fades, rest in the quiet, then pick it up again.', bell: true, weight: 3 },
    { cue: 'Stay with the repetition, easy and steady.', bell: false, weight: 3 },
    { cue: "When you're ready, let the word dissolve and open your eyes.", bell: false, weight: 1 },
  ],
}

// ── Mindful walking ───────────────────────────────────────────────────────────
// Attention in motion: walk slowly and feel each step, returning to the soles of the
// feet when the mind wanders. The feeling-each-step + returning phases carry the most
// weight; settle and close phases are shorter.

const WALKING: GuidedStructure = {
  id: 'walking',
  label: 'Mindful walking',
  description: 'Attention in motion — for when sitting is too much.',
  phases: [
    { cue: 'Stand tall. Feel your feet on the ground, your weight settling.', bell: true, weight: 1 },
    { cue: 'Begin to walk slowly. There\'s nowhere to be.', bell: true, weight: 2 },
    { cue: 'Feel each step — the heel, the roll, the toes, the lift.', bell: true, weight: 3 },
    { cue: 'Match a slow breath to your steps if it helps.', bell: false, weight: 2 },
    { cue: 'When the mind wanders, bring it back to the soles of your feet.', bell: true, weight: 3 },
    { cue: 'Notice the air, the sounds, the movement — without chasing them.', bell: true, weight: 3 },
    { cue: 'Slow, deliberate, present. Step after step.', bell: false, weight: 3 },
    { cue: "When you're ready, pause, and stand still for a breath.", bell: false, weight: 1 },
  ],
}

// ── Muscle release ────────────────────────────────────────────────────────────
// Progressive muscle relaxation: tense and release each region in turn, then the whole
// body at once, to melt tension out. Each region gets equal weight; the whole-body
// release gets a touch more, and settle + close phases are shorter.

const PMR: GuidedStructure = {
  id: 'pmr',
  label: 'Muscle release',
  description: 'Tense and release, part by part, to melt tension out.',
  phases: [
    { cue: 'Sit or lie comfortably. Take a slow breath in and out.', bell: false, weight: 1 },
    { cue: 'Curl your feet and tense your calves. Hold… and release. Feel them soften.', bell: true, weight: 2 },
    { cue: 'Tense your thighs and hips. Hold… and let go.', bell: true, weight: 2 },
    { cue: 'Tighten your belly and lower back. Hold… and release.', bell: true, weight: 2 },
    { cue: 'Make fists and tense your arms. Hold… and drop them, heavy.', bell: true, weight: 2 },
    { cue: 'Lift your shoulders to your ears. Hold… and let them fall.', bell: true, weight: 2 },
    { cue: 'Scrunch your face tight. Hold… and smooth it all out.', bell: true, weight: 2 },
    { cue: 'Now the whole body at once — tense everything. Hold… and completely release.', bell: true, weight: 3 },
    { cue: 'Rest in the looseness left behind.', bell: false, weight: 2 },
    { cue: 'Breathe, and gently return.', bell: false, weight: 1 },
  ],
}

export const GUIDED_STRUCTURES: GuidedStructure[] = [
  BODY_SCAN,
  LOVING_KINDNESS,
  NAME_FEELINGS,
  CHAKRA_OM,
  STRETCHING,
  RECALL_GOOD,
  SELF_COMPASSION,
  SAVORING,
  CELEBRATE_WIN,
  FOCUS,
  YOGA_NIDRA,
  JUST_SIT,
  MANTRA,
  WALKING,
  PMR,
]

// ── Level gates ───────────────────────────────────────────────────────────────
// Some guided structures unlock at a level, mirroring the spirit cosmetic unlocks
// ("Reach level N"). A single source of truth so MeditatePage and PracticesPage
// agree on what's locked. Structures absent from this map are always available.

export const GUIDED_MIN_LEVEL: Partial<Record<GuidedStructureId, number>> = {
  'chakra-om': 5,
}

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
  const totalWeight = structure.phases.reduce((sum, p) => sum + p.weight, 0)
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
