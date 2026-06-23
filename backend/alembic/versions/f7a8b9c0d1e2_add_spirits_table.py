"""add spirits table

The Spirit companion (docs/design/spirit.md, ADR-0022) — one living companion the user
awakens and grows through practice, replacing the Sanctuary as the retention loop. Stored
state is only the irreducible decisions (committed `path`, optional `name`, owned
`cosmetics`); stage / bond / glow / coins are all computed on read. A partial unique index
enforces at most one *active* (non-retired) spirit per user. One logical change; reversible.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'spirits',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('path', sa.Text(), nullable=True),
        sa.Column('name', sa.String(length=40), nullable=True),
        sa.Column(
            'cosmetics',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            'awakened_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_spirits_user_id', 'spirits', ['user_id'])
    # At most one ACTIVE spirit per user — a retired spirit (retired_at IS NOT NULL) no
    # longer blocks awakening a new one.
    op.create_index(
        'uq_spirits_user_active',
        'spirits',
        ['user_id'],
        unique=True,
        postgresql_where=sa.text('retired_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_spirits_user_active', table_name='spirits')
    op.drop_index('ix_spirits_user_id', table_name='spirits')
    op.drop_table('spirits')
