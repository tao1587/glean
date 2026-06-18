"""make feed fetch_error_message text

Revision ID: e7b9c2d4f1a8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-08 18:20:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b9c2d4f1a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "feeds",
        "fetch_error_message",
        existing_type=sa.String(length=1000),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "feeds",
        "fetch_error_message",
        existing_type=sa.Text(),
        type_=sa.String(length=1000),
        existing_nullable=True,
    )
