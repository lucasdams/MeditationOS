# Gamification Design — XP, Levels, Quests, Streaks

[← Back to README](../../README.md) · Related: [ADR-0009](../decisions/0009-gamification-computed-from-activity.md) · [data-model](data-model.md#design-notes)

The engagement layer that turns logged practice into progress. **Progress is
computed on read from `sessions` + `gratitude_entries` + `journals` — nothing about
progress is stored** (no XP column, no quest-status table). The one stored bit is the
user's quest **selection** (`users.quest_features`), a preference rather than progress.
See [ADR-0009](../decisions/0009-gamification-computed-from-activity.md) for the why.
All date bucketing is done in the **user's timezone** (`users.timezone`).

## XP

`xp` is the sum of, all computed in `dashboard_service.get_stats`:

| Source | Rule |
|--------|------|
| Meditation minutes | `(non-breathing seconds) // 60 × 2` (`MEDITATION_XP_PER_MIN`) |
| Breathing minutes | `(resonance-breathing seconds) // 60 × 3` (`BREATHING_XP_MULTIPLIER`) — the harder, signature practice |
| Gratitude moments | `+5` per entry (`GRATITUDE_XP`) |
| Journal entries | `+5` per entry (`JOURNAL_XP`) |
| Daily-activity bonus | `+15` per activity per day it happened (`QUEST_XP`) — see below |
| Streak bonus | `10 × current_streak_days` (`STREAK_BONUS_PER_DAY`) |

## Levels

A Pokémon-style rising curve (`_level_progress`): cumulative XP to **reach** level
`L` is `10·L·(L−1)`, so each level costs `20·L` more than the last — quick early
levels, slower later. Returns `(level, xp_into_level, xp_for_next_level)`. The
frontend mirrors the curve in `lib/level.ts` to animate the post-session reward
overlay (XP bar fill + tree growth + level-up fanfare). Tree tiers live in
`lib/tree.ts`.

## Daily quests

Quests are **personalized**: each user picks **at least 3** of the four daily
activities they want quests for (stored in `users.quest_features`; `NULL` until
chosen → a first-run picker, with all four as the working default). The four:

- **Meditate** — a meditation (non-breathing) session today
- **Breathe for a minute** — ≥ 60s of resonance breathing today (`BREATHE_QUEST_SECONDS`)
- **Write a gratitude** — a gratitude entry today
- **Write a journal entry** — a journal entry today

The dashboard shows the user's selected quests with today's done/todo status and a
live "resets in Xh Ym" countdown to the user's **local midnight**. Each is "did you
do X **today**?", computed from the count of **distinct local days** the user did
each action.

The `+15` **daily-activity bonus** in the XP table is keyed to those same four
activity-day counts (meditate / breathe / gratitude / journal days), so it **only
ever grows** (past days are fixed) and is independent of which quests the user
surfaced — doing the activity earns it. No quest-status table is needed; only the
selection is stored.

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
