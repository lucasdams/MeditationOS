export interface User {
  id: string
  email: string
  username: string | null
  timezone: string
  has_password: boolean
  email_verified: boolean
  is_guest: boolean
  // Derived server-side from the ADMIN_EMAILS allowlist. Gates the /admin route + nav;
  // the backend still enforces admin access on every /admin/* endpoint.
  is_admin: boolean
  reminder_enabled: boolean
  reminder_hour: number | null
  // Independent opt-out for the evening streak-save nudge (defaults true). Only meaningful
  // when reminder_enabled is true — the nudge requires the daily reminder to be on.
  streak_save_enabled: boolean
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
  | 'energizing_breathing'
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
  intention: string | null // pre-session intention (≤ 140 chars)
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
  intention?: string | null
  // Client idempotency key so an auto-save (tab close) + manual save collapse to one row.
  client_token?: string
}

export interface DailyTotal {
  date: string
  seconds: number
}

export interface DailyQuest {
  key: string
  variant: string
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
  counts: Record<string, number> // mood -> count that week (check-ins + journal)
}

export interface WeekRatings {
  week_start: string
  calm: number | null // weekly average calm self-rating (1–5), null if none
  focus: number | null // weekly average focus self-rating (1–5), null if none
  rated_sessions: number // sessions with at least one rating that week
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
  ratings_by_week: WeekRatings[] // only weeks with rated sessions
}

export interface Insight {
  kind: string
  title: string
  detail: string
  basis: string
}

export interface InsightsResponse {
  insights: Insight[]
  needs_more_data: boolean
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

// --- Spirit (docs/design/spirit.md, ADR-0022, ADR-0023) ---------------------------------
// The Spirit is a single living companion grown from practice. Its state is *maximally
// computed* on read: only the CHOSEN path, optional name, and owned cosmetics are stored;
// stage, bond, needs, and coins are all derived. ADR-0023 makes the `path` user-CHOSEN (set
// once via POST /spirit/choose, NULL until then) instead of auto-detected, and replaces the
// single `daily_glow` with three named `needs` plus an overall `condition` (the weakest need).

// The five evolution stages, derived from the user's level (a pure function of level —
// monotonic, never stored, never lost). The mote of light gains structure each stage.
export type SpiritStage = 'spark' | 'wisp' | 'fledgling' | 'ascendant' | 'radiant'

// The chosen creature/path. NULL until the user chooses one (POST /spirit/choose). Labelled in
// the UI as the Ayurvedic dosha; the internal value is unchanged:
//   stillness → Kapha — a serene mini Buddha  (meditation keeps it nourished)
//   breath    → Pitta — an airy wind spirit   (resonance breathwork keeps it nourished)
//   heart     → Vata  — a blooming heart spirit (gratitude + journaling keeps it nourished)
export type SpiritPath = 'stillness' | 'breath' | 'heart'

// A care-need tier, best → worst (ADR-0023). Drives the per-need pill + the overall condition.
export type SpiritNeedTier = 'thriving' | 'content' | 'restless' | 'unwell'

// One tended need (ADR-0023) — a visual-only care signal over a rolling window. `factor` is a
// 0..1 vibrancy multiplier (concave). Advisory only; never reduces progress.
export interface SpiritNeed {
  tier: SpiritNeedTier // thriving | content | restless | unwell
  factor: number // 0..1 vibrancy multiplier (concave)
}

// The active creature's three tended needs (ADR-0023), replacing the single `daily_glow`:
//   nourished — its signature practice (the identity need; per the chosen path)
//   rested    — practice rhythm / consistency (recent active days + streak)
//   joyful    — practice variety (distinct practice types done recently)
export interface SpiritNeeds {
  nourished: SpiritNeed
  rested: SpiritNeed
  joyful: SpiritNeed
}

// The three need KEYS (ADR-0026) — also the per-item `need` affinity on each cosmetic option.
export type SpiritNeedKey = keyof SpiritNeeds

// The overall care state = the weakest of the three needs (ADR-0023), so the UI can render one
// summary look (the glow/vibrancy) without inspecting each need. Visual-only.
export interface SpiritCondition {
  tier: SpiritNeedTier // the weakest need's tier
  factor: number // its 0..1 vibrancy multiplier
}

// A friendly level read-out — the same level + XP-into-level the wallet basis exposes,
// surfaced as the spirit's "bond" with the practitioner.
export interface SpiritBond {
  level: number // the user's level (from earned XP — monotonic)
  xp_into_level: number // XP accumulated within the current level
  xp_for_next: number // XP needed to reach the next level
}

// One option inside a cosmetic slot, with its cost and current state — the same calm
// "personalize" shape the Sanctuary panel uses. Mirrors backend SpiritSlotOption.
export interface SpiritSlotOption {
  option: string
  cost: number // coins to apply this option
  unlocked: boolean // level requirement met
  unlock_hint: string | null // what's needed to unlock (null when unlocked)
  affordable: boolean // the current balance covers the FULL cost (ADR-0024: no swap math)
  applied: boolean // this option is the one currently on the spirit
  available: boolean // offered to the spirit's chosen path (per-path exclusivity; true = universal)
  need: SpiritNeedKey // the need this option FAVOURS (ADR-0026): nourished | rested | joyful
}

// A cosmetic axis for the active spirit: the options to mix and match. Once an option is
// applied the slot LOCKS (ADR-0024) until upgrades are reset. Mirrors backend
// SpiritAvailableSlot.
export interface SpiritAvailableSlot {
  slot: string
  applied: string | null // the option currently applied in this slot (null if none)
  locked: boolean // the slot has an applied option → its options can't be bought (ADR-0024)
  options: SpiritSlotOption[]
}

// A past spirit in the collection — a radiant companion retired when its successor was
// awakened, kept forever (the long-term replay loop). Mirrors backend RetiredSpirit.
export interface RetiredSpirit {
  id: string
  stage: SpiritStage // the stage it retired at (radiant, in practice)
  path: SpiritPath | null // its committed path (stillness | breath | heart), or null
  name: string | null // its nickname, if it had one
}

// The active spirit's computed state, as returned by GET /api/v1/spirit. `available` (the
// cosmetics catalog with per-option state) and `collection` (retired spirits) are additive
// (steps 5 + 6); existing fields are unchanged.
export interface SpiritState {
  stage: SpiritStage // spark | wisp | fledgling | ascendant | radiant (function of level)
  path: SpiritPath | null // the CHOSEN creature; null until chosen via POST /spirit/choose
  name: string | null // the active spirit's nickname, if set (pre-fills / displays in the UI)
  bond: SpiritBond // level + XP-into-level + XP-for-next
  needs: SpiritNeeds // the three tended needs (nourished / rested / joyful); visual-only
  condition: SpiritCondition // overall care state = the weakest need; visual-only (ADR-0023)
  coins: number // level × COINS_PER_LEVEL − Σ cosmetics spent, clamped ≥ 0
  cosmetics: Record<string, string> // owned {slot: option}
  available: SpiritAvailableSlot[] // the cosmetics catalog with per-option state
  collection: RetiredSpirit[] // past (retired) spirits, kept forever
}

// Choose the active creature + name it once (POST /spirit/choose). `path` is the internal
// enum value (the UI relabels it as the dosha); `name` is REQUIRED (ADR-0024) and immutable
// thereafter. Only settable while the spirit is pathless (re-choose → 409).
export interface SpiritChooseRequest {
  path: SpiritPath
  name: string
}

// Buy/apply a cosmetic option to a slot on the active spirit (POST /spirit/cosmetics). A slot
// is applied once and then locked (ADR-0024).
export interface SpiritCosmeticRequest {
  slot: string
  option: string
}

// Change the active spirit's name via a PAID reset (POST /spirit/reset-name). The name is
// otherwise immutable; `name` is required (blank/over-length → 422 server-side).
export interface SpiritResetNameRequest {
  name: string
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

// A biometric (heart-rate, optional HRV) reading — a personal wellness signal,
// NOT a medical measurement. Source-agnostic: manual/estimated now; camera and
// wearable plug in later without a shape change.
export type ReadingContext = 'pre' | 'post' | 'resting'
export type ReadingSource = 'manual' | 'estimated' | 'camera' | 'wearable'

export interface BiometricReading {
  id: string
  session_id: string | null
  context: ReadingContext
  bpm: number
  hrv_ms: number | null
  source: ReadingSource
  measured_at: string
  created_at: string
}

export interface BiometricReadingCreate {
  context: ReadingContext
  bpm: number
  hrv_ms?: number | null
  source?: ReadingSource
  measured_at: string
  session_id?: string | null
  // Client idempotency key so a rapid double-submit collapses to one row.
  client_token?: string
}

// Average pre→post change around sits, with the sample basis. Nulls until there
// are enough paired readings to say anything.
// sample_size: sessions with both pre+post BPM.
// hrv_sample_size: subset that also have HRV on both ends (may be smaller).
export interface BiometricDelta {
  sample_size: number
  hrv_sample_size: number
  avg_bpm_delta: number | null
  avg_hrv_ms_delta: number | null
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

// ── Admin metrics (aggregate, business-wide; counts/sums only) ───────────────
export interface DailyCount {
  day: string // ISO date
  count: number
}

// ── Admin user-management / support tooling ────────────────────────────────
// Account METADATA only — the backend never returns user content here.

export interface AdminUserSummary {
  id: string
  email: string
  username: string | null
  created_at: string
  email_verified: boolean
  is_guest: boolean
  is_admin: boolean
  is_disabled: boolean
}

export interface AdminUserCounts {
  sessions: number
  journals: number
  gratitude: number
  mood_logs: number
  goals: number
}

export interface AdminUserDetail extends AdminUserSummary {
  last_active_at: string | null
  counts: AdminUserCounts
}

export interface AdminUserList {
  users: AdminUserSummary[]
  total: number
}

export interface AuditEntry {
  id: string
  actor_user_id: string | null
  target_user_id: string | null
  action: string
  detail: Record<string, unknown> | null
  created_at: string
}

export interface AuditList {
  entries: AuditEntry[]
  total: number
}

export interface AdminMetrics {
  generated_at: string // ISO date the snapshot was computed (UTC)
  users: {
    total: number
    guests: number
    registered: number
    email_verified: number
    email_unverified: number
    with_active_streak: number
    signups_last_30_days: DailyCount[]
  }
  active_users: {
    dau: number
    wau: number
    mau: number
  }
  practice: {
    total_sessions: number
    total_minutes: number
  }
  content: {
    gratitude_entries: number
    journal_entries: number
    mood_logs: number
  }
  adoption: {
    goal_users: number
    reminder_users: number
    push_users: number
  }
}
