"""session occurred_at timestamp

Revision ID: 43d8e321a234
Revises: 9126dd80ec34
Create Date: 2026-06-09 07:28:30.090455

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43d8e321a234'
down_revision: Union[str, None] = '9126dd80ec34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable, backfill from the old date (midnight UTC), then enforce NOT NULL.
    op.add_column('sessions', sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE sessions SET occurred_at = session_date::timestamptz")
    op.alter_column('sessions', 'occurred_at', nullable=False)

    op.drop_index('ix_sessions_user_id_session_date', table_name='sessions')
    op.create_index('ix_sessions_user_id_occurred_at', 'sessions', ['user_id', 'occurred_at'], unique=False)
    op.drop_column('sessions', 'session_date')


def downgrade() -> None:
    op.add_column('sessions', sa.Column('session_date', sa.DATE(), autoincrement=False, nullable=True))
    op.execute("UPDATE sessions SET session_date = (occurred_at AT TIME ZONE 'UTC')::date")
    op.alter_column('sessions', 'session_date', nullable=False)

    op.drop_index('ix_sessions_user_id_occurred_at', table_name='sessions')
    op.create_index('ix_sessions_user_id_session_date', 'sessions', ['user_id', 'session_date'], unique=False)
    op.drop_column('sessions', 'occurred_at')
