# 31. The companion stops being mortal — encouraging-only, floored needs

**Status:** Accepted · 2026-06-28 · **Reverses [ADR-0029](0029-spirit-tamagotchi.md)** (the
Tamagotchi turn): the spirit can no longer die or be "ailing". Re-adopts the *non-punishing* needs of
[ADR-0022](0022-spirit-companion-replaces-sanctuary.md) /
[ADR-0023](0023-spirit-creatures-and-care.md) and the *computed-not-stored* stance of
[ADR-0009](0009-gamification-computed-from-activity.md). Keeps growth, the radiant graduation flow
([ADR-0030](0030-spirit-rebirth-from-a-spark.md) stays for the rebirth-from-a-spark flavor), and
cosmetics (the skill tree of [ADR-0027](0027-spirit-upgrades-skill-tree.md) and the set bonuses of
[ADR-0028](0028-spirit-set-bonuses.md), now purely cosmetic since ADR-0029). Phase 0 of the
[beginner-first revision](../beginner-first-revision.md) (§4).

## Context

ADR-0029 made the spirit a classical Tamagotchi: needs decayed on a clock, the weakest need was its
health, and total neglect (~5 days) **killed** it, replacing the page with a memorial and forcing an
awaken-new. The product owner accepted the wellness trade-off "with eyes open" — but the
beginner-first revision targets a habit-forming beginner who *inevitably* misses a week. A meditation
companion that dies if she skips is exactly the wrong incentive for that user: it manufactures guilt
and gives a lapse a punishing, irreversible cost. We are reversing the mortality and keeping
everything that makes the companion a warm reason to return.

## Decision

1. **The companion can never die.** Remove `DEATH_DAYS`, the ailing→death computation, the
   death-memorial UI, and the lazy persistence of `died_at`. There is no "dead" or "ailing" state
   anywhere in code or user-facing copy. The spirit is always alive and always rooting for you.

2. **Needs are floored so they never punish.** Each of the three needs (`nourished` / `rested` /
   `joyful`) still eases down off the born-fed baseline + the most-recent relevant practice (and a
   lighter, capped manual tend) — but a `NEEDS_FLOOR` clamps the 0..1 value so it never drops below
   the calm **content** tier. The floor is set to the `content` threshold (`0.8` against the
   `NEED_TIERS` bands), so the WORST a need can ever read is "content" — `restless` / `unwell` are
   unreachable. A need still **brightens to full** the instant you do the relevant practice, and
   **eases back toward the floor** while you're away; nothing is ever lost or alarming.

3. **Tending stays as gentle, optional care.** The Feed / Rest / Play actions and the three needs
   stay. A tend lifts a need to `TEND_CAP` (`0.9` — a small bump above the content floor, below a
   full practice fill), a real-but-gentle optional lift that eases back to the floor over a few
   hours. Practice still fills a need fullest; tending never carries survival stakes. It is a
   purely-positive affordance, not an obligation or a meter to refill on pain of death.

4. **Awaken is graduation-only.** The retire-then-awaken flow keeps its pre-0029 role: reachable
   ONLY when the spirit reaches **radiant** (its OWN-life level, per ADR-0030). The death-triggered
   awaken path is removed.

5. **Growth, graduation, cosmetics, and set bonuses are unchanged.** The `spark → radiant` stage
   ladder, the spirit-level/rebirth model (ADR-0030), the cosmetic skill tree (ADR-0027), and the
   "Signature radiance" set-bonus read-out (ADR-0028, visual-only) all stay exactly as they are.

## Stored state

- **Drop** the `spirits.died_at` column (one Alembic migration, `drop_spirit_died_at`; the
  `downgrade` re-adds it nullable). Nothing reads or writes it anymore.
- **Keep** `needs_baseline_at` (the born-fed anchor) and the three `*_tended_at` columns — they
  still power the gentle needs and the optional tend. (`last_pampered_at` / `last_pampered_need`
  remain stamped-but-unread, as under ADR-0029.)
- **No new stored state.** Warmth/needs are derived from the activity log + the tend stamps, in
  keeping with ADR-0009.

## Consequences

- A lapse is never a loss: the companion waits patiently and brightens the moment you return — the
  right incentive for a habit-forming beginner. The engagement hook becomes "your creature missed
  you", not "your creature will die".
- The Care surface is now purely encouraging: a calm needs read-out + an optional nudge + the
  optional tend buttons, with no warning banner, no memorial, and no death copy.
- Because the floor (`0.8`) sits above `TEND_CAP` (`0.6`), tending a fully-eased need doesn't visibly
  change its value — that's acceptable: practice (which fills to full) is what lifts a need above the
  floor, and tending stays a friendly, harmless touch. (A future tweak could raise `TEND_CAP` above
  the floor if we want tending to read as a visible bump.)
- The migration drops a column; the rest is computed, so most behaviour changes need no migration.

## Alternatives considered

- **Keep mortality opt-out / a difficulty toggle** (rejected — the beginner-first default must be
  safe; a setting hides the problem behind a switch most users never find).
- **Collapse the three needs into a single "warmth" + a once-a-day "visit"** (the revision doc's
  §4.2/§4.3 sketch — deferred; this phase keeps the three needs + Feed/Rest/Play as gentle care so
  the change stays the smallest correct reversal of mortality, not a larger redesign).
- **Floor at the `restless` tier** (`0.6`, = `TEND_CAP`) so tending reads as a visible bump
  (rejected — `restless` still triggers the low-need care nudge; `content` is the mildest tier that
  never reads as needing care, matching "encouraging-only").
