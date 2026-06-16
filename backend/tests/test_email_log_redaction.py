"""Security audit fix #2: in production, the no-SMTP fallback must not log the
message body (which carries live reset/verify tokens) or the recipient address (PII).
In non-production it still logs both for local-dev convenience.
"""

import logging

from app.core.config import settings
from app.services.notifications import email


def test_no_smtp_production_omits_body_and_recipient(monkeypatch, caplog):
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "environment", "production")
    with caplog.at_level(logging.INFO, logger="meditationos.email"):
        assert email.send_email(
            "victim@example.com", "Reset your password", "link?token=SECRETTOKEN123"
        )
    log = caplog.text
    assert "SECRETTOKEN123" not in log
    assert "victim@example.com" not in log
    assert "Reset your password" in log  # subject is safe to log


def test_no_smtp_dev_still_logs_body_and_recipient(monkeypatch, caplog):
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "environment", "development")
    with caplog.at_level(logging.INFO, logger="meditationos.email"):
        assert email.send_email(
            "dev@example.com", "Reset your password", "link?token=DEVTOKEN456"
        )
    log = caplog.text
    assert "DEVTOKEN456" in log
    assert "dev@example.com" in log
