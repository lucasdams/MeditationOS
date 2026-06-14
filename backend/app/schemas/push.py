"""Web Push request/response schemas."""

from pydantic import BaseModel, Field


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """The browser's PushSubscription, as returned by pushManager.subscribe()."""

    endpoint: str = Field(min_length=1)
    keys: PushKeys


class PushUnsubscribe(BaseModel):
    endpoint: str = Field(min_length=1)


class PushConfig(BaseModel):
    """What the client needs to decide whether/how to offer push."""

    configured: bool  # server has VAPID keys
    public_key: str  # the VAPID public key (empty when not configured)
