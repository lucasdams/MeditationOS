# AI Product Standards (V3)

Read when working on user-facing AI features: LLM integration, prompts, journal analysis, or coaching.
Applies to `backend/**/ai/**`, `backend/**/llm/**`, `backend/**/prompts/**`.

## Integration

- LLM calls in `backend/app/services/ai/`, not route handlers.
- Never send passwords, tokens, or unnecessary PII to the model.
- Per-request and per-user token/cost limits.

## Prompts

- Version prompts in `backend/app/prompts/` or dedicated modules; no inline string soup in routes.
- System prompt sets role and boundaries; user content is clearly separated.
- Safe fallbacks for empty, off-topic, or harmful input.

## Output

- Treat model output as untrusted; validate shape before returning to client.
- User-facing text: helpful, non-clinical, no medical claims.
- Log prompt metadata for debugging; avoid logging full journal text in production.

## Do Not

- Block requests on LLM calls without timeouts.
- Put API keys in frontend code.
- Send AI responses without user initiation.
