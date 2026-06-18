"""add new reader mode and discovery schema

Revision ID: f2c3d4e5a6b7
Revises: c9f8d4a7b112
Create Date: 2026-02-16 13:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2c3d4e5a6b7"
down_revision: Union[str, Sequence[str], None] = "c9f8d4a7b112"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entries", sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE entries SET ingested_at = COALESCE(created_at, NOW()) WHERE ingested_at IS NULL")
    op.alter_column("entries", "ingested_at", nullable=False)
    op.create_index(op.f("ix_entries_ingested_at"), "entries", ["ingested_at"], unique=False)

    op.add_column(
        "feeds",
        sa.Column("source_value_score", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column("feeds", sa.Column("quality_score", sa.Float(), server_default="0", nullable=False))
    op.add_column("feeds", sa.Column("health_score", sa.Float(), server_default="0", nullable=False))
    op.add_column("feeds", sa.Column("last_scored_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_feeds_source_value_score"), "feeds", ["source_value_score"], unique=False)

    op.add_column(
        "user_entries",
        sa.Column("triage_state", sa.String(length=20), server_default="now", nullable=False),
    )
    op.add_column("user_entries", sa.Column("defer_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_entries", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_entries", sa.Column("estimated_read_time_sec", sa.Integer(), nullable=True))
    op.add_column(
        "user_entries",
        sa.Column("content_temporality", sa.String(length=20), server_default="mixed", nullable=False),
    )
    op.create_index(op.f("ix_user_entries_triage_state"), "user_entries", ["triage_state"], unique=False)
    op.create_index(op.f("ix_user_entries_defer_until"), "user_entries", ["defer_until"], unique=False)
    op.create_index(op.f("ix_user_entries_expires_at"), "user_entries", ["expires_at"], unique=False)
    op.create_index(
        op.f("ix_user_entries_content_temporality"),
        "user_entries",
        ["content_temporality"],
        unique=False,
    )

    op.create_table(
        "discovery_candidates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("feed_url", sa.String(length=2000), nullable=False),
        sa.Column("site_url", sa.String(length=2000), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("topic", sa.String(length=100), server_default="general", nullable=False),
        sa.Column("source_kind", sa.String(length=30), server_default="whitelist", nullable=False),
        sa.Column("reason", sa.String(length=500), server_default="", nullable=False),
        sa.Column("quality_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("relevance_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("novelty_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("diversity_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("discovery_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("fetch_success_rate", sa.Float(), server_default="0", nullable=False),
        sa.Column("update_stability_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("dedup_ratio", sa.Float(), server_default="0", nullable=False),
        sa.Column("is_blocked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "feed_url", name="uq_discovery_candidate_user_feed"),
    )
    op.create_index(
        op.f("ix_discovery_candidates_user_id"), "discovery_candidates", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_discovery_candidates_topic"), "discovery_candidates", ["topic"], unique=False
    )
    op.create_index(
        op.f("ix_discovery_candidates_source_kind"),
        "discovery_candidates",
        ["source_kind"],
        unique=False,
    )
    op.create_index(
        op.f("ix_discovery_candidates_discovery_score"),
        "discovery_candidates",
        ["discovery_score"],
        unique=False,
    )
    op.create_index(
        op.f("ix_discovery_candidates_is_blocked"),
        "discovery_candidates",
        ["is_blocked"],
        unique=False,
    )
    op.create_index(
        op.f("ix_discovery_candidates_trial_ends_at"),
        "discovery_candidates",
        ["trial_ends_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_discovery_candidates_refreshed_at"),
        "discovery_candidates",
        ["refreshed_at"],
        unique=False,
    )

    op.create_table(
        "discovery_feedback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("candidate_id", sa.String(length=36), nullable=False),
        sa.Column("feedback_type", sa.String(length=40), nullable=False),
        sa.Column("topic", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at_event",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["discovery_candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "candidate_id",
            "feedback_type",
            name="uq_discovery_feedback_user_candidate_type",
        ),
    )
    op.create_index(op.f("ix_discovery_feedback_user_id"), "discovery_feedback", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_discovery_feedback_candidate_id"),
        "discovery_feedback",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_discovery_feedback_feedback_type"),
        "discovery_feedback",
        ["feedback_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_discovery_feedback_feedback_type"), table_name="discovery_feedback")
    op.drop_index(op.f("ix_discovery_feedback_candidate_id"), table_name="discovery_feedback")
    op.drop_index(op.f("ix_discovery_feedback_user_id"), table_name="discovery_feedback")
    op.drop_table("discovery_feedback")

    op.drop_index(op.f("ix_discovery_candidates_refreshed_at"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_trial_ends_at"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_is_blocked"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_discovery_score"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_source_kind"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_topic"), table_name="discovery_candidates")
    op.drop_index(op.f("ix_discovery_candidates_user_id"), table_name="discovery_candidates")
    op.drop_table("discovery_candidates")

    op.drop_index(op.f("ix_user_entries_content_temporality"), table_name="user_entries")
    op.drop_index(op.f("ix_user_entries_expires_at"), table_name="user_entries")
    op.drop_index(op.f("ix_user_entries_defer_until"), table_name="user_entries")
    op.drop_index(op.f("ix_user_entries_triage_state"), table_name="user_entries")
    op.drop_column("user_entries", "content_temporality")
    op.drop_column("user_entries", "estimated_read_time_sec")
    op.drop_column("user_entries", "expires_at")
    op.drop_column("user_entries", "defer_until")
    op.drop_column("user_entries", "triage_state")

    op.drop_index(op.f("ix_feeds_source_value_score"), table_name="feeds")
    op.drop_column("feeds", "last_scored_at")
    op.drop_column("feeds", "health_score")
    op.drop_column("feeds", "quality_score")
    op.drop_column("feeds", "source_value_score")

    op.drop_index(op.f("ix_entries_ingested_at"), table_name="entries")
    op.drop_column("entries", "ingested_at")
