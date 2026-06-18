# ADR-0019: Sanctuary — reset an item's upgrades for a fee

**Status:** Accepted · 2026-06

## Context

The Sanctuary coin balance is *derived from holdings* — there is no wallet row and no
transaction ledger ([ADR-0011](0011-sanctuary-spend-economy.md)):

```
balance = max(0, coins_earned − Σ_holdings(buy + variant_delta + Σ customization_costs
                                           + progressive_surcharge) )
```

Customizations are stored as `{slot: option}` on the holding
([ADR-0012](0012-sanctuary-personalization.md)). Switching an option *within* a slot already
charges only the price difference — an implicit refund on a downgrade. But there was **no way
to fully remove an item's upgrades** and get its sunk customization coins back. Users asked
for one (regret a costly customization, free coins to re-spend elsewhere).

The catch is the no-ledger model. Simply clearing `customizations = {}` would refund the whole
sunk cost on the next derived read — a *free undo*. That invites **reset-churn**: apply an
upgrade, reset it for a full refund, repeat — extracting nothing of value but cluttering the
economy with a frictionless toggle, and making any future "spent X coins on upgrades" framing
meaningless. A reset needs a real, persistent cost, but the model deliberately has nowhere to
*store* a one-off charge.

## Decision

Add a **reset action gated by a flat fee**, and persist that fee in the one place the derived
model can afford: a single per-user counter.

- **One stored economy figure.** A new NOT NULL integer column `users.sanctuary_reset_fees`
  (server_default `0`) tallies the cumulative reset fees a user has paid. The balance formula
  gains exactly one subtrahend:

  ```
  balance = max(0, coins_earned − Σ_holdings − sanctuary_reset_fees)
  ```

  This is the *only* stored coin figure; everything else stays derived from holdings. The
  counter is **monotonic** (it only ever increases), mirroring the monotonicity of
  `coins_earned`, so it can never retroactively *raise* an existing garden's balance — the
  retune-safety property of [ADR-0013](0013-sanctuary-progressive-pricing.md)/
  [ADR-0016](0016-sanctuary-shop-expansion-and-retune.md) is preserved.

- **A flat fee constant.** `SANCTUARY_RESET_FEE = 10`, defined alongside `COINS_PER_LEVEL` and
  `PROGRESSIVE_STEP`. Tunable in code — no migration to retune.

- **`reset_upgrades(db, user_id, planting_id)` service.** Takes the per-user transaction-scoped
  advisory lock **first** (same discipline as `customize`/`move`/`personalize`), loads the
  caller's row (not theirs → `None` → 404), **requires it to have customizations** (empty map →
  `NothingToReset` → 409, so a no-op is never charged a fee), clears `row.customizations = {}`,
  and increments `user.sanctuary_reset_fees += SANCTUARY_RESET_FEE`, committing atomically
  (IntegrityError → `SanctuaryConflictError` → 409, as the other mutators do).

  The **variant is left intact**: a variant is the *purchased base form* (a tree species, a dog
  breed), not an "upgrade". Only the mix-and-match customizations are cleared.

- **Route.** `POST /api/v1/sanctuary/items/{planting_id}/reset` — auth-required, user-scoped,
  rate-limited, `today_for_user` like the sibling routes. 404 not-owner; 409 nothing-to-reset
  or concurrent conflict.

- **Frontend.** A calm, low-key "Reset upgrades…" action at the foot of an owned item's
  customize panel, shown only when the item actually has upgrades. A two-step inline confirm
  **states the fee** ("you'll get your coins back, less a 10 🪙 fee") before anything is charged;
  it's disabled while in-flight so a double-tap can't double-charge. Errors surface as a toast.

## Consequences

- **Net effect of one reset:** `+Σ(cleared customization costs) − SANCTUARY_RESET_FEE`. The
  user recovers their upgrade coins minus a small, fixed toll.

- **Reset-churn is strictly coin-negative.** The customization refund nets exactly against the
  re-purchase cost, but every reset burns a fee that is *stored* and never refunded. A
  buy → grow → reset → regrow cycle leaves the user poorer by one fee, not break-even — so the
  loop can never mint free coins. (Tested: a second reset charges again; a churn cycle ends
  exactly `SANCTUARY_RESET_FEE` below the no-churn baseline.)

- **Balance stays clamped ≥ 0.** The new subtrahend goes through the same `max(0, …)` clamp, so
  a reset on a low-coin user never produces a negative balance.

- **Trade-off — one stored figure.** This is the first deliberate break from a *purely* derived
  balance: a single, monotonic, per-user integer. It's the minimum state needed to persist a
  one-off charge in a ledger-free model; a full transaction ledger was rejected as far more
  surface area than the feature warrants.

- **Affordability checks updated.** `buy` and `customize` subtract `sanctuary_reset_fees` in
  their affordability math (not just at read time), so a fee can't be transiently double-spent.

## Alternatives considered

- **Free reset (no fee).** Rejected: enables reset-churn and makes "spent on upgrades" framing
  meaningless.
- **A full wallet / transaction ledger.** Rejected: large surface area; contradicts ADR-0011's
  derived-balance design for the sake of one counter.
- **Per-customization "sell back" at a discount.** More UI and economy complexity than asked;
  the flat per-item reset is the smallest coherent mechanic.
- **Charging the fee by *reducing* a derived value (e.g. a phantom holding).** Rejected: there's
  no honest holding to attach it to, and it would distort the progressive surcharge ordinals.
