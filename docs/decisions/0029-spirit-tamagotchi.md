# 29. The spirit becomes a Tamagotchi — real-time decay, and it can die

**Status:** Accepted · 2026-06-27 · Reverses the *non-punishing / never-dies* core of
[ADR-0022](0022-spirit-companion-replaces-sanctuary.md) and
[ADR-0023](0023-spirit-creatures-and-care.md), the *computed-not-stored* needs of
[ADR-0009](0009-gamification-computed-from-activity.md) (for needs only — XP/level/coins stay
computed), and **supersedes** the cosmetic needs-modifiers of
[ADR-0025](0025-buying-pampers-the-spirit.md), [ADR-0026](0026-per-item-need-affinities.md), and
[ADR-0028](0028-spirit-set-bonuses.md) (cosmetics become purely cosmetic).

## Context

The spirit was deliberately non-punishing: needs were advisory, floored, and derived from the
activity log; the spirit only dimmed when lapsed and recovered on return. The product owner has
chosen to make it a **classical Tamagotchi by default** — its care has real stakes, and it can
**die** from neglect. This is an intentional reversal, accepted with eyes open to the wellness
trade-off.

## Decision

1. **Needs decay in real time.** Each of the three needs (nourished / rested / joyful) is a 0–1
   meter that **falls on a clock** rather than being read off the activity log. A need goes from
   full to empty over `DECAY_DAYS` (~3) since it was last fed.

2. **Two ways to feed a need:**
   - **Practice (deep, fills to 1.0).** A need's "last fed by practice" time is the most recent
     relevant session in the activity log — nourished ← the dosha's signature practice, rested ←
     any sit, joyful ← gratitude/journal. Practice fills the need full.
   - **Tend actions (light, capped at `TEND_CAP` ≈ 0.6).** New **Feed / Rest / Play** buttons top
     up one need to the cap — enough to keep the spirit alive between sessions, but only practice
     makes it thrive. Stored as a per-need `*_tended_at` timestamp; the tend value decays too.
   - A need's value = `max(practice_value, tend_value)`, each `= cap − elapsed/DECAY_DAYS` clamped.

3. **Sickness → death.** Overall **health = the weakest need.** When health hits ~0 the spirit is
   **ailing** (`ailing_since` set). If it stays ailing for `DEATH_DAYS` (~2) it **dies**
   (`died_at` set) — ~5 days of total neglect is fatal. Any practice or tend clears `ailing_since`
   and resets the clock. (Death and ailing are detected lazily on read and persisted.)

4. **Death is real but the account survives.** A dead spirit is shown as a **memorial** with its
   lifespan; the user **awakens a new one** (the existing choose/awaken flow, now also reachable
   from death) — fresh full needs, re-named, re-equipped. What **persists** (v1): coins, the
   unlocked-cosmetics collection, and growth/stage — so the new spirit **reincarnates at your
   level** (not a literal baby). The cost of death is losing *that* companion: its name, its
   decorated look, its life. (A future option: tie growth to the spirit's own life so death resets
   to a spark — deferred to keep the level/coin/unlock system intact for v1.)

5. **No migration mass-death.** A `needs_baseline_at` (default `now()` at migration / `awakened_at`
   for new spirits) anchors decay, so every existing spirit starts fed — none dies on deploy.

6. **Cosmetics stop modifying needs.** The pamper boost (0025), per-item affinities (0026), and the
   set-bonus harmony lift (0028) are removed from the needs computation — needs are now the
   survival meters, driven by practice + tending. Cosmetics remain purely cosmetic (the
   `set_bonus` radiance stays as a visual flourish).

## Stored state (new `spirits` columns)

`needs_baseline_at` (tz, default now), `nourished_tended_at` / `rested_tended_at` /
`joyful_tended_at` (tz null), `ailing_since` (tz null), `died_at` (tz null). XP/level/coins and the
cosmetics collection are unchanged.

## Consequences

- A genuine care loop with stakes: practice (or at least tend) keeps your companion alive; neglect
  ends it. Strong engagement hook.
- A real wellness trade-off — a meditation companion that can die may induce guilt; mitigated by a
  forgiving ~5-day window, easy tending, and an account that survives so a lapse is never a total
  loss.
- More stored state and a new write path (tending); needs are no longer purely derived.

## Alternatives considered

- **Soft decline without death** (rejected by the owner — they want true Tamagotchi stakes).
- **Opt-in mode** (rejected — they want it as the default).
- **Raise-from-baby on death** (deferred to v2 — keeps the level/coin/unlock system intact now).
