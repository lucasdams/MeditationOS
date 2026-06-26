# ADR-0028: Spirit signature set bonuses (derived "Signature radiance")

**Status:** Accepted · 2026-06-26 · Extends [ADR-0025](0025-buying-pampers-the-spirit.md) and [ADR-0026](0026-per-item-need-affinities.md)

## Context

After [ADR-0027](0027-spirit-upgrade-skill-tree.md) gave each cosmetic slot a small skill
tree, every slot has exactly **one path-exclusive tier-3 capstone per dosha** — the
creature's *signature* option for that slot (e.g. for `stillness`/Kapha: `grove` aura,
`mossy_circlet` accessory, `misty_grove` habitat, …). Collecting and equipping all of them
is the natural **endgame** of the customize tree, but nothing recognised or rewarded
finishing the full themed look. We want a calm, advisory payoff for completing the signature
set — in keeping with the [ADR-0023](0023-spirit-creatures-and-care.md) guardrail that needs
are visual-only and practice stays the primary driver.

## Decision

When a spirit equips its **full SIGNATURE SET** — every slot that has a signature option for
the chosen path is equipped with that signature option — it earns **"Signature radiance"**:

1. **A small advisory harmony lift.** The needs read adds a flat `SET_HARMONY = 0.08` to
   **all three** needs' factors, layered on top of the practice-derived base alongside the
   ADR-0025/0026 passive while-owned lift and the weighted fading buy-boost. Same `clamp(…, 1.0)`
   and the same tier re-derivation from the final factor, so tier and factor stay consistent.

2. **A visual flourish.** When active, the spirit art draws an extra subtle radiance — a soft
   halo bloom behind the figure plus a faint sparkle ring, tinted to the path's accent — that
   shimmers gently on its own slow period and holds static under `prefers-reduced-motion`.

### Definition (derivable — no migration)

- `_signature_option(slot, path)` = the slot's option whose `per_path == path` (exactly one per
  slot for a chosen path; `None` for a pathless spark).
- The set is **complete** when, for **all** slots that have a signature option for the spirit's
  path, the **equipped** option (`cosmetics[slot]`) equals that signature option.
  - `count` = number of slots whose equipped option == its signature option.
  - `total` = number of slots that have a signature option for the path (**7** for a chosen
    creature, given ADR-0027's per-slot-per-path catalog invariant).
  - A **universal** option equipped in a slot does **not** count — only the path-exclusive
    signature does.
  - A **pathless spark** has no signatures → `count 0, total 0`, never active.

Everything is computed **on read** from the equipped cosmetics + chosen path — there is **no new
stored column and no migration**, consistent with the spirit's maximally-computed design
([ADR-0009](0009-gamification-computed-from-activity.md)/0011, ADR-0023). Constants live in
`backend/app/services/spirit_service.py` (`SET_HARMONY`, `SET_BONUS_KIND`, `SET_BONUS_LABEL`);
retuning the lift needs no migration.

### API shape

`SpiritState` gains a derived `set_bonus` block (`backend/app/schemas/spirit.py` →
`SpiritSetBonus`):

```
set_bonus: { active: bool, kind: "signature" | null, count: int, total: int, label: str }
```

`kind` is `"signature"` when active (room for future set kinds) and null otherwise; `label` is
the user-facing name (`"Signature radiance"`). The matching type is mirrored in
`frontend/src/types.ts`.

## Guardrail (unchanged from ADR-0023 / ADR-0025 / ADR-0026)

The set bonus is **visual/advisory only**: the harmony lift moves only the displayed `needs`
and the derived `condition`; it **never** touches coins, stage, level, cosmetics, or the
collection — those stay derived from earned XP and remain monotonic. Completing the set is an
**endgame achievement** (it requires owning + equipping all 7 path-exclusive capstones), and the
lift is intentionally **small** (0.08) so practice — not collecting — stays the primary driver of
a thriving creature.

## Consequences

- **No schema change.** No model column, no Alembic migration; the bonus is a pure function of
  `cosmetics` + `path`.
- The frontend shows the status near the customize tree: an active badge ("✦ Signature radiance"
  + "all 7 signature pieces equipped") or a quiet progress nudge ("{count}/{total} signature
  pieces equipped — equip your creature's exclusive capstones"). `SpiritArt` gains a `setRadiant`
  prop driving the radiance flourish.
- `SpiritState` is additive — existing fields are unchanged; the `extra="forbid"` contract simply
  gains one more known field.

## Alternatives considered

- **A stored "set complete" flag / achievement row.** Rejected — it would need a migration and a
  backfill, and could drift from the live loadout. Deriving on read keeps a single source of
  truth (the equipped cosmetics) and no scheduler.
- **A larger or progress-scaled lift (e.g. per-piece).** Rejected — per-piece lift already exists
  as ADR-0026's passive while-owned affinity; the set bonus is meant to be a small, all-or-nothing
  *completion* reward, not a second per-item track. A bigger lift would risk letting collecting
  substitute for practice.
- **Mechanical (non-visual) rewards (coins / XP / stage).** Rejected — it would break the
  ADR-0023 guardrail that keeps progress monotonic and un-loseable.
