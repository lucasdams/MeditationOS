"""Web Push request/response schemas."""

from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Allowlist of trusted push-service hosts. The stored `endpoint` is later POSTed to by
# the reminder job, so restricting it to known browser push services blocks SSRF to
# internal hosts (e.g. 169.254.169.254). Matched as exact host or trailing-dot suffix.
_ALLOWED_PUSH_HOSTS: tuple[str, ...] = (
    ".push.services.mozilla.com",
    "fcm.googleapis.com",
    ".notify.windows.com",
    ".push.apple.com",
)


def _is_allowed_push_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    for allowed in _ALLOWED_PUSH_HOSTS:
        if allowed.startswith("."):
            if host.endswith(allowed):
                return True
        elif host == allowed:
            return True
    return False


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """The browser's PushSubscription, as returned by pushManager.subscribe()."""

    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1)
    keys: PushKeys

    @field_validator("endpoint")
    @classmethod
    def _validate_endpoint(cls, value: str) -> str:
        if not _is_allowed_push_endpoint(value):
            raise ValueError("endpoint must be an https URL of a known push service")
        return value


class PushUnsubscribe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1)


class PushConfig(BaseModel):
    """What the client needs to decide whether/how to offer push."""

    configured: bool  # server has VAPID keys
    public_key: str  # the VAPID public key (empty when not configured)
