"""add streak_save_enabled to users

Independent opt-out for the evening streak-save nudge. Defaults true so existing
behaviour is preserved (the nudge keeps firing for opted-in users), while letting a
user keep the gentle morning reminder and decline the evening streak-save nudge.
Non-nullable with a server default; reversible.

Revision ID: c4d5e6f7a8b9
Revises: b7e2c1d4f9a6
Create Date: 2026-06-17 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b7e2c1d4f9a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'streak_save_enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'streak_save_enabled')
