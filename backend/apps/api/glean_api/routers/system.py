"""
System router.

Provides public endpoints for system information and status.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas.config import (
    AIIntegrationConfig,
    AIIntegrationStatusResponse,
    EmbeddingConfig,
    EmbeddingRebuildProgress,
    SystemTimeResponse,
    VectorizationStatus,
    VectorizationStatusResponse,
)
from glean_core.server_time import get_server_now, get_server_timezone_name
from glean_core.services import TypedConfigService
from glean_database.models import Entry
from glean_database.session import get_session

router = APIRouter()


async def get_config_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TypedConfigService:
    """Get typed config service instance."""
    return TypedConfigService(session)


@router.get("/vectorization-status", response_model=VectorizationStatusResponse)
async def get_vectorization_status(
    config_service: Annotated[TypedConfigService, Depends(get_config_service)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VectorizationStatusResponse:
    """
    Get vectorization system status.

    This is a public endpoint (requires authentication) for the frontend
    to determine if vectorization features are available.

    If status is REBUILDING and all entries are processed, automatically
    updates status to IDLE.

    Returns:
        Vectorization status including enabled state and any errors.
    """
    config = await config_service.get(EmbeddingConfig)

    # Build progress info if rebuilding
    progress = None
    current_status = config.status

    if config.status == VectorizationStatus.REBUILDING:
        # Get entry counts to check progress
        total_result = await session.execute(select(func.count()).select_from(Entry))
        total = total_result.scalar_one()

        done_result = await session.execute(
            select(func.count()).select_from(Entry).where(Entry.embedding_status == "done")
        )
        done = done_result.scalar_one()

        failed_result = await session.execute(
            select(func.count()).select_from(Entry).where(Entry.embedding_status == "failed")
        )
        failed = failed_result.scalar_one()

        pending_result = await session.execute(
            select(func.count()).select_from(Entry).where(Entry.embedding_status == "pending")
        )
        pending = pending_result.scalar_one()

        processing_result = await session.execute(
            select(func.count()).select_from(Entry).where(Entry.embedding_status == "processing")
        )
        processing = processing_result.scalar_one()

        progress = EmbeddingRebuildProgress(
            total=total,
            pending=pending,
            processing=processing,
            done=done,
            failed=failed,
        )

        # Auto-complete rebuild if all entries are processed
        if total > 0 and (done + failed) >= total:
            await config_service.complete_rebuild()
            current_status = VectorizationStatus.IDLE

    return VectorizationStatusResponse(
        enabled=config.enabled,
        status=current_status,
        has_error=current_status == VectorizationStatus.ERROR,
        error_message=config.last_error if current_status == VectorizationStatus.ERROR else None,
        rebuild_progress=progress,
    )


@router.get("/ai-integration", response_model=AIIntegrationStatusResponse)
async def get_ai_integration_status(
    config_service: Annotated[TypedConfigService, Depends(get_config_service)],
) -> AIIntegrationStatusResponse:
    """Get non-sensitive local AI integration status for the web UI.

    Exposes enough metadata for the frontend to:
    - skip rendering AI views entirely (`enabled=False`)
    - build correct TanStack Query cache keys (`model`, `prompt_version`,
      `target_language`)
    - decide whether to render the daily synthesis panel (`synthesis_enabled`).

    The model / prompt / language tuple comes from the running settings, not
    from the database — changing env vars requires a service restart.
    """
    from glean_api.config import settings as api_settings
    from glean_core.services.llm.prompts import DAILY_SUMMARY_PROMPT_VERSION

    config = await config_service.get(AIIntegrationConfig)
    has_key = bool(api_settings.llm_api_key)
    enabled = config.enabled and has_key
    return AIIntegrationStatusResponse(
        enabled=enabled,
        model=api_settings.llm_model if enabled else None,
        prompt_version=DAILY_SUMMARY_PROMPT_VERSION if enabled else None,
        target_language=(api_settings.llm_target_language or "en") if enabled else None,
        synthesis_enabled=(
            enabled
            and config.allow_today_synthesis
            and api_settings.llm_synthesis_enabled
        ),
    )


@router.get("/time", response_model=SystemTimeResponse)
async def get_system_time() -> SystemTimeResponse:
    """Get server-configured time metadata for browser clients."""
    current_time = get_server_now()
    return SystemTimeResponse(
        timezone=get_server_timezone_name(),
        current_time=current_time,
        current_date=current_time.date(),
    )


@router.get("/health")
async def health_check() -> dict[str, str]:
    """
    Basic health check endpoint.

    Returns:
        Health status.
    """
    return {"status": "healthy"}
