"""ai summary schema v2 — status, language, prompt version, set hash.

Adds lifecycle fields (status, error_code, attempt_count, last_attempt_at,
generated_at), lookup-tuple fields (prompt_version, target_language, source),
observability fields (input_tokens, output_tokens), and synthesis-specific
fields (source_supplement_ids, source_set_hash). Replaces simple unique
constraints with tuple-based unique constraints so multiple
(model, prompt_version, target_language[, source_set_hash]) combinations
can coexist for the same (user, entry) or (user, date) pair.

Existing rows are backfilled to status='done' and prompt_version='v0' so they
fall onto a unique tuple no live code uses — they remain in the DB for
forensics / rollback but are invisible to the new "current tuple" filter.

Revision ID: a1c5e2f9b0d3
Revises: d5e9f1a3b7c8
Create Date: 2026-04-28
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1c5e2f9b0d3"
down_revision: Union[str, Sequence[str], None] = "d5e9f1a3b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def upgrade() -> None:
    # ---- ai_entry_supplements ----
    op.add_column(
        "ai_entry_supplements",
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column("ai_entry_supplements", sa.Column("error_code", sa.String(40)))
    op.add_column("ai_entry_supplements", sa.Column("error_message", sa.Text()))
    op.add_column(
        "ai_entry_supplements",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_entry_supplements",
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "ai_entry_supplements",
        sa.Column("prompt_version", sa.String(16), nullable=False, server_default="v1"),
    )
    op.add_column(
        "ai_entry_supplements",
        sa.Column("target_language", sa.String(16), nullable=False, server_default="en"),
    )
    op.add_column("ai_entry_supplements", sa.Column("input_tokens", sa.Integer()))
    op.add_column("ai_entry_supplements", sa.Column("output_tokens", sa.Integer()))
    op.add_column(
        "ai_entry_supplements",
        sa.Column("generated_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "ai_entry_supplements",
        sa.Column("source", sa.String(20), nullable=False, server_default="internal"),
    )
    op.create_index(
        "ix_ai_entry_supplements_status",
        "ai_entry_supplements",
        ["status"],
    )

    # Backfill existing rows to invisible v0 tuple. target_language uses the
    # server_default ('en'); we don't try to mine user.settings JSONB here —
    # the user will trigger fresh generation under the v1 tuple anyway.
    op.execute(
        """
        UPDATE ai_entry_supplements
        SET status = 'done',
            prompt_version = 'v0',
            attempt_count = 1,
            last_attempt_at = created_at
        WHERE status = 'pending'
        """
    )

    op.drop_constraint(
        "uq_ai_entry_supplement_user_entry", "ai_entry_supplements", type_="unique"
    )
    op.create_unique_constraint(
        "uq_ai_entry_supplement_tuple",
        "ai_entry_supplements",
        ["user_id", "entry_id", "model", "prompt_version", "target_language"],
    )

    # ---- ai_daily_summaries ----
    op.add_column(
        "ai_daily_summaries",
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column("ai_daily_summaries", sa.Column("error_code", sa.String(40)))
    op.add_column("ai_daily_summaries", sa.Column("error_message", sa.Text()))
    op.add_column(
        "ai_daily_summaries",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("prompt_version", sa.String(16), nullable=False, server_default="v1"),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("target_language", sa.String(16), nullable=False, server_default="en"),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column(
            "source_supplement_ids",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column(
            "source_set_hash",
            sa.String(64),
            nullable=False,
            server_default=_EMPTY_SHA256,
        ),
    )
    op.add_column("ai_daily_summaries", sa.Column("input_tokens", sa.Integer()))
    op.add_column("ai_daily_summaries", sa.Column("output_tokens", sa.Integer()))
    op.add_column(
        "ai_daily_summaries",
        sa.Column("generated_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "ai_daily_summaries",
        sa.Column("source", sa.String(20), nullable=False, server_default="internal"),
    )
    op.create_index(
        "ix_ai_daily_summaries_status",
        "ai_daily_summaries",
        ["status"],
    )

    op.execute(
        """
        UPDATE ai_daily_summaries
        SET status = 'done',
            prompt_version = 'v0',
            attempt_count = 1,
            last_attempt_at = created_at
        WHERE status = 'pending'
        """
    )

    op.drop_constraint(
        "uq_ai_daily_summary_user_day", "ai_daily_summaries", type_="unique"
    )
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


def downgrade() -> None:
    op.drop_constraint(
        "uq_ai_daily_summary_tuple", "ai_daily_summaries", type_="unique"
    )
    op.create_unique_constraint(
        "uq_ai_daily_summary_user_day",
        "ai_daily_summaries",
        ["user_id", "summary_date", "timezone"],
    )
    op.drop_index("ix_ai_daily_summaries_status", table_name="ai_daily_summaries")
    for col in (
        "source",
        "generated_at",
        "output_tokens",
        "input_tokens",
        "source_set_hash",
        "source_supplement_ids",
        "target_language",
        "prompt_version",
        "last_attempt_at",
        "attempt_count",
        "error_message",
        "error_code",
        "status",
    ):
        op.drop_column("ai_daily_summaries", col)

    op.drop_constraint(
        "uq_ai_entry_supplement_tuple", "ai_entry_supplements", type_="unique"
    )
    op.create_unique_constraint(
        "uq_ai_entry_supplement_user_entry",
        "ai_entry_supplements",
        ["user_id", "entry_id"],
    )
    op.drop_index("ix_ai_entry_supplements_status", table_name="ai_entry_supplements")
    for col in (
        "source",
        "generated_at",
        "output_tokens",
        "input_tokens",
        "target_language",
        "prompt_version",
        "last_attempt_at",
        "attempt_count",
        "error_message",
        "error_code",
        "status",
    ):
        op.drop_column("ai_entry_supplements", col)
