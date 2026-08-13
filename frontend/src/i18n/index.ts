// Lightweight i18n core — no dependency, i18next-compatible catalog conventions.
//
// WHY HAND-ROLLED: the app ships two locales (en · ja) and its rules forbid casual
// dependencies. This layer is ~100 lines, fully typed, and keeps the catalog format
// (flat dot-keys, `{var}` interpolation, `_one`/`_other` plural suffixes) compatible with
// i18next — if the locale set ever grows past what this covers (complex plural languages,
// lazy-loaded namespaces), migrating is a mechanical rename, not a rewrite.
//
// CONVENTIONS (agents + humans, follow exactly):
//   - Keys are flat dot-paths namespaced by domain: 'practices.title', 'auth.login.cta'.
//   - Interpolation: t('x.y', { name }) replaces '{name}' in the message.
//   - Plurals: pass { count } and author BOTH '<key>_one' and '<key>_other' messages
//     (Japanese only needs '_other'; lookup falls back _other ← _one ← bare key).
//   - English is the source of truth: components must render byte-identical English to the
//     literals they replace, so the existing test suite stays meaningful untouched.
//   - Long-form CONTENT pools (daily readings, guided-session scripts, path cues, emails)
//     are NOT in these catalogs — content localization is a separate phase.
import { useSyncExternalStore } from 'react'
import { EN } from './locales/en'
import { JA } from './locales/ja'

export type Locale = 'en' | 'ja'

export const LOCALES: readonly Locale[] = ['en', 'ja'] as const
// Native-name labels for the Settings picker (each language named in itself).
export const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ja: '日本語' }

const STORAGE_KEY = 'ui.locale'
const CATALOGS: Record<Locale, Record<string, string>> = { en: EN, ja: JA }

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ja') return stored
  } catch {
    // fall through to the browser language
  }
  if (typeof navigator !== 'undefined' && (navigator.language ?? '').toLowerCase().startsWith('ja')) {
    return 'ja'
  }
  return 'en'
}

let current: Locale = detectLocale()
const listeners = new Set<() => void>()

// Keep <html lang> in sync so the UA picks CJK fonts/line-breaking and SRs read correctly.
function applyLang(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
applyLang(current)

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale) {
  if (locale === current) return
  current = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // fine — the choice just won't persist
  }
  applyLang(locale)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Message lookup with plural + locale fallback: exact plural form in the current locale,
// then its `_other`, then the bare key; then the same chain in English; then the key itself
// (a visible '<domain>.<name>' beats a blank screen and is greppable).
function lookup(catalog: Record<string, string>, key: string, count: number | undefined): string | undefined {
  if (count !== undefined) {
    const form = new Intl.PluralRules(current).select(count) // 'one' | 'other' (en/ja)
    return catalog[`${key}_${form}`] ?? catalog[`${key}_other`] ?? catalog[key]
  }
  return catalog[key]
}

export type TVars = Record<string, string | number>

export function t(key: string, vars?: TVars): string {
  const count = typeof vars?.count === 'number' ? vars.count : undefined
  const msg = lookup(CATALOGS[current], key, count) ?? lookup(CATALOGS.en, key, count) ?? key
  if (!vars) return msg
  return msg.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** React hook: re-renders on locale change; returns the live `t` plus the current locale. */
export function useT(): { t: typeof t; locale: Locale } {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return { t, locale }
}

// ── Locale-aware formatting (thin Intl wrappers so call sites never hard-code 'en-US') ──

export function fmtDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(current, options ?? { dateStyle: 'medium' }).format(date)
}

export function fmtTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(current, options ?? { timeStyle: 'short' }).format(date)
}

export function fmtNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(current, options).format(n)
}
