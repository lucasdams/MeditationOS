// Common domain — the app chrome (header/nav/user menu) + strings shared across pages.
// English is the SOURCE OF TRUTH: these must stay byte-identical to the UI copy they replaced.
export const common: Record<string, string> = {
  // Brand + top-level nav
  'nav.home': 'Home',
  'nav.practice': 'Practice',
  'nav.progress': 'Progress',
  'nav.spirit': 'Spirit',
  'nav.menu': 'Menu',

  // Practice menu destinations
  'nav.breathe': 'Breathe',
  'nav.meditate': 'Meditate',
  'nav.trataka': 'Candle gazing',
  'nav.gratitude': 'Gratitude',
  'nav.journal': 'Journal',
  'nav.paths': 'Paths',
  'nav.allPractices': 'All practices',
  'nav.logSession': 'Log a session',

  // Progress menu destinations
  'nav.analytics': 'Analytics',
  'nav.timeline': 'Timeline',
  'nav.goals': 'Goals',
  'nav.schedule': 'Schedule',
  'nav.settings': 'Settings',
  'nav.admin': 'Admin',

  // User chip + account menu
  'user.level': 'Lv {level}',
  'user.logout': 'Log out',
  // Shown in place of the auto-generated guest_<id> username.
  'user.guest': 'Guest',

  // The spirit's three facets (shared by the header chip, practices badges, spirit page)
  'needs.nourished': 'Nourishment',
  'needs.rested': 'Rest',
  'needs.joyful': 'Joy',
  // Short badge forms (practice cards)
  'needs.short.nourished': 'Nourish',
  'needs.short.rested': 'Rest',
  'needs.short.joyful': 'Joy',

  // Header round-out chip (ADR-0032)
  'needChip.label': 'A little {need}?',
  'needChip.title': '{name} has had less {need} lately — a little would round things out',
  'needChip.fallbackName': 'Your spirit',

  // Truly shared bits
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.backHome': '← Home',
  'common.backDashboard': '← Dashboard',
  'common.loading': 'Loading…',
  'common.saving': 'Saving…',
  'common.optional': '(optional)',
  'common.gotIt': 'Got it',
  'common.min_one': '{count} min',
  'common.min_other': '{count} min',
  'common.yourLocalTime': 'Your local time',

  // Shared state views (StateViews.tsx) — loading / retry defaults
  'common.oneMoment': 'One moment…',
  'common.tryAgain': 'Try again',
  'common.retrying': 'Retrying…',
  'common.coins': 'coins',

  // Public footer (SiteFooter.tsx)
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',

  // 404 (NotFoundPage.tsx)
  'notFound.title': 'Page not found',
  'notFound.body': 'This path leads nowhere — it’s gone or never was.',
  'notFound.back': '← Back to home',

  // API-failure copy (lib/errors.ts) — network vs server-side, resolved at call time
  'common.error.network': "Can't reach the server — check your connection and try again.",
  'common.error.server': 'Something stumbled on our end. Give it a moment and try again.',

  // Render-error fallback (ErrorBoundary.tsx)
  'error.title': 'Something went wrong',
  'error.body': 'An unexpected error broke this page. Reloading usually fixes it.',
  'error.reload': 'Reload the app',

  // Settings → Appearance → Language picker
  'settings.language': 'Language',
  'settings.language.note':
    'Applies right away. Long-form content (daily readings, guided scripts) stays in English for now.',
}
