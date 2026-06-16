# Notifications & Email

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md)

How the app reaches the user. The primary channel is **email** — it carries the **daily
practice reminder**, the **weekly summary**, the **password-reset** link, and the
**email-verification** link (see [authentication](authentication.md)). A second, opt-in
channel is **Web Push** (see [Web Push](#web-push)), used to also deliver the daily
nudge as a push notification.

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

## Weekly summary

Opt-in, stored on `users`: `weekly_summary_enabled`, `weekly_summary_day` (0=Mon…6=Sun,
local), `weekly_summary_last_sent_at`.

- **Set via** `POST /auth/weekly-summary { enabled, day }`.
- **Sent by** `weekly_review_service.send_due_weekly_summaries`, via
  `python -m app.jobs.send_weekly_summaries`, on the chosen local weekday at/after 9am.
- Content is the same computed "this week" review the dashboard shows.
- **Idempotent** per ISO week (`weekly_summary_last_sent_at`).

## Web Push

Opt-in browser push, **provider-optional** (mirrors the email/AI fallback): with no VAPID
keys it's disabled — subscriptions still store but sends no-op. Endpoints live in
`push_subscriptions`; `push_service.send_to_user` lazily uses `pywebpush`. The daily
reminder job also pushes (best-effort) to a user's subscriptions. The browser side needs
the production service worker (`public/sw.js`); see [api-v1 `/push`](api-v1.md#push--implemented).

## Deployment

The send jobs are infra-agnostic — wire `python -m app.jobs.send_reminders` and
`python -m app.jobs.send_weekly_summaries` to any scheduler (cron, ECS scheduled task,
k8s CronJob) on an hourly cadence. The web app does **not** send inline; nothing blocks
a request on email or push.

## Streak-save nudge ✅ shipped

A separate, **opt-in evening email** sent only when ALL of:
1. the user's daily reminder is enabled (same opt-in);
2. their local time has reached 20:00;
3. they have an active streak (≥1 day);
4. they have **not practiced today** (so the streak is at risk);
5. the streak is not currently safe via the rest-day allowance; and
6. no streak-save nudge has been sent yet today (`users.streak_save_last_sent_at`).

The nudge uses its own timestamp (`streak_save_last_sent_at`) so it never interferes
with the morning reminder. It is strictly **nudge, not shame** — if the user has
already practiced, or if the streak is safe via rest-day insurance, no nudge fires.
Sent by `reminder_service.send_streak_save_nudges`, invoked via
`python -m app.jobs.send_reminders` on the same scheduler as the morning reminder.

## Deliberately deferred

- Minute-level reminder times (hour granularity is enough for V1).
- Milestone emails (same channel, later copy).
- Per-email unsubscribe tokens (today: toggle in Settings).
