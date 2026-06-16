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
  weekly_summary_enabled: boolean
  weekly_summary_day: number | null
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
  // Client idempotency key so an auto-save (tab close) + manual save collapse to one row.
  client_token?: string
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
  progress: number
  target: number
}

export interface DashboardStats {
  total_seconds: number
  session_count: number
  current_streak_days: number
  longest_streak_days: number
  rest_day_used: boolean
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

// One option inside a customization slot, with its cost and current state.
export interface SlotOption {
  option: string
  cost: number
  unlocked: boolean
  unlock_hint: string | null
  affordable: boolean
  applied: boolean
}

// A customization axis for an owned item: the options to mix and match.
export interface AvailableSlot {
  slot: string
  applied: string | null // option currently applied (null if none)
  options: SlotOption[]
}

// An item the user owns, with its chosen variant and purchased customizations.
export interface OwnedItem {
  id: string
  item_key: string
  track: string
  position: number // immutable acquisition order (economy key — NOT the layout)
  cell: number // grid layout slot (row-major index); the user rearranges this freely
  variant: string | null // chosen base form (default when the item has variants)
  customizations: Record<string, string> // {slot: option} purchased
  available: AvailableSlot[] // slots/options still applicable, with hints
  // Optional cosmetic personalization (ADR-0015) — all default-off, never affect coins.
  name: string | null // user-chosen plaque/nickname (null = unnamed)
  note: string | null // short free-text caption/memory (null = none)
  favorite: boolean // pinned/favourited (subtle star)
}

// A base form selectable at purchase time.
export interface VariantOption {
  variant: string
  cost_delta: number // extra coins over the buy cost (0 = free)
  unlocked: boolean
  unlock_hint: string | null
}

// A buyable catalog item (locked ones carry a hint).
export interface ShopItem {
  item_key: string
  track: string
  cost: number
  unlocked: boolean
  hint: string | null
  variants: VariantOption[] // selectable base forms (empty for fixed-form items)
}

export type Vitality = 'dormant' | 'thriving' | 'flourishing'

export interface SanctuaryScene {
  coins: number // spendable balance
  level: number
  owned: OwnedItem[]
  shop: ShopItem[]
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
  | 'hopeful'
  | 'excited'
  | 'peaceful'
  | 'neutral'
  | 'restless'
  | 'anxious'
  | 'frustrated'
  | 'overwhelmed'
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

export interface ScheduledSession {
  id: string
  type: MeditationType
  scheduled_at: string
  duration_minutes: number | null
  note: string | null
  created_at: string
}

export interface ScheduledSessionCreate {
  type: MeditationType
  scheduled_at: string
  duration_minutes?: number | null
  note?: string | null
}

export interface WeeklyReview {
  start: string
  end: string
  minutes: number
  last_week_minutes: number
  sessions: number
  active_days: number
  current_streak_days: number
  longest_session_seconds: number
  top_mood: Mood | null
  mood_counts: Record<string, number>
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
