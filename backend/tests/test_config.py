"""Settings guardrails."""

import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_SECRET_KEY, Settings

# Minimal valid production overrides shared across tests.
_PROD_BASE = {
    "environment": "production",
    "secret_key": "a-strong-random-secret",
    "cors_origins": "https://app.example.com",
    "database_url": "postgresql://user:pass@prod-db:5432/meditationos",
}


def test_production_rejects_default_secret():
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key=DEFAULT_SECRET_KEY)


def test_production_accepts_real_secret():
    settings = Settings(**_PROD_BASE)
    assert settings.environment == "production"


def test_development_allows_default_secret():
    # Local dev must stay frictionless.
    settings = Settings(environment="development", secret_key=DEFAULT_SECRET_KEY)
    assert settings.secret_key == DEFAULT_SECRET_KEY


# ── new production-config guardrails ─────────────────────────────────────────


def test_production_rejects_localhost_cors():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(**{**_PROD_BASE, "cors_origins": "http://localhost:5173"})


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(**{**_PROD_BASE, "cors_origins": "*"})


def test_production_rejects_default_database_url():
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(
            **{
                **_PROD_BASE,
                "database_url": "postgresql://postgres:postgres@database:5432/meditationos",
            }
        )


def test_production_rejects_localhost_database_url():
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(
            **{**_PROD_BASE, "database_url": "postgresql://user:pass@localhost:5432/meditationos"}
        )


def test_production_rejects_email_verification_without_smtp():
    with pytest.raises(ValidationError, match="SMTP_HOST"):
        Settings(**{**_PROD_BASE, "require_email_verification": True, "smtp_host": ""})


def test_production_email_verification_with_smtp_ok():
    # Should not raise.
    settings = Settings(
        **{**_PROD_BASE, "require_email_verification": True, "smtp_host": "smtp.example.com"}
    )
    assert settings.require_email_verification is True


def test_development_ignores_all_prod_checks():
    # All the "bad" values must still work in dev so local boot is frictionless.
    settings = Settings(
        environment="development",
        secret_key=DEFAULT_SECRET_KEY,
        cors_origins="http://localhost:5173",
        database_url="postgresql://postgres:postgres@database:5432/meditationos",
        require_email_verification=True,
        smtp_host="",
    )
    assert settings.environment == "development"
