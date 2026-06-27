# 30. Rebirth from a spark — the spirit grows on its OWN life, and death is a true restart

**Status:** Accepted · 2026-06-27 · Refines [ADR-0029](0029-spirit-tamagotchi.md): replaces its
v1 "death reincarnates at your lifetime level" (point 4) with a true raise-from-baby. Builds on
[ADR-0009](0009-gamification-computed-from-activity.md) (still computed, not stored — no migration).

## Context

ADR-0029 made the spirit mortal, but v1 kept growth tied to the user's **lifetime** earned XP, so a
spirit awakened after a death immediately *reincarnated at your level* rather than starting small.
The owner chose the truer Tamagotchi loop: a new spirit should begin as a **spark** and be re-grown
("raise from baby"), so death is a real restart of the companion you raise.

## Decision

1. **Growth is the spirit's OWN life.** The spirit's level — call it the **spirit-level** — is
   derived from the XP earned **since `awakened_at`** (this spirit's birth), not the user's lifetime
   XP. `stage`, `bond.level` (+ `xp_into_level` / `xp_for_next`), and the skill-tree **unlock-level
   gates** all key off the spirit-level. A brand-new spark is spirit-level 1 → the `spark` stage,
   regardless of how seasoned the account is.

2. **Death is a true restart.** Awakening a new spirit (from death or from a radiant graduation)
   sets `awakened_at = now`, so its spirit-XP is 0 → it begins as a spark and must be re-grown.
   `unlocked` and the equipped loadout already reset per-spirit (ADR-0027/0029), so the new spark is
   bare and must re-earn its adornments as its spirit-level climbs.

3. **Coins are kept as an account budget** (the owner's "keep your coin budget" choice). The coin
   balance stays derived from the user's **lifetime** level (`level × 80 − coins_spent`), and a new
   spirit's `coins_spent` resets to 0 → you keep your full earned budget and can re-decorate without
   re-grinding currency. So a young spark may hold more coins than its spirit-level implies — that's
   intentional: coins are your account's currency; the spirit-level is *this pet's* growth. (A
   harsher "full fresh start" — coins also scoped to the spirit-level — was offered and declined.)

4. **No migration; backward-compatible for first sparks.** Spirit-XP is derived from activity since
   `awakened_at`, so no schema change. For a first/never-died spirit (awakened at account start),
   spirit-XP ≈ lifetime XP → its stage/level are unchanged. Only a spirit awakened *after* a
   death/graduation reads younger — which is exactly the point.

5. **Timings unchanged.** The ~5-day death window from ADR-0029 (DECAY_DAYS 3 + DEATH_DAYS 2) is
   kept as-is (owner's choice).

## Consequences

- Death matters more: you lose the pet's growth as well as its identity, and re-raise a spark — the
  full Tamagotchi loop, with the early-game progression replayable each life.
- A visible edge case on deploy: a spirit that was awakened *recently* (after an earlier graduation)
  will read as a younger stage than before, since stage now reflects its own life. Correct under
  this ADR, but a one-time surprise for those users. Most users' active spirit is their first spark
  (awakened ≈ account start), so they see no change.
- The spirit's bond level can differ from the dashboard's lifetime level — they now measure
  different things (this pet's growth vs your overall journey).

## Alternatives considered

- **Reincarnate at your lifetime level** (ADR-0029 v1 — superseded here; the owner wanted a real
  restart).
- **Full fresh start incl. coins** (offered; declined — too punishing to also wipe earned currency).
- **Tie coins to the spirit-level** (would remove the rich-young-spark oddity but wipe currency on
  death — same objection).
