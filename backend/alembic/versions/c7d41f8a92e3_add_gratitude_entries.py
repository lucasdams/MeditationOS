"""add gratitude_entries

Revision ID: c7d41f8a92e3
Revises: b3e9c1a47d20
Create Date: 2026-06-10 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7d41f8a92e3'
down_revision: Union[str, None] = 'b3e9c1a47d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CATEGORIES = "'people', 'health', 'nature', 'experiences', 'growth', 'home', 'self', 'simple_pleasures'"


def upgrade() -> None:
    op.create_table(
        'gratitude_entries',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint(f'category IN ({_CATEGORIES})', name='ck_gratitude_category'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_gratitude_entries_user_id_created_at',
        'gratitude_entries',
        ['user_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_gratitude_entries_user_id_created_at', table_name='gratitude_entries')
    op.drop_table('gratitude_entries')
