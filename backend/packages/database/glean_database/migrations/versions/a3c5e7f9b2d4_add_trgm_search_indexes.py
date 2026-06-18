"""add trgm search indexes for entry full-text search

Revision ID: a3c5e7f9b2d4
Revises: b7a9e2c4d8f1
Create Date: 2026-04-20 10:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c5e7f9b2d4"
down_revision: Union[str, Sequence[str], None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pg_trgm extension for trigram-based similarity search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # GIN trigram index on entries.title for fast ILIKE searches
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_entries_title_trgm "
        "ON entries USING gin (title gin_trgm_ops);"
    )

    # GIN trigram index on entries.summary for fast ILIKE searches
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_entries_summary_trgm "
        "ON entries USING gin (summary gin_trgm_ops);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_entries_summary_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_entries_title_trgm;")
    # Intentionally not dropping pg_trgm extension as other tables may use it
