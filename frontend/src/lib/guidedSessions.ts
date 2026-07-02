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
  // Meditation (+3)
  | 'count-breath'
  | 'noting'
  | 'sound-bath'
  // Heart (+4)
  | 'forgiveness'
  | 'gratitude-sit'
  | 'sympathetic-joy'
  | 'awe'
  // Sleep (new, 3)
  | 'wind-down'
  | 'four-seven-eight'
  | 'set-down-day'
  // Steady (new, 4)
  | 'physiological-sigh'
  | 'steady-senses'
  | 'steady-feet'
  | 'steady-soothe'
  // Everyday (new, 4)
  | 'three-breaths'
  | 'stop-pause'
  | 'body-checkin'
  | 'arriving'

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
    { cue: "Try the word on. If it doesn't quite fit, let a truer one come — anxious, lonely, wistful, calm.", bell: false, weight: 3 },
    { cue: 'Now find it in the body. Where does this feeling live — chest, throat, gut, jaw?', bell: true, weight: 3 },
    { cue: "Let it be there, exactly as it is. You don't have to fix it — just keep it company.", bell: true, weight: 3 },
    { cue: "Notice: naming it makes room. You can hold a feeling without it running the show.", bell: false, weight: 2 },
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
    { cue: 'Breathe in, and on the out-breath, a soft "Ommm." Feel it hum in your chest.', bell: false, weight: 1 },
    { cue: 'Root — base of the spine. "Om." Feel it ground you.', bell: true, weight: 2 },
    { cue: 'Sacral — just below the navel. "Om." Let it loosen and warm.', bell: true, weight: 2 },
    { cue: 'Solar plexus — above the navel. "Om." A steady, settled strength.', bell: true, weight: 2 },
    { cue: 'Heart — center of the chest. "Om." Let it open and soften.', bell: true, weight: 2 },
    { cue: 'Throat — base of the throat. "Om." Let breath and voice flow freely.', bell: true, weight: 2 },
    { cue: 'Third eye — between the brows. "Om." Quiet and clear.', bell: true, weight: 2 },
    { cue: 'Crown — top of the head. "Om." Let the sound dissolve into stillness.', bell: true, weight: 2 },
    { cue: 'Rest. Feel the whole channel humming, base to crown. Nothing to do.', bell: true, weight: 3 },
    { cue: 'Let the sound fade. Rest in the quiet it leaves behind.', bell: false, weight: 1 },
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
    { cue: 'Bring to mind something good you have right now — something you can appreciate in this very moment. A person, a comfort, a simple pleasure. Small is fine.', bell: true, weight: 3 },
    { cue: 'Hold it in attention. Really let yourself appreciate it.', bell: true, weight: 3 },
    { cue: "Let the good feeling grow. There's no rush — just stay with it.", bell: true, weight: 4 },
    { cue: 'Soak it in. Let it land fully, the way you\'d savour a good meal.', bell: false, weight: 3 },
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
    { cue: 'When the mind wanders — and it will — notice, and gently return. No frustration.', bell: true, weight: 5 },
    { cue: "Each return is the rep. That's how concentration grows.", bell: false, weight: 3 },
    { cue: 'Stay with the anchor, breath after breath. Let everything else fade to the background.', bell: true, weight: 4 },
    { cue: "When you're ready, widen your attention out again, and open your eyes.", bell: false, weight: 1 },
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
    { cue: "Boredom isn't a problem to solve. Let it be here.", bell: false, weight: 3 },
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
    { cue: 'Silently repeat it, at a pace that feels easy. Let it be almost effortless.', bell: true, weight: 3 },
    { cue: 'When the mind drifts, come back to the word. Softly, again and again.', bell: true, weight: 4 },
    { cue: 'Let the mantra fill the space thoughts used to.', bell: false, weight: 3 },
    { cue: 'If it fades, rest in the quiet, then pick it up again.', bell: false, weight: 3 },
    { cue: 'No need to tie the word to the breath — let it settle into whatever rhythm it wants.', bell: false, weight: 3 },
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
    { cue: 'When the mind wanders, bring it back to the soles of your feet.', bell: false, weight: 3 },
    { cue: 'Notice the air, the sounds, the movement — without chasing them.', bell: true, weight: 3 },
    { cue: 'Let the gaze soften a few steps ahead. Walk as one whole moving body.', bell: false, weight: 2 },
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
    { cue: 'Sink into the looseness left behind — nowhere tense, nothing held.', bell: false, weight: 3 },
    { cue: "When you're ready, take a slow breath and return.", bell: false, weight: 1 },
  ],
}

// ── Count the breath ──────────────────────────────────────────────────────────
// Count each out-breath one to ten, then start again — and begin again at one
// whenever the count is lost. The counting + returning phases carry the most
// weight; settle and close phases are shorter.

const COUNT_BREATH: GuidedStructure = {
  id: 'count-breath',
  label: 'Count the breath',
  description: 'Count each breath, one to ten, and begin again.',
  phases: [
    { cue: 'Settle in. Sit tall, eyes closed or softly lowered.', bell: false, weight: 1 },
    { cue: "Breathe naturally. Don't change the breath — just let it come and go.", bell: false, weight: 1 },
    { cue: 'On the next out-breath, silently count "one". The next, "two".', bell: true, weight: 2 },
    { cue: 'Keep going, gently, up to ten. Just the breath and the number.', bell: true, weight: 3 },
    { cue: "At ten, start again at one. There's no finish line to reach.", bell: false, weight: 3 },
    { cue: 'Lost the count? That happens to everyone. Just start over at one.', bell: true, weight: 4 },
    { cue: "Losing count isn't failure — noticing you lost it is the practice. You don't have to reach ten cleanly.", bell: false, weight: 4 },
    { cue: 'Let the counting steady you. One breath, one number, then the next.', bell: false, weight: 3 },
    { cue: 'Let the numbers fall away. Rest with the bare breath a moment.', bell: true, weight: 2 },
    { cue: "When you're ready, open your eyes and carry the steadiness with you.", bell: false, weight: 1 },
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

// ── Sound meditation ──────────────────────────────────────────────────────────
// Let sound be the anchor: receive the sounds around you, near and far, without
// naming or judging them. The receiving phases carry the most weight; settle and
// close phases are shorter.

const SOUND_BATH: GuidedStructure = {
  id: 'sound-bath',
  label: 'Sound meditation',
  description: 'Let sound be the anchor — receive it, near and far.',
  phases: [
    { cue: 'Settle in. Let your eyes close and your body soften.', bell: false, weight: 1 },
    { cue: 'Take a slow breath, then let it return to its own rhythm.', bell: false, weight: 1 },
    { cue: 'Now open your ears. Let sound come to you — no need to reach for it.', bell: true, weight: 2 },
    { cue: "Start with what's near — the room, your own breath, small movements.", bell: true, weight: 3 },
    { cue: 'Now the further sounds — traffic, wind, a voice, a hum in the walls.', bell: true, weight: 3 },
    { cue: "Don't name or judge them. Just receive each sound as it is.", bell: false, weight: 3 },
    { cue: 'Notice the silence between sounds, too. Rest in the whole soundscape.', bell: true, weight: 3 },
    { cue: 'When you drift into a story about a sound, return to simply hearing.', bell: true, weight: 3 },
    { cue: 'Let each sound end when it ends. No sound needs you to keep it.', bell: false, weight: 3 },
    { cue: 'Let the listening grow soft and wide, holding it all at once.', bell: true, weight: 2 },
    { cue: "When you're ready, open your eyes, keeping a little of that open listening.", bell: false, weight: 1 },
  ],
}

// ── Forgiveness ───────────────────────────────────────────────────────────────
// Loosen your grip on an old hurt — toward yourself first, then, only as far as
// feels okay, toward another. Offered gently, never demanded. The
// acknowledging + releasing phases carry the most weight.

const FORGIVENESS: GuidedStructure = {
  id: 'forgiveness',
  label: 'Forgiveness',
  description: 'Loosen your grip on an old hurt — in your own time.',
  phases: [
    { cue: 'Settle in. Rest a hand on your heart if you like.', bell: false, weight: 1 },
    { cue: "Breathe slowly. There's nothing you have to force here.", bell: false, weight: 1 },
    { cue: 'This practice is an offering, never a demand. If something feels too raw today, you can simply rest with the breath.', bell: true, weight: 2 },
    { cue: "Begin close to home. Bring to mind a way you've been holding something against yourself — a mistake, a failing, an old regret.", bell: true, weight: 3 },
    { cue: "Acknowledge the hurt honestly. It made sense that it landed. You don't have to pretend it didn't matter.", bell: false, weight: 3 },
    { cue: "When you're ready, offer inward:\n\"For the ways I've fallen short, I begin to forgive myself.\"", bell: true, weight: 3 },
    { cue: '"I was doing what I could with what I knew. I can set some of this down now."', bell: false, weight: 3 },
    { cue: 'Now, if you wish, bring to mind someone who hurt you. Only as close as feels okay — no need to picture the worst of it.', bell: true, weight: 3 },
    { cue: "You're not excusing what happened. You're loosening your own grip on it, for your own sake.", bell: false, weight: 3 },
    { cue: "If and when you're ready:\n\"For the hurt you caused me, I begin, in my own time, to let it go.\"", bell: true, weight: 3 },
    { cue: 'Notice what a little less weight feels like. Forgiveness can be partial, and it can take many sittings. That\'s alright.', bell: true, weight: 2 },
    { cue: 'Return to the breath. Carry only what you choose to carry.', bell: false, weight: 1 },
  ],
}

// ── Gratitude meditation ──────────────────────────────────────────────────────
// A guided sit resting on the web of support around you — the body, the people,
// the small comforts, and the unseen hands behind them. The widening-out phases
// carry the most weight; settle and close phases are shorter.

const GRATITUDE_SIT: GuidedStructure = {
  id: 'gratitude-sit',
  label: 'Gratitude meditation',
  description: 'A guided sit resting on the web of support around you.',
  phases: [
    { cue: 'Settle in. Let your eyes close and your breath slow.', bell: false, weight: 1 },
    { cue: 'Breathe easily. Let a little softness come to your face.', bell: false, weight: 1 },
    { cue: 'Start with the body — it has carried you all day without being asked. Feel the breath arriving on its own.', bell: true, weight: 3 },
    { cue: 'Bring to mind someone who supports you — who\'s kind to you, or simply shows up. Picture their face.', bell: true, weight: 3 },
    { cue: 'Let the warmth of them land in your chest. You might silently offer: "Thank you."', bell: false, weight: 3 },
    { cue: 'Widen out. Think of the small comforts holding your day up — a warm drink, a roof, a bed, a quiet moment like this one.', bell: true, weight: 3 },
    { cue: 'Think of the unseen hands behind them — everyone whose work brought these ordinary things to you.', bell: true, weight: 3 },
    { cue: "You don't have to earn any of this or fix anything. Just let yourself receive it for a moment.", bell: false, weight: 3 },
    { cue: 'Rest in the whole web of support around you, seen and unseen. Let the fullness of it settle.', bell: true, weight: 2 },
    { cue: 'Return to the breath, carrying a quiet "thank you" with you.', bell: false, weight: 1 },
  ],
}

// ── Sympathetic joy ───────────────────────────────────────────────────────────
// Take joy in others' good fortune — a loved one's, then someone you quietly envy,
// then everyone — softening comparison along the way. The wishing-well phases
// carry the most weight; settle and close phases are shorter.

const SYMPATHETIC_JOY: GuidedStructure = {
  id: 'sympathetic-joy',
  label: 'Sympathetic joy',
  description: "Take joy in others' good fortune, and soften comparison.",
  phases: [
    { cue: 'Settle in. Let a small, easy smile rest on your face.', bell: false, weight: 1 },
    { cue: 'Breathe gently. Let the heart be light.', bell: false, weight: 1 },
    { cue: "Bring to mind someone you love who's had something good happen lately — a success, a joy, a stroke of luck.", bell: true, weight: 3 },
    { cue: 'Picture their happiness. Let yourself feel glad for them:\n"I\'m happy for you. May your good fortune continue."', bell: true, weight: 3 },
    { cue: 'Notice how their joy can become a little of yours, at no cost to anyone.', bell: false, weight: 3 },
    { cue: 'Now think of someone doing well who you might quietly envy — someone whose luck stings a little.', bell: true, weight: 3 },
    { cue: 'That sting is ordinary; no need to judge it. Softly turn it around:\n"May your happiness grow. May your good fortune last."', bell: true, weight: 3 },
    { cue: 'Feel how wishing them well loosens the knot of comparison. There\'s plenty of joy to go around.', bell: false, weight: 3 },
    { cue: 'Widen out to everyone, everywhere, celebrating something right now:\n"May every joy grow. May good fortune find all beings."', bell: true, weight: 2 },
    { cue: 'Rest in that open gladness. Return to the breath, carrying it with you.', bell: false, weight: 1 },
  ],
}

// ── Awe & wonder ──────────────────────────────────────────────────────────────
// Recall a time you felt small in a good way, widen out to the vastness beyond,
// and rest in the spaciousness. The recalling + widening phases carry the most
// weight; settle and close phases are shorter.

const AWE: GuidedStructure = {
  id: 'awe',
  label: 'Awe & wonder',
  description: 'Recall a sense of vastness, and rest in the spaciousness.',
  phases: [
    { cue: 'Settle in. Take one slow breath and let your shoulders drop.', bell: false, weight: 1 },
    { cue: 'Bring to mind a time you felt small in a good way — under a night sky, before the ocean, on a mountain, holding a newborn.', bell: true, weight: 3 },
    { cue: 'Put yourself back there. What did you see? How far did it stretch? Let the scale of it return.', bell: true, weight: 3 },
    { cue: 'Feel the pleasant smallness of it — how your usual worries shrank against something so vast.', bell: true, weight: 3 },
    { cue: 'Now widen further. Beneath you, a whole spinning planet. Around it, an ocean of stars, older than anything you can name.', bell: true, weight: 3 },
    { cue: 'You are a living part of all of it — breathing, aware, here for this brief, astonishing while.', bell: false, weight: 3 },
    { cue: 'Rest in the spaciousness. Nothing to grasp. Just wonder, quietly.', bell: true, weight: 2 },
    { cue: 'Let your awareness return to the room, the breath, the body — carrying a little of that openness back with you.', bell: false, weight: 1 },
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

// ── 4-7-8 breath ──────────────────────────────────────────────────────────────
// A sleep practice: a slow, exhale-long breath rhythm — in for four, hold for
// seven, out for eight — to settle toward sleep. Bells taper off; no bright end.
// The rounds carry the most weight; settle phases are shorter.

const FOUR_SEVEN_EIGHT: GuidedStructure = {
  id: 'four-seven-eight',
  label: '4-7-8 breath',
  description: 'A slow, exhale-long breath rhythm to settle toward sleep.',
  phases: [
    { cue: 'Settle into bed. Let your eyes close and your body soften.', bell: true, weight: 1 },
    { cue: 'Rest the tip of your tongue just behind your top front teeth.', bell: false, weight: 1 },
    { cue: 'Empty your lungs completely with one long, quiet sigh out.', bell: false, weight: 1 },
    { cue: 'In through the nose for four… two, three, four.', bell: false, weight: 2 },
    { cue: 'Hold, gently, for seven… two, three, four, five, six, seven.', bell: false, weight: 2 },
    { cue: 'Out through the mouth for eight, slow and soft… down to one.', bell: false, weight: 2 },
    { cue: 'Again — in for four… hold for seven… out for eight.', bell: false, weight: 3 },
    { cue: 'And again, at your own easy pace. No straining for the count.', bell: false, weight: 3 },
    { cue: 'A few more rounds. Let each exhale carry a little more away.', bell: false, weight: 3 },
    { cue: 'Now let the counting go. Breathe however feels natural.', bell: false, weight: 2 },
    { cue: "Rest in the quiet you've made. Let yourself drift.", bell: false, weight: 2 },
  ],
}

// ── Set down the day ──────────────────────────────────────────────────────────
// A sleep practice: put the day's loose ends somewhere safe till morning, so
// nothing follows you into sleep. Bells taper off; no bright end. The
// setting-down phases carry the most weight; settle phases are shorter.

const SET_DOWN_DAY: GuidedStructure = {
  id: 'set-down-day',
  label: 'Set down the day',
  description: "Set the day's unfinished business down for the night.",
  phases: [
    { cue: 'Lie back and let your body settle. The day is done.', bell: true, weight: 1 },
    { cue: "Let a few slow breaths out. There's nothing left to do tonight.", bell: false, weight: 2 },
    { cue: "If the day is still replaying, that's okay. Let it come.", bell: true, weight: 2 },
    { cue: 'Picture a shelf, or a box beside the bed — somewhere safe.', bell: false, weight: 2 },
    { cue: "Take whatever's unfinished — a task, a worry, a conversation — and set it there.", bell: false, weight: 3 },
    { cue: "It'll keep till morning. You don't have to solve it lying here.", bell: false, weight: 3 },
    { cue: 'Anything still pulling at you? Name it once, and set it down too.', bell: false, weight: 2 },
    { cue: 'The shelf holds it all now. Your hands are empty.', bell: false, weight: 3 },
    { cue: 'Nothing to carry into sleep. Let your mind grow quiet.', bell: false, weight: 3 },
    { cue: 'Just breathing now. Resting. Letting the night take you.', bell: false, weight: 2 },
  ],
}

// ── Physiological sigh ────────────────────────────────────────────────────────
// A quick settle for harder moments: a double inhale and a long exhale, repeated
// for a few rounds. Self-regulation, not treatment. The sighing rounds carry the
// most weight; settle and close phases are shorter.

const PHYSIOLOGICAL_SIGH: GuidedStructure = {
  id: 'physiological-sigh',
  label: 'Physiological sigh',
  description: 'A double inhale and a long exhale — a quick way to settle.',
  phases: [
    { cue: "Wherever you are, let your shoulders drop. We'll do a few slow rounds.", bell: true, weight: 1 },
    { cue: 'Breathe in through your nose… then, on top, sip in a little more air.', bell: false, weight: 3 },
    { cue: "Now let it all go — a long, slow exhale through the mouth, until you're empty.", bell: false, weight: 3 },
    { cue: 'Again: a full breath in through the nose… and a second small sip to fill the top.', bell: false, weight: 3 },
    { cue: 'And a long exhale out, slower than the in-breath. Let the shoulders fall.', bell: false, weight: 3 },
    { cue: 'A few more, at your own pace. Two breaths in, one long breath out.', bell: false, weight: 3 },
    { cue: 'Now let the breath return to normal. Notice how you feel now — no need to name it.', bell: false, weight: 2 },
  ],
}

// ── Ground in your senses ─────────────────────────────────────────────────────
// A steadying 5-4-3-2-1 senses descent for harder moments — come back to the
// present through what you can see, feel, hear, smell, and taste. Self-regulation,
// not treatment. The senses phases carry the most weight.

const STEADY_SENSES: GuidedStructure = {
  id: 'steady-senses',
  label: 'Ground in your senses',
  description: 'The 5-4-3-2-1 senses descent — come back to the present.',
  phases: [
    { cue: 'Wherever you are, let your feet meet the floor. No need to close your eyes for this one.', bell: false, weight: 1 },
    { cue: 'Look around and name five things you can see. Take them one at a time — a colour, a shape, the light on a surface.', bell: true, weight: 3 },
    { cue: 'Now four things you can feel. Your feet in your shoes, the chair, the air on your skin, the weight of your hands.', bell: false, weight: 3 },
    { cue: 'Three things you can hear. Near and far — a hum, a voice, your own breath. Just notice them.', bell: false, weight: 2 },
    { cue: 'Two things you can smell — or two slow breaths through your nose if nothing\'s there.', bell: false, weight: 2 },
    { cue: 'One thing you can taste, or the simple feeling of your mouth. You\'re here. You made it back to now.', bell: true, weight: 2 },
    { cue: 'Take one easy breath. The room is holding you, and so is the ground.', bell: false, weight: 1 },
  ],
}

// ── Feet on the ground ────────────────────────────────────────────────────────
// A steadying practice for harder moments: drop your weight down and feel held by
// the ground. Self-regulation, not treatment. The grounding phases carry the most
// weight; settle and close phases are shorter.

const STEADY_FEET: GuidedStructure = {
  id: 'steady-feet',
  label: 'Feet on the ground',
  description: 'Feel your weight and your contact with the ground.',
  phases: [
    { cue: 'Sit or stand — however you are. Let your shoulders drop on the next out-breath.', bell: false, weight: 1 },
    { cue: 'Bring your attention all the way down to your feet. Feel exactly where they touch the ground.', bell: true, weight: 3 },
    { cue: "Press down a little. Feel the floor push back up. It's solid, and it's holding you.", bell: true, weight: 3 },
    { cue: "Let your weight sink — through your seat, your legs, into the ground. You don't have to hold yourself up.", bell: true, weight: 3 },
    { cue: "Feel the whole line of contact: feet, seat, wherever you're supported. Steady. Here.", bell: true, weight: 3 },
    { cue: "One slow breath down into that steadiness. When you're ready, carry it with you.", bell: false, weight: 1 },
  ],
}

// ── Soften, soothe, allow ─────────────────────────────────────────────────────
// A steadying practice for harder moments: meet a hard feeling in the body with
// softness and a kind hand — kindness toward self, so it feeds joy. The
// soften/soothe/allow phases carry the most weight.

const STEADY_SOOTHE: GuidedStructure = {
  id: 'steady-soothe',
  label: 'Soften, soothe, allow',
  description: 'Meet a hard feeling in the body with softness and a kind hand.',
  phases: [
    { cue: 'Settle in. Let one hand rest wherever it wants to — your heart, your belly, a cheek.', bell: false, weight: 1 },
    { cue: 'Bring to mind what\'s hard right now. Not to solve it — just to let it be here with you.', bell: true, weight: 2 },
    { cue: 'Find where it lives in your body — a tightness, a weight, a knot. Let your attention rest there.', bell: true, weight: 3 },
    { cue: 'Soften. Let the muscles around it loosen, like easing your grip on something. Soften… soften…', bell: true, weight: 3 },
    { cue: "Soothe. Feel the warmth of your hand. Let it be a kindness — the way you'd comfort someone you love.", bell: true, weight: 3 },
    { cue: "Allow. You don't have to make the feeling leave. Let it be here, and let yourself be here with it.", bell: true, weight: 3 },
    { cue: "Rest a moment longer under your own kind hand. If this feels like a lot to carry alone, it's okay to reach out to someone you trust.", bell: false, weight: 2 },
    { cue: "When you're ready, let your hand come to rest, and return to the breath.", bell: false, weight: 1 },
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

// ── Pause & STOP ──────────────────────────────────────────────────────────────
// A four-step reset for a stressful moment: Stop, Take a breath, Observe, Proceed.
// Short, anywhere, no setup. The observe phases carry the most weight; the
// bookends are short.

const STOP_PAUSE: GuidedStructure = {
  id: 'stop-pause',
  label: 'Pause & STOP',
  description: 'A four-step reset for a stressful moment.',
  phases: [
    { cue: 'Stop. Whatever you were rushing toward, let it wait a moment.', bell: true, weight: 1 },
    { cue: 'Take a breath. One slow, full breath — feel it move.', bell: false, weight: 2 },
    { cue: "Observe. What's here right now — in your body, your mood, your thoughts? Just notice, no fixing.", bell: true, weight: 3 },
    { cue: 'Notice your surroundings too — the room, the light, the ground under you. You\'re here.', bell: false, weight: 2 },
    { cue: 'Proceed. Step back in, a little more awake than a minute ago.', bell: true, weight: 1 },
  ],
}

// ── Body check-in ─────────────────────────────────────────────────────────────
// A quick top-to-bottom read of the body — a weather-report, no fixing. Short,
// anywhere, no setup. The region phases carry the most weight; the bookends are
// short.

const BODY_CHECKIN: GuidedStructure = {
  id: 'body-checkin',
  label: 'Body check-in',
  description: 'A quick top-to-bottom read of the body — no fixing.',
  phases: [
    { cue: "Pause for a moment. Let's do a quick weather-report on your body.", bell: true, weight: 1 },
    { cue: 'Start at the top — your head, jaw, and face. Tight? Easy? Just report the weather.', bell: false, weight: 2 },
    { cue: 'Down to your shoulders, arms, and hands. Held up, or resting? No need to change it.', bell: false, weight: 2 },
    { cue: 'Your chest and belly — is the breath shallow and quick, or slow and low?', bell: false, weight: 2 },
    { cue: 'Your back, hips, and legs, all the way to your feet. Heavy, restless, grounded?', bell: false, weight: 2 },
    { cue: 'Now the whole forecast at once. Nothing to fix — you just checked in. That counts.', bell: true, weight: 1 },
  ],
}

// ── Arriving ──────────────────────────────────────────────────────────────────
// A threshold pause so one thing doesn't bleed into the next — between tasks or
// places. Short, anywhere, no setup. The middle phases carry the most weight; the
// bookends are short.

const ARRIVING: GuidedStructure = {
  id: 'arriving',
  label: 'Arriving',
  description: "A threshold pause so one thing doesn't bleed into the next.",
  phases: [
    { cue: 'Pause at the threshold — the door, the desk, the moment before what\'s next.', bell: true, weight: 1 },
    { cue: "Set down what you were just doing. It'll keep. You don't have to carry it in.", bell: false, weight: 2 },
    { cue: 'One full breath to draw a line: that was then, this is now.', bell: true, weight: 2 },
    { cue: 'Feel your feet, your posture. Let yourself actually arrive where you are.', bell: false, weight: 2 },
    { cue: 'Ask quietly: how do I want to show up for what\'s next?', bell: false, weight: 2 },
    { cue: "Good. You're here now. Step in.", bell: true, weight: 1 },
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
  // Meditation (+3)
  COUNT_BREATH,
  NOTING,
  SOUND_BATH,
  // Heart (+4)
  FORGIVENESS,
  GRATITUDE_SIT,
  SYMPATHETIC_JOY,
  AWE,
  // Sleep (new, 3)
  WIND_DOWN,
  FOUR_SEVEN_EIGHT,
  SET_DOWN_DAY,
  // Steady (new, 4)
  PHYSIOLOGICAL_SIGH,
  STEADY_SENSES,
  STEADY_FEET,
  STEADY_SOOTHE,
  // Everyday (new, 4)
  THREE_BREATHS,
  STOP_PAUSE,
  BODY_CHECKIN,
  ARRIVING,
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
