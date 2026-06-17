"""Outbound email — the app's single channel for reaching the user.

Graceful degradation, like the AI gratitude suggester: when no SMTP host is
configured (local dev, or before a provider is wired in production) the message
is *logged* rather than delivered, so every dependent feature still runs end to
end. Sending never raises — a provider failure is logged and reported as False
so callers (e.g. the reminder job) can carry on.

Swap in a transactional provider (SES, Postmark, …) later by replacing
`_deliver_smtp` or pointing SMTP_* at the provider's relay.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("meditationos.email")


def list_unsubscribe_headers() -> dict[str, str]:
    """Headers for opt-in bulk mail (reminders, weekly summaries) so mail clients can
    surface a one-tap unsubscribe and senders look legitimate.

    Points at the in-app notification settings page — the existing opt-out mechanism —
    plus a mailto: fallback. We deliberately do NOT advertise RFC 8058 one-click POST
    (`List-Unsubscribe-Post`): there is no unauthenticated token endpoint to honour a
    blind POST, and toggling reminders requires a signed-in session. Unsubscribing is a
    two-tap flow via Settings, which the URL form conveys honestly."""
    settings_url = f"{settings.app_base_url}/settings"
    return {
        "List-Unsubscribe": f"<{settings_url}>, <mailto:{settings.email_from}>",
    }


def _deliver_smtp(
    to: str, subject: str, body: str, headers: dict[str, str] | None = None
) -> bool:
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    for name, value in (headers or {}).items():
        message[name] = value
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
    return True


def send_email(
    to: str, subject: str, body: str, headers: dict[str, str] | None = None
) -> bool:
    """Send (or, with no SMTP configured, log) an email. Returns whether it was
    handed off successfully. Never raises.

    `headers` adds extra RFC 5322 headers (e.g. List-Unsubscribe) for bulk/opt-in
    mail; transactional callers can omit it."""
    if not settings.smtp_host:
        if settings.environment == "production":
            # Never log the recipient (PII) or body (carries live reset/verify tokens)
            # to stdout/CloudWatch in production.
            logger.info("email queued (no SMTP configured) subject=%s", subject)
        else:
            # Dev / no-provider mode: log the full message so flows still work locally.
            logger.info(
                "email (not sent — no SMTP configured) to=%s subject=%s\n%s",
                to,
                subject,
                body,
            )
        return True

    try:
        return _deliver_smtp(to, subject, body, headers)
    except Exception:  # noqa: BLE001 — never let email delivery break the caller
        if settings.environment == "production":
            # Don't log the recipient address (PII) in production.
            logger.exception("email delivery failed subject=%s", subject)
        else:
            logger.exception("email delivery failed to=%s subject=%s", to, subject)
        return False
