"""expand gratitude categories

Adds four categories (small_moments, big_moments, spiritual, material) to the
gratitude_entries CHECK constraint.

Revision ID: d9a2b6e1f3c4
Revises: c7d41f8a92e3
Create Date: 2026-06-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd9a2b6e1f3c4'
down_revision: Union[str, None] = 'c7d41f8a92e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD = "'people', 'health', 'nature', 'experiences', 'growth', 'home', 'self', 'simple_pleasures'"
_NEW = _OLD + ", 'small_moments', 'big_moments', 'spiritual', 'material'"


def _recreate(categories: str) -> None:
    op.drop_constraint('ck_gratitude_category', 'gratitude_entries', type_='check')
    op.create_check_constraint(
        'ck_gratitude_category', 'gratitude_entries', f'category IN ({categories})'
    )


def upgrade() -> None:
    _recreate(_NEW)


def downgrade() -> None:
    _recreate(_OLD)
