"""add scheduled_sessions table

Planned future practices (date/time + type) so users can put practice on the calendar.
Distinct from `sessions` (practice that happened). One logical change; reversible.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-06-14 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TYPES = (
    'mindfulness', 'body_scan', 'walking', 'loving_kindness', 'resonance_breathing', 'other',
)
_TYPE_LIST = ", ".join(f"'{t}'" for t in _TYPES)


def upgrade() -> None:
    op.create_table(
        'scheduled_sessions',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(f"type IN ({_TYPE_LIST})", name='ck_scheduled_sessions_type'),
        sa.CheckConstraint(
            'duration_minutes IS NULL OR duration_minutes > 0',
            name='ck_scheduled_sessions_duration_positive',
        ),
    )
    op.create_index(
        'ix_scheduled_sessions_user_id_scheduled_at',
        'scheduled_sessions',
        ['user_id', 'scheduled_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_scheduled_sessions_user_id_scheduled_at', table_name='scheduled_sessions')
    op.drop_table('scheduled_sessions')
