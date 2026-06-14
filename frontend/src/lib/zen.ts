// A little gentle character for the app — zen-playful, never loud. Pure content plus
// deterministic helpers, so a "daily" line stays stable through the day rather than
// flickering on every render.

// Soft daily greetings shown under the dashboard heading.
export const GREETINGS = [
  'Namaste 🙏',
  'Welcome back — breathe easy 🧘',
  'Your cushion missed you 🪷',
  'One breath at a time ✨',
  'The present moment says hi 😌',
  'Be here now 🍃',
  'Inhale calm, exhale hustle 🌬️',
  'Soft mind, steady heart 🧘',
  'A little stillness goes a long way 🪷',
  'Wherever you go, there you are 😉',
]

// Mindful stand-ins for a bare "Loading…".
export const LOADING = [
  'Finding your center…',
  'Inhale… exhale…',
  'Gathering your calm…',
  'Settling the dust…',
  'Returning to the breath…',
  'A mindful moment…',
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
