# ADR-0001: Record architecture decisions

**Status:** Accepted · 2026-06

## Context

This is a portfolio project meant to demonstrate engineering judgment, not just working code. The reasoning behind a choice is more interesting — to a reviewer or interviewer — than the choice itself, and it's the part that's usually lost.

## Decision

Capture significant technical decisions as numbered ADRs in `docs/decisions/`, using a light Context → Decision → Consequences → Alternatives format. ADRs are immutable once accepted; a changed decision gets a new ADR that supersedes the old one.

## Consequences

- The repo carries a readable trail of *why* the system looks the way it does.
- Each ADR is a ready-made interview talking point.
- Small ongoing cost: a few minutes to write one per real decision.

## Alternatives considered

- **No record** — relies on memory; the rationale evaporates.
- **One big DECISIONS.md** — harder to reference a single decision and loses the immutability/supersession model.
