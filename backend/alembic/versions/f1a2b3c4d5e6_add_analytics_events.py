"""add analytics_events

First-party product-analytics event store (self-hosted, no third-party SDK). One row per
anonymous usage event (session completed, path enrolled, streak milestone …).

Privacy by design:
- `user_id` is NULLABLE with ON DELETE SET NULL, so events survive account deletion but
  de-link from the (now gone) user.
- `props` is a small JSONB scalar bag; `name` is constrained to an app-level allowlist
  (enforced in the Pydantic schema, not the DB).

Indexes: (name, created_at) for the admin summary's per-name-over-time grouping, a plain
created_at index for window filtering, and user_id for the distinct-active-users tally.

One logical change; `downgrade` drops the table (and its indexes).

Revision ID: f1a2b3c4d5e6
Revises: a3f1c9d2b7e4
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'a3f1c9d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'analytics_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('props', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_analytics_events_created_at', 'analytics_events', ['created_at'], unique=False
    )
    op.create_index(
        'ix_analytics_events_name_created_at',
        'analytics_events',
        ['name', 'created_at'],
        unique=False,
    )
    op.create_index(
        'ix_analytics_events_user_id', 'analytics_events', ['user_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_analytics_events_user_id', table_name='analytics_events')
    op.drop_index('ix_analytics_events_name_created_at', table_name='analytics_events')
    op.drop_index('ix_analytics_events_created_at', table_name='analytics_events')
    op.drop_table('analytics_events')
