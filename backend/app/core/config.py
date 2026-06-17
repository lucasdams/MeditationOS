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
    password_reset_expire_minutes: int = 30
    email_verification_expire_minutes: int = 1440  # 24h
    database_url: str = "postgresql://postgres:postgres@database:5432/meditationos"
    # SQLAlchemy connection-pool sizing. Tune against the RDS `max_connections`
    # ceiling when scaling web workers: total connections ≈ WEB_CONCURRENCY *
    # (db_pool_size + db_max_overflow). pool_recycle guards against stale
    # connections being culled server-side (e.g. by RDS/idle timeouts).
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    login_rate_limit: str = "5/minute"
    # Per-IP burst limit on data-creation endpoints (complements the daily cap).
    write_rate_limit: str = "60/minute"
    # Per-email login throttle: lock an account's login after N failures within the
    # window (resists distributed brute force, which per-IP limiting misses).
    login_max_failures: int = 10
    login_failure_window_minutes: int = 15
    # Per-email cooldown between transactional sends (reset-request / verify-resend).
    # Complements the per-IP limiter so IP rotation can't inbox-bomb one address.
    email_send_cooldown_seconds: int = 60
    # Trust X-Forwarded-For for client IP (rate limiting). Only enable behind a
    # trusted reverse proxy — otherwise clients can spoof it to dodge limits.
    trust_proxy: bool = False
    # Max rows a user may create per type (sessions / gratitude / journals / goals)
    # per UTC day — an anti-spam ceiling, set well above real use.
    daily_create_limit: int = 200
    # OAuth client ID for "Sign in with Google" (public value). Empty = disabled.
    google_client_id: str = ""
    # Comma-separated allowlist of admin email addresses. An account whose email is in
    # this list is treated as an admin (matched case-insensitively). Migration-free and
    # matches the app's env-config ethos (CORS/SMTP/VAPID are all env). Empty = no admins.
    admin_emails: str = ""
    # Anthropic API key for AI features (gratitude suggestions). Empty = curated fallback.
    anthropic_api_key: str = ""
    # Web Push (VAPID). Both keys empty = push disabled (subscriptions still store, sends
    # no-op) — mirrors the email/AI provider-optional pattern. Generate with
    # `web-push generate-vapid-keys`. The public key is safe to expose to the client.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:noreply@meditationos.app"
    # Outbound email (practice reminders, password reset). With no SMTP host
    # configured the sender logs the message instead of delivering it — so the app
    # works locally with no provider, mirroring the AI curated-fallback pattern.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "MeditationOS <noreply@meditationos.app>"
    # Base URL the frontend is served from, used to build links in emails.
    app_base_url: str = "http://localhost:5173"
    # When True, accounts with an unconfirmed email are blocked (403) from every data
    # route (sessions, journals, sanctuary, …); auth/verify/resend/logout stay open so
    # they can confirm. Google sign-ins and guests arrive verified, so only
    # email/password signups are gated. Default False so it ships dark — flip to true
    # ONLY once verification email delivery (SMTP_*) is live and confirmed, or you lock
    # out every unconfirmed user. Mirrors the provider-optional pattern (email/AI/push).
    require_email_verification: bool = False
    # Error monitoring (Sentry). Leave blank to disable — the app runs identically
    # without a DSN (provider-optional pattern, same as email/AI/push).
    sentry_dsn: str = ""
    # Fraction of transactions to send as performance traces (0.0 = none, 1.0 = all).
    # Keep low in production; traces carry route metadata but no request bodies.
    sentry_traces_sample_rate: float = 0.05

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS origins as a list, parsed from the comma-separated env value."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def admin_emails_set(self) -> set[str]:
        """Admin email allowlist as a lowercased set, parsed from the comma-separated
        env value. Lowercased so membership tests are case-insensitive (emails are
        stored case-insensitively via citext)."""
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

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
