"""add journals table

Meditation journal: a written reflection, optionally linked to a session, with an
optional mood tag. One logical change; reversible.

Revision ID: e3c4d5e6f7a8
Revises: d2b3c4d5e6f7
Create Date: 2026-06-12 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e3c4d5e6f7a8'
down_revision: Union[str, None] = 'd2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MOODS = (
    "calm", "content", "focused", "energized", "grateful",
    "neutral", "restless", "anxious", "tired", "low",
)
_MOOD_LIST = ", ".join(f"'{m}'" for m in _MOODS)


def upgrade() -> None:
    op.create_table(
        'journals',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('mood', sa.String(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(f"mood IS NULL OR mood IN ({_MOOD_LIST})", name='ck_journal_mood'),
    )
    op.create_index('ix_journals_user_id_created_at', 'journals', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_journals_user_id_created_at', table_name='journals')
    op.drop_table('journals')
