"""add user timezone

Adds an IANA timezone to users (default UTC) so streaks, daily quests, the
activity heatmap, and the weekly view bucket dates in the user's local day.

Revision ID: f2c8b5a3e7d1
Revises: e1f4a7c2b9d8
Create Date: 2026-06-10 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f2c8b5a3e7d1'
down_revision: Union[str, None] = 'e1f4a7c2b9d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(), nullable=False, server_default='UTC'),
    )


def downgrade() -> None:
    op.drop_column('users', 'timezone')
