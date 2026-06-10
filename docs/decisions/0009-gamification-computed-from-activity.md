# ADR-0009: Gamification computed from activity, not stored

**Status:** Accepted · 2026-06 · Detail: [gamification design](../design/gamification.md)

## Context

The product layers engagement mechanics on top of logged practice: **XP, levels, a
growing tree, daily quests, and streaks**. The core question is *where this state
lives* — materialized columns/tables updated on each action, or derived on read from
the activity that already exists (`sessions`, `gratitude_entries`).

## Decision

**Compute all of it on read** in `dashboard_service`, storing nothing extra:

- **XP** = practice minutes (resonance breathing ×3) + 5/gratitude + daily-quest
  bonuses + a streak bonus. **Levels** from a rising curve (`10·L·(L−1)` cumulative).
- **Daily quests** (write a gratitude · breathe a minute · log a session) are
  evaluated as "done **today**?", and the XP they grant is the count of **distinct
  days each was ever completed** — so total XP only grows while today's status resets
  at local midnight, with **no quest-state table**.
- **Streaks** are derived from distinct practice dates (already the case pre-quests).
- All date bucketing uses the **user's timezone** (Postgres `timezone(tz, …)`), so
  the "day" is the user's local day.

## Consequences

- **Correct by construction.** No XP/streak/quest counter to drift or desync; the
  activity log is the single source of truth.
- **Cheap to re-tune.** The 3× breathing weight, quest XP, and streak bonus are
  constants — changing them needs *no migration or backfill*, and applies
  retroactively (a feature: past practice is re-valued consistently).
- **Monotonic where it should be.** Quest XP is keyed on past days, so it never drops.
  The **streak bonus rides the *current* streak by choice**, so total XP *can* dip
  after a lapsed streak — accepted because it makes the streak feel alive (the
  alternative, a longest-streak bonus, is monotonic but less motivating).
- **Cost:** a heavier `get_stats` query (several small aggregates). Acceptable at V1
  scale; the escape hatch is a cache with a documented recompute path.

## Alternatives considered

- **Materialized XP / quest tables** updated on each write — the "obvious" approach;
  rejected for V1 because it doubles the write paths, invites drift, and turns every
  rule tweak into a data migration. Revisit only if the computed query becomes hot.
- **Event-sourced XP ledger** (append an XP row per award) — robust and auditable,
  but heavier than this scale needs; the activity log already *is* the event source.
