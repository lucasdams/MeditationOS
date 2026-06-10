# Gamification Design — XP, Levels, Quests, Streaks

[← Back to README](../../README.md) · Related: [ADR-0009](../decisions/0009-gamification-computed-from-activity.md) · [data-model](data-model.md#design-notes)

The engagement layer that turns logged practice into progress. **Everything here is
computed on read from `sessions` + `gratitude_entries` — nothing is stored** (no XP
column, no quest table). See [ADR-0009](../decisions/0009-gamification-computed-from-activity.md)
for the why. All date bucketing is done in the **user's timezone** (`users.timezone`).

## XP

`xp` is the sum of, all computed in `dashboard_service.get_stats`:

| Source | Rule |
|--------|------|
| Practice minutes | `total_seconds // 60`, but **resonance breathing counts 3×** |
| Gratitude moments | `+5` per entry (`GRATITUDE_XP`) |
| Daily quests | `+15` per quest per day it was completed (`QUEST_XP`) — see below |
| Streak bonus | `10 × current_streak_days` (`STREAK_BONUS_PER_DAY`) |

## Levels

A Pokémon-style rising curve (`_level_progress`): cumulative XP to **reach** level
`L` is `10·L·(L−1)`, so each level costs `20·L` more than the last — quick early
levels, slower later. Returns `(level, xp_into_level, xp_for_next_level)`. The
frontend mirrors the curve in `lib/level.ts` to animate the post-session reward
overlay (XP bar fill + tree growth + level-up fanfare). Tree tiers live in
`lib/tree.ts`.

## Daily quests

Three quests, shown on the dashboard with today's done/todo status and a live
"resets in Xh Ym" countdown to the user's **local midnight**:

- **Write a gratitude** — a gratitude entry today
- **Breathe for a minute** — ≥ 60s of resonance breathing today (`BREATHE_QUEST_SECONDS`)
- **Log a session** — any session today

Each is "did you do X **today**?" Completion is computed from the count of **distinct
local days** the user did each action, so the total quest XP **only ever grows**
(past days are fixed) while today's status resets at local midnight. No quest-state
table is needed.

## Streaks

Current and longest streaks are derived from the distinct local dates with a session
(`_compute_streaks`): **longest** = the longest run of consecutive days ever;
**current** = the run ending today *or yesterday* (a grace window — you have until
end of day to keep it). The **streak bonus rides the current streak**, so XP grows as
you keep it up and falls back when it lapses (a deliberate "live" feeling — see
[ADR-0009 trade-offs](../decisions/0009-gamification-computed-from-activity.md)).

## Why computed, not stored

Storing XP/quest state invites drift and migration pain (every rule change needs a
backfill). Computing from the immutable activity log keeps every number correct by
construction and lets us re-tune rules (the 3× breathing weight, quest XP, streak
bonus) with a one-line change — no data migration. The cost is a slightly heavier
`get_stats` query; if it ever gets hot, a cache with a documented recompute path is
the escape hatch (same stance as streaks in [data-model](data-model.md#design-notes)).
