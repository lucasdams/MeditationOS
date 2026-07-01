# 32. Spirit Vitality + Balance — one headline signal, the three needs demoted to a balance

**Status:** Accepted · 2026-07-01 · **Refines (does not fully supersede)
[ADR-0029](0029-spirit-tamagotchi.md) and [ADR-0031](0031-companion-stops-being-mortal.md).**
ADR-0031 already made the companion non-mortal and floored the three needs; this ADR keeps all of
that and changes only what the overall look is computed from and how the needs are framed. The
cosmetic skill tree ([ADR-0027](0027-spirit-upgrades-skill-tree.md)), the set bonuses
([ADR-0028](0028-spirit-set-bonuses.md)), the per-item need affinity
([ADR-0026](0026-per-item-need-affinities.md)), and rebirth-from-a-spark
([ADR-0030](0030-spirit-rebirth-from-a-spark.md)) are all unchanged.

## Context

Since ADR-0023 the overall **condition** has been the WEAKEST of three co-equal, independently
decaying needs (`nourished` / `rested` / `joyful`). ADR-0031 floored those needs so none can punish,
but the *structure* remained: three meters, any one of which drags the summary look down.

A market + behaviour-science review flags this structure as the wrong shape for a calm, habit-forming
beginner product:

- Every gentle winner in the category (e.g. Finch) runs on **one** signal fed by **any** activity.
  A single loop is legible and low-friction.
- **Multiple simultaneously-decaying meters trend toward chore/guilt** — the user feels they are
  "failing" whichever facet is lowest, even when they practiced today. That is exactly the
  manufactured-guilt failure mode ADR-0031 set out to remove, re-introduced through the back door of
  "the weakest need is your look".
- Self-compassion / **informational** framing ("here's your recent mix") beats pressure framing
  ("wants / needs / depleted") for adherence and wellbeing.

## Decision

1. **One headline signal — VITALITY (a.k.a. "cared-for").** The overall `condition` is redefined:
   its factor now decays off the **most-recent practice of ANY kind** — any sit
   (mindfulness/breathing/etc.), a gratitude entry, OR a journal entry — floored at `NEEDS_FLOOR`
   over `DECAY_DAYS`, so a day with a single practice of any sort keeps the companion **content**.
   No single facet can drag the overall look down anymore. The API field name stays `condition`
   (tier + factor) to avoid a response-shape break; only the computation + docstrings change. The
   worst reachable tier stays `content` (floored) — never alarming.

2. **The three needs become an informational BALANCE, not three debts.** `nourished` / `rested` /
   `joyful` are computed exactly as before (same feeders, same floor + decay) — but they are demoted
   to a read-out of the practitioner's **recent practice mix**, advisory only. They no longer drive
   the overall look, and a low facet is a gentle "you could round this out" hint, never an
   obligation. The per-item need affinity (ADR-0026) still favours one of the three facets, which is
   consistent with this framing.

3. **All user-facing copy shifts from pressure to gentle suggestion.** The header chip stops saying
   "Wants {Need}" and instead shows an optional, easy-to-ignore round-out invitation for the
   least-represented facet ("A little {Joy}?"), and only when the balance is actually uneven (facets
   within a small delta → no chip at all). The Practices hub keeps its highlight but reframes it as
   "round out your balance", not "needs / wants". The Spirit page leads with the Vitality tier and
   renders the three as a calm balance read-out plus at most ONE optional round-out suggestion. No
   "needs / wants / hungry / depleted / ailing" language survives. The internal tier NAMES
   (thriving/content/restless/unwell) are data and are unchanged — they are simply never presented
   as alarms (and `restless`/`unwell` remain unreachable behind the floor).

## Stored state

- **None.** No schema change, no migration. Vitality and the three facets are all computed on read
  from the existing activity log + the born-fed `needs_baseline_at` anchor + the `*_tended_at`
  stamps (ADR-0009/0011). The response shape is unchanged (`condition` keeps its `{tier, factor}`).

## Consequences

- The engagement loop is now single and legible: *any* practice keeps your companion content, which
  is the honest, low-pressure incentive — you cannot "fail" a facet by practicing the "wrong" thing.
- The three facets still add texture (a balance read-out + an optional round-out) without ever
  reading as a chore or a debt.
- Because `condition` is now fed by any practice rather than the weakest need, a creature whose
  signature-need facet has eased to the floor can still read as thriving — that is the point.
- Tending (Feed / Rest / Play, ADR-0031) is unchanged: it tops up an individual facet in the balance
  read-out; it does not feed the Vitality signal (practice does).

## Alternatives considered

- **Collapse the three needs into a single "warmth" meter entirely** (the beginner-first revision's
  §4.2 sketch) — deferred. Keeping the three as an informational balance preserves the existing
  Feed/Rest/Play affordance and the per-item need affinity with the smallest correct change, while
  still fixing the multi-debt problem by demoting them out of the overall look.
- **Keep condition = weakest need but soften only the copy** — rejected. The copy is downstream of
  the model: as long as the *look* is driven by the lowest facet, the product still teaches "you're
  behind on X", no matter how gently it's worded.
- **Feed Vitality only from sits (not reflections)** — rejected. Gratitude and journaling are
  first-class practices in this data-first product; excluding them would punish a reflection-only day.
