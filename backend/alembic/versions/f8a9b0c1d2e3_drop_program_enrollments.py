"""drop program_enrollments table

The Programs feature was scrapped — its progress was a manual counter disconnected from
real activity, inconsistent with the app's computed-from-activity model. This drops the
only stored program state. Downgrade recreates the table (empty).

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-14 04:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ix_program_enrollments_user_id', table_name='program_enrollments')
    op.drop_table('program_enrollments')


def downgrade() -> None:
    op.create_table(
        'program_enrollments',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('program_key', sa.String(), nullable=False),
        sa.Column('current_day', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('current_day >= 1', name='ck_program_enrollments_day_positive'),
    )
    op.create_index('ix_program_enrollments_user_id', 'program_enrollments', ['user_id'])
