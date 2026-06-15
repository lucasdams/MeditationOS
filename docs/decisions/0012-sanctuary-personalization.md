# ADR-0012: Sanctuary — variants + mix-and-match customizations

**Status:** Accepted · 2026-06-15 · Extends [ADR-0011](0011-sanctuary-spend-economy.md) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

[ADR-0011](0011-sanctuary-spend-economy.md) made the Sanctuary a spend economy: earn
coins from your level, buy items, and upgrade each through a **linear tier ladder**. In
use the ladder was thin — a tier only added a sparkle, a slight scale, and an aura, so
two trees looked the same and there was little to *choose*. Every concept was also a
single fixed form (one `tree`, one `dog`).

We want real **personalization** without reintroducing a wallet or a spend ledger (the
property ADR-0011 was careful to avoid).

## Decision

Personalize on two axes, both stored on the holding, balance still fully derived:

- **Variant** — a base form chosen *at purchase* (tree species, dog breed, flower type,
  cat/wall colour). Stored as `sanctuary_plantings.variant` (nullable; `NULL` = the
  catalog item's default/first variant). The catalog lists each item's `variants`, each
  with an optional `cost_delta` and `unlock_level`. The variant visibly changes the SVG.
- **Customizations** — independent, named **slots**, each with options, bought over time
  and mixed and matched. Stored as `sanctuary_plantings.customizations` JSONB
  (`{slot: option}`, default `{}`). The catalog lists each item's `slots → {option: cost}`
  (+ optional per-option `unlock_level`). Slots are independent: a dog can be `grown` *and*
  wear a `hat`. Each option costs coins (the product decision); switching options within a
  slot charges only the difference, so it is never punishing.

- **Balance stays derived from holdings — no wallet, no ledger** (preserves ADR-0011).
  `coins_spent` for one owned item =
  `buy_cost + variant_cost_delta + Σ (cost of each purchased customization option)`,
  summed over holdings, subtracted from `level × COINS_PER_LEVEL`, clamped ≥ 0.
- **Catalog stays in code.** Variants, slots, and option costs are tunable constants in
  `SANCTUARY_CATALOG` — retuning needs no migration.
- **Tier retired into a customization.** The old `tier` ladder becomes a `grown` slot.
  The migration backfills `customizations.grown` from any `tier >= 1` (priced the same as
  the old tier-1), so existing spend is preserved exactly, then drops `tier`. The
  `/upgrade` route is replaced by `POST /sanctuary/items/{id}/customize {slot, option}`;
  `buy` gains an optional `variant`.

## Consequences

- **Coins stay monotonic and never punishing.** Legacy rows (no variant, empty
  customizations) cost exactly the buy price — no retroactive spend — and the folded
  `grown` exactly equals prior tier spend, so no existing balance drops or goes negative.
- We store a richer *decision* (variant + a set of customizations) but still compute the
  balance — the same justified step past
  [ADR-0009](0009-gamification-computed-from-activity.md) that ADR-0011 took.
- Retuning remains migration-free; only the schema-shape change (variant + JSONB column,
  tier folded in) needed one additive, reversible migration.
- **Art is the ongoing cost.** Each variant and each customization slot needs bespoke SVG;
  the renderer (`SanctuaryPlant.tsx`) now draws from variant + customizations rather than a
  generic per-tier flourish.
