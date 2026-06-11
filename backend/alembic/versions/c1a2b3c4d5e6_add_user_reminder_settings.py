"""add user reminder settings

Opt-in daily practice reminder: an enable flag, the local hour to fire at, and a
last-sent timestamp for idempotency. One logical change; reversible.

Revision ID: c1a2b3c4d5e6
Revises: b5d8e3f1a9c2
Create Date: 2026-06-12 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1a2b3c4d5e6'
down_revision: Union[str, None] = 'b5d8e3f1a9c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'reminder_enabled',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )
    op.add_column('users', sa.Column('reminder_hour', sa.Integer(), nullable=True))
    op.add_column(
        'users',
        sa.Column('reminder_last_sent_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'reminder_last_sent_at')
    op.drop_column('users', 'reminder_hour')
    op.drop_column('users', 'reminder_enabled')
