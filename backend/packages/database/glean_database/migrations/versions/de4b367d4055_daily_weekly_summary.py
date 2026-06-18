"""daily weekly summary

Revision ID: de4b367d4055
Revises: a1c5e2f9b0d3
Create Date: 2026-06-13 00:11:27.669784

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "de4b367d4055"
down_revision: Union[str, None] = "a1c5e2f9b0d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_daily_summaries",
        sa.Column("period", sa.String(8), nullable=False, server_default="day"),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("period_end", sa.Date(), nullable=True),
    )
    op.create_index("ix_ai_daily_summaries_period", "ai_daily_summaries", ["period"])
    op.alter_column("ai_daily_summaries", "source_supplement_ids", new_column_name="source_ids")
    op.execute("UPDATE ai_daily_summaries SET period_start = summary_date, period_end = summary_date")
    op.drop_constraint("uq_ai_daily_summary_tuple", "ai_daily_summaries", type_="unique")
    op.create_unique_constraint(
        "uq_ai_daily_summary_tuple",
        "ai_daily_summaries",
        [
            "user_id",
            "period",
            "summary_date",
            "timezone",
            "model",
            "prompt_version",
            "target_language",
            "source_set_hash",
        ],
    )
    op.drop_table("ai_entry_supplements")


def downgrade() -> None:
    op.create_table(
        "ai_entry_supplements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("entry_id", sa.String(36), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.drop_constraint("uq_ai_daily_summary_tuple", "ai_daily_summaries", type_="unique")
    op.create_unique_constraint(
        "uq_ai_daily_summary_tuple",
        "ai_daily_summaries",
        [
            "user_id",
            "summary_date",
            "timezone",
            "model",
            "prompt_version",
            "target_language",
            "source_set_hash",
        ],
    )
    op.alter_column("ai_daily_summaries", "source_ids", new_column_name="source_supplement_ids")
    op.drop_index("ix_ai_daily_summaries_period", "ai_daily_summaries")
    op.drop_column("ai_daily_summaries", "period_end")
    op.drop_column("ai_daily_summaries", "period_start")
    op.drop_column("ai_daily_summaries", "period")
