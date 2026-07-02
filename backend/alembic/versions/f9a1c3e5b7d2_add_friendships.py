"""add friendships

A social link between two users (see docs/future-features.md → "Friends"): one row per
relationship, `status` in ('pending', 'accepted'). The row keeps the direction (who
requested) so only the addressee can accept/decline, while a canonical sorted pair
(`user_low`, `user_high`) carries the UNIQUE constraint so a duplicate or mirror row
(A→B and B→A) can't exist. Every FK cascades on user delete. One logical change;
reversible.

Revision ID: f9a1c3e5b7d2
Revises: a3f1c9d2b7e4
Create Date: 2026-07-03 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f9a1c3e5b7d2'
down_revision: Union[str, None] = 'a3f1c9d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = "'pending', 'accepted'"


def upgrade() -> None:
    op.create_table(
        'friendships',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('requester_id', sa.UUID(), nullable=False),
        sa.Column('addressee_id', sa.UUID(), nullable=False),
        sa.Column('user_low', sa.UUID(), nullable=False),
        sa.Column('user_high', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
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
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['addressee_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_low'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_high'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(f"status IN ({_STATUSES})", name='ck_friendship_status'),
        sa.CheckConstraint('user_low <> user_high', name='ck_friendship_distinct'),
        sa.UniqueConstraint('user_low', 'user_high', name='uq_friendship_pair'),
    )
    op.create_index(
        'ix_friendships_requester_status', 'friendships', ['requester_id', 'status']
    )
    op.create_index(
        'ix_friendships_addressee_status', 'friendships', ['addressee_id', 'status']
    )


def downgrade() -> None:
    op.drop_index('ix_friendships_addressee_status', table_name='friendships')
    op.drop_index('ix_friendships_requester_status', table_name='friendships')
    op.drop_table('friendships')
