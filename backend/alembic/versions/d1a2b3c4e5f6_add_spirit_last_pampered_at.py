"""add spirits.last_pampered_at (the pamper-boost timestamp)

ADR-0025: buying a cosmetic "pampers" the spirit — the needs read adds a decaying bonus to
each need's factor, full right after a purchase and fading linearly to 0 over
PAMPER_WINDOW_DAYS. This adds the single stored field that drives it: `last_pampered_at`,
stamped on each buy. Nullable with NO default and no backfill — a never-pampered spirit
(NULL) reads exactly as today (no bonus), so existing spirits are unchanged.

One logical change; reversible.

Revision ID: d1a2b3c4e5f6
Revises: c2e4a6b8d0f3
Create Date: 2026-06-25 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd1a2b3c4e5f6'
down_revision: Union[str, None] = 'c2e4a6b8d0f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'spirits',
        sa.Column(
            'last_pampered_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('spirits', 'last_pampered_at')
