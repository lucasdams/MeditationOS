# ADR-0017: Source-agnostic biometric-readings data model

> **Superseded by [ADR-0022](0022-spirit-companion-replaces-sanctuary.md)** — the Sanctuary was retired in favour of the Spirit companion. Kept for historical rationale.

**Status:** Accepted · 2026-06

## Context

The product is branded on *HRV resonance breathing* but has never **measured**
anything — the user breathes without seeing the effect, so the core thesis
("breathe → measure → see your resonance improve") stays abstract. We want to make
that loop tangible.

The eventual capture tech is varied and not all available now: **camera PPG**
(fingertip estimate), **wearable / health-platform import** (Apple Health, Google
Fit, Oura, Whoop, Fitbit), and plain **manual entry**. Building any single capture
method first would risk a schema shaped around that method.

This ADR covers the **first slice**: the data model, API, and a manual/estimated
capture loop — deliberately *before* any measurement tech — so the rest can plug in
without reshaping storage.

## Decision

One table, **`biometric_readings`**, holds a single heart-rate data point (and an
optional HRV value), designed to be **source-agnostic**:

- **UUID PK**; `user_id` FK `ON DELETE CASCADE` (the reading is the user's, and dies
  with the account) — consistent with [ADR-0004](0004-uuid-primary-keys.md).
- Optional **`session_id`** FK `ON DELETE SET NULL` — a reading *may* be tied to a
  practice sit, but deleting the sit keeps the reading (the data point is still the
  user's history). Indexed for the pre/post lookup.
- **`context`** ∈ {`pre`, `post`, `resting`} — a `pre`/`post` pair sharing a
  `session_id` lets us surface the **immediate calming delta** around a sit; `resting`
  is a standalone baseline.
- **`bpm`** (int, required) and **`hrv_ms`** (float, optional, e.g. RMSSD) — manual
  entry often has only heart rate at first, so HRV is nullable rather than two tables.
- **`source`** ∈ {`manual`, `estimated`, `camera`, `wearable`} — the extension point.
  Manual/estimated ship now; **camera and wearable are already valid values**, so the
  later capture work adds a writer, not a migration.
- **`measured_at`** (tz-aware, user-set) plus `created_at`/`updated_at`. Indexed on
  `(user_id, measured_at)` for the trend query.

Validation (Pydantic, `extra="forbid"`) and DB `CHECK` constraints both enforce the
plausible-human ranges (`bpm` 30–220, `hrv_ms` ≥ 0) and the `context`/`source` sets —
belt-and-braces so a bad row can't enter from either path.

The pre/post **delta** is **computed on read** (average of post−pre across paired
sits, with the sample size), not stored — consistent with
[ADR-0009](0009-gamification-computed-from-activity.md): derive from the data we
already hold rather than denormalize.

**Non-clinical by rule.** Per [`ai-product.md`](../../.claude/rules/ai-product.md), the
UI frames every value as a *personal wellness signal you log yourself — not a medical
measurement or diagnosis*. No medical claims anywhere.

## Consequences

- **Camera PPG and wearable import extend, not reshape.** They write rows with
  `source='camera'`/`'wearable'` and reuse the same API, schemas, trend, and delta.
- **One honest trend surface.** Manual, estimated, and (later) device readings share a
  chart and a delta line, so the user sees one story regardless of how it was captured.
- **HRV-optional is first-class**, so the manual loop is usable on day one (heart rate
  only) and gets richer as HRV sources arrive.
- **Cost:** `source` and `context` are app-enforced enums via `CHECK` rather than a
  Postgres `ENUM` type — adding a value is a `CHECK` change, accepted as the cheaper,
  more reversible option (matches the existing `sessions.type` pattern).

## Alternatives considered

- **A column per source** (e.g. `camera_bpm`, `wearable_hrv`) — explodes the schema and
  cofuses "where it came from" with "what it is". Rejected; `source` captures provenance
  in one column.
- **Separate `hrv_readings` and `hr_readings` tables** — most readings carry both or
  only HR; two tables doubles the write/query paths for no gain. One nullable `hrv_ms`
  is simpler.
- **Storing the pre/post delta** — would drift from its inputs and needs backfill on any
  rule change; computing it on read is correct by construction at this scale.
- **Building camera PPG first** — would have shaped the schema around one method's
  quirks before we knew the others'. Manual-first with `source` proves the model is
  method-neutral.
