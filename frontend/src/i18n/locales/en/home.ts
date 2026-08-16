// home domain — the HOME/dashboard cluster (DashboardPage + its cards). Keys: 'home.*'.
// EN is the SOURCE OF TRUTH: every value stays byte-identical to the literal it replaced
// (the dashboard test suite asserts exact text, so do not reword these).
export const home: Record<string, string> = {
  // DashboardPage — title, greeting fallback
  'home.title': 'Your practice',
  'home.error.stats': "Couldn't load your stats.",

  // Streak / rest-day
  'home.streak.aria': '{count} day streak',
  'home.restDay': 'Rest day used. Skipping one is fine.',

  // Daily-goal ring
  'home.goal.label': 'Daily goal',
  'home.goal.progress': '{done} of {goal} min',
  'home.goal.met': 'Goal met today',
  'home.goal.adjust': 'Adjust goal',
  'home.goal.aria.progress': '{done} of {goal} minutes practiced today',
  'home.goal.aria.met': 'Daily goal met, {goal} minutes today',

  // Today CTA (path-aware + recommendation secondary)
  'home.today.pathDay': 'Day {index} · {title}',
  'home.today.tryPath': 'Try a guided path',

  // Quick-access tiles
  'home.quickAccess.aria': 'Quick access',

  // Today's nudges (the old daily quests)
  'home.quests.heading': 'Today’s nudges',
  'home.quests.aria.detail': '. {detail}',
  'home.quests.aria.progress': ', {progress} of {target}',
  'home.quests.aria.reward': ', reward {xp} XP',
  'home.quests.aria.done': ', done',
  'home.quests.detail.meditate': 'Any non-breathing meditation, 1 min+',
  'home.quests.detail.long_sit': 'One meditation sit of 10 min+',
  'home.quests.detail.double_sit': 'Two separate meditation sits today',
  'home.quests.detail.breathe': 'Any breathing pattern, 1 min+',
  'home.quests.detail.deep_breathe': '5 min+ of breathing in total today',
  'home.quests.detail.slow_breathe': 'Breathing at 5 breaths/min or slower',
  'home.quests.detail.gratitude': 'One gratitude note',
  'home.quests.detail.gratitude_three': 'Three gratitude notes today',
  'home.quests.detail.journal': 'One journal entry',
  'home.quests.detail.mood_journal': 'A journal entry with a mood set',

  // Mood line
  'home.mood.reflect': 'You felt {mood} ',
  'home.mood.log': "Log today's mood",

  // Empty / just-getting-started fallback (split around inline links)
  'home.empty.lead': "You're just getting started. ",
  'home.empty.logSession': 'Log a session',
  'home.empty.or': ' or ',
  'home.empty.breathe': 'breathe',
  'home.empty.trailing': ' to get started.',

  // Progress tab
  'home.progress.seeAnalytics': 'See full analytics',

  // Mood modal
  'home.moodModal.aria': 'How are you feeling?',
  'home.moodModal.kicker': 'Take a breath',
  'home.moodModal.heading': 'How are you feeling?',
  'home.moodModal.skip': 'Skip for now',

  // EncouragementNote — heart button + rotating affirmations
  'home.encouragement.sendLove': 'Send a little love',
  'home.encouragement.0': 'You showed up today.',
  'home.encouragement.1': 'Be gentle with yourself.',
  'home.encouragement.2': 'Every breath is a fresh start.',
  'home.encouragement.3': 'Small steps still move you forward.',
  'home.encouragement.4': 'Rest is part of the practice, too.',
  'home.encouragement.5': 'A little practice goes a long way.',
  'home.encouragement.6': 'Your companion is here.',
  'home.encouragement.7': 'There’s no wrong way to begin.',
  'home.encouragement.8': 'A few quiet breaths is a real win.',
  'home.encouragement.9': 'Whatever today holds, a few breaths help.',
  'home.encouragement.10': 'Progress isn’t always loud.',
  'home.encouragement.11': 'Showing up is the hard part, and you did.',
  'home.encouragement.12': 'Every session leaves a little calm behind.',
  'home.encouragement.13': 'You’re building a habit, one breath at a time.',
  'home.encouragement.14': 'Show up enough and the habit carries you.',
  'home.encouragement.15': 'Each sit settles a little more calm.',

  // FirstRunCard
  'home.firstRun.aria': 'Getting started',
  'home.firstRun.dismiss': 'Dismiss getting started',
  'home.firstRun.title': 'New here? Start with one small step.',
  'home.firstRun.body':
    'Breathe for a few minutes, or log a sit you’ve already done. Your dashboard fills in as you practice.',
  'home.firstRun.breathe': 'Breathe',
  'home.firstRun.logSession': 'Log a session',

  // GraduationCard
  'home.graduation.aria': "You've grown",
  'home.graduation.dismiss': 'Dismiss',
  'home.graduation.title': 'You’ve grown a real practice',
  'home.graduation.body':
    'You’ve stuck with it. That’s the hard part. When you’re ready: measure how your breathing moves your HRV, explore your full history, and give your companion a deeper look.',
  'home.graduation.hrv': 'Measure your HRV',
  'home.graduation.analytics': 'Full analytics',
  'home.graduation.customize': 'Customize',
  'home.graduation.gotIt': 'Got it',

  // WeeklyReview
  'home.weekly.heading': 'This week',
  'home.weekly.gathering': 'Gathering your week…',
  'home.weekly.empty': 'No practice logged yet this week. A few mindful minutes is a great start.',
  'home.weekly.delta.same': 'same as last week',
  'home.weekly.delta.up': '▲ {delta} min vs last week',
  'home.weekly.delta.down': '▼ {delta} min vs last week',
  'home.weekly.label.minutes': 'minutes',
  'home.weekly.daysPracticed': '{days}/7',
  'home.weekly.label.daysPracticed': 'days practiced',
  'home.weekly.label.dayStreak': 'day streak',
  'home.weekly.minutesUnit': '{count} min',
  'home.weekly.label.longestSit': 'longest sit',
  'home.weekly.label.mostly': 'mostly {mood}',

  // LevelCard
  'home.level.title': 'Level {level}',
  'home.level.xpProgress': 'XP progress',
  'home.level.xpText': '{into} / {forNext} XP to level {next} · {total} total',

  // MoodCheckin
  'home.moodCheckin.heading': 'How do you feel?',
  'home.moodCheckin.group': 'Log your mood',
  'home.moodCheckin.noted': 'Noted.',
  'home.moodCheckin.error': "Couldn't log that mood. Try again.",
  'home.moodCheckin.thanks': 'Thanks for checking in. It feeds your trends.',

  // DailyReading — UI labels only (the passages themselves are content)
  'home.reading.aria': 'Daily reading',
  'home.reading.eyebrow': 'Daily reading',
  'home.reading.cite': 'by {attribution}',
  'home.reading.reflect': 'Reflect on this',

  // Daily greeting shown under the dashboard title (lib/zen.ts picks one per day).
  'home.greeting.0': 'Namaste',
  'home.greeting.1': 'Welcome back — breathe easy',
  'home.greeting.2': 'Your cushion missed you',
  'home.greeting.3': 'One breath at a time',
  'home.greeting.4': 'The present moment says hi',
  'home.greeting.5': 'Be here now',
  'home.greeting.6': 'Inhale calm, exhale hustle',
  'home.greeting.7': 'Soft mind, steady heart',
  'home.greeting.8': 'A little stillness goes a long way',
  'home.greeting.9': 'Wherever you go, there you are',
  'home.greeting.10': 'Showing up today rewires you a little',
  'home.greeting.11': 'Build the habit, one breath at a time',

  // Mindful stand-ins for a bare "Loading…" (lib/zen.ts).
  'home.loading.0': 'Finding your center…',
  'home.loading.1': 'Inhale… exhale…',
  'home.loading.2': 'Gathering your calm…',
  'home.loading.3': 'Settling the dust…',
  'home.loading.4': 'Returning to the breath…',
  'home.loading.5': 'A mindful moment…',

  // Recommended-practice hero (lib/recommendation.ts) — CTA + one-line reason.
  'home.recommend.morning.cta': 'Start clear with focused attention',
  'home.recommend.morning.blurb': 'A steady way into the morning.',
  'home.recommend.afternoon.cta': 'Take a slow minute to breathe',
  'home.recommend.afternoon.blurb': 'A small reset for the middle of the day.',
  'home.recommend.evening.cta': 'Wind down with Yoga Nidra',
  'home.recommend.evening.blurb': 'A deep rest for the evening.',
  'home.recommend.night.cta': 'Ease toward sleep with Yoga Nidra',
  'home.recommend.night.blurb': 'Let the day soften.',
  'home.recommend.joyful.cta': 'Warm the heart with loving-kindness',
  'home.recommend.joyful.blurb': 'A little more joy would round things out.',
  'home.recommend.rested.cta': 'Settle with a body scan',
  'home.recommend.rested.blurb': 'A little rest would round things out.',
  'home.recommend.nourished.cta': 'Steady yourself with focused attention',
  'home.recommend.nourished.blurb': 'A grounding practice to round things out.',
  // Newcomer picks (level ≤ 3) — the easiest way in for each time of day.
  'home.recommend.beginner.morning.cta': 'Ease in with three mindful breaths',
  'home.recommend.beginner.morning.blurb': 'The simplest way to begin.',
  'home.recommend.beginner.afternoon.cta': 'Take a slow minute to breathe',
  'home.recommend.beginner.afternoon.blurb': 'A small reset for the middle of the day.',
  'home.recommend.beginner.evening.cta': 'Settle with a gentle body scan',
  'home.recommend.beginner.evening.blurb': 'An easy way to unwind.',
  'home.recommend.beginner.night.cta': 'Soften into a body scan',
  'home.recommend.beginner.night.blurb': 'Let the day go, gently.',
}
