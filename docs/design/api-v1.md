# API Contract — V1

[← Back to README](../../README.md)

REST API under `/api/v1`. JSON in/out. Auth via httpOnly cookie (see [authentication](authentication.md)). All resource routes are scoped to the authenticated user.

**Status legend:** ✅ implemented · ⏳ planned. The full V1 surface — Auth (incl. Sign in with Google), Sessions, Breathing patterns, Dashboard (stats + activity), and Health — is built. This stays the living contract for V1.5+ additions.

## Conventions

- **Base path:** `/api/v1`
- **Auth:** `access_token` httpOnly cookie; protected routes return `401` without it.
- **IDs:** UUID strings.
- **Timestamps:** ISO-8601 UTC (`2026-06-09T14:00:00Z`).
- **Validation:** Pydantic; unexpected fields rejected with `422`.
- **Ownership:** other users' resource IDs return `404` (not `403`) to avoid enumeration.

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
| POST | `/auth/login` | — | `{ email, password }` | `200` user + sets cookie |
| POST | `/auth/google` | — | `{ credential }` | `200` user + sets cookie · `401` if invalid |
| POST | `/auth/logout` | ✓ | — | `204` |
| GET | `/auth/me` | ✓ | — | `200` current user |
| POST | `/auth/username` | ✓ | `{ username }` | `200` user · `409` if taken |

```
POST /api/v1/auth/register
{ "email": "user@example.com", "password": "correct horse battery" }
→ 201
{ "id": "…", "email": "user@example.com", "username": null, "created_at": "2026-06-09T14:00:00Z" }
```

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

`category` is a fixed taxonomy of 12 values (`people`, `health`, `nature`,
`experiences`, `growth`, `home`, `self`, `simple_pleasures`, `small_moments`,
`big_moments`, `spiritual`, `material`). **Suggestions** (10 per call) are generated
by Claude Haiku from the category alone (no user text is sent to the model) and fall
back to a randomized sample of a ~20-deep curated pool per category when
`ANTHROPIC_API_KEY` is unset or the call fails — so "show different ideas" stays fresh
either way; see
[ADR-0008](../decisions/0008-ai-suggestions-curated-fallback.md). Each saved entry
awards **+5 XP** (reflected in `/dashboard/stats`).

## Dashboard ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/dashboard/stats` | ✓ | Aggregates for the caller |
| GET | `/dashboard/activity` | ✓ | A year of daily totals for the activity heatmap |

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

`this_week` is the last 7 calendar days, zero-filled. **XP = minutes practiced**
(resonance breathing counts **3×**) **+ 5 per gratitude moment**; `level` follows a
rising curve (computed, not stored). Streaks are computed from
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

## Health ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | — | Liveness probe → `{ "status": "ok" }` (DB-readiness check planned) |

## Out of scope for V1

Journals, analytics, goals (V2), and all AI endpoints (V3). The contract above is the surface the V1 frontend codes against.
