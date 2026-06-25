import { afterEach, describe, expect, it } from 'vitest'
import {
  applyColorMode,
  autoTheme,
  dayPhaseFromHour,
  readColorModePref,
  resolveSeason,
  seasonFromMonth,
  writeColorModePref,
} from './theme'

describe('seasonFromMonth (northern hemisphere)', () => {
  it('maps months to meteorological seasons', () => {
    expect(seasonFromMonth(11)).toBe('winter') // December
    expect(seasonFromMonth(0)).toBe('winter') // January
    expect(seasonFromMonth(1)).toBe('winter') // February
    expect(seasonFromMonth(2)).toBe('spring') // March
    expect(seasonFromMonth(4)).toBe('spring') // May
    expect(seasonFromMonth(5)).toBe('summer') // June
    expect(seasonFromMonth(7)).toBe('summer') // August
    expect(seasonFromMonth(8)).toBe('autumn') // September
    expect(seasonFromMonth(10)).toBe('autumn') // November
  })
})

describe('dayPhaseFromHour', () => {
  it('maps the clock to dawn / day / dusk / night', () => {
    expect(dayPhaseFromHour(6)).toBe('dawn')
    expect(dayPhaseFromHour(12)).toBe('day')
    expect(dayPhaseFromHour(19)).toBe('dusk')
    expect(dayPhaseFromHour(23)).toBe('night')
    expect(dayPhaseFromHour(3)).toBe('night')
  })

  it('uses inclusive-start, exclusive-end boundaries', () => {
    expect(dayPhaseFromHour(5)).toBe('dawn')
    expect(dayPhaseFromHour(8)).toBe('day')
    expect(dayPhaseFromHour(18)).toBe('dusk')
    expect(dayPhaseFromHour(21)).toBe('night')
  })
})

describe('resolveSeason', () => {
  it('honors an explicit choice over the date', () => {
    const july = new Date(2026, 6, 1)
    expect(resolveSeason('winter', july)).toBe('winter')
  })

  it('follows the calendar when set to auto', () => {
    const july = new Date(2026, 6, 1)
    expect(resolveSeason('auto', july)).toBe('summer')
  })
})

describe('color mode persistence', () => {
  afterEach(() => {
    // Reset so tests don't bleed into each other
    localStorage.removeItem('theme:color-mode')
    delete document.documentElement.dataset.theme
  })

  it('defaults to "dark" when nothing is stored (dark is the hero theme)', () => {
    expect(readColorModePref()).toBe('dark')
  })

  it('honors an explicit stored preference over the default', () => {
    // An explicit choice (incl. "system") still wins; only the unset default changed.
    writeColorModePref('system')
    expect(readColorModePref()).toBe('system')

    writeColorModePref('light')
    expect(readColorModePref()).toBe('light')
  })

  it('round-trips a written preference', () => {
    writeColorModePref('dark')
    expect(readColorModePref()).toBe('dark')

    writeColorModePref('light')
    expect(readColorModePref()).toBe('light')

    writeColorModePref('system')
    expect(readColorModePref()).toBe('system')

    writeColorModePref('auto')
    expect(readColorModePref()).toBe('auto')
  })

  it('applyColorMode sets data-theme for explicit choices', () => {
    applyColorMode('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    applyColorMode('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applyColorMode removes data-theme for "system"', () => {
    document.documentElement.dataset.theme = 'dark'
    applyColorMode('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applyColorMode resolves "auto" from the clock', () => {
    applyColorMode('auto', new Date(2026, 0, 1, 23)) // 11pm → dark
    expect(document.documentElement.dataset.theme).toBe('dark')

    applyColorMode('auto', new Date(2026, 0, 1, 12)) // noon → light
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('autoTheme (clock-driven light/dark)', () => {
  it('is dark in the evening and at night', () => {
    expect(autoTheme(new Date(2026, 0, 1, 19))).toBe('dark') // dusk
    expect(autoTheme(new Date(2026, 0, 1, 23))).toBe('dark') // night
    expect(autoTheme(new Date(2026, 0, 1, 3))).toBe('dark') // small hours
  })

  it('is light during the day and morning', () => {
    expect(autoTheme(new Date(2026, 0, 1, 6))).toBe('light') // dawn
    expect(autoTheme(new Date(2026, 0, 1, 12))).toBe('light') // day
  })

  it('flips at the dusk (18:00) and dawn (05:00) boundaries', () => {
    expect(autoTheme(new Date(2026, 0, 1, 17, 59))).toBe('light')
    expect(autoTheme(new Date(2026, 0, 1, 18, 0))).toBe('dark')
    expect(autoTheme(new Date(2026, 0, 1, 4, 59))).toBe('dark')
    expect(autoTheme(new Date(2026, 0, 1, 5, 0))).toBe('light')
  })
})
