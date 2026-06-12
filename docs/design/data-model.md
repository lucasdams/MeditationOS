# Data Model

[← Back to README](../../README.md) · Related: [ADR-0004 (UUID keys)](../decisions/0004-uuid-primary-keys.md)

Detailed schema for V1–V2. Conventions (UUID PKs, timestamps, indexing) live in [`.claude/rules/database.md`](../../.claude/rules/database.md); this doc is the concrete instance.

## Entity-relationship overview

```
                          ┌──────────────┐
                          │    users     │
                          └──────┬───────┘
                                 │ 1
   ┌──────────┬───────────┬──────┴──────┬───────────┬──────────┐
   │ N        │ N         │ N           │ N         │ N        │ N
┌──▼───────┐ ┌▼─────────┐ ┌▼──────────┐ ┌▼─────────┐ ┌▼───────┐ ┌▼───────┐
│ sessions │ │breathing_│ │gratitude_ │ │sanctuary_│ │journals│ │ goals  │
│          │ │patterns  │ │entries    │ │plantings │ │  (V2)  │ │  (V2)  │
└──┬───────┘ └──────────┘ └───────────┘ └──────────┘ └────────┘ └────────┘
   │ 0..1 (a session may reference the pattern it used)
   └────────────► breathing_patterns
```

All child tables carry `user_id` and are always queried scoped to the authenticated user.

## Tables

### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default `uuid4` |
| `email` | `citext` | UNIQUE, NOT NULL |
| `username` | `citext` | UNIQUE, NULL until the user picks one (public display name) |
| `password_hash` | text | NULL — null for Google-only accounts |
| `email_verified` | bool | NOT NULL, default `false` — confirmed via emailed link; Google sign-in arrives verified |
| `google_sub` | text | UNIQUE, NULL — Google's subject id, set when linked to Google |
| `timezone` | text | NOT NULL, default `UTC` — IANA zone for local-day streaks/quests |
| `reminder_enabled` | bool | NOT NULL, default `false` — opt-in daily practice reminder |
| `reminder_hour` | int | NULL — local hour (0–23) to send the reminder; NULL when disabled |
| `reminder_last_sent_at` | timestamptz | NULL — guards against sending more than once per local day |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| `updated_at` | timestamptz | NOT NULL, default `now()` |

- `email` uses `citext` so uniqueness is case-insensitive (`A@x.com` == `a@x.com`).
- `password_hash` never leaves the data layer — no Pydantic response schema exposes it. It is **nullable**: accounts created via "Sign in with Google" have no password (`authenticate()` rejects a password login against them). `google_sub` links a verified Google identity to the row.

### `sessions`

A logged meditation. Resonance-breathing sessions reuse this table via `type` + the optional breathing columns.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, `ON DELETE CASCADE`, NOT NULL |
| `type` | text | NOT NULL, CHECK in (`mindfulness`,`body_scan`,`resonance_breathing`,…) |
| `duration_seconds` | int | NOT NULL, CHECK > 0 |
| `occurred_at` | timestamptz | NOT NULL (when the session happened — date + time) |
| `notes` | text | NULL |
| `breathing_pattern_id` | UUID | FK → `breathing_patterns.id`, `ON DELETE SET NULL`, NULL |
| `inhale_seconds` | int | NULL, CHECK > 0 (set when `type = resonance_breathing`) |
| `exhale_seconds` | int | NULL, CHECK > 0 |
| `cycles_completed` | int | NULL, CHECK >= 0 |
| `created_at` | timestamptz | NOT NULL, default `now()` |

**Indexes:** `(user_id, occurred_at)` — every dashboard/streak query filters by user and time.

**Planned:** `visibility` (`public` / `private`, default `private`) so a user can share a session — deferred to the Social/Community phase (see [future-features](../future-features.md#practice--sessions)).

### `breathing_patterns`

Saved inhale/exhale presets. Built-in presets and user-created patterns share the table.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, `ON DELETE CASCADE`, NULL for global presets |
| `name` | text | NOT NULL |
| `inhale_seconds` | int | NOT NULL, CHECK between 1 and 60 |
| `exhale_seconds` | int | NOT NULL, CHECK between 1 and 60 |
| `is_preset` | bool | NOT NULL, default `false` |
| `created_at` | timestamptz | NOT NULL, default `now()` |

- `breaths_per_minute` is **derived, not stored**: `60 / (inhale_seconds + exhale_seconds)`. Storing it would risk drift; it's cheap to compute. (See [ADR note](#design-notes).)
- Global presets have `user_id = NULL` and `is_preset = true`.
- **Index:** `user_id`.

### `gratitude_entries`

A logged moment of gratitude. The user picks a fixed **category** and writes (or
accepts an AI-suggested) prompt as free `text`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, `ON DELETE CASCADE`, NOT NULL |
| `category` | text | NOT NULL, CHECK in 37 fixed values (`people`, `health`, `nature`, … `community`, `beauty`, plus `custom` for free-form moments — see `app/models/gratitude.py` `CATEGORIES`) |
| `text` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

**Index:** `(user_id, created_at)`.

- The **category taxonomy is fixed** (constrained by the CHECK) so entries stay filterable; the precise prompt is free text. The AI only generates *suggested* prompts within a category (never stored as the category).
- Each entry awards **+5 XP** (computed in `dashboard_service`, like practice minutes); gratitude does **not** affect the practice streak.

### `sanctuary_plantings`

The user's garden, stored as an **append-only ordered list of what they chose to grow**. Everything else — growth, completion, unlocks, vitality — is computed on read from practice activity (see [ADR-0010](../decisions/0010-sanctuary-cultivation.md) and the [Sanctuary design](sanctuary.md)).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, `ON DELETE CASCADE`, NOT NULL |
| `item_key` | text | NOT NULL — references the in-code `SANCTUARY_CATALOG` (`tree`, `flower`, `pond`, `hut`, `barn`, `bird`, `fox`); not a DB enum so the catalog can evolve without a migration |
| `position` | int | NOT NULL — order in the growth sequence (0, 1, 2, …) |
| `created_at` | timestamptz | NOT NULL, default `now()` |

**Constraint:** `UNIQUE(user_id, position)` — backstops a double-plant race. **Index:** `user_id`.

- **No wallet, no spend ledger, no balance** — just the sequence of choices. Grow cost, stage, completion, the next-unlocked options, and vitality are all derived in `sanctuary_service` from cumulative practice points (the same XP unit the dashboard computes) and the current streak.
- A new user's garden is seeded with a `tree` at `position = 0` on first read (no write until they plant their next item).

### `journals` (V2)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, CASCADE, NOT NULL |
| `session_id` | UUID | FK → `sessions.id`, `ON DELETE SET NULL`, NULL |
| `body` | text | NOT NULL |
| `mood` | text | NULL (tag) |
| `created_at` | timestamptz | NOT NULL, default `now()` |

**Index:** `(user_id, created_at)`.

### `goals` (V2)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, CASCADE, NOT NULL |
| `type` | text | NOT NULL, CHECK in (`daily_minutes`,`streak_days`,`total_hours`) |
| `target` | int | NOT NULL, CHECK > 0 |
| `status` | text | NOT NULL, default `active`, CHECK in (`active`,`completed`,`archived`) |
| `created_at` | timestamptz | NOT NULL, default `now()` |

## Design notes

**Streaks are computed, not stored.** The README sketches a `streaks` table, but a stored streak is a denormalization that can drift and needs careful invalidation. For V1 the current and longest streak are **derived from `sessions` by SQL** (group by the calendar date of `occurred_at` per user, find consecutive runs). If profiling later shows the dashboard query is hot, add a `user_streak_cache` row updated on session write — but only with a documented recompute path. Starting computed keeps correctness simple.

**Breathing data lives on `sessions`, not a separate table.** A resonance-breathing session *is* a meditation session with extra columns, so it shares streak/duration/aggregation logic for free rather than forcing a UNION across two tables.

**`ON DELETE` is explicit per relationship.** Child practice data cascades on user deletion (privacy: account deletion removes the user's data). `breathing_pattern_id` on a session uses `SET NULL` so deleting a saved pattern doesn't erase the history of sessions that used it.

## Future tables (V3+)

`friendships`, `groups`, `challenges`, `notifications`, and avatar/profile tables (`avatars`, `user_avatars`) for the cosmetic system described in [future-features](../future-features.md).
