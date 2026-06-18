"""extend feed source_type with synthetic variants

Revision ID: d5e9f1a3b7c8
Revises: a3c5e7f9b2d4
Create Date: 2026-04-22 12:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "d5e9f1a3b7c8"
down_revision: Union[str, Sequence[str], None] = "a3c5e7f9b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_feeds_source_type", "feeds", type_="check")
    op.create_check_constraint(
        "ck_feeds_source_type",
        "feeds",
        "source_type IN ('feed', 'rsshub', 'synthetic_jsonld', 'synthetic_sitemap')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_feeds_source_type", "feeds", type_="check")
    op.create_check_constraint(
        "ck_feeds_source_type",
        "feeds",
        "source_type IN ('feed', 'rsshub')",
    )
