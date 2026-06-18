"""add feed source type

Revision ID: c6d7e8f9a0b1
Revises: b7a9e2c4d8f1
Create Date: 2026-04-18 18:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "b7a9e2c4d8f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feeds",
        sa.Column("source_type", sa.String(length=20), nullable=False, server_default="feed"),
    )
    op.create_index(op.f("ix_feeds_source_type"), "feeds", ["source_type"], unique=False)
    op.create_check_constraint(
        "ck_feeds_source_type",
        "feeds",
        "source_type IN ('feed', 'rsshub')",
    )

    # Existing rows predate explicit source typing. Preserve normal feed behavior by
    # default, but recover rows that are clearly stored as RSSHub feed URLs.
    op.execute(
        """
        UPDATE feeds
        SET source_type = 'rsshub'
        WHERE lower(url) LIKE '%rsshub%'
           OR url ~ 'https?://[^/]+/(anthropic|bilibili|github|hackernews|medium|pixiv|reddit|telegram|twitter|weibo|x|xiaoyuzhou|youtube|zhihu)(/|$)'
        """
    )
    op.alter_column("feeds", "source_type", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_feeds_source_type", "feeds", type_="check")
    op.drop_index(op.f("ix_feeds_source_type"), table_name="feeds")
    op.drop_column("feeds", "source_type")
