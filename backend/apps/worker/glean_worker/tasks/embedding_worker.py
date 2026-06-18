"""Embedding generation worker tasks."""

import asyncio
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
from glean_core.services import TypedConfigService
from glean_database.session import get_session_context
from glean_vector.clients.embedding_client import EmbeddingClient
from glean_vector.clients.pgvector_client import PgVectorClient
from glean_vector.config import EmbeddingConfig as EmbeddingSettings
from glean_vector.services.embedding_service import EmbeddingService

logger = get_logger(__name__)

# Circuit breaker state
CONSECUTIVE_FAILURES_THRESHOLD = 5

# Model download status tracking (Redis keys)
MODEL_DOWNLOAD_KEY_PREFIX = "glean:model_download:"
MODEL_DOWNLOAD_TTL = 86400  # 24 hours


async def _check_vectorization_enabled(session: AsyncSession) -> tuple[bool, EmbeddingConfig]:
    """
    Check if vectorization is enabled and healthy.

    Returns:
        Tuple of (is_enabled, config)
    """
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    # Check if enabled and in a working state
    is_enabled = config.enabled and config.status in (
        VectorizationStatus.IDLE,
        VectorizationStatus.REBUILDING,
    )

    return is_enabled, config


async def _load_embedding_settings(config: EmbeddingConfig) -> tuple[EmbeddingSettings, int]:
    """
    Build embedding settings from typed config.

    Returns:
        Tuple of (EmbeddingSettings, rate_limit)
    """
    settings = EmbeddingSettings(
        provider=config.provider,
        model=config.model,
        dimension=config.dimension,
        api_key=config.api_key or "",
        base_url=config.base_url,
        timeout=config.timeout,
        batch_size=config.batch_size,
        max_retries=config.max_retries,
    )
    rate_limit = config.get_rate_limit_for_provider()
    return settings, rate_limit


async def _handle_embedding_error(session: AsyncSession, error: Exception) -> None:
    """
    Handle embedding error with circuit breaker logic.

    After CONSECUTIVE_FAILURES_THRESHOLD failures, sets status to ERROR.
    """
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    new_error_count = config.error_count + 1

    if new_error_count >= CONSECUTIVE_FAILURES_THRESHOLD:
        # Circuit breaker: set status to ERROR
        logger.warning(f"Circuit breaker triggered after {new_error_count} consecutive failures")
        await config_service.set_embedding_status(
            VectorizationStatus.ERROR.value,
            error=f"Circuit breaker: {str(error)}",
        )
    else:
        # Just increment error count
        await config_service.update(EmbeddingConfig, error_count=new_error_count)


async def _reset_error_count(session: AsyncSession) -> None:
    """Reset error count on successful operation."""
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    if config.error_count > 0:
        await config_service.update(EmbeddingConfig, error_count=0)


async def generate_entry_embedding(ctx: dict[str, Any], entry_id: str) -> dict[str, Any]:
    """
    Generate embedding for a single entry.

    Args:
        ctx: Worker context
        entry_id: Entry UUID

    Returns:
        Result dictionary
    """
    async with get_session_context() as session:
        # Check if vectorization is enabled
        is_enabled, config = await _check_vectorization_enabled(session)
        if not is_enabled:
            logger.debug(f"Vectorization disabled, skipping embedding for {entry_id}")
            return {"success": False, "entry_id": entry_id, "error": "Vectorization disabled"}

        settings, rate_limit = await _load_embedding_settings(config)
        embedding_client = EmbeddingClient(config=settings, rate_limit=rate_limit)
        vector_client = PgVectorClient(session)

        try:
            await vector_client.ensure_collections(
                settings.dimension, settings.provider, settings.model
            )

            embedding_service = EmbeddingService(
                db_session=session,
                embedding_client=embedding_client,
                milvus_client=vector_client,
            )

            success = await embedding_service.generate_embedding(entry_id)

            if success:
                # Reset error count on success
                await _reset_error_count(session)

            return {"success": success, "entry_id": entry_id}

        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Failed to generate embedding for entry {entry_id}: {error_msg}",
                exc_info=True,
            )
            await _handle_embedding_error(session, e)
            raise

        finally:
            await embedding_client.close()


async def batch_generate_embeddings(ctx: dict[str, Any], limit: int = 100) -> dict[str, int | str]:
    """
    Batch generate embeddings for pending entries.

    Args:
        ctx: Worker context
        limit: Maximum number of entries to process

    Returns:
        Result dictionary with processed and failed counts
    """
    async with get_session_context() as session:
        # Check if vectorization is enabled
        is_enabled, config = await _check_vectorization_enabled(session)
        if not is_enabled:
            logger.debug("Vectorization disabled, skipping batch generate")
            return {"processed": 0, "failed": 0, "skipped": "Vectorization disabled"}

        settings, rate_limit = await _load_embedding_settings(config)
        embedding_client = EmbeddingClient(config=settings, rate_limit=rate_limit)
        vector_client = PgVectorClient(session)

        try:
            await vector_client.ensure_collections(
                settings.dimension, settings.provider, settings.model
            )

            embedding_service = EmbeddingService(
                db_session=session,
                embedding_client=embedding_client,
                milvus_client=vector_client,
            )

            result = await embedding_service.batch_generate(limit=limit)

            if result.get("processed", 0) > 0:
                # Reset error count on successful batch
                await _reset_error_count(session)

            return result  # type: ignore[return-value]

        except Exception as e:
            logger.error(f"Failed to batch generate embeddings: {e}")
            await _handle_embedding_error(session, e)
            raise

        finally:
            await embedding_client.close()


async def retry_failed_embeddings(ctx: dict[str, Any], limit: int = 50) -> dict[str, int | str]:
    """
    Retry failed embeddings.

    Args:
        ctx: Worker context
        limit: Maximum number of entries to retry

    Returns:
        Result dictionary with processed and failed counts
    """
    async with get_session_context() as session:
        # Check if vectorization is enabled
        is_enabled, config = await _check_vectorization_enabled(session)
        if not is_enabled:
            logger.debug("Vectorization disabled, skipping retry")
            return {"processed": 0, "failed": 0, "skipped": "Vectorization disabled"}

        settings, rate_limit = await _load_embedding_settings(config)
        embedding_client = EmbeddingClient(config=settings, rate_limit=rate_limit)
        vector_client = PgVectorClient(session)

        try:
            await vector_client.ensure_collections(
                settings.dimension, settings.provider, settings.model
            )

            embedding_service = EmbeddingService(
                db_session=session,
                embedding_client=embedding_client,
                milvus_client=vector_client,
            )

            result = await embedding_service.retry_failed(limit=limit)

            if result.get("processed", 0) > 0:
                await _reset_error_count(session)

            return result  # type: ignore[return-value]

        except Exception as e:
            logger.error(f"Failed to retry failed embeddings: {e}")
            await _handle_embedding_error(session, e)
            raise

        finally:
            await embedding_client.close()


async def validate_and_rebuild_embeddings(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Validate embedding config and trigger rebuild if valid.

    This task is triggered when vectorization is enabled or config is changed.
    """
    redis = ctx.get("redis")

    async with get_session_context() as session:
        config_service = TypedConfigService(session)
        config = await config_service.get(EmbeddingConfig)

        if not config.enabled:
            return {"success": False, "error": "Vectorization is not enabled"}

        from glean_vector.services import EmbeddingValidationService

        validation_service = EmbeddingValidationService()

        # Validate provider
        provider_result = await validation_service.validate_provider(config)
        if not provider_result.success:
            await config_service.set_embedding_status(
                VectorizationStatus.ERROR.value,
                error=f"Provider validation failed: {provider_result.message}",
            )
            return {"success": False, "error": provider_result.message}

        # Validate pgvector
        pgvector_result = await validation_service.validate_pgvector(
            session, config.dimension, config.provider, config.model
        )
        if not pgvector_result.success:
            await config_service.set_embedding_status(
                VectorizationStatus.ERROR.value,
                error=f"pgvector validation failed: {pgvector_result.message}",
            )
            return {"success": False, "error": pgvector_result.message}

        # Check if rebuild is actually needed
        vector_client = PgVectorClient(session)
        is_compatible, reason = await vector_client.check_model_compatibility(
            config.dimension, config.provider, config.model
        )

        if is_compatible and await vector_client.collections_exist():
            logger.info(
                "pgvector tables already compatible with config, skipping rebuild. "
                f"model={config.provider}:{config.model}, dimension={config.dimension}"
            )
            await config_service.update(EmbeddingConfig, status=VectorizationStatus.IDLE)
            return {
                "success": True,
                "message": "Tables already compatible, no rebuild needed",
                "skipped_rebuild": True,
            }

        logger.info(
            f"Rebuild required: {reason or 'no model signature found'}. Triggering rebuild..."
        )

        if redis:
            await redis.enqueue_job("rebuild_embeddings")

        return {"success": True, "message": "Validation passed, rebuild queued"}


async def download_embedding_model(
    ctx: dict[str, Any], model: str, dimension: int
) -> dict[str, Any]:
    """
    Download and warm up a sentence-transformers model.

    Reports download status to Redis so the admin frontend can poll for progress.
    Status values: downloading → done | error
    """
    redis = ctx.get("redis")
    redis_key = f"{MODEL_DOWNLOAD_KEY_PREFIX}{model}"

    async def _set_status(status: str, error: str | None = None) -> None:
        if redis:
            data: dict[str, str] = {"status": status}
            if error:
                data["error"] = error
            await redis.set(redis_key, json.dumps(data), ex=MODEL_DOWNLOAD_TTL)

    await _set_status("downloading")
    logger.info(f"Starting sentence-transformers model download: {model}")

    try:
        from glean_vector.clients.providers.sentence_transformer_provider import (
            SentenceTransformerProvider,
        )

        provider = SentenceTransformerProvider(model=model, dimension=dimension)

        # get_model() is blocking (downloads + loads into memory), run in thread pool
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, provider.get_model)

        actual_dimension = provider.dimension
        logger.info(
            f"Model downloaded and cached: {model}, dimension={actual_dimension}"
        )
        await _set_status("done")
        return {"success": True, "model": model, "dimension": actual_dimension}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to download model {model}: {error_msg}", exc_info=True)
        await _set_status("error", error=error_msg)
        return {"success": False, "model": model, "error": error_msg}
