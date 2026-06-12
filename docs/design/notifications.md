# Notifications & Email

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md)

How the app reaches the user. The first and only channel is **email**; it carries
the **daily practice reminder** and the **password-reset** link (see
[authentication](authentication.md)), and is the foundation for email verification
later.

## The channel

`app/services/notifications/email.py` exposes one function:

```python
send_email(to, subject, body) -> bool   # never raises
```

- **No SMTP configured → log, don't send.** With `SMTP_HOST` blank (local dev, or
  before a provider is wired up) the message is logged and `send_email` returns
  `True`, so every dependent feature runs end to end. This mirrors the AI
  gratitude suggester's curated-fallback: the product never hard-depends on an
  external service being present.
- **SMTP configured → deliver** via stdlib `smtplib` (STARTTLS, optional auth). A
  delivery failure is logged and reported as `False` — it never breaks the caller.
- Swap in a transactional provider (SES, Postmark, …) by pointing `SMTP_*` at its
  relay, or by replacing `_deliver_smtp`.

Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`,
`APP_BASE_URL` (for links in emails). See `.env.example`.

## Daily practice reminder

Opt-in, stored on `users` (see [data-model](data-model.md)): `reminder_enabled`,
`reminder_hour` (0–23, local), `reminder_last_sent_at`.

- **Set via** `POST /auth/reminders { enabled, hour }` (see [api-v1](api-v1.md)),
  surfaced on the Settings page.
- **Sent by** `reminder_service.send_due_reminders(db, now_utc=…)`, which a
  scheduler invokes through `python -m app.jobs.send_reminders`.

A user is **due** when, evaluated in **their** timezone:
1. reminders are enabled and an hour is set;
2. their local time has reached that hour today;
3. they haven't already been reminded today (`reminder_last_sent_at`); and
4. they **haven't practiced yet today** — nudge, not shame.

The pass is **idempotent** (at most one reminder per user per local day), so the
scheduler can run as often as it likes; hourly is enough given hour granularity.

## Deployment

The send job is infra-agnostic — wire `python -m app.jobs.send_reminders` to any
scheduler (cron, ECS scheduled task, k8s CronJob) on an hourly cadence. The web app
does **not** send reminders inline; nothing blocks a request on email.

## Deliberately deferred

- Minute-level reminder times (hour granularity is enough for V1).
- Web push / PWA notifications (needs a service worker + VAPID).
- Streak-at-risk and milestone emails (same channel, later copy).
- Per-email unsubscribe tokens (today: toggle in Settings).
