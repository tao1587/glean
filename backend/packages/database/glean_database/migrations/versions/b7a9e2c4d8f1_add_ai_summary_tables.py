"""add ai summary tables

Revision ID: b7a9e2c4d8f1
Revises: 91b7c2e4aa11
Create Date: 2026-04-17 04:45:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7a9e2c4d8f1"
down_revision: str | Sequence[str] | None = "91b7c2e4aa11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_daily_summaries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("summary_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("highlights", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("topics", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column(
            "recommended_entry_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "summary_date", "timezone", name="uq_ai_daily_summary_user_day"),
    )
    op.create_index(op.f("ix_ai_daily_summaries_user_id"), "ai_daily_summaries", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_ai_daily_summaries_summary_date"),
        "ai_daily_summaries",
        ["summary_date"],
        unique=False,
    )

    op.create_table(
        "ai_entry_supplements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("key_points", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("reading_priority", sa.String(length=20), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entry_id", name="uq_ai_entry_supplement_user_entry"),
    )
    op.create_index(op.f("ix_ai_entry_supplements_user_id"), "ai_entry_supplements", ["user_id"], unique=False)
    op.create_index(op.f("ix_ai_entry_supplements_entry_id"), "ai_entry_supplements", ["entry_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_entry_supplements_entry_id"), table_name="ai_entry_supplements")
    op.drop_index(op.f("ix_ai_entry_supplements_user_id"), table_name="ai_entry_supplements")
    op.drop_table("ai_entry_supplements")
    op.drop_index(op.f("ix_ai_daily_summaries_summary_date"), table_name="ai_daily_summaries")
    op.drop_index(op.f("ix_ai_daily_summaries_user_id"), table_name="ai_daily_summaries")
    op.drop_table("ai_daily_summaries")
