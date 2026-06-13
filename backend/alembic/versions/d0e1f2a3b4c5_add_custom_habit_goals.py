"""add custom-habit goals

Lets a goal track something the app doesn't record ("Gym", "Read"): a new `custom`
activity carrying a free-text `label`, with progress from stored `goal_checkins`
(one per local day). Built-in activities are unchanged and still computed on read.
One logical change; reversible.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-13 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTIVITIES_NEW = "'meditate', 'breathe', 'gratitude', 'journal', 'custom'"
_ACTIVITIES_OLD = "'meditate', 'breathe', 'gratitude', 'journal'"


def upgrade() -> None:
    # Custom goals carry a name; built-in activities leave it NULL.
    op.add_column('goals', sa.Column('label', sa.String(), nullable=True))
    op.drop_constraint('ck_goal_activity', 'goals', type_='check')
    op.create_check_constraint('ck_goal_activity', 'goals', f"activity IN ({_ACTIVITIES_NEW})")

    op.create_table(
        'goal_checkins',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('goal_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('checkin_date', sa.Date(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('goal_id', 'checkin_date', name='uq_goal_checkin_day'),
    )
    op.create_index(
        'ix_goal_checkins_user_id_date', 'goal_checkins', ['user_id', 'checkin_date']
    )


def downgrade() -> None:
    op.drop_index('ix_goal_checkins_user_id_date', table_name='goal_checkins')
    op.drop_table('goal_checkins')
    # Drop any custom goals before re-tightening the activity CHECK.
    op.execute("DELETE FROM goals WHERE activity = 'custom'")
    op.drop_constraint('ck_goal_activity', 'goals', type_='check')
    op.create_check_constraint('ck_goal_activity', 'goals', f"activity IN ({_ACTIVITIES_OLD})")
    op.drop_column('goals', 'label')
