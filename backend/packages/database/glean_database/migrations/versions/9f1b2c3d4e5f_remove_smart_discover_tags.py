"""remove smart/discover/tags schema artifacts

Revision ID: 9f1b2c3d4e5f
Revises: e8f9a0b1c2d3
Create Date: 2026-04-19 12:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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

    op.drop_table("user_entry_tags")
    op.drop_table("bookmark_tags")
    op.drop_index(op.f("ix_tags_user_id"), table_name="tags")
    op.drop_table("tags")


def downgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_tag_name"),
    )
    op.create_index(op.f("ix_tags_user_id"), "tags", ["user_id"], unique=False)

    op.create_table(
        "bookmark_tags",
        sa.Column("bookmark_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["bookmark_id"], ["bookmarks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("bookmark_id", "tag_id"),
    )

    op.create_table(
        "user_entry_tags",
        sa.Column("user_entry_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_entry_id"], ["user_entries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_entry_id", "tag_id"),
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
        sa.Column(
            "refreshed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
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
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
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
    op.create_index(
        op.f("ix_discovery_feedback_user_id"), "discovery_feedback", ["user_id"], unique=False
    )
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
