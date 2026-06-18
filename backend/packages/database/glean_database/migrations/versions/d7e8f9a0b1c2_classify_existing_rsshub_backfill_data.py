"""classify existing rsshub backfill data

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-04-18 19:15:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RSSHUB_LEGACY_URL_MATCH = r"""
lower(url) LIKE '%rsshub%'
OR url ~ 'https?://[^/]+/(anthropic|bilibili|github|hackernews|medium|pixiv|reddit|telegram|twitter|weibo|x|xiaoyuzhou|youtube|zhihu)(/|$)'
"""


def upgrade() -> None:
    # Existing data predates persisted source typing. Runtime code no longer guesses from
    # URL routes, but this one-time migration has to classify legacy rows from stored URLs.
    op.execute(
        f"""
        UPDATE feeds
        SET source_type = 'rsshub'
        WHERE source_type <> 'rsshub'
          AND ({RSSHUB_LEGACY_URL_MATCH})
        """
    )

    # RSSHub subscriptions are considered source-complete. Any queued/failed full-text
    # backfill work left from before source typing should not keep surfacing as errors.
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
    # Data-only cleanup is intentionally not reversible: restoring stale failed/pending
    # backfill jobs would reintroduce misleading errors for RSSHub source-complete feeds.
    pass
