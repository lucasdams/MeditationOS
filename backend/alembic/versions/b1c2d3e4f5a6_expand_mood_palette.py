"""expand mood palette

Add hopeful, excited, peaceful, frustrated, overwhelmed to the mood CHECK
constraints on journals and mood_logs. Mood is stored as a plain String column
(not a DB enum type), so only the CHECK constraints need updating.

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_MOODS = (
    'calm', 'content', 'focused', 'energized', 'grateful',
    'neutral', 'restless', 'anxious', 'tired', 'low',
)
_NEW_MOODS = (
    'calm', 'content', 'focused', 'energized', 'grateful',
    'hopeful', 'excited', 'peaceful',
    'neutral', 'restless', 'anxious', 'frustrated', 'overwhelmed',
    'tired', 'low',
)

_old_mood_list = ", ".join(f"'{m}'" for m in _OLD_MOODS)
_new_mood_list = ", ".join(f"'{m}'" for m in _NEW_MOODS)


def upgrade() -> None:
    # journals
    op.drop_constraint('ck_journal_mood', 'journals', type_='check')
    op.create_check_constraint(
        'ck_journal_mood',
        'journals',
        f"mood IS NULL OR mood IN ({_new_mood_list})",
    )

    # mood_logs
    op.drop_constraint('ck_mood_logs_mood', 'mood_logs', type_='check')
    op.create_check_constraint(
        'ck_mood_logs_mood',
        'mood_logs',
        f"mood IN ({_new_mood_list})",
    )


def downgrade() -> None:
    # mood_logs
    op.drop_constraint('ck_mood_logs_mood', 'mood_logs', type_='check')
    op.create_check_constraint(
        'ck_mood_logs_mood',
        'mood_logs',
        f"mood IN ({_old_mood_list})",
    )

    # journals
    op.drop_constraint('ck_journal_mood', 'journals', type_='check')
    op.create_check_constraint(
        'ck_journal_mood',
        'journals',
        f"mood IS NULL OR mood IN ({_old_mood_list})",
    )
