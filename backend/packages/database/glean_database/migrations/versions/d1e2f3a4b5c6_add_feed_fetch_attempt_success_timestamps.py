"""add feed fetch attempt/success timestamps

Revision ID: d1e2f3a4b5c6
Revises: f2c3d4e5a6b7
Create Date: 2026-02-18 09:10:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "f2c3d4e5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("feeds", sa.Column("last_fetch_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("feeds", sa.Column("last_fetch_success_at", sa.DateTime(timezone=True), nullable=True))

    # Backfill historical data:
    # - last_fetch_attempt_at mirrors legacy last_fetched_at
    # - last_fetch_success_at is inferred for currently healthy feeds
    op.execute(
        """
        UPDATE feeds
        SET last_fetch_attempt_at = last_fetched_at
        WHERE last_fetch_attempt_at IS NULL AND last_fetched_at IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE feeds
        SET last_fetch_success_at = last_fetched_at
        WHERE last_fetch_success_at IS NULL
          AND last_fetched_at IS NOT NULL
          AND COALESCE(error_count, 0) = 0
          AND status = 'active'
        """
    )


def downgrade() -> None:
    op.drop_column("feeds", "last_fetch_success_at")
    op.drop_column("feeds", "last_fetch_attempt_at")
