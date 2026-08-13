"""add ai_reflections table

One AI-generated (or curated-fallback) reflection per journal entry: a short
reflective note plus one gentle follow-up question. `journal_id` is UNIQUE so an
entry can only ever have one reflection; `model` records what produced it (a model
id, or "fallback"). One logical change; reversible.

Revision ID: d8f2a4c6e9b1
Revises: c3d5e7f9a1b2
Create Date: 2026-08-12 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd8f2a4c6e9b1'
down_revision: Union[str, None] = 'c3d5e7f9a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_reflections',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('journal_id', sa.UUID(), nullable=False),
        sa.Column('reflection_text', sa.Text(), nullable=False),
        sa.Column('followup_question', sa.Text(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['journal_id'], ['journals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('journal_id', name='uq_ai_reflections_journal_id'),
    )
    # The daily-generation cap counts by user over the current day.
    op.create_index(
        'ix_ai_reflections_user_id_created_at', 'ai_reflections', ['user_id', 'created_at']
    )


def downgrade() -> None:
    op.drop_index('ix_ai_reflections_user_id_created_at', table_name='ai_reflections')
    op.drop_table('ai_reflections')
