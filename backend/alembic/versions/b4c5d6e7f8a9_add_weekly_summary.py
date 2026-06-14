"""add weekly summary email opt-in to users

Opt-in weekly summary email: enabled flag, the local weekday to send on (0=Mon…6=Sun),
and a last-sent timestamp for once-per-week idempotency. One logical change; reversible.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-06-14 01:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'weekly_summary_enabled',
            sa.Boolean(),
            server_default='false',
            nullable=False,
        ),
    )
    op.add_column('users', sa.Column('weekly_summary_day', sa.Integer(), nullable=True))
    op.add_column(
        'users',
        sa.Column('weekly_summary_last_sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        'ck_users_weekly_summary_day',
        'users',
        'weekly_summary_day IS NULL OR weekly_summary_day BETWEEN 0 AND 6',
    )


def downgrade() -> None:
    op.drop_constraint('ck_users_weekly_summary_day', 'users', type_='check')
    op.drop_column('users', 'weekly_summary_last_sent_at')
    op.drop_column('users', 'weekly_summary_day')
    op.drop_column('users', 'weekly_summary_enabled')
