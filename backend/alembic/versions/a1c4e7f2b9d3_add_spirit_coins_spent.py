"""add spirits.coins_spent (the committed spend ledger)

ADR-0024 turns the Spirit's name & upgrades into a committed choice with paid resets. The
coin balance was derived as `level × COINS_PER_LEVEL − Σ cost of currently-applied
cosmetics`, so undoing/swapping a cosmetic refunded its coins. This adds a STORED, monotonic
spend ledger column (`coins_spent`): coins become `level × COINS_PER_LEVEL − coins_spent`,
and every upgrade / paid reset only ADDS to it (clearing cosmetics never refunds).

To keep existing balances unchanged, this backfills `coins_spent` for each spirit from the
SUM of its currently-applied cosmetics' costs (a self-contained snapshot of the catalog at
this revision, so the migration is stable even if the catalog is retuned later). One logical
change; reversible.

Revision ID: a1c4e7f2b9d3
Revises: e9d8c7b6a5f4
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f2b9d3'
down_revision: Union[str, None] = 'e9d8c7b6a5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# A self-contained snapshot of the SPIRIT_COSMETICS_CATALOG option costs at this revision
# (mirrors spirit_service.SPIRIT_COSMETICS_CATALOG). Kept here, not imported, so this
# migration's backfill stays stable even if the catalog is retuned in a later release.
COSTS = {
    ('aura', 'soft'): 30,
    ('aura', 'warm'): 45,
    ('aura', 'starlit'): 70,
    ('accessory', 'halo'): 40,
    ('accessory', 'leaf_crown'): 55,
    ('accessory', 'ribbon'): 35,
    ('habitat', 'meadow'): 50,
    ('habitat', 'dusk'): 65,
    ('habitat', 'night'): 80,
}


def upgrade() -> None:
    op.add_column(
        'spirits',
        sa.Column(
            'coins_spent', sa.Integer(), nullable=False, server_default='0'
        ),
    )

    # Backfill: each spirit's prior spend = Σ cost of its currently-applied {slot: option}
    # cosmetics, so derived balances are unchanged after the formula switches to coins_spent.
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, cosmetics FROM spirits")).fetchall()
    for row in rows:
        cosmetics = row.cosmetics or {}
        if not isinstance(cosmetics, dict):
            cosmetics = {}
        spent = 0
        for slot, option in cosmetics.items():
            spent += COSTS.get((str(slot), str(option)), 0)
        if spent:
            bind.execute(
                sa.text(
                    "UPDATE spirits SET coins_spent = :spent WHERE id = :id"
                ),
                {"spent": spent, "id": row.id},
            )


def downgrade() -> None:
    op.drop_column('spirits', 'coins_spent')
