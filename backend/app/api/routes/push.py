"""Web Push routes — expose VAPID config + store/remove browser subscriptions.
Thin handlers; logic in push_service; subscriptions scoped to the user."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.push import PushConfig, PushSubscriptionCreate, PushUnsubscribe
from app.services import push_service

router = APIRouter(prefix="/push", tags=["push"], dependencies=[Depends(require_verified_email)])


@router.get("/config", response_model=PushConfig)
def get_config(current_user: User = Depends(get_current_user)) -> PushConfig:
    """Tells the client whether push is available and the VAPID public key to use."""
    return PushConfig(
        configured=push_service.is_configured(),
        public_key=settings.vapid_public_key,
    )


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.write_rate_limit)
def subscribe(
    request: Request,  # required by the rate limiter
    data: PushSubscriptionCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    push_service.subscribe(db, current_user.id, data)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.write_rate_limit)
def unsubscribe(
    request: Request,  # required by the rate limiter
    data: PushUnsubscribe,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    push_service.unsubscribe(db, current_user.id, data.endpoint)
