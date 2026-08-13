// paths domain (English) — Guided Paths (multi-day courses) page. English is the SOURCE OF TRUTH:
// every value must stay byte-identical to the literal it replaced.
export const paths: Record<string, string> = {
  'paths.back': '← All practices',
  'paths.title': 'Paths',
  'paths.subtitle':
    'A short, day-by-day course to settle into a practice. Go at your own pace — a missed day is never a problem.',
  'paths.loading': 'Gathering the paths…',
  'paths.empty': 'No paths yet — gentle courses are on the way.',
  'paths.loadError': "Couldn't load the paths.",
  'paths.enrollError': "Couldn't start the path. Try again.",
  'paths.dayLabel': 'Day {index}',
  'paths.progress.completed': 'Complete · all {total} days',
  'paths.progress.notEnrolled': '{total} days · a gentle place to begin',
  'paths.progress.enrolled': 'Day {current} of {total} · pick up where you left off',
  'paths.dayStartAria': 'Start {day}: {title}',
  'paths.dayStart': 'Start',
  'paths.cardStartAria': 'Start {title}',
  'paths.starting': 'Starting…',
  'paths.welcomeBack': "Welcome back — you're on Day {current}.",
  'paths.finished': "You've finished this path. Beautifully done.",
}
