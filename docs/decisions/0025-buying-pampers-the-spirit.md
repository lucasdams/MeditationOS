# ADR-0025: Buying an upgrade pampers the spirit (a decaying needs boost)

**Status:** Accepted · 2026-06-25 · Amends [ADR-0023](0023-spirit-creatures-and-care.md)

## Context

[ADR-0023](0023-spirit-creatures-and-care.md) made the three tended needs
(`nourished` / `rested` / `joyful`) a **pure function of the activity log** — each is
computed on every read from recent practice and is **visual-only**: needs never touch
stage, level, coins, cosmetics, or the collection, so progress stays monotonic.

That leaves spending a touch joyless: buying a cosmetic changes the look, but the
companion itself doesn't *react*. We want buying an upgrade to also "replenish some
stats" — a small, satisfying reward for treating your spirit, without breaking the
visual-only guardrail or letting purchases substitute for practice.

## Decision

Buying a cosmetic **pampers** the spirit:

1. **It records `spirits.last_pampered_at = now()`** in the same transaction (under the
   existing per-user advisory lock) that applies the cosmetic and adds its cost to the
   `coins_spent` ledger. Only **buying** pampers — the paid resets (`reset-name`,
   `reset-upgrades`) and `awaken` do **not**.

2. **The needs read adds a decaying pamper bonus** to each need's 0..1 factor:

   ```
   days_since = today − local_date(tz, last_pampered_at)        # 0 on the purchase day
   pamper     = PAMPER_BOOST × max(0, 1 − days_since / PAMPER_WINDOW_DAYS)
   boosted    = min(1.0, factor + pamper)                       # per need, clamped
   ```

   - Full boost right after a purchase, **fading linearly to zero** over
     `PAMPER_WINDOW_DAYS`; once that many days have passed there is no boost at all.
   - The whole spirit perks up: the bonus is applied to **nourished, rested, AND
     joyful**, and each need's reported tier is re-derived from its boosted factor so
     the tier stays consistent with the factor.

3. **The boost is partial (`PAMPER_BOOST`) and capped (`min(1.0, …)`).** From a genuinely
   *neglected floor* it only lifts a need part-way — a treat **can't substitute** for
   practice when the spirit has truly been ignored. From a healthier baseline the `+0.35`
   can briefly read `thriving`: a generous, short-lived reward for spending, not a way to
   keep a neglected spirit happy without practising. A pathless spark keeps its neutral
   defaults (no pamper).

Constants live in `spirit_service.py` (retuning needs no migration):

| Constant | Value | Meaning |
|---|---|---|
| `PAMPER_BOOST` | `0.35` | added to each need's 0..1 factor at purchase time |
| `PAMPER_WINDOW_DAYS` | `3` | days over which the boost decays linearly to 0 |

## Guardrail (unchanged from ADR-0023)

The boost is **still visual-only**. It lifts only the displayed `needs` and the derived
`condition`; it **never** touches coins, stage, level, cosmetics, or the collection —
those stay derived from earned XP and remain monotonic. Pampering is purely a perk-up of
the care display; a pampered spirit has exactly the coins/stage it earned.

## Consequences

- `last_pampered_at` becomes a new **stored** field on the spirit (`DateTime(timezone=True)`,
  nullable) — consistent with ADR-0024's stored `coins_spent`. The needs are now
  **activity-derived factor + decaying pamper bonus**, clamped to `[0, 1]`.
- A new Alembic migration adds the nullable column (no backfill: a never-pampered spirit
  reads as un-boosted, exactly today's behaviour) and drops it on downgrade. It must be
  applied to dev/prod.
- `last_pampered_at` is internal — it is **not** exposed in `SpiritState`; the boost shows
  through the existing `needs` / `condition`.

## Alternatives considered

- **Full boost (jump straight to thriving on a purchase).** Rejected — it would let
  spending substitute for practice and trivialize the care loop.
- **A separate stored "pamper points" balance that decays on a job.** Rejected — needs are
  computed-on-read by design (ADR-0023); a stored, decaying-on-read bonus keyed off a
  single timestamp keeps that property and needs no scheduler.
