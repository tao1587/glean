"""add entry content backfill fields

Revision ID: f4b8a1c9d2e3
Revises: e7b9c2d4f1a8
Create Date: 2026-03-18 14:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4b8a1c9d2e3"
down_revision: Union[str, Sequence[str], None] = "e7b9c2d4f1a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column(
            "content_backfill_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "entries",
        sa.Column(
            "content_backfill_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column("entries", sa.Column("content_backfill_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("entries", sa.Column("content_backfill_error", sa.Text(), nullable=True))
    op.add_column("entries", sa.Column("content_source", sa.String(length=30), nullable=True))

    op.create_index(
        op.f("ix_entries_content_backfill_status"),
        "entries",
        ["content_backfill_status"],
        unique=False,
    )
    op.create_index(op.f("ix_entries_content_source"), "entries", ["content_source"], unique=False)

    op.create_check_constraint(
        "ck_entries_content_backfill_status",
        "entries",
        "content_backfill_status IN ('pending', 'processing', 'done', 'failed', 'skipped')",
    )
    op.create_check_constraint(
        "ck_entries_content_source",
        "entries",
        "content_source IS NULL OR content_source IN "
        "('feed_fulltext', 'feed_summary_only', 'backfill_http', 'backfill_browser')",
    )

    # Keep the migration schema-only.
    #
    # A previous full-table UPDATE here caused startup migration failures on
    # real datasets due to unique constraint conflicts surfacing while the
    # table was being rewritten. Existing rows can safely start with the new
    # defaults and be normalized later through the application backfill flows.

    op.alter_column("entries", "content_backfill_status", server_default=None)
    op.alter_column("entries", "content_backfill_attempts", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_entries_content_source", "entries", type_="check")
    op.drop_constraint("ck_entries_content_backfill_status", "entries", type_="check")
    op.drop_index(op.f("ix_entries_content_source"), table_name="entries")
    op.drop_index(op.f("ix_entries_content_backfill_status"), table_name="entries")
    op.drop_column("entries", "content_source")
    op.drop_column("entries", "content_backfill_error")
    op.drop_column("entries", "content_backfill_at")
    op.drop_column("entries", "content_backfill_attempts")
    op.drop_column("entries", "content_backfill_status")
