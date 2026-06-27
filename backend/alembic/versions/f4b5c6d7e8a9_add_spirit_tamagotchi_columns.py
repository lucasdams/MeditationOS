"""add spirit Tamagotchi columns (real-time decay + death)

ADR-0029 (the spirit becomes a Tamagotchi): needs now DECAY in real time and a spirit can DIE
from neglect. This adds the stored anchors that drive it:

- `needs_baseline_at` (NOT NULL, server_default now()) — the "born fed" anchor each need decays
  from. The server_default = now() is what prevents a mass-death on deploy: every EXISTING spirit
  gets `needs_baseline_at = now()`, so all three needs start FULL the moment this ships.
- `nourished_tended_at` / `rested_tended_at` / `joyful_tended_at` (nullable) — the last manual
  tend (Feed / Rest / Play) per need; NULL = never tended.
- `died_at` (nullable) — the death moment; NULL = alive. Persisted lazily on the first read that
  detects death (terminal).

One logical change; reversible (down = drop the five columns).

Revision ID: f4b5c6d7e8a9
Revises: f3a4b5c6d7e8
Create Date: 2026-06-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f4b5c6d7e8a9'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'spirits',
        sa.Column(
            'needs_baseline_at',
            sa.DateTime(timezone=True),
            nullable=False,
            # Existing rows get now() → every need starts full → no mass-death on deploy.
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        'spirits',
        sa.Column('nourished_tended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'spirits',
        sa.Column('rested_tended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'spirits',
        sa.Column('joyful_tended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'spirits',
        sa.Column('died_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('spirits', 'died_at')
    op.drop_column('spirits', 'joyful_tended_at')
    op.drop_column('spirits', 'rested_tended_at')
    op.drop_column('spirits', 'nourished_tended_at')
    op.drop_column('spirits', 'needs_baseline_at')
