# ADR-0010: Sanctuary — cultivation sequence, not a spend economy

**Status:** Superseded by [ADR-0011](0011-sanctuary-spend-economy.md) (2026-06-15) · Detail: [Sanctuary design](../design/sanctuary.md) · Amends [ADR-0009](0009-gamification-computed-from-activity.md)

> **Superseded.** The product later adopted the spend-economy shape this ADR rejected —
> coins earned by levelling, spent to **buy** and **upgrade** items — for a richer
> "earn → choose → upgrade" loop. See [ADR-0011](0011-sanctuary-spend-economy.md). The
> rest of this document is kept for the original rationale.

## Context

The Sanctuary is the product's headline retention loop: a space the user grows by
practicing. Two shapes were considered.

1. **Spend economy** — practice earns a currency you bank and *spend* in a catalog
   (a wallet, a spend ledger, affordability checks).
2. **Cultivation sequence** — you grow **one thing at a time**; practice itself grows
   the current item; when it finishes you **choose what to grow next** (another tree,
   a flower, a barn, a companion). The page fills with the accumulated assortment.

[ADR-0009](0009-gamification-computed-from-activity.md) established that all
gamification is **computed on read** from the activity log, with nothing stored,
because stored counters drift and turn every rule tweak into a migration. The
Sanctuary is the first mechanic that introduces a genuine *user decision* — which
item to grow, and in what order — that cannot be derived from activity. The question
is how much state that forces us to store.

## Decision

Build the **cultivation sequence**, and store **only the irreducible decision**: the
ordered list of what the user chose to grow. Everything else stays computed.

- **One new table, `sanctuary_plantings`** — `(user_id, item_key, position)`, an
  append-only ordered sequence. Repeats allowed (an *assortment* of trees), so there
  is **no currency, no wallet, no spend ledger, and no balance**.
- **Growth is computed.** Each item has a `grow_cost` in practice points (minutes,
  resonance breathing ×3 — the same unit philosophy as XP). With cumulative practice
  `P`, planting `i` is **complete** when `P ≥ Σ grow_cost[0..i]`; the **current**
  growing item is the first not-yet-complete one, and its progress bar is how far `P`
  reaches into its band. Thresholds **stack in sequence**, so practice **carries over**
  between items — nothing a user does is ever wasted.
- **Both gates are computed.** *Grow* gate = practice accrued (above). *Offer* gate =
  an item's `unlock` condition (e.g. level ≥ 5, a 30-day streak) evaluated from the
  same stats `dashboard_service` already computes. The **catalog is an in-code
  constant** (`SANCTUARY_CATALOG`), matching the project's other fixed taxonomies
  (`SESSION_TYPES`, gratitude `CATEGORIES`, breathing presets) — no catalog table.
- **One write path** — `POST /sanctuary/plantings { item_key }` appends the next item.
  It validates that the item is unlocked and that the current item is complete (you
  cannot queue ahead — one at a time), then inserts at the next `position`. No balance
  math. Every user is auto-seeded with a starter plant at `position 0`, so the scene
  always has something growing.
- **Dormancy is computed and never destructive.** Owned plantings are permanent; the
  thriving/dim overlay derives from `current_streak_days` (like the tree's tier). A
  lapse dims the scene; returning revives it. Nudge, not shame.

This **amends ADR-0009** rather than overturning it: the principle holds — *store only
what cannot be derived (the choices and their order); compute everything else.*

## Consequences

- **Minimal, drift-resistant footprint.** The entire persistent state is one
  append-only table of choices. There is no balance to desync, and — unlike the spend
  economy — **no negative-balance edge case** (computing a spendable balance from a
  re-tunable earn rate could go negative; cultivation has no balance at all).
- **Cheap to re-tune.** `grow_cost` and `unlock` are constants. Lowering a cost or an
  unlock applies retroactively (more of the garden may complete at once — a welcome
  "your practice was waiting" effect). Raising a cost can momentarily un-complete a
  near-done item; treated like the streak-bonus dip in ADR-0009 — acceptable, and we
  prefer to only lower or hold costs.
- **On-theme.** Practice *directly* grows the garden; there is no abstract currency
  intermediating between sitting and seeing the space change.
- **Cost:** the scene render is the real work — per-item ASCII art with growth stages,
  composed into a background. The data and rules are trivial; the frontend is where
  the effort lands.

## Alternatives considered

- **Spend economy (currency + catalog + wallet).** The "obvious" game design;
  rejected because it adds a balance, a spend ledger, affordability checks, and a
  negative-balance risk under earn-rate retunes — all to express a loop that
  cultivation expresses with one table and no currency.
- **Catalog as a table.** Rejected for the same reason as the gratitude categories: a
  fixed taxonomy that changes with code needs no table or admin UI, and a code
  constant is the single validation source.
- **Storing per-item progress / completion.** Rejected — progress is a pure function
  of cumulative practice and the sequence, so deriving it keeps it correct by
  construction (same stance as XP and streaks).
- **Several items growing at once.** Deferred — one-at-a-time keeps the "choose what's
  next" moment meaningful and the threshold math a simple running sum.
