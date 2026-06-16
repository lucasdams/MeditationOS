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


def _deliver_smtp(to: str, subject: str, body: str) -> bool:
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
    return True


def send_email(to: str, subject: str, body: str) -> bool:
    """Send (or, with no SMTP configured, log) an email. Returns whether it was
    handed off successfully. Never raises."""
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
        return _deliver_smtp(to, subject, body)
    except Exception:  # noqa: BLE001 — never let email delivery break the caller
        if settings.environment == "production":
            # Don't log the recipient address (PII) in production.
            logger.exception("email delivery failed subject=%s", subject)
        else:
            logger.exception("email delivery failed to=%s subject=%s", to, subject)
        return False
