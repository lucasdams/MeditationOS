"""add spirits.coins_spent >= 0 CHECK constraint

The `Spirit` model declares `CheckConstraint("coins_spent >= 0",
name="ck_spirits_coins_spent_nonneg")` (the spend ledger is monotonic and never negative,
ADR-0024), but the column-adding migration (`a1c4e7f2b9d3`) only created the column with a
server_default and never the constraint. This closes that defense-in-depth gap by creating
the named CHECK at the database level. One logical change; reversible.

Revision ID: b1d3f5a7c9e2
Revises: a1c4e7f2b9d3
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1d3f5a7c9e2'
down_revision: Union[str, None] = 'a1c4e7f2b9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        'ck_spirits_coins_spent_nonneg', 'spirits', 'coins_spent >= 0'
    )


def downgrade() -> None:
    op.drop_constraint(
        'ck_spirits_coins_spent_nonneg', 'spirits', type_='check'
    )
