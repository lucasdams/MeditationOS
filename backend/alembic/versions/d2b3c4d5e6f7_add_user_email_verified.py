"""add user email_verified

Confirmation flag for the email address. Existing rows default to false (unverified);
they can confirm via the emailed link. One logical change; reversible.

Revision ID: d2b3c4d5e6f7
Revises: c1a2b3c4d5e6
Create Date: 2026-06-12 11:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2b3c4d5e6f7'
down_revision: Union[str, None] = 'c1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'email_verified',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'email_verified')
