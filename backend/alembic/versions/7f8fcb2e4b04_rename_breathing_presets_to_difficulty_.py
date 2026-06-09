"""rename breathing presets to difficulty labels

Revision ID: 7f8fcb2e4b04
Revises: e533e31a65f9
Create Date: 2026-06-09 08:54:08.630026

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f8fcb2e4b04'
down_revision: Union[str, None] = 'e533e31a65f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename(pairs: list[tuple[int, int, str]]) -> None:
    for inhale, exhale, name in pairs:
        op.execute(
            sa.text(
                "UPDATE breathing_patterns SET name = :name "
                "WHERE is_preset AND user_id IS NULL "
                "AND inhale_seconds = :inhale AND exhale_seconds = :exhale"
            ).bindparams(name=name, inhale=inhale, exhale=exhale)
        )


def upgrade() -> None:
    # Slower breathing is harder, so slowest = hardest.
    _rename(
        [
            (4, 6, "Easy"),
            (8, 12, "Medium"),
            (16, 24, "Advanced"),
            (24, 36, "Extreme"),
        ]
    )


def downgrade() -> None:
    _rename(
        [
            (4, 6, "6 bpm · balanced"),
            (8, 12, "3 bpm · slow"),
            (16, 24, "1.5 bpm · extended"),
            (24, 36, "1 bpm · advanced"),
        ]
    )
