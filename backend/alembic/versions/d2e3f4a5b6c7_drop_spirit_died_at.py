"""drop spirit died_at (the companion stops being mortal)

ADR-0031 ("the companion stops being mortal") REVERSES the Tamagotchi turn of ADR-0029: the spirit
can no longer die. Needs are now FLOORED so they never empty or punish, and the death/ailing logic
is gone — so the `spirits.died_at` column that froze a spirit's death moment is no longer read or
written. This drops it.

KEPT (still power the gentle needs + the optional Feed/Rest/Play tend): `needs_baseline_at` and the
three `*_tended_at` columns. Only `died_at` goes.

One logical change; reversible (down = re-add `died_at` nullable, matching the pre-ADR-0031 shape).

Revision ID: d2e3f4a5b6c7
Revises: f4b5c6d7e8a9
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'f4b5c6d7e8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('spirits', 'died_at')


def downgrade() -> None:
    # Re-add the column nullable (its original ADR-0029 shape); NULL = alive.
    op.add_column(
        'spirits',
        sa.Column('died_at', sa.DateTime(timezone=True), nullable=True),
    )
