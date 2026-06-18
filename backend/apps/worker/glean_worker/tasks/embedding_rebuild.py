"""Embedding rebuild task."""

from typing import Any

from sqlalchemy import select, update

from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig as EmbeddingConfigSchema
from glean_core.schemas.config import VectorizationStatus
from glean_core.services import TypedConfigService
from glean_core.services.system_config_service import SystemConfigService
from glean_database.models import Entry
from glean_database.session import get_session_context
from glean_vector.clients.pgvector_client import PgVectorClient
from glean_vector.config import EmbeddingConfig as EmbeddingSettings
from glean_vector.config import embedding_config as env_embedding_config

logger = get_logger(__name__)


async def rebuild_embeddings(
    ctx: dict[str, Any], config: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Rebuild embeddings after config change.

    Steps:
      1) Load embedding config (payload passed or system config / env fallback)
      2) Update status to REBUILDING
      3) Clear pgvector embedding tables
      4) Mark all entries pending
      5) Enqueue embedding jobs in batches
      6) Enqueue user preference rebuild jobs
      7) Keep status as REBUILDING (will be set to IDLE when all done)
    """
    redis = ctx.get("redis")
    if not redis:
        return {"success": False, "error": "Redis unavailable"}

    async with get_session_context() as session:
        # Update status to REBUILDING so embedding tasks can proceed
        config_service = TypedConfigService(session)
        await config_service.update(
            EmbeddingConfigSchema,
            status=VectorizationStatus.REBUILDING,
        )
        # Commit status change BEFORE clearing vectors to prevent inconsistent state
        await session.commit()

        # Load config
        if config is None:
            scs = SystemConfigService(session)
            config = await scs.get_config("embedding.config")

        if not config:
            # Fallback to env defaults
            env_conf = env_embedding_config.model_dump()
            config = {
                "provider": env_conf["provider"],
                "model": env_conf["model"],
                "dimension": env_conf["dimension"],
                "api_key": env_conf.get("api_key") or "",
                "base_url": env_conf.get("base_url"),
                "rate_limit": {"default": 10, "providers": {}},
            }

        settings = EmbeddingSettings(
            **{k: v for k, v in config.items() if k in EmbeddingSettings.model_fields}
        )
        dimension = settings.dimension

        # Clear all pgvector embeddings and update model signature
        # NOTE: This is a point of no return - old embeddings are gone after this.
        vector_client = PgVectorClient(session)
        await vector_client.recreate_collections(dimension, settings.provider, settings.model)
        logger.info(f"Cleared pgvector tables for rebuild, dimension={dimension}")

        # Mark all entries pending for new model (new transaction)
        await session.execute(
            update(Entry).values(
                embedding_status="pending",
                embedding_error=None,
            )
        )
        await session.commit()

        # Enqueue embedding jobs in batches
        total_result = await session.execute(select(Entry.id))
        entry_ids = [row[0] for row in total_result.all()]

        for entry_id in entry_ids:
            await redis.enqueue_job("generate_entry_embedding", entry_id)

        logger.info(f"Enqueued {len(entry_ids)} embedding jobs")

        return {
            "success": True,
            "queued_entries": len(entry_ids),
            "dimension": dimension,
        }
