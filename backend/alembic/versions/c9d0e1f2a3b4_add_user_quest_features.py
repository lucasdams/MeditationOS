"""add user quest_features

Lets each user choose which daily-activity quests they receive (a subset of
meditate/breathe/gratitude/journal, ≥3). NULL means "not chosen yet" → the client
shows a first-run picker. Existing users are backfilled to all four so they skip
onboarding.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-13 02:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('quest_features', sa.ARRAY(sa.String()), nullable=True),
    )
    # Backfill existing accounts to the full set so they aren't sent through the
    # first-run picker (NULL is reserved for brand-new accounts).
    op.execute(
        "UPDATE users SET quest_features = "
        "ARRAY['meditate','breathe','gratitude','journal'] "
        "WHERE quest_features IS NULL"
    )


def downgrade() -> None:
    op.drop_column('users', 'quest_features')
