"""add pgvector tables for entry embeddings and user preferences

Revision ID: a1b2c3d4e5f6
Revises: d1e2f3a4b5c6
Create Date: 2026-03-02 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Entry embeddings table (replaces Milvus entries collection)
    op.execute("""
        CREATE TABLE IF NOT EXISTS entry_embeddings (
            entry_id    VARCHAR(36) PRIMARY KEY,
            embedding   vector      NOT NULL,
            feed_id     VARCHAR(36) NOT NULL,
            published_at BIGINT,
            language    VARCHAR(10),
            word_count  INTEGER,
            author      VARCHAR(200),
            FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_entry_embeddings_feed_id ON entry_embeddings (feed_id)")
    # HNSW index is NOT created here because pgvector requires vector(N) with a fixed dimension,
    # but the dimension is user-configured (unknown at migration time).
    # PgVectorClient.ensure_collections() handles ALTER TABLE + CREATE INDEX at runtime.

    # User preference vectors table (replaces Milvus user_preferences collection)
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_preference_vectors (
            id          VARCHAR(50) PRIMARY KEY,
            user_id     VARCHAR(36) NOT NULL,
            vector_type VARCHAR(20) NOT NULL,
            embedding   vector      NOT NULL,
            sample_count FLOAT      NOT NULL,
            updated_at  BIGINT      NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_pref_vectors_user_id ON user_preference_vectors (user_id)"
    )

    # Model signature config table (one row tracks current embedding model)
    op.execute("""
        CREATE TABLE IF NOT EXISTS vector_model_config (
            id              INTEGER PRIMARY KEY DEFAULT 1,
            model_signature VARCHAR(200) NOT NULL,
            CHECK (id = 1)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS vector_model_config")
    op.execute("DROP TABLE IF EXISTS user_preference_vectors")
    op.execute("DROP TABLE IF EXISTS entry_embeddings")
    # Note: we intentionally do not DROP EXTENSION vector as other tables may use it
