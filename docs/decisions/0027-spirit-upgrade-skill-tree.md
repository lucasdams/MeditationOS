# 27. Spirit upgrades as a skill tree — unlock-to-own, free equip, prerequisite tiers

**Status:** Accepted · 2026-06-26 · Supersedes the *locked-upgrades* and *paid upgrades-reset*
of [ADR-0024](0024-spirit-identity-committed.md) (its required-name and `coins_spent` spend
ledger, and the paid **name** reset, still stand). Builds on
[ADR-0025](0025-buying-pampers-the-spirit.md) and [ADR-0026](0026-per-item-need-affinities.md).

## Context

ADR-0024 made cosmetics a *committed choice*: you bought one option per slot, the slot **locked**,
and changing it cost a paid **upgrades-reset** (250 coins, no refund). That's a one-shot
commitment with friction and a coin sink.

We want **progression** instead — a skill tree you climb. Each spirit already has a signature
path-exclusive item per slot (the natural capstones), and options already carry level gates. The
goal: let players **unlock** items along prerequisite chains, **own them forever**, and **freely
equip** what they've earned — and preview that tree when choosing a creature.

## Decision

1. **Unlock-to-own.** Each catalog option is a tree node. Unlocking it costs coins (existing
   prices), adds the option to the spirit's owned set, and adds the cost to `coins_spent`
   (unchanged from ADR-0024 — permanent, never refunded). Owned is forever.

2. **Prerequisite tiers.** Each option has a `tier` (1 | 2 | 3) within its slot:
   - tier 1 — no prerequisite (the starter options);
   - tier N > 1 — requires owning **at least one** option of tier N−1 **in the same slot**;
   - the path-exclusive capstones are tier 3.
   The existing `unlock_level` (level gate) and `per_path` (dosha gate) still apply on top, as
   does affordability. An option is *unlockable* only when tier-prereq **and** level **and** path
   **and** coins are all satisfied.

3. **Free equip.** Equip one owned option per slot (or leave a slot empty); swapping what's shown
   is **free and instant**. This replaces slot-locking and the paid upgrades-reset. The stored
   `cosmetics` map now means **equipped** (`{slot: option}`). Unlocking an option also equips it
   into its slot immediately; you can re-equip any owned option afterward at no cost.

4. **Stored state.** Add `spirits.unlocked` (JSONB list of owned option keys; default `[]`).
   `cosmetics` stays as the equipped map; `coins_spent` is unchanged. **No data backfill:** the
   effective owned set is `unlocked ∪ values(equipped)`, so every spirit keeps the items it has
   already equipped/paid for.

## Consequences

- Cosmetics become a **collection + loadout**, not a one-shot pick. Clear sense of progression;
  the capstones (path-exclusive items) are a goal you build toward.
- The same tree is **previewable on the choose page** (read-only while pathless) — you can see
  what a creature grows into before committing.
- The paid upgrades-reset (a 250-coin sink) is **removed**; the only coin sink is unlocking. Coins
  still derive from `level × 80 − coins_spent`; capstones stay expensive for pacing.
- Pamper/needs are unchanged in spirit: **unlocking is the new "buying"** — it stamps
  `last_pampered_at` + `last_pampered_need` (ADR-0025/0026); the passive need lift reads the
  **equipped** items.
- Slightly more stored state (the `unlocked` list) and a richer API surface (`unlock` + `equip`).

## Alternatives considered

- **Keep slot-lock + paid swap.** Rejected: the friction and 250-coin swap fee fight a tree's
  "climb and experiment" feel.
- **A global cross-slot tree** (unlocking an aura gates a companion). Rejected: dependencies would
  be arbitrary; per-slot tiers map cleanly to the existing level gates.
- **A full linear chain per slot** (the capstone requires owning *every* cheaper option).
  Rejected: too grindy. "Own *any one* of the tier below" is gentler while still a real tree.
