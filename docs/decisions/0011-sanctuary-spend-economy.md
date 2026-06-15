# ADR-0011: Sanctuary — a spend economy (coins, buy, upgrade)

**Status:** Accepted · 2026-06-15 · Supersedes [ADR-0010](0010-sanctuary-cultivation.md) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

[ADR-0010](0010-sanctuary-cultivation.md) chose *cultivation* — you grow one item at a
time by practicing, with no currency to bank or spend — explicitly to avoid a wallet and
spend ledger. In use, that loop felt thin: growth was a single bar, gratitude/journal
didn't visibly matter, and there was nothing to *choose* beyond "what grows next."

We decided to move to the shape 0010 rejected: a small **spend economy** where you earn
**coins** as you level up and spend them to **buy** items and **upgrade** them through
visual tiers (e.g., tree → flowering → old oak). This gives a richer loop — *earn →
choose → upgrade* — and naturally makes *all* activity matter (coins come from level,
which comes from all XP-earning activity, including gratitude and journal).

## Decision

- **Currency = coins, earned from level.** `coins_earned = level × COINS_PER_LEVEL`,
  where the level is computed from **earned XP** — total XP *minus the streak bonus*.
  Excluding the volatile streak bonus keeps coins **monotonic**: a lapsed streak never
  takes coins (or bought items) away. Balance = `coins_earned − coins_spent`.
- **Spent is derived from holdings, not a separate ledger.** The only stored state is
  *what you own* and each item's `tier` (`sanctuary_plantings.tier`). `coins_spent` =
  Σ over owned items of `buy_cost + Σ upgrade_costs up to its tier`. So the "ledger" is
  the holdings themselves — no wallet row, no transaction log.
- **Catalog in code.** `SANCTUARY_CATALOG` holds each item's `cost`, `unlock_level`, and
  `upgrade_costs` (per tier). Costs are tunable constants — no migration to retune.
- **API.** `GET /sanctuary` (coins, level, owned, shop), `POST /sanctuary/buy`,
  `POST /sanctuary/items/{id}/upgrade`.

## Consequences

- We now store a *decision* (purchases + tiers) and compute a balance — a deliberate
  step past [ADR-0009](0009-gamification-computed-from-activity.md)'s "store nothing
  derivable," justified the same way 0009 allows the planting sequence: purchases can't
  be derived from activity.
- Coins stay monotonic by construction (earned-XP basis), so the visible garden never
  regresses — the property that made cultivation feel safe is preserved.
- Retuning is still migration-free (costs are code constants).
- Upgrade **art** is the ongoing cost: each item needs tier visuals. The first cut uses a
  generic flourish (scale + aura + sparkles per tier); bespoke per-item tiers can follow.
