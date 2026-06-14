"""add mood_logs table

A quick standalone mood check-in ("how do you feel?") — one tap, no written body,
distinct from a journal entry. Moods reuse the journal palette. One logical change;
reversible.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MOODS = (
    'calm', 'content', 'focused', 'energized', 'grateful',
    'neutral', 'restless', 'anxious', 'tired', 'low',
)
_MOOD_LIST = ", ".join(f"'{m}'" for m in _MOODS)


def upgrade() -> None:
    op.create_table(
        'mood_logs',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('mood', sa.String(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(f"mood IN ({_MOOD_LIST})", name='ck_mood_logs_mood'),
    )
    op.create_index(
        'ix_mood_logs_user_id_created_at', 'mood_logs', ['user_id', 'created_at']
    )


def downgrade() -> None:
    op.drop_index('ix_mood_logs_user_id_created_at', table_name='mood_logs')
    op.drop_table('mood_logs')
