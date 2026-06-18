"""add implicit feedback event tables

Revision ID: c9f8d4a7b112
Revises: bf4a5e9d1c2f
Create Date: 2026-02-16 01:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c9f8d4a7b112"
down_revision: Union[str, Sequence[str], None] = "bf4a5e9d1c2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_entry_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("view", sa.String(length=16), nullable=True),
        sa.Column("device_type", sa.String(length=16), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scroll_depth_max", sa.Float(), nullable=False, server_default="0"),
        sa.Column("est_read_time_sec", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("extra", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_user_entry_event_event_id"),
    )
    op.create_index(
        "ix_user_entry_events_user_entry_occurred",
        "user_entry_events",
        ["user_id", "entry_id", "occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_user_entry_events_entry_occurred",
        "user_entry_events",
        ["entry_id", "occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_user_entry_events_user_occurred",
        "user_entry_events",
        ["user_id", "occurred_at"],
        unique=False,
    )

    op.create_table(
        "user_entry_implicit_labels",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("label_date", sa.Date(), nullable=False),
        sa.Column("total_sessions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quick_skip_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("effective_read_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("return_read_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_active_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_est_read_time_sec", sa.Float(), nullable=False, server_default="0"),
        sa.Column("avg_normalized_dwell", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "entry_id",
            "label_date",
            name="uq_user_entry_implicit_labels_day",
        ),
    )
    op.create_index(
        "ix_user_entry_implicit_labels_user_date",
        "user_entry_implicit_labels",
        ["user_id", "label_date"],
        unique=False,
    )
    op.create_index(
        "ix_user_entry_implicit_labels_entry_date",
        "user_entry_implicit_labels",
        ["entry_id", "label_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_entry_implicit_labels_entry_date", table_name="user_entry_implicit_labels")
    op.drop_index("ix_user_entry_implicit_labels_user_date", table_name="user_entry_implicit_labels")
    op.drop_table("user_entry_implicit_labels")

    op.drop_index("ix_user_entry_events_user_occurred", table_name="user_entry_events")
    op.drop_index("ix_user_entry_events_entry_occurred", table_name="user_entry_events")
    op.drop_index("ix_user_entry_events_user_entry_occurred", table_name="user_entry_events")
    op.drop_table("user_entry_events")
