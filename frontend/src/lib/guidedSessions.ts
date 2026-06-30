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

export const GUIDED_STRUCTURES: GuidedStructure[] = [
  BODY_SCAN,
  LOVING_KINDNESS,
  NAME_FEELINGS,
  CHAKRA_OM,
  STRETCHING,
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
  const s = GUIDED_STRUCTURES.find((g) => g.id === id)
  if (!s) throw new Error(`Unknown guided structure: ${id}`)
  return s
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
