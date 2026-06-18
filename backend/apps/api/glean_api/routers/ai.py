"""Local AI integration auth helpers.

The `/api/ai/*` namespace previously hosted external-writeback endpoints
(today-entries / entry-detail / today-summary / supplement upserts). Those
have been removed in favor of the internal-trigger flow at `/api/today/ai/*`.

This file now only exposes auth/config dependencies that the new flow reuses.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from glean_core.schemas import UserResponse
from glean_core.schemas.config import AIIntegrationConfig
from glean_core.services import TypedConfigService

from ..dependencies import (
    get_current_user_or_api_token_user,
    get_typed_config_service,
)

# Empty router kept so existing main.py registration / ordering doesn't change.
router = APIRouter()


async def get_enabled_ai_config(
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> AIIntegrationConfig:
    """Load AI config and reject disabled integration."""
    config = await config_service.get(AIIntegrationConfig)
    if not config.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local AI integration is disabled",
        )
    return config


def ensure_user_ai_enabled(current_user: UserResponse) -> UserResponse:
    """Reject local AI access until the current user enables it."""
    if not (current_user.settings and current_user.settings.ai_integration_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local AI integration is disabled for this user",
        )
    return current_user


async def get_ai_enabled_user_or_api_token_user(
    current_user: Annotated[UserResponse, Depends(get_current_user_or_api_token_user)],
) -> UserResponse:
    """Load a browser or API-token user and require their personal AI setting."""
    return ensure_user_ai_enabled(current_user)
