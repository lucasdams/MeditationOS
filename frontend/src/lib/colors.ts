// Shared colour coding, so the same concept reads the same colour everywhere
// (nav, quests, goals, session logs, analytics, journal moods).

import type { MeditationType, Mood } from '../types'

// The four core activities. Matches the soft nav colours in index.css
// (meditate = teal, breathe = sky) and extends them to gratitude/journal.
export type Activity = 'meditate' | 'breathe' | 'gratitude' | 'journal' | 'custom'

export const ACTIVITY_COLORS: Record<Activity, string> = {
  meditate: '#14b8a6', // teal
  breathe: '#0ea5e9', // sky
  gratitude: '#f59e0b', // amber
  journal: '#8b5cf6', // violet
  custom: '#6366f1', // indigo — user-defined habits
}

// The single source of truth for how an activity reads: emoji + label + colour.
// (Colour mirrors ACTIVITY_COLORS so the two never drift.) Pages that need a
// context-specific label — e.g. "Write gratitude" on the goals form — override
// the label locally; the emoji/colour stay shared.
export const ACTIVITY_META: Record<Activity, { emoji: string; label: string; color: string }> = {
  meditate: { emoji: '🧘', label: 'Meditate', color: ACTIVITY_COLORS.meditate },
  breathe: { emoji: '🫁', label: 'Breathe', color: ACTIVITY_COLORS.breathe },
  gratitude: { emoji: '🙏', label: 'Gratitude', color: ACTIVITY_COLORS.gratitude },
  journal: { emoji: '📓', label: 'Journal', color: ACTIVITY_COLORS.journal },
  custom: { emoji: '⭐', label: 'Custom', color: ACTIVITY_COLORS.custom },
}

// Bold, saturated fills for the dashboard quick-action tiles — distinct per destination
// and dark enough that white label/icon text clears WCAG AA (≥4.5:1) in LIGHT mode. Dark
// mode swaps to the brighter TILE_COLORS_DARK below (with a dark label) so the tiles pop on
// the slate canvas. These are deliberately heavier than the soft ACTIVITY_COLORS used for
// borders/quests, so the tiles read as the home screen's primary focal point.
//   meditate #0f766e → 5.47:1 · breathe #0369a1 → 5.93:1 · gratitude #b45309 → 5.02:1
//   journal #6d28d9 → 7.10:1  (white text, light mode)
export const TILE_COLORS = {
  meditate: '#0f766e', // teal-700
  breathe: '#0369a1', // sky-700
  gratitude: '#b45309', // amber-700
  journal: '#6d28d9', // violet-700
} as const

// Dark-mode tile fills. The light TILE_COLORS are deep, near-700 shades that go muddy on the
// dark slate canvas, so dark mode uses brighter, more saturated ~500 shades that pop. At those
// brightnesses white text would drop below WCAG AA, so the dark tile carries a near-black slate
// LABEL instead (TILE_TEXT_DARK) — the .feature-tile dark CSS pairs the two via --tile-fill-dark.
//   meditate #14b8a6 → 7.17:1 · breathe #0ea5e9 → 6.44:1 · gratitude #f59e0b → 8.31:1
//   journal #a78bfa → 6.56:1  (label #0f172a vs each fill)
export const TILE_COLORS_DARK = {
  meditate: '#14b8a6', // teal-500
  breathe: '#0ea5e9', // sky-500
  gratitude: '#f59e0b', // amber-500
  journal: '#a78bfa', // violet-400
} as const

// The label/icon colour used on the brighter dark-mode tile fills (slate-900).
export const TILE_TEXT_DARK = '#0f172a'

// Meditation session types — same palette used by the session-log cards.
export const TYPE_COLORS: Record<MeditationType, string> = {
  mindfulness: '#14b8a6',
  body_scan: '#8b5cf6',
  walking: '#f59e0b',
  loving_kindness: '#ec4899',
  resonance_breathing: '#3b82f6',
  energizing_breathing: '#d97706',
  other: '#9ca3af',
}

// Display labels for each meditation type — the single source of truth so the
// Schedule and Timeline views (and any new surface) can't drift apart when a
// type is added or renamed. LogSessionPage intentionally shows a narrower
// 2-type subset with its own copy and stays separate.
export const TYPE_LABELS: Record<MeditationType, string> = {
  mindfulness: 'Mindfulness',
  body_scan: 'Body scan',
  walking: 'Walking',
  loving_kindness: 'Loving-kindness',
  resonance_breathing: 'Resonance breathing',
  energizing_breathing: 'Energizing breathing',
  other: 'Other',
}

// Journal moods, grouped loosely by sentiment — pleasant moods stay warm/bright,
// neutral is grey, and harder moods take calmer cool tones (never alarm-red).
export const MOOD_COLORS: Record<Mood, string> = {
  calm: '#14b8a6',
  content: '#10b981',
  focused: '#3b82f6',
  energized: '#f59e0b',
  grateful: '#ec4899',
  hopeful: '#34d399',   // emerald-green — forward-looking warmth
  excited: '#fbbf24',  // amber-yellow — bright, upbeat
  peaceful: '#67e8f9', // cyan — soft and still
  neutral: '#9ca3af',
  restless: '#f97316',
  anxious: '#8b5cf6',
  frustrated: '#94a3b8', // slate — cool-muted, not alarm-red
  overwhelmed: '#6366f1', // indigo — heavy but not alarming
  tired: '#94a3b8',
  low: '#64748b',
}

// Mood emoji + label — the single source of truth for how a mood reads, shared by the
// one-tap check-in and the timeline. Order matches the `Mood` type (pleasant → harder).
export const MOOD_META: Record<Mood, { emoji: string; label: string }> = {
  calm: { emoji: '😌', label: 'Calm' },
  content: { emoji: '🙂', label: 'Content' },
  focused: { emoji: '🎯', label: 'Focused' },
  energized: { emoji: '⚡', label: 'Energized' },
  grateful: { emoji: '🙏', label: 'Grateful' },
  hopeful: { emoji: '🌱', label: 'Hopeful' },
  excited: { emoji: '✨', label: 'Excited' },
  peaceful: { emoji: '🌿', label: 'Peaceful' },
  neutral: { emoji: '😐', label: 'Neutral' },
  restless: { emoji: '😣', label: 'Restless' },
  anxious: { emoji: '😰', label: 'Anxious' },
  frustrated: { emoji: '😤', label: 'Frustrated' },
  overwhelmed: { emoji: '😮‍💨', label: 'Overwhelmed' },
  tired: { emoji: '😴', label: 'Tired' },
  low: { emoji: '😔', label: 'Low' },
}

// A rotating palette for charts not keyed to a known concept.
export const PALETTE = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#10b981']

// Gratitude has ~37 categories — too many to hand-map. Derive a stable colour for each
// from a curated palette by hashing the category key, so a given category is always the
// same colour and the log reads as a spread of colours rather than all-amber.
const GRATITUDE_PALETTE = [
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f97316', // orange
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#e11d48', // rose
  '#0891b2', // cyan
  '#65a30d', // lime
]

export const gratitudeColor = (category: string): string => {
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0
  return GRATITUDE_PALETTE[h % GRATITUDE_PALETTE.length]
}

// A soft tinted background for a given accent — for pills/badges with coloured text.
export const tint = (color: string) => `color-mix(in srgb, ${color} 16%, white)`
