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

// Meditation session types — same palette used by the session-log cards.
export const TYPE_COLORS: Record<MeditationType, string> = {
  mindfulness: '#14b8a6',
  body_scan: '#8b5cf6',
  walking: '#f59e0b',
  loving_kindness: '#ec4899',
  resonance_breathing: '#3b82f6',
  other: '#9ca3af',
}

// Journal moods, grouped loosely by sentiment — pleasant moods stay warm/bright,
// neutral is grey, and harder moods take calmer cool tones (never alarm-red).
export const MOOD_COLORS: Record<Mood, string> = {
  calm: '#14b8a6',
  content: '#10b981',
  focused: '#3b82f6',
  energized: '#f59e0b',
  grateful: '#ec4899',
  neutral: '#9ca3af',
  restless: '#f97316',
  anxious: '#8b5cf6',
  tired: '#64748b',
  low: '#475569',
}

// A rotating palette for charts not keyed to a known concept.
export const PALETTE = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#10b981']

// A soft tinted background for a given accent — for pills/badges with coloured text.
export const tint = (color: string) => `color-mix(in srgb, ${color} 16%, white)`
