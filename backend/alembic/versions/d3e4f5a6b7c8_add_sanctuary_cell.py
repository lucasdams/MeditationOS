"""add sanctuary grid cell (layout, separate from position)

Movable grid layout (ADR-0014). Items gain a `cell` (row-major grid index) the user can
rearrange freely by dragging. `cell` is deliberately separate from `position`: `position`
remains the immutable acquisition-order key the progressive pricing surcharge is computed
from (ADR-0013), so layout changes never re-price the garden. Existing rows backfill
`cell = position` so current gardens keep their present order as the initial layout, with
UNIQUE(user_id, cell) so two items can't share a cell. One logical change; reversible.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-06-15 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so we can backfill before enforcing NOT NULL + uniqueness.
    op.add_column(
        'sanctuary_plantings',
        sa.Column('cell', sa.Integer(), nullable=True),
    )
    # Backfill: existing gardens keep their current order as the initial layout.
    op.execute(sa.text("UPDATE sanctuary_plantings SET cell = position WHERE cell IS NULL"))
    op.alter_column(
        'sanctuary_plantings',
        'cell',
        existing_type=sa.Integer(),
        nullable=False,
        server_default='0',
    )
    op.create_unique_constraint(
        'uq_sanctuary_plantings_user_cell',
        'sanctuary_plantings',
        ['user_id', 'cell'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_sanctuary_plantings_user_cell',
        'sanctuary_plantings',
        type_='unique',
    )
    op.drop_column('sanctuary_plantings', 'cell')
