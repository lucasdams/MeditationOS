"""add spirits.last_pampered_need (the bought item's favoured need)

ADR-0026 (extends ADR-0025): each cosmetic now FAVOURS one need. Buying records the bought
item's favoured need alongside `last_pampered_at`, so the decaying buy-boost can be WEIGHTED
toward that need. This adds the single stored field that drives it: `last_pampered_need`.
Nullable with NO default and no backfill — a row with `last_pampered_at` set but
`last_pampered_need` NULL is treated as a LEGACY pampered row and gets ADR-0025's uniform boost,
so existing pampered spirits don't regress.

One logical change; reversible.

Revision ID: e2f3a4b5c6d7
Revises: d1a2b3c4e5f6
Create Date: 2026-06-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1a2b3c4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'spirits',
        sa.Column(
            'last_pampered_need',
            sa.Text(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('spirits', 'last_pampered_need')
