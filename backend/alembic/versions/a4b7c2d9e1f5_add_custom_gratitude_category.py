"""add custom gratitude category

Adds a free-form 'custom' value to the gratitude category CHECK so a user can
write an entry without picking a theme. One logical change; reversible.

Revision ID: a4b7c2d9e1f5
Revises: f2c8b5a3e7d1
Create Date: 2026-06-10 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a4b7c2d9e1f5'
down_revision: Union[str, None] = 'f2c8b5a3e7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CATEGORIES_36 = [
    'people', 'health', 'nature', 'experiences', 'growth', 'home', 'self',
    'simple_pleasures', 'small_moments', 'big_moments', 'spiritual', 'material',
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
    _recreate(_CATEGORIES_36 + ['custom'])


def downgrade() -> None:
    _recreate(_CATEGORIES_36)
