// Shared colour coding, so the same concept reads the same colour everywhere
// (nav, quests, goals, session logs, analytics, journal moods).

import type { ComponentType } from 'react'
import { Brain, Wind, HandHeart, NotebookPen, Star, type LucideProps } from 'lucide-react'
import type { MeditationType, Mood } from '../types'

// The four core activities — each its own cool-leaning bright colour so they read
// as one modern Cool Electric set. Mirrors the soft nav tints in index.css and
// extends them to gratitude/journal.
export type Activity = 'meditate' | 'breathe' | 'gratitude' | 'journal' | 'custom'

export const ACTIVITY_COLORS: Record<Activity, string> = {
  meditate: '#6a5cff', // electric indigo (the hero accent)
  breathe: '#06b6d4', // cyan
  gratitude: '#f59e0b', // amber — the warm pop in a cool set
  journal: '#3b82f6', // blue
  custom: '#ec4899', // pink — user-defined habits
}

// The single source of truth for how an activity reads: icon + label + colour.
// (Colour mirrors ACTIVITY_COLORS so the two never drift.) Pages that need a
// context-specific label — e.g. "Write gratitude" on the goals form — override
// the label locally; the icon/colour stay shared. `icon` is a lucide line-icon
// component (consistent line icons app-wide, no system emoji) — render it sized
// to context with strokeWidth={1.75}; it inherits `color` as its stroke.
export type ActivityIcon = ComponentType<LucideProps>
export const ACTIVITY_META: Record<Activity, { icon: ActivityIcon; label: string; color: string }> = {
  meditate: { icon: Brain, label: 'Meditate', color: ACTIVITY_COLORS.meditate },
  breathe: { icon: Wind, label: 'Breathe', color: ACTIVITY_COLORS.breathe },
  gratitude: { icon: HandHeart, label: 'Gratitude', color: ACTIVITY_COLORS.gratitude },
  journal: { icon: NotebookPen, label: 'Journal', color: ACTIVITY_COLORS.journal },
  custom: { icon: Star, label: 'Custom', color: ACTIVITY_COLORS.custom },
}

// Meditation session types — same cool-leaning palette used by the session-log cards.
export const TYPE_COLORS: Record<MeditationType, string> = {
  mindfulness: '#6a5cff', // electric indigo
  body_scan: '#8b5cf6', // violet
  walking: '#10b981', // emerald
  loving_kindness: '#ec4899', // pink
  resonance_breathing: '#06b6d4', // cyan
  energizing_breathing: '#f59e0b', // amber
  other: '#94a3b8', // cool slate-grey
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

// Journal moods, grouped loosely by sentiment — a cool-leaning, vivid Cool Electric
// set. Pleasant moods read bright; neutral is a cool slate; harder moods take cooler,
// quieter tones. Tuned so no two are confusable.
export const MOOD_COLORS: Record<Mood, string> = {
  calm: '#06b6d4',     // cyan — still water
  content: '#10b981',  // emerald
  focused: '#6a5cff',  // electric indigo
  energized: '#f59e0b', // amber — the warm pop
  grateful: '#ec4899',  // pink
  hopeful: '#22c55e',   // green — forward-looking
  excited: '#f97316',   // orange — bright, upbeat
  peaceful: '#2dd4bf',  // teal — soft and still
  neutral: '#94a3b8',   // cool slate-grey
  restless: '#fb7185',  // coral-rose — restive warmth
  anxious: '#a855f7',   // purple — heavy but not alarming
  frustrated: '#f43f5e', // rose-red — hot but cool-toned
  overwhelmed: '#8b5cf6', // violet — heavy
  tired: '#64748b',     // muted slate — quiet
  low: '#475569',       // deep slate — grounded
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

// A rotating palette for charts not keyed to a known concept — Cool Electric,
// led by the electric indigo so charts open on the hero accent.
export const PALETTE = ['#6a5cff', '#06b6d4', '#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6']

// Gratitude has ~37 categories — too many to hand-map. Derive a stable colour for each
// from a curated palette by hashing the category key, so a given category is always the
// same colour and the log reads as a spread of colours rather than all one hue.
const GRATITUDE_PALETTE = [
  '#6a5cff', // electric indigo
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ec4899', // pink
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#22c55e', // green
]

export const gratitudeColor = (category: string): string => {
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0
  return GRATITUDE_PALETTE[h % GRATITUDE_PALETTE.length]
}

// A soft tinted background for a given accent — for pills/badges with coloured text.
export const tint = (color: string) => `color-mix(in srgb, ${color} 16%, white)`
