"""add updated_at to sessions, journals, goals

These three tables expose PATCH endpoints (edit a logged session, a journal entry, or a
goal) but only carried `created_at`, so an edit left no last-modified trace — a drift from
the project rule that mutable rows carry both `created_at` and `updated_at` (prayers,
ai_reflections, biometric_readings, path_enrollments, spirit already comply).

Add `updated_at` as NOT NULL with a `now()` server default so existing rows are backfilled
without a data migration and new rows default correctly. Existing rows are then set to their
`created_at`, so a never-edited row reads `updated_at == created_at` rather than the
migration timestamp. The ORM carries `onupdate=func.now()` (applied in UPDATE statements),
so no DB-side trigger is needed.

One logical change; reversible.

Revision ID: c7f3a1b9e2d4
Revises: b1d4e7a9c2f5
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7f3a1b9e2d4'
down_revision: Union[str, None] = 'b1d4e7a9c2f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ('sessions', 'journals', 'goals')


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                'updated_at',
                sa.DateTime(timezone=True),
                server_default=sa.text('now()'),
                nullable=False,
            ),
        )
        # Backfill so a never-edited row reads updated_at == created_at, not the
        # migration run time.
        op.execute(f'UPDATE {table} SET updated_at = created_at')


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, 'updated_at')
