"""rework goals into activity + cadence

Goals move from a numeric target (daily_minutes / streak_days / total_hours) to a
recurring habit: an activity (meditate/breathe/gratitude/journal) done `count` times
per `period` (day/week). The two models don't map, so existing goal rows are cleared.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-12 19:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTIVITIES = "'meditate', 'breathe', 'gratitude', 'journal'"
_PERIODS = "'day', 'week'"


def upgrade() -> None:
    # The old target-based goals have no equivalent in the new model.
    op.execute("DELETE FROM goals")
    op.drop_constraint('ck_goal_type', 'goals', type_='check')
    op.drop_constraint('ck_goal_target_positive', 'goals', type_='check')
    op.drop_column('goals', 'type')
    op.drop_column('goals', 'target')
    op.add_column('goals', sa.Column('activity', sa.String(), nullable=False))
    op.add_column('goals', sa.Column('period', sa.String(), nullable=False))
    op.add_column('goals', sa.Column('count', sa.Integer(), nullable=False))
    op.create_check_constraint('ck_goal_activity', 'goals', f"activity IN ({_ACTIVITIES})")
    op.create_check_constraint('ck_goal_period', 'goals', f"period IN ({_PERIODS})")
    op.create_check_constraint('ck_goal_count_positive', 'goals', "count > 0")


def downgrade() -> None:
    op.execute("DELETE FROM goals")
    op.drop_constraint('ck_goal_count_positive', 'goals', type_='check')
    op.drop_constraint('ck_goal_period', 'goals', type_='check')
    op.drop_constraint('ck_goal_activity', 'goals', type_='check')
    op.drop_column('goals', 'count')
    op.drop_column('goals', 'period')
    op.drop_column('goals', 'activity')
    op.add_column('goals', sa.Column('type', sa.String(), nullable=False))
    op.add_column('goals', sa.Column('target', sa.Integer(), nullable=False))
    op.create_check_constraint(
        'ck_goal_type', 'goals', "type IN ('daily_minutes', 'streak_days', 'total_hours')"
    )
    op.create_check_constraint('ck_goal_target_positive', 'goals', "target > 0")
