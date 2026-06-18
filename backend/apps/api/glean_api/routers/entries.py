"""
Entries router.

Provides endpoints for reading and managing feed entries.
"""

import asyncio
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from glean_core import get_logger
from glean_core.schemas import (
    EntryListResponse,
    EntryResponse,
    EntrySearchResponse,
    ParagraphTranslationsResponse,
    TranslateEntryRequest,
    TranslateTextsRequest,
    TranslateTextsResponse,
    TranslationResponse,
    UpdateEntryStateRequest,
    UserResponse,
)
from glean_core.server_time import get_server_date, get_server_day_range
from glean_core.services import EntryService, TranslationService
from glean_core.services.translation_providers import create_translation_provider

from ..dependencies import (
    get_current_user,
    get_entry_service,
    get_translation_service,
)

logger = get_logger(__name__)

router = APIRouter()


@router.get("")
async def list_entries(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    feed_id: str | None = None,
    folder_id: str | None = None,
    is_read: bool | None = None,
    read_later: bool | None = None,
    collected_after: datetime | None = Query(None),
    collected_before: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    view: str = Query("timeline", regex="^(timeline|today-board)$"),
) -> EntryListResponse:
    """
    Get entries with filtering and pagination.

    Args:
        current_user: Current authenticated user.
        entry_service: Entry service.
        feed_id: Optional filter by feed ID.
        folder_id: Optional filter by folder ID (gets entries from all feeds in folder).
        is_read: Optional filter by read status.
        read_later: Optional filter by read later status.
        collected_after: Optional inclusive lower bound for collection time filtering.
        collected_before: Optional exclusive upper bound for collection time filtering.
        page: Page number (1-indexed).
        per_page: Items per page (max 100).
        view: View mode ("timeline" or "today-board").

    Returns:
        Paginated list of entries.
    """
    return await entry_service.get_entries(
        user_id=current_user.id,
        feed_id=feed_id,
        folder_id=folder_id,
        is_read=is_read,
        read_later=read_later,
        collected_after=collected_after,
        collected_before=collected_before,
        page=page,
        per_page=per_page,
        view=view,
    )


@router.get("/today")
async def list_today_entries(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    feed_id: str | None = None,
    folder_id: str | None = None,
    date_: date | None = Query(default=None, alias="date"),
    limit: int = Query(500, ge=1, le=500),
) -> EntryListResponse:
    """
    Get entries collected during a server-local day.

    This endpoint returns a bounded aggregate for 今日收录 / Today's Intake
    instead of timeline pages. The date window is derived from the server
    configured timezone so browser-local timezone settings cannot shift the
    data boundary.
    """
    try:
        collected_after, collected_before, _timezone = get_server_day_range(
            date_ or get_server_date()
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return await entry_service.get_entries(
        user_id=current_user.id,
        feed_id=feed_id,
        folder_id=folder_id,
        collected_after=collected_after,
        collected_before=collected_before,
        page=1,
        per_page=limit,
        view="today-board",
    )

@router.get("/search", response_model=EntrySearchResponse)
async def search_entries(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    q: Annotated[str, Query(min_length=2, max_length=200)],
    scope: Literal["all", "date", "week"] = Query("all"),
    date_param: str | None = Query(None, alias="date", description="YYYY-MM-DD, required when scope=date"),
    limit: int = Query(30, ge=1, le=100),
) -> EntrySearchResponse:
    """
    Search entries by keyword across title and summary.

    Args:
        q: Search query string (min 2, max 200 chars).
        scope: Time scope — 'all', 'date' (requires date param), or 'week'.
        date_param: ISO date string (YYYY-MM-DD), required when scope='date'.
        limit: Maximum number of results to return (max 100).
        current_user: Current authenticated user.
        entry_service: Entry service.

    Returns:
        Search results with timing information.
    """
    items, total, took_ms = await entry_service.search_entries(
        user_id=UUID(current_user.id),
        query=q,
        scope=scope,
        date=date_param,
        limit=limit,
    )
    return EntrySearchResponse(
        items=items,
        total=total,
        query=q,
        scope=scope,
        took_ms=took_ms,
    )


@router.get("/{entry_id}")
async def get_entry(
    entry_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
) -> EntryResponse:
    """
    Get a specific entry.

    Args:
        entry_id: Entry identifier.
        current_user: Current authenticated user.
        entry_service: Entry service.

    Returns:
        Entry details.

    Raises:
        HTTPException: If entry not found or user not subscribed to feed.
    """
    try:
        return await entry_service.get_entry(entry_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.patch("/{entry_id}")
async def update_entry_state(
    entry_id: str,
    data: UpdateEntryStateRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
) -> EntryResponse:
    """
    Update entry state (read and read later).

    Args:
        entry_id: Entry identifier.
        data: State update data.
        current_user: Current authenticated user.
        entry_service: Entry service.

    Returns:
        Updated entry.

    Raises:
        HTTPException: If entry not found.
    """
    try:
        return await entry_service.update_entry_state(entry_id, current_user.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


class MarkAllReadRequest(BaseModel):
    """Mark all read request body."""

    feed_id: str | None = None
    folder_id: str | None = None


@router.post("/mark-all-read")
async def mark_all_read(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    data: MarkAllReadRequest,
) -> dict[str, str]:
    """
    Mark all entries as read.

    Args:
        current_user: Current authenticated user.
        entry_service: Entry service.
        data: Request body with optional feed_id and folder_id filters.

    Returns:
        Success message.
    """
    await entry_service.mark_all_read(current_user.id, data.feed_id, data.folder_id)
    return {"message": "All entries marked as read"}


# Viewport-based sync translation


@router.post("/translate-texts")
async def translate_texts(
    data: TranslateTextsRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    translation_service: Annotated[TranslationService, Depends(get_translation_service)],
) -> TranslateTextsResponse:
    """
    Synchronously translate an array of text strings.

    Used for viewport-based sentence-level translation.
    Returns translations immediately and optionally persists them
    when entry_id is provided.

    Args:
        data: List of texts, target language, and optional entry_id.
        current_user: Current authenticated user.
        translation_service: Translation service for persistence.

    Returns:
        List of translated strings in the same order.
    """
    if not data.texts:
        return TranslateTextsResponse(translations=[], target_language=data.target_language)

    # Filter out empty strings, preserving index mapping
    non_empty_indices = [i for i, t in enumerate(data.texts) if t.strip()]
    non_empty_texts = [data.texts[i] for i in non_empty_indices]

    if not non_empty_texts:
        return TranslateTextsResponse(
            translations=[""] * len(data.texts),
            target_language=data.target_language,
        )

    # Check DB cache for already-translated sentences when entry_id is provided
    cached_map: dict[str, str] = {}
    if data.entry_id:
        try:
            cached_map = (
                await translation_service.get_paragraph_translations(
                    data.entry_id, data.target_language
                )
                or {}
            )
        except Exception:
            logger.exception(
                "Failed to load cached paragraph translations",
                extra={"entry_id": data.entry_id},
            )

    # Split into cached hits and texts that need translation
    to_translate: list[str] = []
    to_translate_indices: list[int] = []
    cached_results: dict[int, str] = {}

    for i, text in enumerate(non_empty_texts):
        if text in cached_map:
            cached_results[i] = cached_map[text]
        else:
            to_translate.append(text)
            to_translate_indices.append(i)

    # Translate uncached sentences using user's configured provider
    translated_new: list[str] = []
    if to_translate:
        provider_name = "google"
        if current_user.settings:
            if isinstance(current_user.settings, dict):
                configured_provider = current_user.settings.get("translation_provider")
            else:
                configured_provider = getattr(current_user.settings, "translation_provider", None)

            if isinstance(configured_provider, str) and configured_provider.strip():
                provider_name = configured_provider.strip()
        provider = create_translation_provider(current_user.settings)
        try:
            translated_new = await asyncio.to_thread(
                provider.translate_batch, to_translate, data.source_language, data.target_language
            )
        except Exception as exc:
            error_message = str(exc).strip() or exc.__class__.__name__
            logger.exception(
                "Translation provider failed in translate-texts",
                extra={
                    "target_language": data.target_language,
                    "source_language": data.source_language,
                    "entry_id": data.entry_id,
                    "user_id": current_user.id,
                    "provider": provider_name,
                    "count": len(to_translate),
                    "error": error_message,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Translation provider failed "
                    f"(provider={provider_name}, target={data.target_language}): {error_message}"
                ),
            ) from exc

    # Merge cached + newly translated results
    merged: list[str] = [""] * len(non_empty_texts)
    for i, result in cached_results.items():
        merged[i] = result
    for j, idx in enumerate(to_translate_indices):
        merged[idx] = translated_new[j]

    # Reconstruct full list with empty strings for originally-empty inputs
    all_results = [""] * len(data.texts)
    for i, idx in enumerate(non_empty_indices):
        all_results[idx] = merged[i]

    # Persist new translations when entry_id is provided
    if data.entry_id and translated_new:
        pairs = {
            text: trans
            for text, trans in zip(to_translate, translated_new, strict=True)
            if trans.strip()
        }
        if pairs:
            try:
                await translation_service.save_paragraph_translations(
                    data.entry_id, data.target_language, pairs
                )
            except Exception:
                logger.exception(
                    "Failed to persist paragraph translations",
                    extra={"entry_id": data.entry_id},
                )

    return TranslateTextsResponse(
        translations=all_results,
        target_language=data.target_language,
    )


@router.get("/{entry_id}/paragraph-translations")
async def get_paragraph_translations(
    entry_id: str,
    target_language: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    translation_service: Annotated[TranslationService, Depends(get_translation_service)],
) -> ParagraphTranslationsResponse:
    """
    Get cached paragraph-level translations for an entry.

    Args:
        entry_id: Entry identifier.
        target_language: Target language code (e.g. "zh-CN", "en").
        current_user: Current authenticated user.
        translation_service: Translation service.

    Returns:
        Cached sentence translations or empty dict.
    """
    result = await translation_service.get_paragraph_translations(entry_id, target_language)
    return ParagraphTranslationsResponse(translations=result or {})

# Translation endpoints


@router.post("/{entry_id}/translate")
async def translate_entry(
    entry_id: str,
    data: TranslateEntryRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    translation_service: Annotated[TranslationService, Depends(get_translation_service)],
) -> TranslationResponse:
    """
    Request translation of an entry.

    If target_language is not provided, auto-detects:
    Chinese content → translates to English, otherwise → translates to Chinese.

    Returns cached translation if available, or queues a new translation task.

    Args:
        entry_id: Entry identifier.
        data: Translation request with optional target_language.
        current_user: Current authenticated user.
        translation_service: Translation service.

    Returns:
        Translation status and content.

    Raises:
        HTTPException: If entry not found.
    """
    try:
        return await translation_service.request_translation(
            entry_id, current_user.id, data.target_language
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.get("/{entry_id}/translation/{target_language}")
async def get_translation(
    entry_id: str,
    target_language: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    translation_service: Annotated[TranslationService, Depends(get_translation_service)],
) -> TranslationResponse:
    """
    Get translation of an entry for a specific language.

    Args:
        entry_id: Entry identifier.
        target_language: Target language code (e.g. "zh-CN", "en").
        current_user: Current authenticated user.
        translation_service: Translation service.

    Returns:
        Translation content and status.

    Raises:
        HTTPException: If translation not found.
    """
    result = await translation_service.get_translation(entry_id, target_language)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Translation not found")
    return result
