# ADR-0014: Sanctuary — movable grid layout (separate from the economy key)

**Status:** Accepted · 2026-06-15 · Extends [ADR-0011](0011-sanctuary-spend-economy.md), [ADR-0012](0012-sanctuary-personalization.md), [ADR-0013](0013-sanctuary-progressive-pricing.md) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

Users want to **arrange their garden** — put each item in the spot they personally want,
not just in the order they bought it. That means free placement on a grid (choose the
cell), with drag-to-move, and it has to work on mobile (a core-flow requirement).

The obvious move — reorder by rewriting `sanctuary_plantings.position` — is unsafe.
[ADR-0013](0013-sanctuary-progressive-pricing.md) keys the **progressive pricing
surcharge** off `position` as a proxy for *acquisition order*: the k-th item acquired pays
`round(PROGRESSIVE_STEP × position)`, and the whole balance is **derived from holdings**
(no wallet, no ledger — ADR-0011). If a layout change rewrote `position`, the garden would
silently re-price and balances would shift. Layout must not touch the economy.

## Decision

- **A separate `cell` column.** Add `sanctuary_plantings.cell INT` — a row-major grid index
  (`cell = row × GRID_COLUMNS + col`) — with `UNIQUE(user_id, cell)` so two items can't
  share a spot. `position` is left untouched and keeps its own `UNIQUE(user_id, position)`;
  it remains the **immutable acquisition-order key** the surcharge is computed from. The
  balance computation is unchanged, so the economy is provably unaffected by layout.

- **Backfill `cell = position`.** Existing gardens keep their present order as the initial
  layout. New items are bought into the **lowest free cell** (`position` still gets
  `max(position)+1`, exactly as before — pricing is unchanged).

- **A layout-only `POST /items/{id}/move` endpoint.** Body `{ cell }`, user-scoped and
  default-deny (404 for another user's item; 422 for a negative or out-of-bounds cell). If
  the target cell is occupied by another of the user's items, the two **swap** cells; else
  the item simply takes the empty cell. The swap is one transaction, staging the moving row
  on a temporary out-of-range sentinel cell so `UNIQUE(user_id, cell)` is never momentarily
  violated. It returns the updated scene and never changes coins.

- **Drag on desktop, tap-to-place on touch.** The frontend renders the garden on a CSS
  grid (`GRID_COLUMNS = 4`, mirroring the backend constant) ordered by `cell`. Desktop uses
  native HTML5 drag-and-drop (no new dependency, a project rule). Touch and keyboard use a
  **tap-to-pick-then-tap-target** fallback, since HTML5 DnD is unreliable on touch. Moves
  are optimistic and revert with an error toast on failure.

## Consequences

- Layout is fully decoupled from pricing: `position` (economy) and `cell` (layout) are
  independent keys. Rearranging the garden can never alter the balance.
- The balance stays **derived from holdings** — `cell` carries no cost, so ADR-0011's
  no-wallet/no-ledger property is preserved.
- Two small ints + two unique constraints per row; negligible cost. `GRID_COLUMNS` /
  `GRID_CELLS` are tunable constants — widening the grid needs no migration.
- A bounded addressable grid (`GRID_CELLS`) means move targets are validated; it is far
  larger than any realistic garden, so a buy always finds a free cell.

## Alternatives considered

- **Reorder via `position`.** Rejected — it would re-price the garden (breaks ADR-0013).
- **A JSON layout blob on the user.** Rejected — a normalized `cell` with a DB uniqueness
  guarantee is simpler to query, validate, and keep consistent than an opaque map.
- **Full touch-drag (pointer events) on mobile.** Deferred — the tap-to-place fallback is
  reliable and calm; pointer-drag can layer on later without an API change.
- **Linear reordering only.** Rejected — users asked for free placement (choose the cell),
  not just a reordered list.
