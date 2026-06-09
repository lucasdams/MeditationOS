"""Application settings, loaded from environment variables.

Field names map case-insensitively to env vars (e.g. `secret_key` ← `SECRET_KEY`),
matching the names documented in `.env.example`.
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-me-to-a-random-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    secret_key: str = DEFAULT_SECRET_KEY
    cors_origins: str = "http://localhost:5173"
    access_token_expire_minutes: int = 60
    database_url: str = "postgresql://postgres:postgres@database:5432/meditationos"
    login_rate_limit: str = "5/minute"

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS origins as a list, parsed from the comma-separated env value."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def _require_secret_key_in_production(self) -> "Settings":
        """Refuse to boot in production with the placeholder secret.

        A default/known signing key means anyone can forge a valid JWT, so this
        must never reach a deployed environment. Fail fast at startup instead.
        """
        if self.environment == "production" and self.secret_key == DEFAULT_SECRET_KEY:
            raise ValueError(
                "SECRET_KEY must be set to a strong, non-default value when "
                "ENVIRONMENT=production."
            )
        return self


settings = Settings()
