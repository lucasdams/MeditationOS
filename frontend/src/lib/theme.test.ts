import { afterEach, describe, expect, it } from 'vitest'
import {
  applyColorMode,
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

  it('returns "system" when nothing is stored', () => {
    expect(readColorModePref()).toBe('system')
  })

  it('round-trips a written preference', () => {
    writeColorModePref('dark')
    expect(readColorModePref()).toBe('dark')

    writeColorModePref('light')
    expect(readColorModePref()).toBe('light')

    writeColorModePref('system')
    expect(readColorModePref()).toBe('system')
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
})
