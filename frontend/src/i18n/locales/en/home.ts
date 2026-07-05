// home domain — the HOME/dashboard cluster (DashboardPage + its cards). Keys: 'home.*'.
// EN is the SOURCE OF TRUTH: every value stays byte-identical to the literal it replaced
// (the dashboard test suite asserts exact text, so do not reword these).
export const home: Record<string, string> = {
  // DashboardPage — title, greeting fallback, tabs
  'home.title': 'Your practice',
  'home.error.stats': "Couldn't load your stats.",
  'home.sections.aria': 'Home sections',
  'home.tabs.today': 'Today',
  'home.tabs.progress': 'Progress',

  // Streak / rest-day
  'home.streak.aria': '{count} day streak',
  'home.restDay': 'Rest day used — skipping one is fine.',

  // Today CTA (path-aware + recommendation secondary)
  'home.today.pathDay': 'Day {index} · {title}',
  'home.today.tryPath': 'Try a guided path',

  // Quick-access tiles
  'home.quickAccess.aria': 'Quick access',

  // Today's nudges (the old daily quests)
  'home.quests.heading': 'Today’s nudges',
  'home.quests.aria.detail': '. {detail}',
  'home.quests.aria.progress': ' — {progress} of {target}',
  'home.quests.aria.reward': ' — reward {xp} XP',
  'home.quests.aria.done': ' — done',
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
  'home.encouragement.11': 'Showing up is the hard part — and you did.',
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
    'You’ve stuck with it — that’s the hard part. When you’re ready: measure how your breathing moves your HRV, explore your full history, and give your companion a deeper look.',
  'home.graduation.hrv': 'Measure your HRV',
  'home.graduation.analytics': 'Full analytics',
  'home.graduation.customize': 'Customize',
  'home.graduation.gotIt': 'Got it',

  // WeeklyReview
  'home.weekly.heading': 'This week',
  'home.weekly.gathering': 'Gathering your week…',
  'home.weekly.empty': 'No practice logged yet this week — a few mindful minutes is a great start.',
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
  'home.moodCheckin.error': "Couldn't log that mood — try again.",
  'home.moodCheckin.thanks': 'Thanks for checking in — it feeds your trends.',

  // DailyReading — UI labels only (the passages themselves are content)
  'home.reading.aria': 'Daily reading',
  'home.reading.eyebrow': 'Daily reading',
  'home.reading.cite': '— {attribution}',
  'home.reading.reflect': 'Reflect on this',
}
