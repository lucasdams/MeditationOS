"""add prayers table

Prayer journal: a written prayer, intention, or blessing, optionally marked as
answered (answered_at). Non-denominational — no category is stored. One logical
change; reversible.

Revision ID: a9b8c7d6e5f4
Revises: d8f2a4c6e9b1
Create Date: 2026-08-12 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, None] = 'd8f2a4c6e9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'prayers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('answered_at', sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_prayers_user_id_created_at', 'prayers', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_prayers_user_id_created_at', table_name='prayers')
    op.drop_table('prayers')
