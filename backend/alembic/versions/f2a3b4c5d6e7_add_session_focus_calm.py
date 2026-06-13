"""add session focus/calm rating

Optional post-session self-rating: how focused and how calm you felt (1–5 each),
nullable. One logical change; reversible.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-13 22:45:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('focus', sa.Integer(), nullable=True))
    op.add_column('sessions', sa.Column('calm', sa.Integer(), nullable=True))
    op.create_check_constraint(
        'ck_sessions_focus', 'sessions', 'focus IS NULL OR focus BETWEEN 1 AND 5'
    )
    op.create_check_constraint(
        'ck_sessions_calm', 'sessions', 'calm IS NULL OR calm BETWEEN 1 AND 5'
    )


def downgrade() -> None:
    op.drop_constraint('ck_sessions_calm', 'sessions', type_='check')
    op.drop_constraint('ck_sessions_focus', 'sessions', type_='check')
    op.drop_column('sessions', 'calm')
    op.drop_column('sessions', 'focus')
