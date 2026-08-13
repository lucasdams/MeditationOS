"""add users.daily_goal_minutes (the user's small daily practice goal)

A calm, Duolingo-style daily-goal ring lets a user set a small daily practice target in
minutes and watch today's progress fill toward it. The target is a per-user preference, so
it lives on `users` as a single INT column. NOT NULL with a server default of 10 minutes, so
every existing account is backfilled to a gentle 10-minute goal without a data migration and
new rows get the same default. The sane editable range (1–120) is enforced at the API layer
(Pydantic), not as a DB constraint, matching how the other preference columns are validated.

One logical change; reversible.

Revision ID: b1d4e7a9c2f5
Revises: a9b8c7d6e5f4
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1d4e7a9c2f5'
down_revision: Union[str, None] = 'a9b8c7d6e5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'daily_goal_minutes', sa.Integer(), nullable=False, server_default='10'
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'daily_goal_minutes')
