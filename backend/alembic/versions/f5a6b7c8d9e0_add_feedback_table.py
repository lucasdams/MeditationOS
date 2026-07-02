"""add feedback table

In-app feedback: a coarse category (bug/idea/praise/other) + a message + the app route it
was sent from, read by the owner in the admin inbox. `user_id` is nullable with ON DELETE
SET NULL so a note survives the sender deleting their account. One logical change; reversible.

Revision ID: f5a6b7c8d9e0
Revises: a3f1c9d2b7e4
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'a3f1c9d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CATEGORIES = ('bug', 'idea', 'praise', 'other')
_CATEGORY_LIST = ", ".join(f"'{c}'" for c in _CATEGORIES)
_MAX_MESSAGE_LENGTH = 2000


def upgrade() -> None:
    op.create_table(
        'feedback',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('path', sa.String(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            f"category IN ({_CATEGORY_LIST})", name='ck_feedback_category'
        ),
        sa.CheckConstraint(
            f"char_length(message) <= {_MAX_MESSAGE_LENGTH}",
            name='ck_feedback_message_length',
        ),
    )
    op.create_index('ix_feedback_created_at', 'feedback', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_feedback_created_at', table_name='feedback')
    op.drop_table('feedback')
