# ADR-0013: Sanctuary — progressive pricing + economy retune

> **Superseded by [ADR-0022](0022-spirit-companion-replaces-sanctuary.md)** — the Sanctuary was retired in favour of the Spirit companion. Kept for historical rationale.

**Status:** Accepted · 2026-06-15 · Extends [ADR-0011](0011-sanctuary-spend-economy.md) + [ADR-0012](0012-sanctuary-personalization.md) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

Two pressures on the Sanctuary economy:

1. **Coins now accrue more slowly.** Coins come from level, which comes from earned XP. A
   separate change made practice XP **front-loaded per session** (meditation:
   10min→20, 30min→50, 60min→70; breathing higher), so longer sits add less XP than before
   and coins lag what users expect. Early progress no longer felt rewarding fast enough.
2. **Every item cost the same forever.** Buy cost was flat regardless of how big a garden
   already was, so there was no rising stakes to acquisition and a large garden was as cheap
   per item as a first one.

We want early progress to feel good again *and* make each additional item cost more —
without reintroducing a wallet or a spend ledger (the property
[ADR-0011](0011-sanctuary-spend-economy.md) was careful to keep, preserved by
[ADR-0012](0012-sanctuary-personalization.md)).

## Decision

- **Retune for faster early reward.** `COINS_PER_LEVEL` 50 → **70**, and catalog buy costs
  lowered ~25% (e.g. tree 40→30, flower 25→20, dog 90→70). The `grown` size stays
  `round(buy_cost × 1.5)`, so it falls with the base. A fresh level-1 user (now 70 coins)
  can afford two cheap items immediately, vs one before. All values remain tunable code
  constants — no migration to retune.

- **Progressive surcharge, derived from holdings.** Each *additional* item carries a
  surcharge that is a deterministic function of its **ordinal among the user's holdings**:
  the k-th item acquired (0-indexed by its stable `sanctuary_plantings.position`) pays
  `round(PROGRESSIVE_STEP × k)`, with `PROGRESSIVE_STEP = 8`. The first item pays nothing
  extra; each later one a linearly growing premium. Because positions are dense and
  monotonic (assigned `max(position)+1` at buy time), `position` *is* the acquisition
  ordinal, so total spend is computable purely from what's owned —
  **still no wallet, no ledger** (preserves ADR-0011/0012).

  ```
  coins_spent(item) = buy_cost + variant_delta + Σ customization_costs + round(PROGRESSIVE_STEP × position)
  ```

  A linear step (rather than geometric) was chosen because it is easy to reason about, keeps
  later items expensive without runaway compounding, and the offset against the cheaper base
  is transparent.

- **Applied consistently at read and write.** The surcharge is added in the spent
  computation (`_spent`) and in the `buy` affordability check (which prices the next item at
  `base + variant_delta + surcharge(next_position)`), so buying the next item validates
  against exactly the cost the balance will reflect. Customization swaps within a slot still
  charge only the option difference — the surcharge is per item, not per customization.

## Consequences

- **Nobody typical is punished.** The cheaper base offsets the early surcharge for small
  gardens (1–3 items are cheaper in raw spend), and the higher `COINS_PER_LEVEL` means that
  at any fixed level a small/typical garden's *balance* is **at least** its balance under
  the old economy. Balance stays clamped ≥ 0. Example garden of N identical trees:

  | items | old `coins_spent` | new `coins_spent` | balance @ lvl 6 (old→new) |
  |------:|------------------:|------------------:|---------------------------|
  | 1 | 40 | 30 | 260 → 390 |
  | 3 | 120 | 114 | 180 → 306 |
  | 6 | 240 | 300 | 60 → 120 |
  | 10 | 400 | 660 | 0 → 0 |

  Only larger gardens (6+) pay meaningfully more in raw spend, and never end with a lower
  balance than before.

- **Coins stay monotonic.** The basis is unchanged (earned XP), and lowering buy costs only
  *raises* the computed balance of existing rows — an existing garden never loses coins from
  this change.

- **No schema or migration.** `position` already exists and is already dense/monotonic; the
  surcharge is derived from it. Retuning either knob (`COINS_PER_LEVEL`, `PROGRESSIVE_STEP`,
  any buy cost) remains a one-line code edit.

- **Trade-off to watch.** The surcharge is keyed to *acquisition order*, not item value, so
  the 10th cheap flower costs the same surcharge as a 10th expensive structure. This is
  intentional (it prices *count*, the thing we want rising stakes on) but means a player who
  buys many cheap items early front-loads their surcharge budget. If that proves too blunt,
  the step is a single tunable constant.
