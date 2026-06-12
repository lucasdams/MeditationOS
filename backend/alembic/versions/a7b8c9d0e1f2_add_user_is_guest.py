"""add user is_guest

Marks anonymous "use without signing up" accounts. Existing rows default to false
(real accounts). One logical change; reversible.

Revision ID: a7b8c9d0e1f2
Revises: f4d5e6f7a8b9
Create Date: 2026-06-12 17:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'is_guest',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'is_guest')
