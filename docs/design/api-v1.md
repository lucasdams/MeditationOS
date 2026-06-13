# API Contract — V1

[← Back to README](../../README.md)

REST API under `/api/v1`. JSON in/out. Auth via httpOnly cookie (see [authentication](authentication.md)). All resource routes are scoped to the authenticated user.

**Status legend:** ✅ implemented · ⏳ planned. The full V1 surface — Auth (incl. Sign in with Google), Sessions, Breathing patterns, Gratitude, Journals, Goals, Dashboard (stats + activity), Analytics, Sanctuary, and Health — is built. This stays the living contract for V1.5+ additions.

## Conventions

- **Base path:** `/api/v1`
- **Auth:** `access_token` httpOnly cookie; protected routes return `401` without it.
- **IDs:** UUID strings.
- **Timestamps:** ISO-8601 UTC (`2026-06-09T14:00:00Z`).
- **Validation:** Pydantic; unexpected fields rejected with `422`.
- **Ownership:** other users' resource IDs return `404` (not `403`) to avoid enumeration.
- **Pagination:** list endpoints (`/sessions`, `/gratitude`, `/journals`) take `limit`
  (default `50`, max `200`) + `offset`; the UI loads pages with a "Load more" control.
- **Abuse limits:** auth endpoints are IP rate-limited, with a per-email login
  throttle on top; creating a resource (session / gratitude / journal / goal) is
  capped per user per UTC day (`DAILY_CREATE_LIMIT`, default `200`) and per-IP per
  minute (`WRITE_RATE_LIMIT`). All over-limit cases return `429`.

### Error envelope

Errors return FastAPI's default shape:

```json
{ "detail": "Human-readable message" }
```

> _Planned:_ add a machine-readable `code` field (e.g. `"invalid_credentials"`) via a
> custom exception handler, so clients can branch on a stable value instead of prose.

| Status | When |
|--------|------|
| `400` | Malformed request |
| `401` | Missing/invalid/expired auth |
| `403` | Authenticated but not allowed |
| `404` | Not found, or not owned by caller |
| `409` | Conflict (e.g. duplicate email) |
| `422` | Validation failed (Pydantic field errors) |
| `429` | Rate limit exceeded |

## Auth ✅ implemented

| Method | Path | Auth | Body | Success |
|--------|------|------|------|---------|
| POST | `/auth/register` | — | `{ email, password }` | `201` user |
| POST | `/auth/guest` | — | — | `200` anonymous user + sets cookie; rate-limited |
| POST | `/auth/login` | — | `{ email, password }` | `200` user + sets cookie |
| POST | `/auth/claim` | ✓ | `{ email, password }` | `200` user · `400` if not a guest · `409` if email taken |
| POST | `/auth/google` | — | `{ credential }` | `200` user + sets cookie · `401` if invalid |
| POST | `/auth/logout` | ✓ | — | `204` |
| GET | `/auth/me` | ✓ | — | `200` current user |
| GET | `/auth/export` | ✓ | — | `200` — full JSON of the account's data (portability) |
| DELETE | `/auth/me` | ✓ | — | `204` — permanently deletes the account + all data, clears the cookie |
| POST | `/auth/username` | ✓ | `{ username }` | `200` user · `409` if taken |
| POST | `/auth/timezone` | ✓ | `{ timezone }` | `200` user · `422` if not a valid IANA zone |
| POST | `/auth/quest-features` | ✓ | `{ features: string[] }` | `200` user · `422` if any feature is unknown or fewer than 3 chosen |
| POST | `/auth/password` | ✓ | `{ current_password?, new_password }` | `200` user · `401` if current wrong |
| POST | `/auth/password/reset-request` | — | `{ email }` | `202` always (no enumeration); rate-limited |
| POST | `/auth/password/reset` | — | `{ token, new_password }` | `204` · `400` if token invalid/expired/used |
| POST | `/auth/verify-email` | — | `{ token }` | `204` · `400` if token invalid/expired |
| POST | `/auth/verify-email/resend` | ✓ | — | `202`; rate-limited |
| POST | `/auth/reminders` | ✓ | `{ enabled, hour? }` | `200` user · `422` if `enabled` without `hour` / `hour` out of 0–23 |

```
POST /api/v1/auth/register
{ "email": "user@example.com", "password": "correct horse battery" }
→ 201
{ "id": "…", "email": "user@example.com", "username": null, "created_at": "2026-06-09T14:00:00Z" }
```

**Your data.** `GET /auth/export` returns a portable JSON snapshot of everything the
account owns (profile minus the password hash, plus sessions, gratitude, journals,
goals, sanctuary). `DELETE /auth/me` permanently deletes the account; all user-owned
rows cascade via their foreign keys (global breathing presets are untouched), and the
session cookie is cleared. Both require auth.

**Use without signing up.** `POST /auth/guest` creates an **anonymous account**
(a synthetic email, an auto-assigned username, no password, `is_guest: true`,
`email_verified: true` so the fake address never prompts a verify banner) and signs
it in with the same cookie as login — so the whole app works immediately. Later,
`POST /auth/claim { email, password }` converts that guest **in place** (keeping all
its data) into a real account: it sets the email + password, flips `is_guest` to
false, and sends an email verification. `UserRead.is_guest` lets the client nudge
guests to claim. `/auth/guest` is rate-limited; `/auth/claim` requires the guest to
be logged in and `409`s on a taken email.

**Change password.** `POST /auth/password` changes the password for an
email/password account — `current_password` is verified first (`401` if wrong).
For a Google-only account (no password yet) `current_password` is omitted and the
call *sets* a first password, so the account can then also log in with email. The
`UserRead` response carries a `has_password` boolean (never the hash itself) so the
client knows whether to ask for the current password.

**Email verification.** Registration emails a confirmation link to
`{APP_BASE_URL}/verify-email?token=…`; `POST /auth/verify-email { token }` confirms it
(`204`, idempotent; `400` if invalid/expired). The token is a signed 24-hour JWT
carrying the user id and the address it was issued for. `UserRead.email_verified`
reflects the state, and `POST /auth/verify-email/resend` (authenticated, rate-limited)
sends a fresh link. Accounts created or linked through **Sign in with Google** arrive
already verified. Verification is **not enforced** for V1 — the app shows a reminder
banner rather than blocking unverified users.

**Forgot password.** `POST /auth/password/reset-request` always returns `202` — it
never reveals whether the email exists — and, only if the address belongs to a
password account, emails a link to `{APP_BASE_URL}/reset-password?token=…`. It's
rate-limited like login. The token is a **signed, short-lived (30 min) JWT** that
embeds a fingerprint of the user's current password hash, which makes it
**single-use**: completing the reset (or any password change) changes the hash, so
outstanding links stop working. `POST /auth/password/reset { token, new_password }`
verifies the token and sets the new password (`400` if invalid/expired/used). No new
table — the token carries its own state. Google-only accounts have no password to
reset and are silently skipped. See the [notifications design](notifications.md).

**Daily reminders.** `POST /auth/reminders` opts into (or out of) a daily practice
reminder email. `hour` is the **local** hour (0–23) to send at; it's required when
`enabled` is true and dropped when disabling. The `UserRead` response carries
`reminder_enabled` and `reminder_hour`. Delivery happens out-of-band: a scheduler
runs `python -m app.jobs.send_reminders`, which emails every opted-in user once per
local day, at/after their hour, **skipping anyone who already practiced that day**.
With no SMTP provider configured the email is logged rather than sent, so the loop
works locally. See the [notifications design](notifications.md).

**Sign in with Google.** `POST /auth/google` takes the ID token (`credential`)
from Google Identity Services. The backend verifies it against Google's keys
(audience = `GOOGLE_CLIENT_ID`, issuer, expiry; via `google-auth`), then resolves
the account: an existing Google-linked account → a same-email account (linked,
since Google verified the email) → otherwise a new passwordless account. On
success it sets the **same httpOnly session cookie** as password login. Rate-limited
like `/login`. Requires `GOOGLE_CLIENT_ID` to be configured (else `401`).

## Sessions ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/sessions` | ✓ | Log a session |
| GET | `/sessions` | ✓ | List caller's sessions; `?from=&to=&type=` filters, paginated |
| GET | `/sessions/{id}` | ✓ | `404` if not owned |
| PATCH | `/sessions/{id}` | ✓ | Edit notes/fields |
| DELETE | `/sessions/{id}` | ✓ | `204` |

```
POST /api/v1/sessions
{
  "type": "resonance_breathing",
  "duration_seconds": 600,
  "occurred_at": "2026-06-09T07:30:00",
  "inhale_seconds": 5,
  "exhale_seconds": 5,
  "cycles_completed": 60,
  "notes": "calm"
}
→ 201
{ "id": "…", "type": "resonance_breathing", "duration_seconds": 600,
  "breaths_per_minute": 6, "occurred_at": "2026-06-09T07:30:00", "created_at": "…" }
```

`breaths_per_minute` is computed in the response, never stored.

## Breathing patterns ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/breathing-patterns` | ✓ | Global presets + caller's custom patterns |
| POST | `/breathing-patterns` | ✓ | Save a custom pattern |
| DELETE | `/breathing-patterns/{id}` | ✓ | Only caller's own; presets are read-only |

```
GET /api/v1/breathing-patterns
→ 200
[
  { "id": "…", "name": "Easy", "inhale_seconds": 4, "exhale_seconds": 6,
    "breaths_per_minute": 6, "is_preset": true },
  { "id": "…", "name": "My slow", "inhale_seconds": 15, "exhale_seconds": 5,
    "breaths_per_minute": 3, "is_preset": false }
]
```

## Gratitude ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/gratitude` | ✓ | Log a moment `{ category, text }` → `201` |
| GET | `/gratitude` | ✓ | Caller's entries, newest first; `?category=` filter, paginated |
| GET | `/gratitude/suggestions` | ✓ | `?category=…` → AI-suggested prompts (rate-limited) |
| DELETE | `/gratitude/{id}` | ✓ | `204`; `404` if not owned |

```
GET /api/v1/gratitude/suggestions?category=people
→ 200
{
  "category": "people",
  "options": [
    "A friend who checked in on me",
    "Someone who made me laugh"
  ]
}
```

`category` is a fixed taxonomy of **37 values** (`people`, `health`, `nature`, …
through `community`, `beauty`, plus `custom` for free-form moments — see
`app/models/gratitude.py`). **Suggestions** (10
per call) are generated by Claude Haiku from the category alone (no user text is sent
to the model) and fall back to a randomized sample of a **~90-deep curated pool**
per category (≈3,200 prompts total, in `app/services/ai/gratitude_fallback.json`)
when `ANTHROPIC_API_KEY` is unset or the call fails — so "show different ideas" stays
fresh either way; see
[ADR-0008](../decisions/0008-ai-suggestions-curated-fallback.md). Each saved entry
awards **+5 XP** (reflected in `/dashboard/stats`).

## Journals ✅ implemented

A written reflection, optionally tied to a session, with an optional mood tag.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/journals` | ✓ | Create `{ body, mood?, session_id? }` → `201`; `404` if a linked session isn't the caller's |
| GET | `/journals` | ✓ | Caller's reflections, newest first; `?mood=` filter, paginated |
| GET | `/journals/{id}` | ✓ | `404` if not owned |
| PATCH | `/journals/{id}` | ✓ | Edit `body` / `mood` |
| DELETE | `/journals/{id}` | ✓ | `204`; `404` if not owned |

```
POST /api/v1/journals
{ "body": "Felt calmer after sitting.", "mood": "calm", "session_id": "…" }
→ 201
{ "id": "…", "body": "Felt calmer after sitting.", "mood": "calm",
  "session_id": "…", "created_at": "…" }
```

`mood` is an optional value from a fixed palette (`calm`, `content`, `focused`,
`energized`, `grateful`, `neutral`, `restless`, `anxious`, `tired`, `low`); `body` is
free text. A linked session must belong to the caller (`404` otherwise), and uses
`ON DELETE SET NULL` so deleting the session keeps the reflection.

## Goals ✅ implemented

A recurring habit: do an **activity** a **count** of times per **period**. Only intent
is stored; **progress in the current period is computed on read**.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/goals` | ✓ | Create `{ activity, period, count }` → `201` |
| GET | `/goals` | ✓ | Caller's goals with this-period progress; `?status=active\|archived` filter |
| GET | `/goals/{id}` | ✓ | `404` if not owned |
| PATCH | `/goals/{id}` | ✓ | Edit `count` / `period`, or archive/reactivate via `status` |
| DELETE | `/goals/{id}` | ✓ | `204`; `404` if not owned |

```
POST /api/v1/goals
{ "activity": "journal", "period": "day", "count": 1 }
→ 201
{ "id": "…", "activity": "journal", "period": "day", "count": 1, "status": "active",
  "done": 0, "progress": 0.0, "achieved": false, "created_at": "…" }
```

`activity` ∈ `meditate` (any session) · `breathe` (resonance-breathing sessions) ·
`gratitude` · `journal`. `period` ∈ `day` (today) · `week` (a rolling 7-day window).
`count` is the target times per period (positive int). `status` is `active` or
`archived`. The response adds **computed** fields — `done` (times the activity
happened this period), `progress` (0–1, capped), and `achieved` (`done >= count`) —
counted from the user's own activity; nothing about progress is stored.

## Dashboard ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/dashboard/stats` | ✓ | Aggregates for the caller |
| GET | `/dashboard/activity` | ✓ | Daily totals for the activity heatmap; `?days=` windows it (default `365`, `1`–`366`; the web UI requests `35` ≈ last month) |

```
GET /api/v1/dashboard/stats
→ 200
{
  "total_seconds": 54000,
  "session_count": 42,
  "current_streak_days": 7,
  "longest_streak_days": 14,
  "xp": 900,
  "level": 7,
  "xp_into_level": 60,
  "xp_for_next_level": 140,
  "this_week": [
    { "date": "2026-06-03", "seconds": 600 },
    { "date": "2026-06-04", "seconds": 0 }
  ]
}
```

`this_week` is the last 7 calendar days, zero-filled. **XP = meditation minutes ×2 +
breathing minutes ×3 + 5 per gratitude moment + 5 per journal entry + daily-activity
bonuses + a streak bonus**; `level` follows a rising curve (computed, not stored).
`daily_quests` lists the user's **chosen** quests — at least 3 of `meditate` ·
`breathe` · `gratitude` · `journal` (set via `POST /auth/quest-features`; all four
until chosen) — each with `done` status. A `+15` bonus is awarded per activity per
day it happened, counted across all history so that part only grows.
`streak_bonus_xp` is **10 × your current streak** (grows as you keep the streak,
falls back if it lapses). See [gamification](gamification.md) for the full rules. Streaks, quests,
the heatmap, and the weekly view all bucket dates in the **user's timezone**
(`users.timezone`, auto-synced from the browser via `POST /auth/timezone`), so the
day rolls over at the user's **local midnight**. Streaks are computed from
`sessions` (see [data-model](data-model.md#design-notes)), not stored:
**current** = consecutive days ending today *or yesterday* (grace through end of
today); **longest** = the longest run ever.

```
GET /api/v1/dashboard/activity
→ 200
{
  "start": "2025-06-09",
  "end": "2026-06-09",
  "days": [
    { "date": "2026-06-08", "seconds": 1200 },
    { "date": "2026-06-09", "seconds": 600 }
  ]
}
```

`days` is **sparse** — only days with at least one session over the last 365 — so
the payload stays small; the frontend fills the `start`..`end` grid (GitHub-style
heatmap). Kept separate from `/stats` so the per-navigation stats call stays light.

## Analytics ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/analytics` | ✓ | Aggregated practice + journal insights for the caller |

```
GET /api/v1/analytics
→ 200
{
  "total_sessions": 42, "total_minutes": 540, "days_practiced": 30,
  "by_type": [{ "type": "mindfulness", "count": 30, "minutes": 360 }, …],
  "by_weekday": [{ "weekday": 0, "count": 4 }, …],          // 7, Sun→Sat, zero-filled
  "by_time_of_day": [{ "bucket": "morning", "count": 18 }, …], // 4, ordered
  "minutes_by_week": [{ "week_start": "2026-03-30", "minutes": 60 }, …], // last 12, oldest→newest
  "moods": [{ "mood": "calm", "count": 9 }, …]              // journal moods
}
```

All aggregates are computed by SQL, bucketed in the user's timezone (like the
dashboard), and read-only — no analytics tables. `by_type` covers every meditation
type; `by_weekday`/`by_time_of_day` bucket sessions by their local weekday/hour;
`minutes_by_week` is the last 12 Monday-aligned weeks; `moods` is the journal mood
distribution.

## Sanctuary ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/sanctuary` | ✓ | The caller's garden scene — ordered plantings with computed growth, plus the unlocked next-options |
| POST | `/sanctuary/plantings` | ✓ | Grow the next item `{ item_key }` → updated scene; `409` if locked or something is still growing |

```
GET /api/v1/sanctuary
→ 200
{
  "plantings": [
    { "item_key": "tree", "track": "nature", "position": 0,
      "stage": 4, "stage_count": 4, "progress": 1, "complete": true },
    { "item_key": "pond", "track": "nature", "position": 1,
      "stage": 0, "stage_count": 4, "progress": 0.13, "complete": false }
  ],
  "current_position": 1,
  "next_options": [
    { "item_key": "flower", "track": "nature", "unlocked": true },
    { "item_key": "fox", "track": "companion", "unlocked": false, "hint": "Keep a 3-day streak" }
  ],
  "vitality": "thriving",
  "current_streak": 3
}
```

```
POST /api/v1/sanctuary/plantings
{ "item_key": "flower" }
→ 201   (the updated scene, same shape as GET /sanctuary)
   · 404 if item_key is unknown
   · 409 if it isn't unlocked yet, or the current item is still growing
```

The garden is stored only as the **ordered sequence of plantings** (`sanctuary_plantings`,
see [data-model](data-model.md)); growth, completion, the offered next-options, and
`vitality` (`dormant` / `thriving` / `flourishing`) are all **computed on read** from
cumulative practice points and the current streak — no wallet or balance is stored.
`next_options` is surfaced only when the current item is fully grown; locked items carry
a `hint` describing the unlock requirement. See
[ADR-0010](../decisions/0010-sanctuary-cultivation.md) and the
[Sanctuary design](sanctuary.md).

## Health ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | — | Liveness probe → `{ "status": "ok" }` (DB-readiness check planned) |

## Out of scope for V1

Analytics (V2) and all AI endpoints (V3). The contract above is the surface the V1 frontend codes against. (Journaling and goals — both V2 headlines — shipped early; see the Journals and Goals sections above.)
