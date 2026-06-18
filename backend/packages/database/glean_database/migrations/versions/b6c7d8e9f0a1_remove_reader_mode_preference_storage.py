"""remove reader mode and preference storage

Revision ID: b6c7d8e9f0a1
Revises: 9f1b2c3d4e5f
Create Date: 2026-04-19 13:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = "9f1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REMOVED_SETTINGS_KEYS = (
    "reader_mode",
    "ranking_mode",
    "recommendation_strength",
    "explore_ratio",
    "manual_only",
)


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_preference_vectors")
    op.drop_table("user_preference_stats")

    op.execute("ALTER TABLE user_entries DROP COLUMN IF EXISTS liked_at")
    op.execute("ALTER TABLE user_entries DROP COLUMN IF EXISTS is_liked")

    settings_key_sql = ", ".join(f"'{key}'" for key in REMOVED_SETTINGS_KEYS)
    op.execute(
        f"""
        UPDATE users
        SET settings = settings - ARRAY[{settings_key_sql}]
        WHERE settings IS NOT NULL
        """
    )


def downgrade() -> None:
    op.add_column("user_entries", sa.Column("is_liked", sa.Boolean(), nullable=True))
    op.add_column("user_entries", sa.Column("liked_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "user_preference_stats",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("positive_count", sa.Float(), nullable=False, server_default="0"),
        sa.Column("negative_count", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "source_affinity",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "author_affinity",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
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
        sa.UniqueConstraint("user_id"),
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_preference_vectors (
            id          VARCHAR(50) PRIMARY KEY,
            user_id     VARCHAR(36) NOT NULL,
            vector_type VARCHAR(20) NOT NULL,
            embedding   vector      NOT NULL,
            sample_count FLOAT      NOT NULL,
            updated_at  BIGINT      NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_pref_vectors_user_id ON user_preference_vectors (user_id)"
    )
