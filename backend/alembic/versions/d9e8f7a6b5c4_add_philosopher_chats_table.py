"""add philosopher_chats table

Opt-in persistence for the philosopher chat: one row per saved conversation, owned by a
user, tied to a persona `philosopher_id`, with the turns stored as a JSONB list. One
logical change; reversible.

Revision ID: a1b2c3d4e5f6
Revises: f5a6b7c8d9e0
Create Date: 2026-08-16 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd9e8f7a6b5c4'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'philosopher_chats',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('philosopher_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('messages', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
    # The conversations list is "this user's, newest first".
    op.create_index(
        'ix_philosopher_chats_user_id_updated_at',
        'philosopher_chats',
        ['user_id', 'updated_at'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_philosopher_chats_user_id_updated_at', table_name='philosopher_chats'
    )
    op.drop_table('philosopher_chats')
