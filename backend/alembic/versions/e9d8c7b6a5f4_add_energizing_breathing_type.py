"""add energizing_breathing session type

Recreates the ck_sessions_type CHECK constraint to allow the new
'energizing_breathing' session type (a brisk, invigorating breathwork
pattern alongside resonance breathing).

Revision ID: e9d8c7b6a5f4
Revises: c9f2a1b3d4e5
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e9d8c7b6a5f4'
down_revision: Union[str, None] = 'c9f2a1b3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_sessions_type", "sessions", type_="check")
    op.create_check_constraint(
        "ck_sessions_type",
        "sessions",
        "type IN ('mindfulness','body_scan','walking','loving_kindness',"
        "'resonance_breathing','energizing_breathing','other')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_sessions_type", "sessions", type_="check")
    op.create_check_constraint(
        "ck_sessions_type",
        "sessions",
        "type IN ('mindfulness','body_scan','walking','loving_kindness',"
        "'resonance_breathing','other')",
    )
