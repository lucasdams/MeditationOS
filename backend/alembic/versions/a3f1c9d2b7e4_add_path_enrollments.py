"""add path_enrollments

The one stored piece of the beginner "Paths" feature: a per-user enrollment recording only
*which path* and *when started* (`started_on`). Day-completion is NOT stored — it is derived
from the user's logged activity at read time (ADR-0009 / docs/beginner-first-revision.md §8),
so there is deliberately no "completed" column here.

One row per (user, path) is enforced by a unique constraint; re-enrolling updates the existing
row's `started_on`. One logical change; `downgrade` drops the table.

Revision ID: a3f1c9d2b7e4
Revises: d2e3f4a5b6c7
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3f1c9d2b7e4'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'path_enrollments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('path_id', sa.String(), nullable=False),
        sa.Column(
            'started_on',
            sa.Date(),
            server_default=sa.text('CURRENT_DATE'),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'path_id', name='uq_path_enrollments_user_path'),
    )
    op.create_index(
        'ix_path_enrollments_user_id', 'path_enrollments', ['user_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_path_enrollments_user_id', table_name='path_enrollments')
    op.drop_table('path_enrollments')
