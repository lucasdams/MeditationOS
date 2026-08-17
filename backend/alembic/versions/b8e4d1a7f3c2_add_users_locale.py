"""add users.locale

A per-user UI language ("en" | "ja") so server-sent content — chiefly transactional
emails — can be localized. Defaults to "en"; one logical change; reversible.

Revision ID: b8e4d1a7f3c2
Revises: d9e8f7a6b5c4
Create Date: 2026-08-17 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8e4d1a7f3c2'
down_revision: Union[str, None] = 'd9e8f7a6b5c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('locale', sa.String(), nullable=False, server_default='en'),
    )


def downgrade() -> None:
    op.drop_column('users', 'locale')
