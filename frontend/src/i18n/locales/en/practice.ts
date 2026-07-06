// practice domain — the PRACTICE cluster (hub + breathe/meditate/trataka + shared session UI).
// Keys: 'practice.*'. English is the SOURCE OF TRUTH: every value must stay byte-identical to the
// literal it replaced (the test suite asserts exact card names, section copy, "Untimed", etc.).
export const practice: Record<string, string> = {
  // ── Practices hub — page chrome ──────────────────────────────────────────
  'practice.hub.title': 'Practices',
  'practice.hub.subtitle': 'Every way to practice — and what it gives your spirit.',
  'practice.hub.programsLabel': 'Programs',
  'practice.hub.paths.name': 'Guided paths',
  'practice.hub.paths.desc': 'A day-by-day course to settle in',
  'practice.hub.logPast.name': 'Log a past session',
  'practice.hub.logPast.desc': 'Record a practice you did offline',
  'practice.hub.search.placeholder': 'Search practices…',
  'practice.hub.search.label': 'Search practices',
  'practice.hub.search.clear': 'Clear search',
  // Category filter chips — All + Start here + one chip per group; the calm one-shelf browse.
  'practice.hub.filter.aria': 'Browse by category',
  'practice.hub.filter.all': 'All',
  'practice.hub.filter.starter': 'Start here',
  'practice.hub.seeAll': 'See all {count}',
  'practice.hub.beginner.title': 'New here? Start here',
  'practice.hub.beginner.blurb': 'Gentle places to begin — short, simple, and no experience needed.',
  'practice.hub.suggested.title': 'Suggested for you',
  'practice.hub.noMatches': 'No practices match “{query}”.',
  'practice.hub.beginnerBadge': 'Good first practice',
  'practice.hub.lockedHint': 'Reach level {level} to unlock',
  // Spirit round-out nudge (ADR-0032) — the sentence wraps a need label + icon, so it's split.
  'practice.hub.nudge.fallbackName': 'Your spirit',
  'practice.hub.nudge.before': 'has had a little less',
  'practice.hub.nudge.after':
    'lately — the highlighted practices would round things out, if you feel like it.',

  // ── Practices hub — group titles + blurbs ────────────────────────────────
  'practice.group.breathing.title': 'Breathing',
  'practice.group.breathing.blurb': 'Work with the breath to steady body and mind.',
  'practice.group.meditation.title': 'Meditation',
  'practice.group.meditation.blurb': 'Train attention and rest the mind.',
  'practice.group.body.title': 'Body',
  'practice.group.body.blurb': 'Settle into the body — scan, move, release.',
  'practice.group.heart.title': 'Heart',
  'practice.group.heart.blurb': 'Warm, feeling-centred practices for kindness and joy.',
  'practice.group.sleep.title': 'Sleep',
  'practice.group.sleep.blurb': 'Wind-down practices to ease toward sleep.',
  'practice.group.steady.title': 'Steady',
  'practice.group.steady.blurb': 'Quick ways to regulate in a harder moment.',
  'practice.group.everyday.title': 'Everyday',
  'practice.group.everyday.blurb': 'Short, anywhere on-ramps — no setup.',
  'practice.group.reflection.title': 'Reflection',
  'practice.group.reflection.blurb': 'Put the day into words — gratitude and journaling.',

  // ── Practices hub — card names + descriptions (keyed by route) ───────────
  // Breathing
  'practice.card.resonance.name': 'Resonance',
  'practice.card.resonance.desc': 'Slow, longer-exhale breathing',
  'practice.card.box.name': 'Box',
  'practice.card.box.desc': 'Equal in·hold·out·hold',
  'practice.card.energizing.name': 'Energizing',
  'practice.card.energizing.desc': 'Brisk, active inhale',
  'practice.card.alternate.name': 'Alternate nostril',
  'practice.card.alternate.desc': 'Nadi Shodhana — balance left & right',
  // Meditation
  'practice.card.mindfulness.name': 'Mindfulness',
  'practice.card.mindfulness.desc': 'Open, unguided sitting — just be with the breath',
  'practice.card.focus.name': 'Focused attention',
  'practice.card.focus.desc': 'Steady a scattered mind on one anchor',
  'practice.card.countBreath.name': 'Count the breath',
  'practice.card.countBreath.desc': 'Count each breath one to ten, restart when you drift',
  'practice.card.noting.name': 'Noting',
  'practice.card.noting.desc': 'Softly label what arises — thinking, hearing, feeling',
  'practice.card.soundBath.name': 'Sound meditation',
  'practice.card.soundBath.desc': 'Rest attention on the sounds around you, near and far',
  'practice.card.nameFeelings.name': 'Name what you feel',
  'practice.card.nameFeelings.desc': 'Notice a feeling, name it precisely, let it be',
  'practice.card.chakraOm.name': 'Chakra Om',
  'practice.card.chakraOm.desc': 'Chant Om up through the seven chakras',
  'practice.card.mantra.name': 'Mantra',
  'practice.card.mantra.desc': 'A word to rest the mind on — an anchor for a busy head',
  'practice.card.justSit.name': 'Dopamine reset',
  'practice.card.justSit.desc': 'Sit with nothing — relearn stillness',
  'practice.card.trataka.name': 'Candle gazing',
  'practice.card.trataka.desc': 'Trataka — steady focus on a flame',
  // Body
  'practice.card.bodyScan.name': 'Body scan',
  'practice.card.bodyScan.desc': 'Move awareness through the body, head to toe',
  'practice.card.yogaNidra.name': 'Yoga Nidra',
  'practice.card.yogaNidra.desc': 'Non-sleep deep rest — lie back and unwind',
  'practice.card.pmr.name': 'Muscle release',
  'practice.card.pmr.desc': 'Tense and release, part by part, to melt tension out',
  'practice.card.stretching.name': 'Mindful stretching',
  'practice.card.stretching.desc': 'Gentle guided stretches — move with the breath',
  'practice.card.walking.name': 'Mindful walking',
  'practice.card.walking.desc': 'Attention in motion — for when sitting is too much',
  // Heart
  'practice.card.lovingKindness.name': 'Loving-kindness',
  'practice.card.lovingKindness.desc': 'Send warm wishes to yourself and outward',
  'practice.card.selfCompassion.name': 'Self-compassion',
  'practice.card.selfCompassion.desc': 'Turn kindness inward, like a good friend',
  'practice.card.recallGood.name': 'Recount a good memory',
  'practice.card.recallGood.desc': 'Relive a happy memory in vivid detail',
  'practice.card.savoring.name': 'Savor something good',
  'practice.card.savoring.desc': 'Slow down and soak in a simple good thing, right now',
  'practice.card.celebrateWin.name': 'Celebrate a win',
  'practice.card.celebrateWin.desc': 'Acknowledge something you did — big or small',
  'practice.card.forgiveness.name': 'Forgiveness',
  'practice.card.forgiveness.desc': 'Set down an old hurt, gently — toward yourself or another',
  'practice.card.gratitudeSit.name': 'Gratitude meditation',
  'practice.card.gratitudeSit.desc': 'A guided gratitude sit — bring to mind what holds you up',
  'practice.card.sympatheticJoy.name': 'Sympathetic joy',
  'practice.card.sympatheticJoy.desc': "Delight in others' good fortune — joy that costs nothing",
  'practice.card.awe.name': 'Awe & wonder',
  'practice.card.awe.desc': 'Evoke a sense of vastness — and feel yourself part of it',
  // Sleep
  'practice.card.windDown.name': 'Wind down',
  'practice.card.windDown.desc': 'Let the body grow heavy and give yourself permission to drift',
  'practice.card.fourSevenEight.name': '4-7-8 breath',
  'practice.card.fourSevenEight.desc': 'In for four, hold for seven, out for eight — a settling rhythm',
  'practice.card.setDownDay.name': 'Set down the day',
  'practice.card.setDownDay.desc': "Put the day's loose ends somewhere safe till morning",
  // Steady
  'practice.card.physiologicalSigh.name': 'Physiological sigh',
  'practice.card.physiologicalSigh.desc': 'Two breaths in, one long breath out — the fastest reset',
  'practice.card.steadySenses.name': 'Ground in your senses',
  'practice.card.steadySenses.desc': 'Come back to now through your five senses (5-4-3-2-1)',
  'practice.card.steadyFeet.name': 'Feet on the ground',
  'practice.card.steadyFeet.desc': 'Drop your weight down and feel held',
  'practice.card.steadySoothe.name': 'Soften, soothe, allow',
  'practice.card.steadySoothe.desc': 'Meet a hard feeling with a kind touch',
  // Everyday
  'practice.card.threeBreaths.name': 'Three mindful breaths',
  'practice.card.threeBreaths.desc': 'A one-minute reset — just three breaths',
  'practice.card.stopPause.name': 'Pause & STOP',
  'practice.card.stopPause.desc': 'Stop, Take a breath, Observe, Proceed',
  'practice.card.bodyCheckin.name': 'Body check-in',
  'practice.card.bodyCheckin.desc': 'A quick weather-report on your body',
  'practice.card.arriving.name': 'Arriving',
  'practice.card.arriving.desc': 'A clean pause between tasks or places',
  // Reflection
  'practice.card.gratitude.name': 'Gratitude',
  'practice.card.gratitude.desc': "Note what you're grateful for",
  'practice.card.journal.name': 'Journal',
  'practice.card.journal.desc': 'Reflect in writing',

  // ── Time cues (PRACTICE_META.mins) ───────────────────────────────────────
  'practice.mins.youChoose': 'You choose',
  'practice.mins.1': '1 min',
  'practice.mins.2': '2 min',
  'practice.mins.3': '3 min',
  'practice.mins.4': '4 min',
  'practice.mins.5': '5 min',
  'practice.mins.8': '8 min',
  'practice.mins.10': '10 min',
  'practice.mins.12': '12 min',
  'practice.mins.15': '15 min',
  'practice.mins.20': '20 min',
  'practice.mins.30': '30 min',
  'practice.mins.45': '45 min',
  'practice.mins.60': '60 min',
  'practice.mins.90': '90 min',

  // ── Shared session UI (back links, controls, states) ─────────────────────
  'practice.back.dashboard': '← Dashboard',
  'practice.control.start': 'Start',
  'practice.control.resume': 'Resume',
  'practice.control.pause': 'Pause',
  'practice.control.begin': 'Begin',
  'practice.control.reset': 'Reset',
  'practice.control.finishSave': 'Finish & save',
  'practice.state.ready': 'Ready',
  'practice.state.paused': 'Paused',

  // Duration stepper options (shared across meditate/breathe/trataka)
  'practice.duration.label': 'Duration',
  'practice.duration.untimed': 'Untimed',
  // "{time} elapsed" — shared by the meditate + trataka stat rows.
  'practice.elapsed': '{time} elapsed',

  // Unsaved-sit recovery
  'practice.recover.save': 'Save it',
  'practice.recover.discard': 'Discard',
  'practice.recover.saving': 'Saving…',
  'practice.recover.savedToast': 'Session saved.',
  'practice.recover.saveFailed': "Couldn't save that session.",
  // Recovery line: meditate/trataka fill {label} with the (lower-cased) draft label; breathe
  // uses its own fixed line (practice.breathe.recover.unsaved).
  'practice.recover.unsavedSit': 'Unsaved {label} sit · {min} min from earlier.',

  // Errors
  'practice.error.saveSession': "Couldn't save the session.",
  'practice.error.saveReflection': "Couldn't save reflection.",

  // Pre-session intention (shared)
  'practice.prep.summary': 'Session prep — intention & pre-reading (optional)',
  'practice.intention.label': 'Intention',
  'practice.intention.optional': '(optional)',

  // Pre-session reading offer (shared)
  'practice.prereading.log': 'Log a reading first (optional)',
  'practice.prereading.title': 'Log a reading first?',

  // Post-session reflection (shared modal)
  'practice.reflect.heading': 'How was that?',
  'practice.reflect.intro': 'Optional — rate it, or jot a quick note.',
  'practice.reflect.focus': 'Focus',
  'practice.reflect.calm': 'Calm',
  'practice.reflect.moodLabel': 'Mood (optional)',
  'practice.reflect.notesLabel': 'Notes (optional)',
  'practice.reflect.notesPlaceholder': 'Anything that arose…',
  'practice.reflect.keep': 'Keep it',
  'practice.reflect.skip': 'Skip',
  'practice.reflect.notRated': '—',
  'practice.reflect.readingTitle': 'Log a quick reading?',

  // RatingChips shared component defaults
  'practice.rating.notRated': 'Not rated',
  'practice.rating.rateAria': 'Rate {n} of 5',

  // SoundscapePicker aria labels
  'practice.soundscape.group': 'Ambient soundscape',
  'practice.soundscape.volume': 'Soundscape volume',

  // Stepper default button labels
  'practice.stepper.previous': 'Previous',
  'practice.stepper.next': 'Next',

  // ReflectionMood group aria label
  'practice.reflectionMood.group': 'Mood (optional)',

  // Post-session reading toast (shared)
  'practice.reading.notedToast': 'Noted — your heart, on the record.',

  // ── Meditate page ─────────────────────────────────────────────────────────
  'practice.meditate.title': 'Meditate',
  'practice.meditate.intro.whatUnguided':
    'An open, unguided sit — just you and the breath, for as long as you like.',
  'practice.meditate.intro.howGuided':
    'You’ll be gently guided — just follow along. No experience needed.',
  'practice.meditate.intro.howUnguided':
    'Find a comfortable seat, pick a length below, and press Start when you’re ready.',
  'practice.meditate.phase.beHere': 'Be here',
  'practice.meditate.minSit': '{min} min sit',
  'practice.meditate.guidedStructure': 'Guided structure',
  'practice.meditate.guidedNone': 'None — plain timer',
  'practice.meditate.guidedLocked': '{label} — Reach level {level} to unlock',
  'practice.meditate.guidedOption': '{label} — {desc}',
  'practice.meditate.spoken.toggle': 'Spoken guidance',
  'practice.meditate.spoken.unavailable':
    'Voice unavailable here — cues show on screen with a soft bell.',
  'practice.meditate.spoken.on': 'Cues are read aloud so you can keep your eyes closed.',
  'practice.meditate.spoken.off': 'Cues show on screen with a soft bell.',
  'practice.meditate.preReading.intro':
    'Optional: your heart rate now, to see how a sit settles you.',
  'practice.meditate.reflect.aria': 'Reflect on your sit',
  'practice.meditate.reflect.intentionLabel': 'Your intention:',
  'practice.meditate.reading.aria': 'Log a quick reading',
  'practice.meditate.sound.summary': 'Sound & bells',
  'practice.meditate.sound.ambient': 'Ambient sound',
  'practice.meditate.bells.label': 'Bells',
  'practice.meditate.bells.off': 'Off',
  'practice.meditate.bells.ends': 'At start & end',
  'practice.meditate.bells.every5': 'Start, end & every 5 min',
  'practice.meditate.bells.every10': 'Start, end & every 10 min',
  'practice.meditate.bellVolume': 'Bell volume',
  'practice.meditate.intentionAria': 'Your intention for this sit',
  'practice.meditate.recover.label': 'Meditation',

  // ── Breathe page ──────────────────────────────────────────────────────────
  'practice.breathe.title': 'Breathe',
  'practice.breathe.intro.resonance':
    'Slow, even breaths with a longer exhale — the gentle, calming default.',
  'practice.breathe.intro.box': 'Equal counts — in, hold, out, hold. Simple and steadying.',
  'practice.breathe.intro.energizing': 'A brisk, active inhale to wake the body up.',
  'practice.breathe.intro.alternate':
    'Alternate-nostril breathing (Nadi Shodhana) — balancing left and right.',
  'practice.breathe.intro.default': 'A few calm minutes of paced breathing — just follow along.',
  'practice.breathe.intro.how':
    'Follow the orb — breathe in as it grows, out as it shrinks. There’s nothing to get wrong.',
  'practice.breathe.recover.unsaved': 'Unsaved breathing sit · {min} min from earlier.',
  'practice.breathe.cycles': '{cycles} cycles',
  'practice.breathe.bpm': '{bpm} breaths per minute',
  'practice.breathe.runningHint': 'Pause to change the pattern, pace, or sound.',
  'practice.breathe.guidedCue': 'Follow the orb.',
  'practice.breathe.pattern.label': 'Pattern',
  'practice.breathe.pattern.group': 'Breathing pattern',
  // Alternate-nostril side labels (the value 'left'/'right' also drives layout/CSS).
  'practice.breathe.nostril.left': 'left',
  'practice.breathe.nostril.right': 'right',
  'practice.breathe.alternateNote':
    'Close one nostril with your thumb or finger; switch sides each round.',
  'practice.breathe.pace.label': 'Pace',
  'practice.breathe.pace.aria': 'Breaths per minute',
  'practice.breathe.pace.gentler': 'Gentler',
  'practice.breathe.pace.harder': 'Harder',
  'practice.breathe.eachPhase.label': 'Each phase',
  'practice.breathe.eachPhase.aria': 'Seconds per phase',
  'practice.breathe.eachPhase.shorter': 'Shorter',
  'practice.breathe.eachPhase.longer': 'Longer',
  // Pace difficulty labels (from DIFFICULTY)
  'practice.breathe.difficulty.expert': 'Very advanced',
  'practice.breathe.difficulty.advanced': 'Advanced',
  'practice.breathe.difficulty.moderate': 'Moderate',
  'practice.breathe.difficulty.gentle': 'Gentle',
  // Pace / phase stepper option labels
  'practice.breathe.bpmOption': '{n} breaths/min',
  'practice.breathe.boxOption': '{n}s each',
  'practice.breathe.sound.label': 'Sound',
  'practice.breathe.sound.off': 'Off',
  'practice.breathe.chime': 'Chime',
  'practice.breathe.volume': 'Volume',
  'practice.breathe.soundscape.summary': 'Ambient soundscape',
  'practice.breathe.audio.summary': 'Sound — breath wash, chime & soundscape',
  'practice.breathe.preReading.done': 'Pre-breathing reading logged.',
  'practice.breathe.preReading.intro':
    'Optional: your heart rate now, to see how a breathing sit settles you.',
  'practice.breathe.reflect.aria': 'Reflect on your breathing',
  'practice.breathe.reflect.intentionLabel': 'Your intention:',
  'practice.breathe.reading.aria': 'Log a quick reading',
  'practice.breathe.recover.label': 'Breathing',
  'practice.breathe.preReadingDone.meditate': 'Pre-sit reading logged.',

  // ── Trataka (candle gazing) page ──────────────────────────────────────────
  'practice.trataka.title': 'Candle gazing',
  'practice.trataka.intro.what':
    'Trataka — rest your open gaze on the flame and let your attention settle on it.',
  'practice.trataka.intro.how':
    'When the mind wanders, gently bring your eyes back to the flame. Blink whenever you need to.',
  'practice.trataka.guide': 'Rest your gaze softly on the flame',
  'practice.trataka.phase.gazing': 'Rest your gaze on the flame',
  'practice.trataka.phase.ready': 'Eyes open · gaze softly',
  'practice.trataka.minGaze': '{min} min gaze',
  'practice.trataka.sound.summary': 'Ambient sound',
  'practice.trataka.recover.label': 'Candle gazing',
  // The procedural flame's screen-reader description (components/Flame.tsx)
  'practice.trataka.flameAria': 'A softly glowing candle flame to gaze at',
  'practice.trataka.reflect.aria': 'Reflect on your gaze',
  'practice.trataka.about.summary': 'About candle gazing',
  'practice.trataka.about.p1intro': 'Candle gazing — traditionally called',
  'practice.trataka.about.p1mid':
    '— is a yogic concentration practice (a form of',
  'practice.trataka.about.p1end':
    '): you rest your open gaze on a single point, classically a candle flame, and let your attention settle there. When the mind wanders, you gently bring it back to the flame.',
  'practice.trataka.about.p2intro': "It's traditionally used to",
  'practice.trataka.about.p2emph': 'train sustained attention',
  'practice.trataka.about.p2end':
    '— the idea being that steadying your visual focus on one spot can carry over into steadier attention overall. Research into concentration practices is still emerging, so we hold this as a long-standing practice people find helpful, not a proven outcome.',
  'practice.trataka.about.p3intro':
    'Some people with attention difficulties find single-point focus grounding. That said, candle gazing is',
  'practice.trataka.about.p3emph': 'not a treatment for ADHD or any condition',
  'practice.trataka.about.p3end':
    'and is no substitute for professional care — if you have medical concerns, please speak with a qualified professional.',
  'practice.trataka.about.note':
    'A gentle, traditional focus practice — supportive, not clinical, and not a medical measurement or diagnosis.',

  // ── RewardOverlay ─────────────────────────────────────────────────────────
  'practice.reward.dismiss': 'Dismiss reward',
  'practice.reward.gained': '+{xp} XP',
  'practice.reward.level': 'Level {level}',
  'practice.reward.levelUp': ' · Level up!',
  'practice.reward.coins': "You've earned coins to spend on your spirit",
  'practice.reward.toNext': '{into} / {forNext} to next level',
  'practice.reward.continue': 'Continue',
  // XP-source lines in the reward breakdown (lib/xpBreakdown.ts). {label} is the
  // server-provided quest copy, passed through as-is.
  'practice.reward.quest': 'Quest: {label}',
  'practice.reward.streakBonus': 'Streak bonus',
  // Warm words of praise on finishing a sit (picked at random).
  'practice.reward.praise.0': 'Beautifully done.',
  'practice.reward.praise.1': 'You showed up — that’s what matters.',
  'practice.reward.praise.2': 'That’s time well spent.',
  'practice.reward.praise.3': 'A quiet gift to yourself.',
  'practice.reward.praise.4': 'Every sit counts.',
  'practice.reward.praise.5': 'Proud of you for this.',
  'practice.reward.praise.6': 'That’s another rep for your brain.',
  'practice.reward.praise.7': 'One more sit — the habit’s taking root.',
  'practice.reward.praise.8': 'You just strengthened the pathway.',

  // ── BiometricCapture ──────────────────────────────────────────────────────
  'practice.biometric.bpmLabel': 'Heart rate (bpm)',
  'practice.biometric.bpmPlaceholder': 'e.g. 68',
  'practice.biometric.bpmHint': 'Between 30 and 220 bpm',
  'practice.biometric.hrvLabel': 'HRV in ms (optional, if you know it)',
  'practice.biometric.hrvPlaceholder': 'e.g. 45',
  'practice.biometric.hrvHint':
    'Heart-rate variability — many watches and rings report it. Skip if you don’t track it.',
  'practice.biometric.disclaimer':
    'A personal wellness signal you enter yourself — not a medical measurement or diagnosis.',
  'practice.biometric.save': 'Save reading',
  'practice.biometric.saving': 'Saving…',
  'practice.biometric.skip': 'Skip',
  'practice.biometric.error.bpm': 'Enter a heart rate between 30 and 220 bpm.',
  'practice.biometric.error.hrv': 'HRV must be 0 or more (leave blank if unknown).',
  'practice.biometric.error.save': "Couldn't save the reading. Try again.",

  // ── BreathingInfo ─────────────────────────────────────────────────────────
  'practice.breathingInfo.summary': 'About resonance breathing',
  'practice.breathingInfo.whatHeading': 'What it is',
  'practice.breathingInfo.whatBody.pre':
    'Resonance (or "coherence") breathing is slow, paced breathing — around 6 breaths a minute or slower. At this pace your heart rate and breath fall into sync, which maximizes',
  'practice.breathingInfo.whatBody.emph': 'heart-rate variability (HRV)',
  'practice.breathingInfo.whatBody.post':
    'and shifts your nervous system toward "rest and digest" for a calmer, more focused state.',
  'practice.breathingInfo.ratioHeading': 'Why the 2:3 ratio',
  'practice.breathingInfo.ratioBody.pre':
    'You breathe in for 2 counts and out for 3 — a slightly',
  'practice.breathingInfo.ratioBody.emph': 'longer exhale',
  'practice.breathingInfo.ratioBody.mid':
    ', which gently stimulates the vagus nerve and deepens relaxation. At a',
  'practice.breathingInfo.ratioBody.emph2': 'Gentle',
  'practice.breathingInfo.ratioBody.post':
    'pace (6 breaths a minute) that\'s about 4 seconds in, 6 seconds out; slower paces stretch both.',
  'practice.breathingInfo.benefitsHeading': 'Benefits',
  'practice.breathingInfo.benefit1': 'Lower stress and anxiety in the moment',
  'practice.breathingInfo.benefit2': 'Sharper focus and a steadier mind',
  'practice.breathingInfo.benefit3': 'Higher HRV — a marker of nervous-system resilience',
  'practice.breathingInfo.benefit4': 'Can support better sleep and emotional regulation',
  'practice.breathingInfo.howHeading': 'How to do it',
  'practice.breathingInfo.how1': 'Sit comfortably, shoulders relaxed.',
  'practice.breathingInfo.how2': 'Breathe through your nose, down into your belly — not your chest.',
  'practice.breathingInfo.how3': 'Follow the circle and tone: in as it grows, out as it shrinks.',
  'practice.breathingInfo.how4': "Don't force it — if a pace strains, choose an easier (faster) one.",
  'practice.breathingInfo.how5': 'Start with a few minutes and build up over time.',
  'practice.breathingInfo.disclaimer':
    'General wellness guidance, not medical advice. Ease off or stop if you feel light-headed, and check with a clinician first if you have a heart or respiratory condition.',
}
