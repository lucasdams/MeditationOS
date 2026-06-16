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
| Meditation minutes | `(non-breathing seconds) // 60 × 2` (`MEDITATION_XP_PER_MIN`) — per *minute*, so a sub-minute "sit" earns 0 |
| Breathing minutes | `(resonance-breathing seconds) // 60 × 3` (`BREATHING_XP_MULTIPLIER`) — the harder, signature practice |
| Gratitude moments | `+5` per entry (`GRATITUDE_XP`), **only the first `GRATITUDE_XP_DAILY_CAP` (5) entries each day** |
| Journal entries | `+5` per entry (`JOURNAL_XP`), **only the first `JOURNAL_XP_DAILY_CAP` (5) entries each day** |
| Daily-quest bonus | the day's rotating quest XP (varies by variant, `+10`…`+35`) for each category whose quest was completed that day — see below |
| Streak bonus | `10 × current_streak_days` (`STREAK_BONUS_PER_DAY`) |

**Anti-spam.** XP rewards genuine practice, not volume: meditation pays per whole minute
(so spamming 1-second sits earns nothing, and the *meditate* quest needs
`MEDITATE_QUEST_SECONDS` = 60s on the day), and gratitude/journal XP is capped to the
first few entries per local day (the entries still save — they just stop paying). The
displayed gratitude/journal totals stay uncapped. A day also only counts as practice for
**streaks and the activity heatmap** once its total session time reaches
`MIN_PRACTICE_SECONDS` = 60s, so daily 1-second sits can't prop up a streak or light the
calendar (the weekly bars still show the real, uncapped seconds).

## Levels

A Pokémon-style rising curve (`_level_progress`): cumulative XP to **reach** level
`L` is `10·L·(L−1)`, so each level costs `20·L` more than the last — quick early
levels, slower later. Returns `(level, xp_into_level, xp_for_next_level)`. The
frontend mirrors the curve in `lib/level.ts` to animate the post-session reward
overlay (XP bar fill + level-up fanfare). The level is displayed as a neutral
**level badge** (◆ + number, `LevelCard.tsx`), decoupled from any tree metaphor —
it also shows the **coins earned** to date and the **next Sanctuary item** the
current level will unlock. XP rewards are **itemized** on the post-session overlay
so the user sees exactly what they earned and why.

**Front-loaded per-session XP curve:** longer sits earn more per minute via a
concave curve, so sustained practice is rewarded more than many short sits. The
coin accrual rate follows the same curve, which informed the `COINS_PER_LEVEL = 80`
retune in [ADR-0016](../decisions/0016-sanctuary-shop-expansion-and-retune.md).

## Daily quests

Quests are **personalized**: each user picks **at least 3** of the four daily
activity **categories** they want quests for (stored in `users.quest_features`;
`NULL` until chosen → a first-run picker, with all four as the working default):
**meditate · breathe · gratitude · journal**.

Within each category the **specific quest rotates by the date** from a pool of
variants with **varied XP by effort** (`app/services/quest_pool.py`, `quest_for`),
so the same category offers, e.g., *"Meditate today"* (+15) one day and *"Sit 10+
minutes"* (+30) the next. The pool today:

| Category | Variants (rotating) — XP |
|----------|--------------------------|
| meditate | Meditate today `+15` · Sit 10+ min in one session `+30` · Meditate twice today `+25` |
| breathe | Breathe for a minute `+20` · Breathe 5+ minutes `+30` · Breathe slow, ≤5 bpm `+35` |
| gratitude | Write a gratitude `+10` · Write three gratitudes `+25` |
| journal | Write a journal entry `+20` · Journal with a mood `+25` |

The rotation is a pure function of `(category, date)` — nothing stored — staggered
per category so they don't all advance in lockstep. **At most `DAILY_QUEST_LIMIT` (3)
quests surface on any one day** (`quest_pool.categories_for_day`): a user opted into all
four still sees three, via a date-rotating window over the selected categories, so each
one appears regularly without crowding a single day. The dashboard shows those with
**today's** surfaced quest (label + XP + done) and a live "resets in Xh Ym" countdown to
the user's **local midnight**. `QuestStatus.key` stays the category (so the frontend
keeps its icon/link/colour mapping); the `variant` field names the specific quest.

The **daily-quest bonus** in the XP table awards the surfaced quest's XP for each day
its condition was met, summed over all activity days across **all four** categories
(earning is independent of which quests the user surfaced). Because each past day's
quest is fixed by its date, the bonus **only ever grows** — no quest-status table is
needed; only the category selection is stored.

## Streaks

Current and longest streaks are derived from the distinct local dates with a session
(`_compute_streaks`): **longest** = the longest run of consecutive days ever (and at
least the current streak); **current** = the run ending today *or yesterday* (a grace
window — you have until end of day to keep it).

**Rest day (streak insurance).** The current streak tolerates **one skipped day**
(`REST_DAYS_PER_STREAK`): a single-day gap is bridged so a missed day doesn't reset
progress — wellness should nudge, not shame. Two missed days in a row still ends it.
It's computed (nothing stored); `rest_day_used` on `/dashboard/stats` tells the UI
when the streak is currently leaning on its rest day (shown as a 🛡️ badge). The **streak bonus rides the current streak**, so XP grows as
you keep it up and falls back when it lapses (a deliberate "live" feeling — see
[ADR-0009 trade-offs](../decisions/0009-gamification-computed-from-activity.md)).

## Why computed, not stored

Storing XP/quest state invites drift and migration pain (every rule change needs a
backfill). Computing from the immutable activity log keeps every number correct by
construction and lets us re-tune rules (the 3× breathing weight, quest XP, streak
bonus) with a one-line change — no data migration. The cost is a slightly heavier
`get_stats` query; if it ever gets hot, a cache with a documented recompute path is
the escape hatch (same stance as streaks in [data-model](data-model.md#design-notes)).
