"""add session intention

Optional pre-session intention: a short phrase (≤ 140 chars) the user can set
before sitting. Nullable, stored as text. Reversible.

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('intention', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'intention')
