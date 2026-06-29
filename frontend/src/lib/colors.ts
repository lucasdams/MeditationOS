// Shared colour coding, so the same concept reads the same colour everywhere
// (nav, quests, goals, session logs, analytics, journal moods).

import type { ComponentType } from 'react'
import { Brain, Wind, HandHeart, NotebookPen, Star, type LucideProps } from 'lucide-react'
import type { MeditationType, Mood } from '../types'

// The four core activities — all drawn from the Warm Sanctuary family so they
// read as one earthy set (no cool teal/sky/violet/indigo). Mirrors the soft nav
// tints in index.css and extends them to gratitude/journal.
export type Activity = 'meditate' | 'breathe' | 'gratitude' | 'journal' | 'custom'

export const ACTIVITY_COLORS: Record<Activity, string> = {
  meditate: '#3a7d6f', // warm teal-green
  breathe: '#3d8597', // dusty warm teal
  gratitude: '#d9a441', // amber-gold
  journal: '#9a6b9c', // warm mauve
  custom: '#c4744f', // clay — user-defined habits
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

// Bold, saturated fills for the dashboard quick-action tiles — distinct per destination
// and dark enough that white label/icon text clears WCAG AA (≥4.5:1) in LIGHT mode. Dark
// mode swaps to the brighter TILE_COLORS_DARK below (with a dark label) so the tiles pop on
// the slate canvas. These are deliberately heavier than the soft ACTIVITY_COLORS used for
// borders/quests, so the tiles read as the home screen's primary focal point.
//   Warm Sanctuary: earthy, harmonious fills, each still ≥4.5:1 vs white text.
export const TILE_COLORS = {
  meditate: '#517042', // deep sage
  breathe: '#3d7585', // deep dusty teal
  gratitude: '#b45309', // amber-700 (already warm, on-brand)
  journal: '#7d5a86', // deep warm mauve
} as const

// Dark-mode tile fills. The light TILE_COLORS are deep, near-700 shades that go muddy on the
// dark slate canvas, so dark mode uses brighter, more saturated ~500 shades that pop. At those
// brightnesses white text would drop below WCAG AA, so the dark tile carries a near-black slate
// LABEL instead (TILE_TEXT_DARK) — the .feature-tile dark CSS pairs the two via --tile-fill-dark.
//   Warm Sanctuary dark: lifted, warmer fills that pop on the espresso canvas (dark label).
export const TILE_COLORS_DARK = {
  meditate: '#93b27e', // sage
  breathe: '#82b3c6', // dusty teal
  gratitude: '#e3a83c', // warm amber
  journal: '#bd9fc9', // warm mauve
} as const

// The label/icon colour used on the brighter dark-mode tile fills (warm espresso).
export const TILE_TEXT_DARK = '#2a2119'

// Meditation session types — same warm palette used by the session-log cards.
export const TYPE_COLORS: Record<MeditationType, string> = {
  mindfulness: '#3a7d6f', // warm teal-green
  body_scan: '#9a6b9c', // warm mauve
  walking: '#d9a441', // amber-gold
  loving_kindness: '#bd6b6b', // dusty rose
  resonance_breathing: '#3d8597', // dusty warm teal
  energizing_breathing: '#c2410c', // terracotta
  other: '#a89a87', // warm taupe-grey
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

// Journal moods, grouped loosely by sentiment — all within the warm Sanctuary
// family. Pleasant moods stay bright/warm, neutral is a warm taupe, and harder
// moods take muted earthy tones (never alarm-red, never cool indigo).
export const MOOD_COLORS: Record<Mood, string> = {
  calm: '#3a7d6f',     // warm teal-green
  content: '#6f9460',  // sage
  focused: '#3d8597',  // dusty warm teal
  energized: '#d9a441', // amber-gold
  grateful: '#bd6b6b',  // dusty rose
  hopeful: '#8aab6a',   // light moss — forward-looking warmth
  excited: '#e0a83c',   // warm gold — bright, upbeat
  peaceful: '#7fb3a8',  // soft warm teal — soft and still
  neutral: '#a89a87',   // warm taupe
  restless: '#d97746',  // warm terracotta-orange
  anxious: '#9a6b9c',   // warm mauve — heavy but not alarming
  frustrated: '#a3866a', // muted walnut — earthy, not alarm-red
  overwhelmed: '#8d6a78', // dusty plum-mauve — heavy but warm
  tired: '#9b8c7a',     // dusty taupe
  low: '#7a6b5e',       // muted brown — quiet, grounded
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

// A rotating palette for charts not keyed to a known concept — all warm/earthy,
// led by clay so charts never open on a cool indigo.
export const PALETTE = ['#c4744f', '#3a7d6f', '#d9a441', '#bd6b6b', '#3d8597', '#9a6b9c', '#6f9460']

// Gratitude has ~37 categories — too many to hand-map. Derive a stable colour for each
// from a curated palette by hashing the category key, so a given category is always the
// same colour and the log reads as a spread of colours rather than all-amber.
const GRATITUDE_PALETTE = [
  '#d9a441', // amber-gold
  '#3a7d6f', // warm teal-green
  '#bd6b6b', // dusty rose
  '#9a6b9c', // warm mauve
  '#3d8597', // dusty warm teal
  '#6f9460', // sage
  '#d97746', // terracotta-orange
  '#c4744f', // clay
  '#8d6a78', // dusty plum
  '#b45309', // terracotta-brown
  '#7fb3a8', // soft warm teal
  '#8aab6a', // moss
]

export const gratitudeColor = (category: string): string => {
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0
  return GRATITUDE_PALETTE[h % GRATITUDE_PALETTE.length]
}

// A soft tinted background for a given accent — for pills/badges with coloured text.
export const tint = (color: string) => `color-mix(in srgb, ${color} 16%, white)`
