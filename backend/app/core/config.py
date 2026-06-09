"""Application settings, loaded from environment variables.

Field names map case-insensitively to env vars (e.g. `secret_key` ← `SECRET_KEY`),
matching the names documented in `.env.example`.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    secret_key: str = "change-me-to-a-random-secret"
    cors_origins: str = "http://localhost:5173"
    access_token_expire_minutes: int = 60

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS origins as a list, parsed from the comma-separated env value."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
