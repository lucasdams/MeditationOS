"""add sanctuary variant + customizations, fold tier into the grown customization

Sanctuary personalization (ADR-0012, preserving ADR-0011's derived balance): items now
have a chosen `variant` (base form) and mix-and-match `customizations` ({slot: option}).
The old linear `tier` becomes the `grown` customization so existing spend is preserved
(tier-1 cost == the grown option's cost), then the column is dropped. One logical change;
reversible.

Revision ID: c2d3e4f5a6b7
Revises: b0c1d2e3f4a5
Create Date: 2026-06-15 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sanctuary_plantings',
        sa.Column('variant', sa.String(), nullable=True),
    )
    op.add_column(
        'sanctuary_plantings',
        sa.Column(
            'customizations',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    # Preserve existing spend: any item with tier >= 1 had bought the "grown" upgrade
    # (the old tier-1, priced the same as the new grown option). Fold it in so balances
    # are unchanged. tier >= 2 collapses to the same grown option — coins are monotonic
    # (never raised retroactively), so this never makes a legacy balance go negative.
    op.execute(
        sa.text(
            "UPDATE sanctuary_plantings "
            "SET customizations = '{\"grown\": \"grown\"}'::jsonb "
            "WHERE tier >= 1"
        )
    )
    op.drop_column('sanctuary_plantings', 'tier')


def downgrade() -> None:
    op.add_column(
        'sanctuary_plantings',
        sa.Column('tier', sa.Integer(), nullable=False, server_default='0'),
    )
    # Map the grown customization back to tier 1 (best-effort inverse).
    op.execute(
        sa.text(
            "UPDATE sanctuary_plantings SET tier = 1 "
            "WHERE customizations ? 'grown'"
        )
    )
    op.drop_column('sanctuary_plantings', 'customizations')
    op.drop_column('sanctuary_plantings', 'variant')
