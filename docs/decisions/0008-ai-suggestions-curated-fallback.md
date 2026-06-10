# ADR-0008: AI suggestions with a curated fallback

**Status:** Accepted · 2026-06 · Detail: [AI product rules](../../.claude/rules/ai-product.md), [API contract](../design/api-v1.md#gratitude--implemented)

## Context

The gratitude tool suggests precise prompts within a category. These should feel
fresh and varied (an AI strength), but the app must stay fully usable without an
LLM — locally with no API key, in CI, and when the model is slow or returns junk.
This is the project's first user-facing AI feature, so it also sets the pattern for
later ones (the V3 coach).

## Decision

Generate suggestions with **Claude Haiku 4.5**, but **always behind a curated
fallback**. The AI service (`backend/app/services/ai/gratitude_suggester.py`):

- lives in the service/AI layer, never in a route (per the AI product rules);
- **lazily imports** the Anthropic SDK so the dependency only loads when used and
  tests can patch `suggest_options` without it;
- is **time-boxed** (short timeout, small `max_tokens`) and rate-limited at the route;
- **validates** the model output as untrusted (a JSON array of short strings, capped);
- returns a **curated `FALLBACK_OPTIONS`** set on *any* failure — missing key, timeout,
  network error, or output that fails validation — so the endpoint never errors.

**Privacy:** suggestions are generated from the chosen **category alone**. The user's
own gratitude text is never sent to the model.

**Storage stays deterministic:** the AI only suggests prompts *within* a fixed category
taxonomy; the stored `category` is always one of the constrained enum values.

## Consequences

- The feature degrades gracefully: identical UX with or without a key, and CI runs with
  the suggester mocked — no network, no key, no flakiness.
- One new backend dependency (`anthropic`), loaded lazily.
- Output validation + the fallback bound the blast radius of a bad/hostile model response.
- Sending no user text keeps personal reflection private and the prompt stateless, at the
  cost of personalization (deferred).

## Alternatives considered

- **Curated only (no AI)** — simplest, but loses the dynamic, varied suggestions the user
  asked for. The fallback *is* this set, so we keep it as the safety net.
- **AI with no fallback** — unacceptable: breaks with no key, in CI, and on any timeout.
- **Personalize from the user's history** — richer, but would send private reflections to
  the model. Deferred on privacy grounds.
- **AI-generated category labels** — would mean storing free-text categories, losing clean
  filtering/stats. Kept a fixed taxonomy instead.
