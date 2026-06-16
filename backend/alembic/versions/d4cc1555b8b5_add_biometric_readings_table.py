"""add biometric_readings table

User-scoped heart-rate (and optional HRV) data points. Source-agnostic: a `source`
column distinguishes manual/estimated now and camera/wearable later. Optional
`session_id` (SET NULL) links a reading to a sit; `context` (pre/post/resting)
supports the calming-delta pairing. One logical change; reversible.

Revision ID: d4cc1555b8b5
Revises: c3d4e5f6a7b8
Create Date: 2026-06-16 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4cc1555b8b5'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONTEXTS = "'pre', 'post', 'resting'"
_SOURCES = "'manual', 'estimated', 'camera', 'wearable'"


def upgrade() -> None:
    op.create_table(
        'biometric_readings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=True),
        sa.Column('context', sa.String(), nullable=False),
        sa.Column('bpm', sa.Integer(), nullable=False),
        sa.Column('hrv_ms', sa.Float(), nullable=True),
        sa.Column('source', sa.String(), server_default='manual', nullable=False),
        sa.Column('measured_at', sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('bpm BETWEEN 30 AND 220', name='ck_biometric_readings_bpm'),
        sa.CheckConstraint(
            'hrv_ms IS NULL OR hrv_ms >= 0', name='ck_biometric_readings_hrv'
        ),
        sa.CheckConstraint(
            f"context IN ({_CONTEXTS})", name='ck_biometric_readings_context'
        ),
        sa.CheckConstraint(
            f"source IN ({_SOURCES})", name='ck_biometric_readings_source'
        ),
    )
    op.create_index(
        'ix_biometric_readings_user_id_measured_at',
        'biometric_readings',
        ['user_id', 'measured_at'],
    )
    op.create_index(
        'ix_biometric_readings_session_id',
        'biometric_readings',
        ['session_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_biometric_readings_session_id', table_name='biometric_readings'
    )
    op.drop_index(
        'ix_biometric_readings_user_id_measured_at', table_name='biometric_readings'
    )
    op.drop_table('biometric_readings')
