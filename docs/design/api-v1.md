# API Contract — V1

[← Back to README](../../README.md)

REST API under `/api/v1`. JSON in/out. Auth via httpOnly cookie (see [authentication](authentication.md)). All resource routes are scoped to the authenticated user.

**Status legend:** ✅ implemented · ⏳ planned. This is the V1 *contract* — Auth, Sessions, and Health are built; Dashboard and Breathing patterns are the surface upcoming cycles code against.

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
| POST | `/auth/logout` | ✓ | — | `204` |
| GET | `/auth/me` | ✓ | — | `200` current user |

```
POST /api/v1/auth/register
{ "email": "user@example.com", "password": "correct horse battery" }
→ 201
{ "id": "…", "email": "user@example.com", "created_at": "2026-06-09T14:00:00Z" }
```

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

## Breathing patterns ⏳ planned (Cycle 4)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/breathing-patterns` | ✓ | Global presets + caller's custom patterns |
| POST | `/breathing-patterns` | ✓ | Save a custom pattern |
| DELETE | `/breathing-patterns/{id}` | ✓ | Only caller's own; presets are read-only |

```
GET /api/v1/breathing-patterns
→ 200
[
  { "id": "…", "name": "6 bpm balanced", "inhale_seconds": 5, "exhale_seconds": 5,
    "breaths_per_minute": 6, "is_preset": true },
  { "id": "…", "name": "My slow", "inhale_seconds": 15, "exhale_seconds": 5,
    "breaths_per_minute": 3, "is_preset": false }
]
```

## Dashboard ⏳ planned (Cycle 3)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/dashboard/stats` | ✓ | Aggregates for the caller |

```
GET /api/v1/dashboard/stats
→ 200
{
  "total_seconds": 54000,
  "session_count": 42,
  "current_streak_days": 7,
  "longest_streak_days": 14,
  "this_week": [
    { "date": "2026-06-03", "seconds": 600 },
    { "date": "2026-06-04", "seconds": 0 }
  ]
}
```

Streak values are computed from `sessions` (see [data-model](data-model.md#design-notes)).

## Health ✅ implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | — | Liveness probe → `{ "status": "ok" }` (DB-readiness check planned) |

## Out of scope for V1

Journals, analytics, goals (V2), and all AI endpoints (V3). The contract above is the surface the V1 frontend codes against.
