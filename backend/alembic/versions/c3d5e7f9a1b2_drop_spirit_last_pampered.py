"""drop spirits.last_pampered_at + last_pampered_need (vestigial after ADR-0029)

ADR-0025/0026 stored a cosmetic "pamper" needs boost via `last_pampered_at` +
`last_pampered_need`. ADR-0029 removed that effect entirely (cosmetics are purely cosmetic),
after which both columns were only STAMPED on unlock and read by nothing. This drops them —
no code reads or writes them anymore.

One logical change; reversible (downgrade re-adds both nullable columns, no backfill).

Revision ID: c3d5e7f9a1b2
Revises: a3f1c9d2b7e4
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d5e7f9a1b2'
down_revision: Union[str, None] = 'a3f1c9d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('spirits', 'last_pampered_need')
    op.drop_column('spirits', 'last_pampered_at')


def downgrade() -> None:
    # Re-add both nullable columns (no default, no backfill) — matches their original shape.
    op.add_column(
        'spirits',
        sa.Column('last_pampered_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'spirits',
        sa.Column('last_pampered_need', sa.Text(), nullable=True),
    )
