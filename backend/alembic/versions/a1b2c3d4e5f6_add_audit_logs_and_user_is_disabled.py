"""add audit_logs table and users.is_disabled

Admin support tooling foundation: an append-only audit trail of privileged admin
actions, plus an admin-controlled account-suspension flag.

- audit_logs: actor/target FKs to users with ON DELETE SET NULL (the trail must outlive
  a deleted account), nullable JSONB detail (ids/flags only — never private content),
  indexed on actor/target/created_at.
- users.is_disabled: boolean, default false; a disabled account is blocked at auth.

One logical change; reversible.

Revision ID: a1b2c3d4e5f6
Revises: d4cc1555b8b5
Create Date: 2026-06-16 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd4cc1555b8b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'is_disabled',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('actor_user_id', sa.UUID(), nullable=True),
        sa.Column('target_user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('detail', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['target_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])
    op.create_index('ix_audit_logs_actor_user_id', 'audit_logs', ['actor_user_id'])
    op.create_index('ix_audit_logs_target_user_id', 'audit_logs', ['target_user_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_target_user_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_actor_user_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_column('users', 'is_disabled')
