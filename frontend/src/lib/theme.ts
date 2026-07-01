// Seasonal + time-of-day theming.
//
// The season can be chosen manually or left on "auto" (derived from the calendar
// month). The day phase — dawn / day / dusk / night — is always derived from the
// local clock. Both are pure functions of a Date so they're trivial to test, and a
// small context layer (see context/ThemeContext.tsx) applies them to the document.

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type SeasonPref = 'auto' | Season
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const SEASONS: { value: Season; label: string }[] = [
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
]

// Text-only labels: these render inside a native <select><option>, where an inline
// lucide icon can't live — so the season emoji are dropped rather than swapped.
export const SEASON_PREFS: { value: SeasonPref; label: string }[] = [
  { value: 'auto', label: 'Auto (by date)' },
  ...SEASONS.map((s) => ({ value: s.value as SeasonPref, label: s.label })),
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
