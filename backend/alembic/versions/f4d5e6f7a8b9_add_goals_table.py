"""add goals table

User-set practice targets (daily minutes / streak days / total hours). Only the
intent is stored; progress is computed on read. One logical change; reversible.

Revision ID: f4d5e6f7a8b9
Revises: e3c4d5e6f7a8
Create Date: 2026-06-12 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f4d5e6f7a8b9'
down_revision: Union[str, None] = 'e3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TYPES = "'daily_minutes', 'streak_days', 'total_hours'"
_STATUSES = "'active', 'archived'"


def upgrade() -> None:
    op.create_table(
        'goals',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('target', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), server_default='active', nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(f"type IN ({_TYPES})", name='ck_goal_type'),
        sa.CheckConstraint(f"status IN ({_STATUSES})", name='ck_goal_status'),
        sa.CheckConstraint('target > 0', name='ck_goal_target_positive'),
    )
    op.create_index('ix_goals_user_id_created_at', 'goals', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_goals_user_id_created_at', table_name='goals')
    op.drop_table('goals')
