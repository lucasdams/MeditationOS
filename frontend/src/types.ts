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

export interface MonthTotals {
  month_start: string // first day of the month (user's local month)
  minutes: number
  sessions: number
  days_practiced: number
}

export interface MonthComparison {
  this_month: MonthTotals
  last_month: MonthTotals
  minutes_delta: number // this − last (positive ⇒ more than last month)
  sessions_delta: number
  days_practiced_delta: number
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
  monthly_comparison: MonthComparison // this calendar month vs the previous
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

// --- Spirit (docs/design/spirit.md; ADR-0022/0023, 0027 skill tree, 0030 rebirth, 0031 never-mortal) ---
// The Spirit is a single living companion grown from practice. Its state is *maximally
// computed* on read: only the CHOSEN path, optional name, and owned cosmetics are stored;
// stage, bond, needs, and coins are all derived. ADR-0023 makes the `path` user-CHOSEN (set
// once via POST /spirit/choose, NULL until then) instead of auto-detected, and replaces the
// single `daily_glow` with three named `needs` plus an overall `condition` (the weakest need).

// The five evolution stages, derived from the user's level (a pure function of level —
// monotonic, never stored, never lost). The mote of light gains structure each stage.
export type SpiritStage = 'spark' | 'wisp' | 'fledgling' | 'ascendant' | 'radiant'

// The chosen creature/path. NULL until the user chooses one (POST /spirit/choose). Labelled in
// the UI as the Ayurvedic dosha (balanced by its OPPOSITE practice — see DOSHA in Spirit.tsx):
//   stillness → Kapha (earth + water) — breathwork keeps it nourished
//   breath    → Pitta (fire + water)  — gratitude & journaling keeps it nourished
//   heart     → Vata  (air + ether)   — meditation keeps it nourished
export type SpiritPath = 'stillness' | 'breath' | 'heart'

// A care-need tier, best → worst (ADR-0023). Drives the per-need pill + the overall condition.
// ADR-0031 floors needs at the `content` tier, so in practice only `thriving`/`content` are seen.
export type SpiritNeedTier = 'thriving' | 'content' | 'restless' | 'unwell'

// One gentle care need (ADR-0031) — a 0..1 meter that eases down over time but is FLOORED so it
// never empties or punishes. `factor` is a 0..1 vibrancy multiplier; practice fills it, tending
// tops it up; it can never reach 0 or read as alarming (the companion only ever roots for you).
export interface SpiritNeed {
  tier: SpiritNeedTier // thriving | content (floored — never restless/unwell in practice)
  factor: number // 0..1 (eases over time, floored; never empties)
}

// The active creature's three gentle needs (ADR-0031), each fed by a kind of practice + tending:
//   nourished — its signature practice (per the chosen path: breathwork / gratitude+journal / meditation)
//   rested    — any sit (a practice session of any kind)
//   joyful    — gratitude or journal entries
export interface SpiritNeeds {
  nourished: SpiritNeed
  rested: SpiritNeed
  joyful: SpiritNeed
}

// The three need KEYS (ADR-0026) — also the per-item `need` affinity on each cosmetic option.
export type SpiritNeedKey = keyof SpiritNeeds

// The overall care state = the weakest of the three needs (ADR-0023), so the UI can render one
// summary look (the glow/vibrancy) without inspecting each need. A calm, visual read-out only —
// floored like the needs, so it never reads as alarming (ADR-0031).
export interface SpiritCondition {
  tier: SpiritNeedTier // the weakest need's tier
  factor: number // its 0..1 vibrancy multiplier
}

// A friendly level read-out, surfaced as the spirit's "bond" with the practitioner. Since ADR-0030
// this is the SPIRIT-LEVEL — the spirit's OWN growth (earned XP since it was awakened) — which can
// DIFFER from the account/header level (a reborn spark starts at bond level 1).
export interface SpiritBond {
  level: number // the spirit-level: earned XP since awakened_at (ADR-0030; not the account level)
  xp_into_level: number // XP accumulated within the current level
  xp_for_next: number // XP needed to reach the next level
}

// One node in a cosmetic slot's skill tree, with its cost and current state (ADR-0027) —
// the calm "personalize" shape the Spirit panel uses. Mirrors backend SpiritSlotOption.
export interface SpiritSlotOption {
  option: string
  cost: number // coins to UNLOCK this option (equipping an owned option is free)
  unlock_level: number // the level this option unlocks at (1 = always)
  unlock_hint: string | null // what's needed to reach unlock_level (null when met)
  tier: number // the skill-tree tier (1|2|3): tier N>1 needs an owned tier N−1 in the same slot
  affordable: boolean // the current balance covers the unlock cost
  owned: boolean // the spirit owns this option (unlocked, or legacy-equipped)
  equipped: boolean // this option is the one currently shown in its slot
  unlockable: boolean // not owned AND path/level/tier prereqs met (affordability is separate)
  available: boolean // offered to the spirit's chosen path (per-path exclusivity; true = universal)
  exclusive: boolean // the chosen creature's OWN per-path SIGNATURE capstone (vs a universal option)
  need: SpiritNeedKey // the need this option FAVOURS (ADR-0026): nourished | rested | joyful
}

// A cosmetic axis for the active spirit — a small skill tree (ADR-0027). The slot reports its
// currently EQUIPPED option (or null) and is never "locked": owned options equip freely.
// Mirrors backend SpiritAvailableSlot.
export interface SpiritAvailableSlot {
  slot: string
  equipped: string | null // the option currently equipped in this slot (null if none)
  options: SpiritSlotOption[]
}

// A past spirit in the collection — a radiant companion graduated and set free when its successor
// was awakened, kept forever (the long-term replay loop). Mirrors backend RetiredSpirit. ADR-0031
// removed the death path, so every retired spirit is a radiant graduate.
export interface RetiredSpirit {
  id: string
  stage: SpiritStage // the stage it retired at (radiant — graduates only)
  path: SpiritPath | null // its committed path (stillness | breath | heart), or null
  name: string | null // its nickname, if it had one
  awakened_at: string // ISO birth moment
}

// The active spirit's SIGNATURE SET status (ADR-0028) — the endgame achievement of equipping every
// slot's path-exclusive capstone at once. Fully DERIVED from the equipped cosmetics + chosen path
// (no stored column); visual/advisory only. When `active`, the spirit earns "Signature radiance":
// a gentle harmony lift to every need. Mirrors backend SpiritSetBonus.
export interface SpiritSetBonus {
  active: boolean // the full signature set is equipped → the harmony lift is on
  kind: 'signature' | null // "signature" when active, else null
  count: number // signature slots currently equipped with their signature option
  total: number // signature slots that exist for the chosen path (7 chosen; 0 pathless)
  label: string // the user-facing bonus name ("Signature radiance")
}

// The active spirit's computed state, as returned by GET /api/v1/spirit. `available` (the
// cosmetics catalog with per-option state) and `collection` (retired spirits) are additive
// (steps 5 + 6); `set_bonus` (ADR-0028) is additive too; existing fields are unchanged.
export interface SpiritState {
  stage: SpiritStage // spark | wisp | fledgling | ascendant | radiant (function of level)
  path: SpiritPath | null // the CHOSEN creature; null until chosen via POST /spirit/choose
  name: string | null // the active spirit's nickname, if set (pre-fills / displays in the UI)
  bond: SpiritBond // level + XP-into-level + XP-for-next
  needs: SpiritNeeds // the three gentle needs (nourished / rested / joyful) — floored, never empty (ADR-0031)
  condition: SpiritCondition // overall care state = the weakest need (a calm visual read-out)
  coins: number // lifetime level × COINS_PER_LEVEL − coins_spent (stored spend ledger), clamped ≥ 0
  cosmetics: Record<string, string> // the EQUIPPED loadout {slot: option} (ADR-0027; empty = none)
  available: SpiritAvailableSlot[] // the cosmetics skill tree with per-option state
  collection: RetiredSpirit[] // past (retired) spirits, kept forever
  set_bonus: SpiritSetBonus // signature-set status (ADR-0028) — visual only
  awakened_at: string // ISO birth moment
}

// Which need a tend action tops up (ADR-0031): feed → nourished, rest → rested, play → joyful.
// The body sent to POST /spirit/tend — gentle, optional care (no survival stakes).
export type SpiritTendKind = 'feed' | 'rest' | 'play'

// One option in a path's read-only skill-tree PREVIEW (GET /spirit/preview) — the choose page's
// "what does this creature grow into" data. State-free (the spirit doesn't exist yet): just the
// catalog facts plus `exclusive` (this is the path's own per-path tier-3 capstone). Mirrors
// backend OptionPreview.
export interface SpiritOptionPreview {
  option: string
  tier: number // the skill-tree tier (1|2|3) — options are listed tier-ascending
  cost: number // coins to unlock it
  unlock_level: number // the level it unlocks at (1 = always)
  need: SpiritNeedKey // the need it favours (nourished | rested | joyful)
  exclusive: boolean // the path's OWN per-path capstone (its signature tier-3 option)
}

// One cosmetic slot in a path's preview — its options ordered by tier (ADR-0027). Mirrors
// backend SlotPreview. Only the options the path can ever own appear (universal + its own
// exclusives; other paths' exclusives are excluded).
export interface SpiritSlotPreview {
  slot: string
  options: SpiritOptionPreview[]
}

// The full preview returned by GET /spirit/preview — every choosable creature's tree keyed by
// path, so the choose page can fetch once and show what each one grows into.
export type SpiritPreview = Record<SpiritPath, SpiritSlotPreview[]>

// Choose the active creature + name it once (POST /spirit/choose). `path` is the internal
// enum value (the UI relabels it as the dosha); `name` is REQUIRED (ADR-0024) and immutable
// thereafter. Only settable while the spirit is pathless (re-choose → 409).
export interface SpiritChooseRequest {
  path: SpiritPath
  name: string
}

// Unlock a cosmetic option into the active spirit's owned collection + auto-equip it
// (POST /spirit/cosmetics, ADR-0027). Charges the option's cost; owned forever.
export interface SpiritUnlockRequest {
  slot: string
  option: string
}

// Equip an OWNED cosmetic option into its slot, or clear the slot (POST /spirit/cosmetics/equip,
// ADR-0027) — FREE. A null `option` clears the slot; a non-null one must be owned.
export interface SpiritEquipRequest {
  slot: string
  option: string | null
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

// A journaling nudge tuned to the user's recent practice (with a generic fallback).
export interface JournalPromptResponse {
  text: string
  context: string // stable machine key: after_breathing | streak_7 | generic | …
  contextual: boolean // false when we fell back to a generic prompt
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

// --- Paths (beginner-first revision §8) ---
// A Path is a short, multi-day guided course: static content (an ordered list of days, each
// prescribing one practice + on-screen guidance — no recorded audio). A day's completion is
// DERIVED server-side from real logged activity (ADR-0009), so the client only renders state.

// The practice a path day asks for; the client maps it to the matching feature route.
export type PathPractice = 'breathe' | 'meditate' | 'gratitude'

// A day's derived state. `current` is the lowest-index day not yet completed (the one to do
// next); `done` days are quietly checked; `locked` days are dimmed and not actionable.
export type PathDayStatus = 'done' | 'current' | 'locked'

export interface PathDay {
  index: number // 1-based day number ("Day 1")
  title: string
  practice: PathPractice
  min_minutes: number // the bar a logged session must clear to complete the day
  cue: string // the on-screen guidance line(s) for the day
  status: PathDayStatus
}

export interface PathSummary {
  id: string
  title: string
  blurb: string
  total_days: number
  enrolled: boolean
  started_on: string | null // ISO date the user enrolled; null when not enrolled
  current_day: number | null // 1-based index of the day to do next; null when not enrolled
  completed: boolean // every day done
  completed_days: number // how many days are derived done
  days: PathDay[]
}

export interface PathList {
  paths: PathSummary[]
}
