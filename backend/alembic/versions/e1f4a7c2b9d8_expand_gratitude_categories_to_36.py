"""expand gratitude categories to 36

Revision ID: e1f4a7c2b9d8
Revises: d9a2b6e1f3c4
Create Date: 2026-06-10 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1f4a7c2b9d8'
down_revision: Union[str, None] = 'd9a2b6e1f3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BASE_12 = [
    'people', 'health', 'nature', 'experiences', 'growth', 'home', 'self',
    'simple_pleasures', 'small_moments', 'big_moments', 'spiritual', 'material',
]
_ADDED_24 = [
    'work', 'food', 'learning', 'creativity', 'kindness', 'music', 'animals',
    'travel', 'friendship', 'family', 'love', 'play', 'memories', 'hope', 'body',
    'mind', 'mornings', 'evenings', 'weather', 'comfort', 'freedom', 'abundance',
    'community', 'beauty',
]


def _recreate(categories: list[str]) -> None:
    values = ", ".join(f"'{c}'" for c in categories)
    op.drop_constraint('ck_gratitude_category', 'gratitude_entries', type_='check')
    op.create_check_constraint(
        'ck_gratitude_category', 'gratitude_entries', f'category IN ({values})'
    )


def upgrade() -> None:
    _recreate(_BASE_12 + _ADDED_24)


def downgrade() -> None:
    _recreate(_BASE_12)
