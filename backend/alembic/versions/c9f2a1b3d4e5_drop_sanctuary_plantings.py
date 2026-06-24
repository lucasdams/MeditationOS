"""drop sanctuary_plantings

Retire the Sanctuary feature: the Spirit companion (ADR-0022) replaces it, so the
sanctuary backend is removed and its table is dropped. One logical change.

Data loss on downgrade (retired feature): downgrade recreates the table structure as it
existed at head, but cannot restore any rows that were dropped — there is no surviving
source for the old plantings.

Revision ID: c9f2a1b3d4e5
Revises: f7a8b9c0d1e2
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c9f2a1b3d4e5'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ix_sanctuary_plantings_user_id', table_name='sanctuary_plantings')
    op.drop_table('sanctuary_plantings')


def downgrade() -> None:
    # Recreate the table structure as it existed at head (before the drop). This restores
    # the schema only — no rows are restored (data loss on downgrade, retired feature).
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
        sa.Column('variant', sa.String(), nullable=True),
        sa.Column(
            'customizations',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            'cell',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
        sa.Column('name', sa.String(length=40), nullable=True),
        sa.Column('note', sa.String(length=140), nullable=True),
        sa.Column(
            'favorite',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'user_id', 'position', name='uq_sanctuary_plantings_user_position'
        ),
        sa.UniqueConstraint('user_id', 'cell', name='uq_sanctuary_plantings_user_cell'),
    )
    op.create_index(
        'ix_sanctuary_plantings_user_id', 'sanctuary_plantings', ['user_id']
    )
