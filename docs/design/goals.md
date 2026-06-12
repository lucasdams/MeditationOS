# Goals

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md) · [ADR-0009](../decisions/0009-gamification-computed-from-activity.md)

Recurring practice **habits** — the motivation primitive alongside streaks and XP.
You pick an activity and how often (e.g. "journal once a day", "breathe 3 times a
week"); the app shows how you're tracking against it this period.

## Intent stored, progress computed

A `goals` row holds only **intent**: an `activity`, a cadence (`count` × `period`),
and a lifecycle `status` (`active` / `archived`). Everything about *how you're doing* —

- `done` — how many times you did the activity this period,
- `progress` — 0–1, capped,
- `achieved` — whether `done >= count` this period —

is **computed on read** from your own activity, never stored. Same reasoning as
streaks and XP ([ADR-0009](../decisions/0009-gamification-computed-from-activity.md)):
no denormalized progress to drift, and re-tuning what counts is a one-line change.
There's no stored `completed` — achievement is derived per period, so a goal is simply
active or archived.

## Activities and periods

| `activity` | counts… |
|------------|---------|
| `meditate` | any logged session |
| `breathe` | resonance-breathing sessions |
| `gratitude` | gratitude entries |
| `journal` | journal entries |

`period` is `day` (today, in the user's local timezone) or `week` (a rolling 7-day
window ending today). Sessions are counted by their local `occurred_at` day; gratitude
and journal entries by their local `created_at` day — consistent with streaks and the
dashboard.

## API & frontend

Full CRUD under `/api/v1/goals`, user-scoped (see [api-v1](api-v1.md)); `GET` accepts a
`?status=` filter and returns the computed fields. The `/goals` page is a two-step
picker — **activity** ("Meditate / Breathe / Write gratitude / Journal") and **cadence**
(a preset like "Once a day" / "3× a week") — no numbers to type. Each goal shows a
progress bar, a "done this period" count, and a "✓ Done" badge, with archive /
reactivate / delete.

## Deliberately deferred

- **Goal-met celebration / notification** (the email channel could announce it).
- **Custom cadences** beyond the presets, and calendar-aligned weeks.
- **History** of met goals over time (today: archive).
