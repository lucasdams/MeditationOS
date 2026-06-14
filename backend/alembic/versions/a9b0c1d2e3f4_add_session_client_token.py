"""add sessions.client_token for idempotent saves

A client-generated idempotency key so an auto-save (beacon on tab close) and a
manual/restored save of the same in-progress sit collapse to one row. Nullable, with a
partial unique index over (user_id, client_token) where the token is set.

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-06-14 05:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('client_token', sa.String(), nullable=True))
    op.create_index(
        'uq_sessions_user_client_token',
        'sessions',
        ['user_id', 'client_token'],
        unique=True,
        postgresql_where=sa.text('client_token IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_sessions_user_client_token', table_name='sessions')
    op.drop_column('sessions', 'client_token')
