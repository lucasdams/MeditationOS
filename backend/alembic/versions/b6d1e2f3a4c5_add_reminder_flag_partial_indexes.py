"""add reminder/weekly-summary opt-in partial indexes

The hourly reminder and weekly-summary jobs filter `users` on the opt-in flags
(`reminder_enabled` / `weekly_summary_enabled` true) with no index, forcing a full
table scan every run. These partial indexes cover only the opted-in rows so each
run does a small index scan instead. Reversible.

Revision ID: b6d1e2f3a4c5
Revises: a2b3c4d5e6f7
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b6d1e2f3a4c5'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_users_reminder_enabled',
        'users',
        ['reminder_enabled'],
        postgresql_where=sa.text('reminder_enabled'),
    )
    op.create_index(
        'ix_users_weekly_summary_enabled',
        'users',
        ['weekly_summary_enabled'],
        postgresql_where=sa.text('weekly_summary_enabled'),
    )


def downgrade() -> None:
    op.drop_index('ix_users_weekly_summary_enabled', table_name='users')
    op.drop_index('ix_users_reminder_enabled', table_name='users')
