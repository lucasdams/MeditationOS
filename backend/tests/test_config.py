"""Settings guardrails."""

import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_SECRET_KEY, Settings


def test_production_rejects_default_secret():
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key=DEFAULT_SECRET_KEY)


def test_production_accepts_real_secret():
    settings = Settings(environment="production", secret_key="a-strong-random-secret")
    assert settings.environment == "production"


def test_development_allows_default_secret():
    # Local dev must stay frictionless.
    settings = Settings(environment="development", secret_key=DEFAULT_SECRET_KEY)
    assert settings.secret_key == DEFAULT_SECRET_KEY
