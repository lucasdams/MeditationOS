# ADR-0015: Sanctuary — naming and personal touches (name, note, favourite)

**Status:** Accepted · 2026-06-16 · Extends [ADR-0011](0011-sanctuary-spend-economy.md), [ADR-0012](0012-sanctuary-personalization.md), [ADR-0014](0014-sanctuary-grid-layout.md) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

[ADR-0012](0012-sanctuary-personalization.md) let users personalize an item's *form*
(variant) and *features* (mix-and-match customizations). What was still missing is the
quiet, *personal* layer — the bit that makes a garden feel like **yours**: giving an item a
name ("Grandpa's Oak"), jotting a one-line memory, or marking the few items you love. These
are sentimental, not economic.

The product's saved UX preference is **calm, uncrowded, low-pressure**: naming should feel
like an optional personal touch, never a nag. So whatever we add must be optional and
default-off, and must not clutter a user who ignores it.

## Decision

Add three **purely cosmetic** fields to a holding, all optional and default-off:

- **`name`** — a user-chosen plaque/nickname shown under the item (≤ 40 chars). Settable at
  purchase (the primary ask) and editable anytime. `NULL` = unnamed.
- **`note`** — a short free-text caption/memory (≤ 140 chars). `NULL` = none.
- **`favorite`** — a boolean pin flag, surfaced subtly (a small star). Default `false`.

Why these three: a name is the headline request; a note is the natural one-line companion
(a memory beside the name); a favourite is a single-bit "this one matters" that's trivial to
store and surface. Together they cover the personal layer without sprawl — no tags, no
colours, no descriptions — and all three ride one additive migration and one endpoint.

- **Cosmetic, never economic.** None of the three enter the derived-balance spend
  computation ([ADR-0011](0011-sanctuary-spend-economy.md)): naming, noting, or pinning an
  item can **never change coins**. They are also layout-neutral (independent of `cell`,
  [ADR-0014](0014-sanctuary-grid-layout.md)).
- **Schema.** `sanctuary_plantings` gains `name VARCHAR(40) NULL`, `note VARCHAR(140) NULL`,
  and `favorite BOOLEAN NOT NULL DEFAULT false`. One additive, reversible migration; existing
  rows are unchanged (NULL name/note, `favorite = false`).
- **Name at purchase.** `POST /sanctuary/buy` accepts an optional `name`. The frontend offers
  it in the buy modal (multi-variant items) and via a quiet, optional "name it…" affordance
  on single-variant items — the one-tap Buy stays the default so naming never nags.
- **A `PATCH /sanctuary/items/{id}` endpoint.** Body `{ name?, note?, favorite? }`, a
  **partial update** (only the fields *present* change, via Pydantic's `model_fields_set`),
  user-scoped and default-deny (404 for another user's item). It returns the updated scene
  and never changes coins. PATCH (not a dedicated `/name` route) because it cleanly covers
  all three cosmetic fields in one place and reads as "edit this item".
- **Input handling.** `name`/`note` are user text: trimmed, empty/whitespace → `NULL`
  (clearing the field), and length-capped server-side (40 / 140) → `422` on over-length,
  enforced regardless of any client cap. React escapes the text on render, so there is no
  HTML-injection vector; the caps bound storage and layout.

### Suggested names per item (amendment, 2026-06-18)

Naming above started from a blank field, so it sat quiet but uninviting. To make it feel
personal and *charming* without ever nagging, each catalog item now carries a small pool of
**suggested example names** that fit *that* item — gnome names for the gnome ("Bramblewick"),
breed-appropriate pet names ("Biscuit" for the dog), nature names for the plants/trees, and
whimsical names for the curios (the tea cart, the wind chime).

- **Static per item type, in code beside `blurb` — no DB change, no migration.** The
  `CatalogItem` dataclass gains `suggested_names: tuple[str, ...] = ()` (built via a fluent
  `.names(...)` helper), exactly mirroring how `blurb` is defined. It is **cosmetic only** and
  never enters the spend computation, like the rest of the personal layer.
- **Surfaced as a *suggestion*, never a default.** The naming field starts **blank**; the
  item's first suggested name is shown only as the input **placeholder** ("e.g. Bramblewick"),
  and a quiet **"suggest a name" 🎲** button fills a random name from the pool so the user can
  shuffle until one fits. Nothing is auto-assigned — the chosen name still saves through the
  unchanged buy / `PATCH` flow, so storage and validation are untouched.
- **Exposed to the client on the existing scene payload.** `ShopItem` (the shop entry the
  buy UI already reads) gains `suggested_names: list[str]`, the same path `blurb` travels. The
  rename panel for an owned item looks the pool up from that shop entry by `item_key`, so both
  the buy modal and the rename field offer the placeholder + 🎲 shuffle.
- Names are short (≤ the 40-char cap), warm, and family-friendly; a catalog-integrity test
  asserts every item has at least one non-empty suggestion.

## Consequences

- The garden gains a sentimental layer with no economic surface area — the derived-balance,
  no-wallet/no-ledger property (ADR-0011) is provably untouched, since the spend computation
  ignores these fields entirely.
- Default-off everywhere: a user who never names anything sees exactly the prior UI.
- One additive, reversible migration; three nullable/defaulted columns — negligible cost.
  Caps are constants mirrored in the schema, so retuning a cap is a one-line edit (the column
  length is a defence-in-depth bound, not the primary gate).
- The personalization data is portable: the account export dumps all columns, so names and
  notes travel with the user.

## Alternatives considered

- **A dedicated `/name` route.** Rejected — a single `PATCH` covers name + note + favourite
  without three near-identical endpoints, and matches REST "edit the resource".
- **Free-form tags / colour labels / long descriptions.** Deferred — they add UI weight and
  storage shape for little extra value over a name + a one-line note; they would fight the
  calm-UX preference. Can layer on later without breaking this API.
- **Storing the touches in the `customizations` JSONB blob.** Rejected — those are *priced*
  economy options; mixing free cosmetic text into them would risk the derived balance and
  muddy validation. Normalised columns keep the cap + nullability explicit and queryable.
- **Charging coins to name/favourite.** Rejected — naming is a sentimental touch, not a
  purchase; pricing it would make it a nag and re-enter the economy.
