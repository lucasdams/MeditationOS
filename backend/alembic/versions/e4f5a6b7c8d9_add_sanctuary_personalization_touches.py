"""add sanctuary personalization touches (name, note, favorite)

Optional cosmetic personalization (ADR-0015): each planting gains a user-chosen `name`
(plaque, ≤40 chars), a short `note` caption (≤140 chars), and a `favorite` pin flag. All
default-off — `name`/`note` are nullable (NULL = unset) and `favorite` defaults to false —
so existing gardens are unchanged and a user who ignores naming sees no clutter. These are
purely cosmetic: they never enter the derived-balance spend computation (ADR-0011), so
naming/noting/pinning an item can never alter coins. One logical change; reversible.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-06-16 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Lengths mirror the schema caps (NAME_MAX_LENGTH / NOTE_MAX_LENGTH) as a defence-in-depth
    # bound; the API trims + rejects over-length input as 422 before it reaches the DB.
    op.add_column(
        'sanctuary_plantings',
        sa.Column('name', sa.String(length=40), nullable=True),
    )
    op.add_column(
        'sanctuary_plantings',
        sa.Column('note', sa.String(length=140), nullable=True),
    )
    op.add_column(
        'sanctuary_plantings',
        sa.Column(
            'favorite',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('sanctuary_plantings', 'favorite')
    op.drop_column('sanctuary_plantings', 'note')
    op.drop_column('sanctuary_plantings', 'name')
