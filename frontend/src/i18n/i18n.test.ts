import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, setLocale, t, fmtNumber } from './index'

describe('i18n core', () => {
  afterEach(() => {
    setLocale('en')
    localStorage.clear()
  })

  it('defaults to English (jsdom navigator is en-US)', () => {
    expect(getLocale()).toBe('en')
    expect(t('nav.home')).toBe('Home')
  })

  it('switches to Japanese, persists the choice, and updates <html lang>', () => {
    setLocale('ja')
    expect(t('nav.home')).toBe('ホーム')
    expect(localStorage.getItem('ui.locale')).toBe('ja')
    expect(document.documentElement.lang).toBe('ja')
  })

  it('interpolates {vars} and leaves unknown placeholders visible', () => {
    expect(t('user.level', { level: 7 })).toBe('Lv 7')
    expect(t('needChip.label', { need: 'Rest' })).toBe('A little Rest?')
    // An unknown placeholder stays literal — greppable, never silently blank.
    expect(t('needChip.label', {})).toBe('A little {need}?')
  })

  it('selects plural forms by count (en one/other; ja has only other)', () => {
    expect(t('common.min', { count: 1 })).toBe('1 min')
    expect(t('common.min', { count: 5 })).toBe('5 min')
    setLocale('ja')
    expect(t('common.min', { count: 1 })).toBe('1分')
    expect(t('common.min', { count: 5 })).toBe('5分')
  })

  it('falls back ja → en → key', () => {
    setLocale('ja')
    // A key missing from BOTH catalogs comes back as itself (visible + greppable).
    expect(t('missing.key')).toBe('missing.key')
  })

  it('formats numbers with the current locale', () => {
    expect(fmtNumber(1234.5)).toBe('1,234.5')
    setLocale('ja')
    expect(fmtNumber(1234.5)).toBe('1,234.5') // same digits either way — sanity, not a golden test
  })
})
