# Meditation Journal

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md)

A written reflection practice. The heart of a "data-first, not guided-audio"
meditation product: capture what came up, optionally tie it to the session it
followed, and tag a mood — so the data can later surface patterns (V2 analytics).

## Model

One table, `journals` (see [data-model](data-model.md)):

- `body` — free text, the reflection itself (required).
- `mood` — optional tag from a **fixed palette** (`calm`, `content`, `focused`,
  `energized`, `grateful`, `neutral`, `restless`, `anxious`, `tired`, `low`),
  constrained by a CHECK so entries stay filterable — same approach as gratitude
  categories. Source of truth: `app/models/journal.py` `MOODS`.
- `session_id` — optional FK to a session, `ON DELETE SET NULL` so deleting the
  session keeps the reflection. Validated to belong to the caller on write.

## API

Full CRUD under `/api/v1/journals`, all scoped to the user (see [api-v1](api-v1.md)):
create / list (newest first, `?mood=` filter) / get / patch / delete. Unowned IDs —
including a linked session that isn't yours — return `404`, never `403`.

## Frontend

`/journal` page: a compose box (reflection + optional mood + optional "reflecting on"
a recent session) and a reverse-chronological list with delete. Each entry shows its
**linked session** (type + when) underneath when one is set — resolved client-side
from the user's session list (a non-null `session_id` always exists, since deleting a
session sets it NULL). Loading / error / empty states per the frontend rules.

## Deliberately deferred

- **XP for journaling.** Gratitude awards XP; journaling doesn't yet. Kept out to
  avoid touching the gamification engine in the same change — easy to add later.
- **Search / full-text** over reflections.
- **Mood trends** and journal-pattern analysis — V2 analytics / V3 AI.
- **Prompted journaling** (suggested reflection questions), akin to gratitude
  suggestions.
