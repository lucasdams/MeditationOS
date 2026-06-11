export interface User {
  id: string
  email: string
  username: string | null
  timezone: string
  created_at: string
}

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

export interface ActivityCalendar {
  start: string
  end: string
  days: DailyTotal[] // sparse — only days with practice
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
  stage: number // 0 .. stage_count - 1
  stage_count: number
  progress: number // 0.0 .. 1.0
}

export interface SanctuaryScene {
  current: PlantState
  completed: PlantState[]
}

export interface BreathingPattern {
  id: string
  name: string
  inhale_seconds: number
  exhale_seconds: number
  is_preset: boolean
  breaths_per_minute: number
}
