"""add sanctuary_plantings

The user's cultivation sequence — an append-only, ordered list of what they chose
to grow (Sanctuary Phase 2). One logical change; reversible.

Revision ID: b5d8e3f1a9c2
Revises: a4b7c2d9e1f5
Create Date: 2026-06-11 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b5d8e3f1a9c2'
down_revision: Union[str, None] = 'a4b7c2d9e1f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sanctuary_plantings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('item_key', sa.String(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'position', name='uq_sanctuary_plantings_user_position'),
    )
    op.create_index('ix_sanctuary_plantings_user_id', 'sanctuary_plantings', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_sanctuary_plantings_user_id', table_name='sanctuary_plantings')
    op.drop_table('sanctuary_plantings')
