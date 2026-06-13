"""add 'total' goal period

Adds an all-time cumulative cadence ("meditate 100 times total") alongside the
recurring day/week periods. Only the activity CHECK constraint changes. Reversible
(drops any 'total' goals on downgrade before re-tightening the CHECK).

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-13 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERIODS_NEW = "'day', 'week', 'total'"
_PERIODS_OLD = "'day', 'week'"


def upgrade() -> None:
    op.drop_constraint('ck_goal_period', 'goals', type_='check')
    op.create_check_constraint('ck_goal_period', 'goals', f"period IN ({_PERIODS_NEW})")


def downgrade() -> None:
    op.execute("DELETE FROM goals WHERE period = 'total'")
    op.drop_constraint('ck_goal_period', 'goals', type_='check')
    op.create_check_constraint('ck_goal_period', 'goals', f"period IN ({_PERIODS_OLD})")
