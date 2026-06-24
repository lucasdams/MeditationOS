# ADR-0022: Spirit companion replaces the Sanctuary

**Status:** Accepted · 2026-06-23 · Supersedes [ADR-0010](0010-sanctuary-cultivation.md)–[ADR-0021](0021-sanctuary-evolution-tree-and-preview-locked.md) · Detail: [Spirit design](../design/spirit.md)

## Context

The Sanctuary ([ADR-0011](0011-sanctuary-spend-economy.md), refined through
[ADR-0021](0021-sanctuary-evolution-tree-and-preview-locked.md)) is the product's retention
loop: earn coins by levelling, buy static SVG items, customize and arrange them on a grid. The
engineering is sound — a derived coin balance with no wallet or ledger, 27 catalog items,
evolution trees, a movable grid — but the loop is emotionally flat. It is **collection and
decoration**: attention is spread across many inert items, nothing changes between visits, and
nothing reacts to the user. None of the things that make a virtual companion *bond* are present.

We want the retention loop to **stand out** and feel gamified. A single living companion — one
subject, with state that changes between visits, that reacts to practice — is the strongest hook
available, and no competing meditation app does it.

The risk is that the obvious "virtual pet" design (Tamagotchi) runs on **neglect → decay →
death**, a guilt loop that directly contradicts the app's [calm, low-pressure
stance](../design/gamification.md). The design must keep a pet's *aliveness* while discarding its
*punishment*.

## Decision

Replace the Sanctuary with a **Spirit**: a single companion the user awakens once and grows by
practicing. Full replacement, not a parallel feature — two retention loops would compete for the
same coins and home-screen real estate.

- **The practice shapes the evolution (the standout mechanic).** Everyone awakens the same
  pathless spark; the user's **dominant lifetime practice** (computed from the aggregates
  `dashboard_service` already produces) determines which of three paths it grows into —
  `stillness` (a mini Buddha), `breath` (a wind spirit), or `heart` (a bloom spirit). The path is
  shown as a *lean* early, then **commits once** at stage 2. Different practitioners get visibly
  different creatures; "which companion?" becomes discovery and replay, not a menu pick.
- **Five-stage growth, derived from level.** `spark → wisp → fledgling → ascendant → radiant`,
  gated by level bands (tunable constants). Stage is a pure function of level, which is computed
  from **earned XP** (total minus the volatile streak bonus) — so it is **monotonic and can never
  be lost**.
- **Gamified, never punishing.** Evolution stage, bond, and the collection of retired spirits are
  permanent. Lapsing dims only the *surface daily glow*, floored so the spirit never goes dark,
  sick, or dies; the next session restores it. The pull is a happy reunion, not fear of loss.
- **It reacts.** The spirit lives on the home screen with an idle animation, a computed daily
  glow, a session-complete celebration (via the existing `RewardOverlay`), and — the signature
  moment — an **aura that breathes in sync with the resonance pacer** on `BreathePage`.
- **The economy survives, repurposed.** The derived-balance coin model is kept verbatim
  (`coins = level × COINS_PER_LEVEL − Σ spent`, holdings-as-ledger, no wallet) and repointed from
  garden items to **spirit cosmetics** (auras, accessories, a small habitat). The progressive
  surcharge ([ADR-0013](0013-sanctuary-progressive-pricing.md)) is dropped — with one subject
  there is no hoarding to tax.
- **Maximally computed state.** Consistent with [ADR-0009](0009-gamification-computed-from-activity.md)
  and [ADR-0011](0011-sanctuary-spend-economy.md): store only the irreducible decisions — the
  committed `path`, the optional `name`, the owned `cosmetics`, and retired spirits — in one
  `spirits` table. Stage, bond, glow, and coins are all derived.
- **No-reset migration.** A user's level maps to a starting stage and their history seeds a path,
  so existing practitioners awaken an already-grown spirit. Past garden spend is no longer
  subtracted from coins, so balances only rise (monotonic-safe). `sanctuary_plantings` is retained
  by the cutover migration and dropped later.

Full mechanics, data model, API, and the seven-step build order are in the
[Spirit design](../design/spirit.md).

## Consequences

- **Supersedes a large body of work.** On acceptance this retires ADR-0010–0021 and removes the
  Sanctuary routes/UI; ~4,000 lines of frontend and a full backend service are replaced. The
  derived-economy machinery, the level/XP engine, and the companion SVG renderers (dog/cat/fox/
  bird) are reused; the grid, multi-item collection, four-track shop, and progressive pricing are
  cut. This is the single biggest design change in the app — phased over multiple PRs.
- **One new stored decision shape.** A committed `path` is stored because hysteresis must stop it
  flip-flopping — it is not derivable after commit, the same justification ADR-0011 used for
  purchases. Everything else stays computed.
- **Reactivity is the real cost.** The animation/breathing-sync layer is where "stand out"
  succeeds or fails and is the bulk of the frontend effort, beyond per-path × per-stage art.
- **Keeps the app's ethos.** Monotonic progress and a non-destructive daily glow preserve the
  "wellness nudges, never shames" property that made the Sanctuary safe — while adding a genuine
  bond the Sanctuary lacked.

## Alternatives considered

- **Reframe, not replace** — keep the Sanctuary and promote one of its companion items to a live
  pet, demoting the garden to a backdrop. Salvages the most code, but leaves two half-loops (a
  static garden plus a pet) competing for attention and coins; the user chose full replacement for
  a single, focused, standout loop.
- **Add a pet alongside the Sanctuary** — lowest risk, but two parallel retention loops dilute
  each other and double the surface to maintain. Rejected for the same reason.
- **Classic Tamagotchi decay/death** — more "game", but its engine is guilt and loss, which
  violates the app's [calm, low-pressure stance](../design/gamification.md). Rejected; the daily
  glow gives the *liveness* without the harm.
- **Let the user pick the companion from a menu** — simpler, but throws away the standout
  practice-shapes-evolution hook and makes the choice a one-time dropdown instead of an ongoing,
  personal, replayable discovery.
</content>
