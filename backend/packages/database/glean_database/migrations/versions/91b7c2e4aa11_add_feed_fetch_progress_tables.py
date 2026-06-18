"""add feed fetch progress tables

Revision ID: 91b7c2e4aa11
Revises: f4b8a1c9d2e3
Create Date: 2026-04-03 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "91b7c2e4aa11"
down_revision: str | Sequence[str] | None = "f4b8a1c9d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feed_fetch_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("feed_id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("trigger_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_stage", sa.String(length=50), nullable=True),
        sa.Column("path_kind", sa.String(length=32), nullable=True),
        sa.Column("profile_key", sa.String(length=255), nullable=True),
        sa.Column("queue_entered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("predicted_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("predicted_finish_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["feed_id"], ["feeds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_feed_fetch_runs_feed_created",
        "feed_fetch_runs",
        ["feed_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_feed_fetch_runs_job_id", "feed_fetch_runs", ["job_id"], unique=False)
    op.create_index("ix_feed_fetch_runs_status", "feed_fetch_runs", ["status"], unique=False)
    op.create_index(
        "ix_feed_fetch_runs_profile_key", "feed_fetch_runs", ["profile_key"], unique=False
    )

    op.create_table(
        "feed_fetch_stage_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("stage_name", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
        sa.ForeignKeyConstraint(["run_id"], ["feed_fetch_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "stage_order", name="uq_feed_fetch_stage_events_run_order"),
    )
    op.create_index(
        "ix_feed_fetch_stage_events_run_order",
        "feed_fetch_stage_events",
        ["run_id", "stage_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_feed_fetch_stage_events_run_order", table_name="feed_fetch_stage_events")
    op.drop_table("feed_fetch_stage_events")

    op.drop_index("ix_feed_fetch_runs_profile_key", table_name="feed_fetch_runs")
    op.drop_index("ix_feed_fetch_runs_status", table_name="feed_fetch_runs")
    op.drop_index("ix_feed_fetch_runs_job_id", table_name="feed_fetch_runs")
    op.drop_index("ix_feed_fetch_runs_feed_created", table_name="feed_fetch_runs")
    op.drop_table("feed_fetch_runs")
