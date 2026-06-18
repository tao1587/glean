"""finalize rsshub backfill states

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-04-18 19:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent data cleanup for environments that already ran the source-type
    # migration while old queued backfill jobs were still draining.
    op.execute(
        """
        UPDATE entries AS e
        SET content_backfill_status = 'skipped',
            content_backfill_attempts = 0,
            content_backfill_at = COALESCE(e.content_backfill_at, NOW()),
            content_backfill_error = NULL
        FROM feeds AS f
        WHERE f.id = e.feed_id
          AND f.source_type = 'rsshub'
          AND e.content_backfill_status IN ('pending', 'processing', 'failed')
        """
    )


def downgrade() -> None:
    # Data cleanup is intentionally not reversible.
    pass
