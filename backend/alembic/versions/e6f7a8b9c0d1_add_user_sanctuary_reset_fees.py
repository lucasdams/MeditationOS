"""add sanctuary_reset_fees to users

A per-user tally of coins charged as Sanctuary upgrade-reset fees (ADR-0019). The garden's
coin balance is otherwise *derived* from holdings (no wallet/ledger), so resetting an item's
customizations refunds their sunk cost on the next read; this stored counter persists the
flat reset fee that's subtracted from the derived balance, so a reset can't be churned for
free coins. NOT NULL with a server_default of 0 so existing rows backfill to "no fees paid";
reversible.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-18 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'sanctuary_reset_fees',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'sanctuary_reset_fees')
