# ADR-0026: Per-item need affinities (passive lift + weighted fading buy-boost)

**Status:** Accepted · 2026-06-26 · Extends [ADR-0025](0025-buying-pampers-the-spirit.md)

## Context

[ADR-0025](0025-buying-pampers-the-spirit.md) made **buying any cosmetic** add a uniform,
decaying "pamper" boost (`+0.35`) to **all three** needs (`nourished` / `rested` /
`joyful`) equally. That is satisfying but flat: every item feels the same, and owning an
item gives nothing once the boost has decayed. We want each item to have a small
**identity** — to favour ONE need — and to reward both *owning* it and *buying* it, while
keeping the ADR-0023 guardrail (needs are visual-only) and keeping **practice the primary
driver** of needs.

## Decision

Each cosmetic item declares the ONE need it **favours** (its catalog `need`, one of
`nourished` / `rested` / `joyful`), and that affinity drives **two** effects layered on
top of the unchanged, practice-derived base factor per need:

1. **Passive (while-owned).** Each currently-applied cosmetic adds a small permanent lift
   to the need it favours:

   ```
   passive(need) = min(PASSIVE_NEED_CAP, PASSIVE_PER_ITEM × (#applied items favouring need))
   ```

   No decay — it lasts as long as the item is applied. Capped per need so a need can't be
   propped up by hoarding items.

2. **Buy-boost (fading, weighted).** Buying stamps `spirits.last_pampered_at = now()` AND
   records the bought item's favoured need in `spirits.last_pampered_need`. The needs read
   then adds a **decaying** boost, **weighted** toward that need:

   ```
   decay        = max(0, 1 − days_since / PAMPER_WINDOW_DAYS)   # 1 on the purchase day
   buyboost(K)  = decay × (PAMPER_PRIMARY if K == last_pampered_need else PAMPER_SPILL)
   ```

The final per-need factor is `clamp(base + passive + buyboost, 1.0)`, and the reported
tier is re-derived from that final factor so tier and factor stay consistent.

- **Non-punishing spillover.** The other two needs still get the smaller `PAMPER_SPILL`,
  so buying *any* item still helps overall condition somewhat — never a zero-sum trade.
- **Practice stays primary.** Both effects are partial and capped: from a genuinely
  neglected floor they only lift a need part-way — a treat can't substitute for practice.
- **Legacy fallback (no regression).** A spirit pampered *before* this feature has
  `last_pampered_at` set but `last_pampered_need` NULL. We then apply ADR-0025's **uniform**
  behaviour — every need gets `decay × PAMPER_PRIMARY` — so existing pampered spirits don't
  regress.

Constants live in `spirit_service.py` (retuning needs no migration):

| Constant | Value | Meaning |
|---|---|---|
| `PAMPER_PRIMARY` | `0.35` | buy-boost added to the bought item's favoured need (before decay) |
| `PAMPER_SPILL` | `0.12` | smaller buy-boost spillover to the other two needs (before decay) |
| `PAMPER_WINDOW_DAYS` | `3` | days over which the buy-boost decays linearly to 0 |
| `PASSIVE_PER_ITEM` | `0.05` | passive lift per applied item favouring a need |
| `PASSIVE_NEED_CAP` | `0.15` | cap on the passive lift per need |

`PAMPER_PRIMARY` replaces ADR-0025's `PAMPER_BOOST` (same value, clearer name).

## Guardrail (unchanged from ADR-0023 / ADR-0025)

Both effects are **still visual-only**: they lift only the displayed `needs` and the
derived `condition`; they **never** touch coins, stage, level, cosmetics, or the
collection — those stay derived from earned XP and remain monotonic.

## Consequences

- A new **stored** field on the spirit, `last_pampered_need` (`Text`, nullable, no server
  default) — set alongside `last_pampered_at` on each buy. A new Alembic migration adds the
  nullable column (no backfill: a NULL means never-pampered OR a legacy row → the uniform
  fallback) and drops it on downgrade. It must be applied to dev/prod.
- `SpiritSlotOption` now exposes `need` (the favoured need) so the shop can tag each item;
  `last_pampered_need` itself is internal and not exposed.
- Every catalog option must carry an explicit `need`; a module-level `DEFAULT_ITEM_NEED`
  is a safety net only (a coverage test asserts every option declares one).

## Alternatives considered

- **Keep the uniform boost (ADR-0025).** Rejected — items feel identical and owning one is
  inert once the boost decays; no identity.
- **Buy-boost only the favoured need (no spillover).** Rejected — it would make buying an
  "off-need" item feel punishing; the small spillover keeps every purchase a net positive.
- **A stored per-need decaying balance.** Rejected — needs are computed-on-read by design
  (ADR-0023); a passive lift derived from owned items + a single timestamp keeps that
  property and needs no scheduler.
