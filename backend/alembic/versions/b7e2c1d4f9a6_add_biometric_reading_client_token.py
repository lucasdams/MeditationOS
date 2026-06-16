"""add biometric_readings.client_token for idempotent saves

A client-generated idempotency key so a rapid double-submit of the same reading
(e.g. a post reading saved twice) collapses to one row, keeping the pre/post delta
deterministic instead of order-dependent. Mirrors sessions.client_token: nullable,
with a partial unique index over (user_id, client_token) where the token is set.

The bpm(30-220)/hrv(>=0) CHECK constraints already ship in the table's creation
migration (d4cc1555b8b5), so this migration only adds the new column and index.

Revision ID: b7e2c1d4f9a6
Revises: b6d1e2f3a4c5
Create Date: 2026-06-16 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7e2c1d4f9a6'
down_revision: Union[str, None] = 'b6d1e2f3a4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'biometric_readings', sa.Column('client_token', sa.String(), nullable=True)
    )
    op.create_index(
        'uq_biometric_readings_user_client_token',
        'biometric_readings',
        ['user_id', 'client_token'],
        unique=True,
        postgresql_where=sa.text('client_token IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index(
        'uq_biometric_readings_user_client_token', table_name='biometric_readings'
    )
    op.drop_column('biometric_readings', 'client_token')
