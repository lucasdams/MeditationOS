export interface User {
  id: string
  email: string
  username: string | null
  timezone: string
  has_password: boolean
  email_verified: boolean
  is_guest: boolean
  reminder_enabled: boolean
  reminder_hour: number | null
  // Daily-activity quests the user opted into (≥3 of QUEST_FEATURES). null until
  // they choose — the client shows a first-run picker while null.
  quest_features: string[] | null
  created_at: string
}

// The daily activities a user can receive quests for. Mirrors the backend
// QUEST_FEATURES / GOAL_ACTIVITIES vocabulary. Order is canonical (display order).
export const QUEST_FEATURES: { key: string; label: string }[] = [
  { key: 'meditate', label: 'Meditate' },
  { key: 'breathe', label: 'Breathe' },
  { key: 'gratitude', label: 'Gratitude' },
  { key: 'journal', label: 'Journal' },
]

// A user must pick at least this many features (kept in sync with the backend).
export const MIN_QUEST_FEATURES = 3

export type MeditationType =
  | 'mindfulness'
  | 'body_scan'
  | 'walking'
  | 'loving_kindness'
  | 'resonance_breathing'
  | 'other'

export interface Session {
  id: string
  type: MeditationType
  duration_seconds: number
  occurred_at: string
  notes: string | null
  focus: number | null // 1–5 self-rating
  calm: number | null // 1–5 self-rating
  inhale_seconds: number | null
  exhale_seconds: number | null
  cycles_completed: number | null
  breaths_per_minute: number | null
  created_at: string
}

export interface SessionCreate {
  type: MeditationType
  duration_seconds: number
  occurred_at: string
  notes?: string | null
  focus?: number | null
  calm?: number | null
  inhale_seconds?: number | null
  exhale_seconds?: number | null
  cycles_completed?: number | null
}

export interface DailyTotal {
  date: string
  seconds: number
}

export interface DailyQuest {
  key: string
  label: string
  xp: number
  done: boolean
}

export interface DashboardStats {
  total_seconds: number
  session_count: number
  current_streak_days: number
  longest_streak_days: number
  xp: number
  level: number
  xp_into_level: number
  xp_for_next_level: number
  this_week: DailyTotal[]
  gratitude_count: number
  streak_bonus_xp: number
  daily_quests: DailyQuest[]
}

export interface ActivityDay {
  date: string
  seconds: number
  all_quests: boolean // all three daily quests completed that day
}

export interface TypeBreakdown {
  type: string
  count: number
  minutes: number
}

export interface WeekdayCount {
  weekday: number // 0 = Sunday … 6 = Saturday
  count: number
}

export interface TimeBucketCount {
  bucket: string // morning | afternoon | evening | night
  count: number
}

export interface WeekMinutes {
  week_start: string
  minutes: number
}

export interface MoodCount {
  mood: string
  count: number
}

export interface WeekMoods {
  week_start: string
  counts: Record<string, number> // mood -> count that week
}

export interface AnalyticsSummary {
  total_sessions: number
  total_minutes: number
  days_practiced: number
  by_type: TypeBreakdown[]
  by_weekday: WeekdayCount[]
  by_time_of_day: TimeBucketCount[]
  minutes_by_week: WeekMinutes[]
  moods: MoodCount[]
  mood_by_week: WeekMoods[]
}

export interface ActivityCalendar {
  start: string
  end: string
  days: ActivityDay[] // sparse — only days with practice
}

export type GratitudeCategory =
  | 'people'
  | 'health'
  | 'nature'
  | 'experiences'
  | 'growth'
  | 'home'
  | 'self'
  | 'simple_pleasures'
  | 'small_moments'
  | 'big_moments'
  | 'spiritual'
  | 'material'
  | 'work'
  | 'food'
  | 'learning'
  | 'creativity'
  | 'kindness'
  | 'music'
  | 'animals'
  | 'travel'
  | 'friendship'
  | 'family'
  | 'love'
  | 'play'
  | 'memories'
  | 'hope'
  | 'body'
  | 'mind'
  | 'mornings'
  | 'evenings'
  | 'weather'
  | 'comfort'
  | 'freedom'
  | 'abundance'
  | 'community'
  | 'beauty'
  | 'custom'

export interface Gratitude {
  id: string
  category: GratitudeCategory
  text: string
  created_at: string
}

export interface GratitudeCreate {
  category: GratitudeCategory
  text: string
}

export interface GratitudeSuggestions {
  category: GratitudeCategory
  options: string[]
}

export interface PlantState {
  item_key: string
  track: string
  position: number
  stage: number // 0 .. stage_count - 1
  stage_count: number
  progress: number // 0.0 .. 1.0
  complete: boolean
}

export interface CatalogOption {
  item_key: string
  track: string
  unlocked: boolean
  hint: string | null // what's needed to unlock it (null when unlocked)
}

export type Vitality = 'dormant' | 'thriving' | 'flourishing'

export interface SanctuaryScene {
  plantings: PlantState[]
  current_position: number | null // the actively growing planting; null if all complete
  next_options: CatalogOption[]
  vitality: Vitality
  current_streak: number
}

export interface BreathingPattern {
  id: string
  name: string
  inhale_seconds: number
  exhale_seconds: number
  is_preset: boolean
  breaths_per_minute: number
}

export type Mood =
  | 'calm'
  | 'content'
  | 'focused'
  | 'energized'
  | 'grateful'
  | 'neutral'
  | 'restless'
  | 'anxious'
  | 'tired'
  | 'low'

export interface Journal {
  id: string
  body: string
  mood: Mood | null
  session_id: string | null
  created_at: string
}

export interface JournalCreate {
  body: string
  mood?: Mood | null
  session_id?: string | null
}

export interface MoodLog {
  id: string
  mood: Mood
  created_at: string
}

export type GoalActivity = 'meditate' | 'breathe' | 'gratitude' | 'journal' | 'custom'
export type GoalPeriod = 'day' | 'week' | 'total'
export type GoalStatus = 'active' | 'archived'

export interface Goal {
  id: string
  activity: GoalActivity
  label: string | null // habit name for custom goals; null for built-in activities
  period: GoalPeriod
  count: number // target times per period
  status: GoalStatus
  done: number // times done this period
  progress: number // 0.0 .. 1.0
  achieved: boolean
  checked_in_today: boolean // custom goals only — is today already marked done?
  created_at: string
}

export interface GoalCreate {
  activity: GoalActivity
  period: GoalPeriod
  count: number
  label?: string // required for custom goals only
}
