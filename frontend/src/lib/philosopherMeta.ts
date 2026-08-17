import {
  BookOpen,
  Eye,
  Flower2,
  Landmark,
  MessageCircle,
  Sparkles,
  Sun,
  Swords,
  Wind,
  type LucideIcon,
} from 'lucide-react'

// Per-guide presentation + integration metadata, keyed on the stable backend persona id. The
// roster itself (name, tradition, blurb, openers) comes from the API; this is the frontend-only
// layer that gives each guide a distinct identity and ties them back into the app:
//   - `icon`  — a distinct lucide line-icon (no emoji), per the design system.
//   - `light`/`dark` — a per-guide accent (light + dark theme), mirroring the practice tiles, so
//     the roster reads as seven different people rather than one repeated card.
//   - `era`   — a short place · period label shown as a tag (factual, shown untranslated like the
//     backend `tradition`).
//   - `practice` — a practice in this guide's spirit (route + existing card-name i18n key), so a
//     reflection can close the loop back into actually practising ("guide-suggested practice").
export interface PhilosopherMeta {
  icon: LucideIcon
  light: string
  dark: string
  era: string
  practice: { to: string; nameKey: string }
}

export const PHILOSOPHER_META: Record<string, PhilosopherMeta> = {
  'marcus-aurelius': {
    icon: Landmark,
    light: '#4f46e5',
    dark: '#a5b4fc',
    era: 'Rome · 121–180 CE',
    practice: { to: '/meditate/focus', nameKey: 'practice.card.focus.name' },
  },
  buddha: {
    icon: Flower2,
    light: '#b9760a',
    dark: '#f5c151',
    era: 'India · 5th c. BCE',
    practice: { to: '/meditate/loving-kindness', nameKey: 'practice.card.lovingKindness.name' },
  },
  confucius: {
    icon: BookOpen,
    light: '#2f6fe0',
    dark: '#82b4ff',
    era: 'China · 551–479 BCE',
    practice: { to: '/journal', nameKey: 'practice.card.journal.name' },
  },
  laozi: {
    icon: Wind,
    light: '#0e8aa6',
    dark: '#5fd2e8',
    era: 'China · 6th c. BCE',
    practice: { to: '/breathe?pattern=resonance', nameKey: 'practice.card.resonance.name' },
  },
  'eckhart-tolle': {
    icon: Sun,
    light: '#d97706',
    dark: '#f5a742',
    era: 'b. 1948',
    practice: { to: '/meditate/three-breaths', nameKey: 'practice.card.threeBreaths.name' },
  },
  'carl-jung': {
    icon: Sparkles,
    light: '#7c3aed',
    dark: '#c4b5fd',
    era: '1875–1961',
    practice: { to: '/journal', nameKey: 'practice.card.journal.name' },
  },
  'miyamoto-musashi': {
    icon: Swords,
    light: '#545a73',
    dark: '#a6acc4',
    era: 'Japan · 1584–1645',
    practice: { to: '/trataka', nameKey: 'practice.card.trataka.name' },
  },
  krishnamurti: {
    icon: Eye,
    light: '#16a34a',
    dark: '#4ade80',
    era: 'India · 1895–1986',
    practice: { to: '/meditate/noting', nameKey: 'practice.card.noting.name' },
  },
}

// Fallback for any id without bespoke metadata (keeps the UI resilient if the roster grows
// server-side before this map does).
export const PHILOSOPHER_META_FALLBACK: PhilosopherMeta = {
  icon: MessageCircle,
  light: '#5847f0',
  dark: '#a8a2ff',
  era: '',
  practice: { to: '/meditate/three-breaths', nameKey: 'practice.card.threeBreaths.name' },
}

export function philosopherMeta(id: string): PhilosopherMeta {
  return PHILOSOPHER_META[id] ?? PHILOSOPHER_META_FALLBACK
}
