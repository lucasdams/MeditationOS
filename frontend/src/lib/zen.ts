// A little gentle character for the app — zen-playful, never loud. Pure content plus
// deterministic helpers, so a "daily" line stays stable through the day rather than
// flickering on every render.

// Soft daily greetings shown under the dashboard heading. These are i18n KEYS (resolved
// with t() at render) so the greeting localises — the English/Japanese copy lives in the
// `home` locale files. dailyOf() still picks one deterministically per calendar day.
export const GREETINGS = [
  'home.greeting.0',
  'home.greeting.1',
  'home.greeting.2',
  'home.greeting.3',
  'home.greeting.4',
  'home.greeting.5',
  'home.greeting.6',
  'home.greeting.7',
  'home.greeting.8',
  'home.greeting.9',
  'home.greeting.10',
  'home.greeting.11',
]

// Mindful stand-ins for a bare "Loading…" — i18n keys, resolved with t() at render.
export const LOADING = [
  'home.loading.0',
  'home.loading.1',
  'home.loading.2',
  'home.loading.3',
  'home.loading.4',
  'home.loading.5',
]

// The little blessings that float up for the "namaste" easter egg.
export const BLESSINGS = ['🙏', '🪷', '🧘', '✨', '😌', '🍃']

// Deterministic pick — stable for a given calendar day (local), so the daily greeting
// doesn't change between renders or navigations within the same day.
export function dailyOf<T>(list: T[], date: Date): T {
  const localDayOrdinal = Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  )
  return list[((localDayOrdinal % list.length) + list.length) % list.length]
}

export function randomOf<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

// Local calendar date as a stable `YYYY-MM-DD` key — used to gate once-per-day UI
// (e.g. the mood check-in prompt) by the user's own day, not UTC.
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
