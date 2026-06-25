// Seasonal + time-of-day theming.
//
// The season can be chosen manually or left on "auto" (derived from the calendar
// month). The day phase — dawn / day / dusk / night — is always derived from the
// local clock. Both are pure functions of a Date so they're trivial to test, and a
// small context layer (see context/ThemeContext.tsx) applies them to the document.

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type SeasonPref = 'auto' | Season
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const SEASONS: { value: Season; label: string; emoji: string }[] = [
  { value: 'winter', label: 'Winter', emoji: '❄️' },
  { value: 'spring', label: 'Spring', emoji: '🌸' },
  { value: 'summer', label: 'Summer', emoji: '☀️' },
  { value: 'autumn', label: 'Autumn', emoji: '🍂' },
]

export const SEASON_PREFS: { value: SeasonPref; label: string }[] = [
  { value: 'auto', label: 'Auto (by date)' },
  ...SEASONS.map((s) => ({ value: s.value as SeasonPref, label: `${s.emoji} ${s.label}` })),
]

// Northern-hemisphere meteorological seasons, keyed by 0-indexed month.
export function seasonFromMonth(month: number): Season {
  if (month === 11 || month <= 1) return 'winter' // Dec, Jan, Feb
  if (month <= 4) return 'spring' // Mar–May
  if (month <= 7) return 'summer' // Jun–Aug
  return 'autumn' // Sep–Nov
}

export function dayPhaseFromHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 18) return 'day'
  if (hour >= 18 && hour < 21) return 'dusk'
  return 'night'
}

// Resolve the effective season: an explicit choice wins; "auto" follows the date.
export function resolveSeason(pref: SeasonPref, now: Date): Season {
  return pref === 'auto' ? seasonFromMonth(now.getMonth()) : pref
}

export function dayPhaseFor(now: Date): DayPhase {
  return dayPhaseFromHour(now.getHours())
}

const STORAGE_KEY = 'theme:season'

export function readSeasonPref(): SeasonPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'auto' || v === 'winter' || v === 'spring' || v === 'summer' || v === 'autumn') {
      return v
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to auto.
  }
  return 'auto'
}

export function writeSeasonPref(pref: SeasonPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // ignore — the preference simply won't persist
  }
}

// ── Color mode (auto / light / dark / system) ─────────────────────────────
// "auto" (the default) follows the local clock: light by day, dark at night.
// "system" follows the OS prefers-color-scheme (no data-theme attribute, the
// CSS @media handles it). "light" / "dark" pin an explicit data-theme.

export type ColorModePref = 'auto' | 'system' | 'light' | 'dark'

const COLOR_MODE_KEY = 'theme:color-mode'

// The default when a user has never made an explicit choice. Dark is the app's
// hero theme — the glowing spirit, breathing visuals, and evening practice all
// read best on a dim canvas. Users can still pick auto / system / light in Settings.
const DEFAULT_COLOR_MODE: ColorModePref = 'dark'

/**
 * Resolve "auto" to an explicit light/dark theme from the clock, using the local
 * `dayPhaseFromHour` boundaries: dawn/day → light, dusk/night → dark.
 */
export function autoTheme(now: Date = new Date()): 'light' | 'dark' {
  const phase = dayPhaseFromHour(now.getHours())
  return phase === 'dusk' || phase === 'night' ? 'dark' : 'light'
}

export function readColorModePref(): ColorModePref {
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY)
    if (v === 'auto' || v === 'system' || v === 'light' || v === 'dark') return v
  } catch {
    // private mode / unavailable — fall through to the default
  }
  return DEFAULT_COLOR_MODE
}

export function writeColorModePref(pref: ColorModePref): void {
  try {
    localStorage.setItem(COLOR_MODE_KEY, pref)
  } catch {
    // ignore
  }
}

/**
 * Apply the color mode preference to <html data-theme>.
 * - "auto"   → data-theme computed from the local clock (light by day, dark at night)
 * - "light"  → data-theme="light"
 * - "dark"   → data-theme="dark"
 * - "system" → attribute removed (CSS @media prefers-color-scheme takes over)
 *
 * Call this early (before React renders) to avoid a flash, and again whenever
 * the preference or — for "auto" — the time of day changes. Pass `now` so the
 * caller controls the clock (handy in tests and on the minute tick).
 */
export function applyColorMode(pref: ColorModePref, now: Date = new Date()): void {
  const root = document.documentElement
  if (pref === 'auto') {
    root.dataset.theme = autoTheme(now)
  } else if (pref === 'light') {
    root.dataset.theme = 'light'
  } else if (pref === 'dark') {
    root.dataset.theme = 'dark'
  } else {
    delete root.dataset.theme
  }
}
