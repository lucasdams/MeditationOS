"""add sanctuary_plantings.tier for the spend-economy upgrades

The sanctuary became a spend economy (ADR-0011): items are bought with coins and
upgraded through visual tiers. `tier` (0 = base) is the only new stored state.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-06-15 04:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sanctuary_plantings',
        sa.Column('tier', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('sanctuary_plantings', 'tier')
