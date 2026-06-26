"""add spirits.unlocked (the owned cosmetic-option collection)

ADR-0027 (supersedes ADR-0024's locked upgrades + paid upgrades-reset): cosmetics become a
COLLECTION you unlock-to-own plus a LOADOUT you equip. `spirits.cosmetics` now means the
EQUIPPED `{slot: option}` map; this adds `spirits.unlocked`, the JSONB list of owned option
keys. The effective owned set is `unlocked ∪ values(cosmetics)`, so already-equipped/paid-for
items count as owned with NO data backfill — a fresh column defaulting to `[]` is enough.

One logical change; reversible (down = drop column).

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-06-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'spirits',
        sa.Column(
            'unlocked',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column('spirits', 'unlocked')
