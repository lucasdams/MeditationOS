"""add google auth to users

Adds `google_sub` (the linked Google account id) and makes `password_hash`
nullable so Google-only accounts can exist without a password.

Revision ID: b3e9c1a47d20
Revises: fd668a5de4cc
Create Date: 2026-06-09 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3e9c1a47d20'
down_revision: Union[str, None] = 'fd668a5de4cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('google_sub', sa.String(), nullable=True))
    op.create_unique_constraint('uq_users_google_sub', 'users', ['google_sub'])
    op.alter_column('users', 'password_hash', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Note: fails if any Google-only (passwordless) accounts exist — give them a
    # password or delete them before downgrading.
    op.alter_column('users', 'password_hash', existing_type=sa.String(), nullable=False)
    op.drop_constraint('uq_users_google_sub', 'users', type_='unique')
    op.drop_column('users', 'google_sub')
