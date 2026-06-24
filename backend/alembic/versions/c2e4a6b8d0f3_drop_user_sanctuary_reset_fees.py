"""drop the dead users.sanctuary_reset_fees column

`sanctuary_reset_fees` (added by `e6f7a8b9c0d1`) tallied coins charged as Sanctuary
upgrade-reset fees under the old derived-balance economy (ADR-0019). The economy moved to the
Spirit's stored `spirits.coins_spent` ledger (ADR-0024), and this column now has zero reads
or writes anywhere in the codebase. This drops the dead column. The downgrade re-adds it with
its original type/default (NOT NULL, server_default 0) so the chain stays reversible; the
backfilled values are not recoverable (the data is genuinely dead). One logical change.

Revision ID: c2e4a6b8d0f3
Revises: b1d3f5a7c9e2
Create Date: 2026-06-24 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c2e4a6b8d0f3'
down_revision: Union[str, None] = 'b1d3f5a7c9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('users', 'sanctuary_reset_fees')


def downgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'sanctuary_reset_fees',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )
