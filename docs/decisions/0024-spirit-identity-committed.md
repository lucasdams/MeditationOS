# ADR-0024: Spirit identity is committed — required name, locked upgrades, paid resets

**Status:** Accepted · 2026-06-24 · Amends [ADR-0023](0023-spirit-creatures-and-care.md)

## Context

[ADR-0023](0023-spirit-creatures-and-care.md) shipped chosen creatures plus a cosmetics
economy. As built, personalization is weightless:

- the **name** is optional and freely renamable (a `PATCH` that also clears on empty);
- **cosmetics** can be swapped within a slot at will; and because coins are *derived* from the
  **currently-applied** cosmetics (`coins = level × COINS_PER_LEVEL − Σ applied-cost`), swapping
  to a cheaper option or clearing a slot **refunds** the difference.

We want naming and adorning a companion to be a **commitment** — a deliberate choice you live
with, changeable only at a real, steep cost.

## Decision

1. **Name — required and immutable.** A creature is named **at creation**: the choose step
   requires a non-empty name (≤ `SPIRIT_NAME_MAX_LENGTH`). The free rename is removed; the name
   cannot change except via a paid reset.

2. **Upgrades — applied once per slot, then locked.** Buying a cosmetic applies it to its slot
   and **locks that slot**. Empty slots stay buyable (you can keep adorning), but a filled slot
   can't be swapped except via a paid reset. Removes the within-slot net-cost swap.

3. **Two paid resets — `RESET_COST = 250` coins each (independent).**
   - **Reset name** — charges 250 and replaces the name (a new non-empty name is supplied in the
     same call, so the spirit is never left nameless).
   - **Reset upgrades** — charges 250 and clears **all** applied cosmetics so they can be
     re-picked. The cleared cosmetics' original cost is **not** refunded.

4. **Stored monotonic spend ledger.** Replace the derive-from-current-cosmetics coin model with a
   stored `spirits.coins_spent` (int, `≥ 0`, **only ever increases**):
   `coins = level × COINS_PER_LEVEL − coins_spent`, clamped `≥ 0`. Every cosmetic buy and every
   reset **adds** its cost to `coins_spent`; nothing subtracts. So a reset genuinely *costs* coins
   (no refund), and the balance stays monotonic against earned XP — level only grows, spend only
   grows. A migration backfills `coins_spent` from each existing spirit's currently-applied
   cosmetics, so balances are unchanged at upgrade time.

The ADR-0023 **guardrail** is unchanged: needs/condition stay visual-only; resets spend the
earned-XP coin balance and never touch stage, level, or the collection.

## Consequences

- Personalization is a deliberate commitment; changing your mind has a real, steep cost.
- `coins_spent` is the spirit's first stored economic counter. It is still bounded by the earned
  coin balance at spend time (purchases are affordability-gated), so the balance can never go
  negative and earned progress is never lost — only spent.
- The choose flow gains a **required name** field. On `/spirit`, the name becomes read-only with a
  **Reset name** action, and each applied cosmetic slot shows **locked** with a **Reset upgrades**
  action.

## Alternatives considered

- **One combined reset.** Rejected — the user wants to reset name *or* upgrades independently.
- **Keep derived coins, just block swaps.** Rejected — clearing a slot on reset would refund its
  cost, so a reset would cost nothing. A stored spend ledger is required for resets to bite.
