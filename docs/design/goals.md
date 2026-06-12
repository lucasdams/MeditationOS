# Goals

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md) · [ADR-0009](../decisions/0009-gamification-computed-from-activity.md)

User-set practice targets — the motivation primitive that sits alongside streaks and
XP. You pick something to aim at; the app tracks how close you are.

## Intent stored, progress computed

A `goals` row holds only **intent**: a `type`, a `target`, and a lifecycle `status`
(`active` / `archived`). Everything about *how you're doing* —

- `current` — your value in the goal's unit,
- `progress` — 0–1, capped,
- `achieved` — whether `current` has reached `target` right now —

is **computed on read** from the same activity the dashboard aggregates, never stored.
Same reasoning as streaks and XP ([ADR-0009](../decisions/0009-gamification-computed-from-activity.md)):
no denormalized progress to drift, and re-tuning what counts is a one-line change.
That's also why there's no stored `completed` status — achievement is derived, so a
goal is simply active or archived.

## The three goal types

| `type` | `current` is… | achieved when |
|--------|---------------|---------------|
| `daily_minutes` | minutes practiced **today** (user's local day) | today's minutes ≥ target |
| `streak_days` | current practice streak | streak ≥ target |
| `total_hours` | lifetime hours practiced | total ≥ target |

All three are read straight off `dashboard_service.get_stats` (today's minutes from the
weekly breakdown, the current streak, and total seconds), so goals stay perfectly
consistent with the dashboard.

## API & frontend

Full CRUD under `/api/v1/goals`, user-scoped (see [api-v1](api-v1.md)); `GET` accepts a
`?status=` filter and returns the computed fields. The `/goals` page lets you add a goal
(type + target), shows each as a progress bar with an "achieved" badge, and supports
archive / reactivate / delete.

## Deliberately deferred

- **Goal-met celebration / notification** (the email channel could announce it).
- **Weekly/monthly target types** and custom date windows.
- **History** of completed goals over time (today: archive).
