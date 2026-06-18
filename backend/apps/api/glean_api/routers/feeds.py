"""
Feeds and subscriptions router.

Provides endpoints for feed discovery, subscription management, and OPML import/export.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, Header, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_core.schemas import (
    BatchDeleteSubscriptionsRequest,
    BatchDeleteSubscriptionsResponse,
    DiscoverFeedRequest,
    FolderCreate,
    FolderTreeNode,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionSyncResponse,
    UpdateSubscriptionRequest,
    UserResponse,
)
from glean_core.services import FeedService, FolderService, RSSHubService
from glean_core.services.feed_service import UNSET
from glean_database.models import Feed, FeedFetchRun, Subscription
from glean_database.session import get_session
from glean_rss import (
    SOURCE_TYPE_SYNTHETIC_JSONLD,
    SOURCE_TYPE_SYNTHETIC_SITEMAP,
    FeedNotFoundError,
    discover_feed,
    fetch_feed,
    generate_opml,
    parse_feed,
    parse_opml_with_folders,
)

from ..dependencies import (
    get_current_user,
    get_feed_service,
    get_folder_service,
    get_redis_pool,
)
from ..feed_fetch_progress import (
    load_active_feed_fetch_runs,
    load_latest_feed_fetch_runs,
    reconcile_active_feed_fetch_runs,
    serialize_feed_fetch_run,
)
from ..feed_refresh import build_refresh_status_items, enqueue_feed_refresh_job

router = APIRouter()
logger = logging.getLogger(__name__)


async def _validate_feed_url(feed_url: str) -> tuple[bool, str | None]:
    """Check that a feed URL can be fetched and parsed."""
    try:
        result = await fetch_feed(feed_url)
        if result is None:
            return True, None
        content, _headers = result
        await parse_feed(content, feed_url)
        return True, None
    except Exception as e:
        return False, str(e)


class RefreshJobItem(BaseModel):
    """Single queued refresh job payload."""

    feed_id: str
    job_id: str = Field(min_length=1)


class RefreshStatusRequest(BaseModel):
    """Refresh status query payload."""

    items: list[RefreshJobItem]


class FeedFetchRunBatchRequest(BaseModel):
    """Batch latest-run query payload."""

    feed_ids: list[str] = Field(default_factory=list)


@router.get("")
async def list_subscriptions(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    folder_id: str | None = None,
    page: int = 1,
    per_page: int = 20,
    search: str | None = None,
) -> SubscriptionListResponse:
    """
    Get paginated user subscriptions.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.
        folder_id: Optional folder filter. Use empty string for ungrouped feeds.
        page: Page number (1-indexed, default 1).
        per_page: Items per page (default 20, max 100).
        search: Optional search query to filter by title or URL.

    Returns:
        Paginated list of user subscriptions.
    """
    # Clamp per_page to reasonable limits
    per_page = max(1, min(per_page, 100))
    page = max(1, page)

    return await feed_service.get_user_subscriptions_paginated(
        current_user.id, page, per_page, folder_id, search
    )


@router.get("/sync/all")
async def sync_all_subscriptions(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    response: Response,
    if_none_match: Annotated[str | None, Header()] = None,
) -> SubscriptionSyncResponse | None:
    """
    Get all subscriptions with ETag support for efficient syncing.

    This endpoint returns all subscriptions for the current user along with
    an ETag. Clients can cache the response and send the ETag in the
    If-None-Match header on subsequent requests. If the data hasn't changed,
    a 304 Not Modified response is returned.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.
        response: FastAPI response object for setting headers.
        if_none_match: Optional ETag from client cache.

    Returns:
        All subscriptions with ETag, or 304 if unchanged.
    """
    sync_response = await feed_service.get_user_subscriptions_sync(current_user.id)

    # Set ETag header
    response.headers["ETag"] = f'"{sync_response.etag}"'

    # Check if client has cached data
    if if_none_match:
        # Strip quotes from If-None-Match header if present
        client_etag = if_none_match.strip('"')
        if client_etag == sync_response.etag:
            response.status_code = status.HTTP_304_NOT_MODIFIED
            return None

    return sync_response


@router.get("/{subscription_id:uuid}")
async def get_subscription(
    subscription_id: UUID,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> SubscriptionResponse:
    """
    Get a specific subscription.

    Args:
        subscription_id: Subscription identifier.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Subscription details.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        return await feed_service.get_subscription(str(subscription_id), current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.post("/discover", status_code=status.HTTP_201_CREATED)
async def discover_feed_url(
    data: DiscoverFeedRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SubscriptionResponse:
    """
    Discover and subscribe to a feed from URL.

    This endpoint performs feed discovery (tries to fetch and parse the URL).
    For direct subscription without discovery, the feed service will create
    a basic feed if discovery fails.

    Args:
        data: Feed discovery request with URL and optional folder_id.
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Returns:
        Created subscription.

    Raises:
        HTTPException: If feed discovery fails or already subscribed.
    """
    source_url = str(data.url) if data.url else None
    feed_url = source_url
    feed_title = None
    source_error: str | None = None
    rsshub_path = (data.rsshub_path or "").strip() or None
    source_type = "rsshub" if rsshub_path else "feed"

    if rsshub_path:
        # Manual RSSHub path mode: skip automatic source fallback logic.
        feed_title = None
    else:
        if not source_url:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="url is required when rsshub_path is not provided",
            )

        feed_not_found_error: str | None = None
        discovered_source_type: str | None = None
        try:
            feed_url, feed_title, discovered_source_type = await discover_feed(source_url)
        except FeedNotFoundError as exc:
            feed_not_found_error = str(exc)
        except ValueError:
            pass

        if feed_not_found_error is not None:
            is_source_valid, source_error = False, feed_not_found_error
        elif discovered_source_type in (
            SOURCE_TYPE_SYNTHETIC_JSONLD,
            SOURCE_TYPE_SYNTHETIC_SITEMAP,
        ):
            # Synthetic feeds don't parse as RSS at the source URL; the synthesizer
            # owns validation (it already produced entries). Accept directly.
            is_source_valid, source_error = True, None
            source_type = discovered_source_type
        else:
            is_source_valid, source_error = await _validate_feed_url(feed_url or source_url)

        if not is_source_valid:
            rsshub_service = RSSHubService(feed_service.session)
            converted_feed_urls = await rsshub_service.convert_for_subscribe(source_url)
            if converted_feed_urls:
                rsshub_errors: list[str] = []
                selected_rsshub_url: str | None = None
                for converted_feed_url in converted_feed_urls:
                    is_rsshub_valid, rsshub_error = await _validate_feed_url(converted_feed_url)
                    if is_rsshub_valid:
                        selected_rsshub_url = converted_feed_url
                        break
                    if rsshub_error:
                        rsshub_errors.append(f"{converted_feed_url}: {rsshub_error}")

                if selected_rsshub_url:
                    logger.info(
                        "Using RSSHub fallback for subscription",
                        extra={"source_url": source_url, "rsshub_url": selected_rsshub_url},
                    )
                    feed_url = selected_rsshub_url
                    source_type = "rsshub"
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Subscription failed. Source feed and RSSHub fallback both failed: "
                            f"source={source_error}; rsshub={'; '.join(rsshub_errors)}"
                        ),
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subscription failed. Source feed unavailable: {source_error}",
                )

    try:
        # Create subscription (will create feed if needed)
        subscription = await feed_service.create_subscription(
            current_user.id,
            feed_url,
            feed_title,
            data.folder_id,
            rsshub_path,
            source_type,
        )

        await enqueue_feed_refresh_job(
            session=session,
            redis=redis,
            feed_id=subscription.feed.id,
            feed_title=subscription.custom_title
            or subscription.feed.title
            or subscription.feed.url,
            trigger_type="subscription_bootstrap",
            subscription_id=subscription.id,
        )

        return subscription
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None


@router.patch("/{subscription_id:uuid}")
async def update_subscription(
    subscription_id: UUID,
    data: UpdateSubscriptionRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> SubscriptionResponse:
    """
    Update subscription settings.

    Args:
        subscription_id: Subscription identifier.
        data: Update data (custom_title, folder_id, feed_url).
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Updated subscription.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        # Determine if folder_id was explicitly provided
        # - "__unset__" means not provided, keep unchanged
        # - None means explicitly set to null (remove from folder)
        # - string means move to that folder
        should_update_folder = data.folder_id != "__unset__"

        return await feed_service.update_subscription(
            str(subscription_id),
            current_user.id,
            data.custom_title,
            data.folder_id if should_update_folder else UNSET,
            str(data.feed_url) if data.feed_url else None,
            data.rsshub_path,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.delete("/{subscription_id:uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    subscription_id: UUID,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> None:
    """
    Delete a subscription and clean up related data.

    This endpoint:
    1. Deletes the user's reading state for entries in this feed
    2. Removes the subscription
    3. If no other users subscribe, deletes the feed and its entries
    4. Queues cleanup of vector embeddings if feed was deleted

    Args:
        subscription_id: Subscription identifier.
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        orphaned_feed_id, entry_ids = await feed_service.delete_subscription(
            str(subscription_id), current_user.id
        )

        # Queue Milvus embedding cleanup if feed was orphaned
        if orphaned_feed_id and entry_ids:
            try:
                await redis.enqueue_job("cleanup_orphan_embeddings", orphaned_feed_id, entry_ids)
            except Exception:
                logger.exception(
                    "Failed to enqueue orphan embedding cleanup after subscription delete",
                    extra={"user_id": current_user.id, "feed_id": orphaned_feed_id},
                )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.post("/batch-delete")
async def batch_delete_subscriptions(
    data: BatchDeleteSubscriptionsRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> BatchDeleteSubscriptionsResponse:
    """
    Delete multiple subscriptions at once with cleanup.

    This endpoint performs the same cleanup as single delete for each subscription.

    Args:
        data: Batch delete request with subscription IDs.
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Returns:
        Result with deleted and failed counts.
    """
    deleted_count, failed_count, orphaned_feeds = await feed_service.batch_delete_subscriptions(
        data.subscription_ids, current_user.id
    )

    # Queue Milvus embedding cleanup for each orphaned feed
    for feed_id, entry_ids in orphaned_feeds.items():
        if entry_ids:
            try:
                await redis.enqueue_job("cleanup_orphan_embeddings", feed_id, entry_ids)
            except Exception:
                logger.exception(
                    "Failed to enqueue orphan embedding cleanup after batch delete",
                    extra={"user_id": current_user.id, "feed_id": feed_id},
                )

    return BatchDeleteSubscriptionsResponse(deleted_count=deleted_count, failed_count=failed_count)


@router.post("/{subscription_id:uuid}/refresh", status_code=status.HTTP_202_ACCEPTED)
async def refresh_feed(
    subscription_id: UUID,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str | int]:
    """
    Manually trigger a feed refresh.

    Args:
        subscription_id: Subscription identifier.
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Returns:
        Job status message.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        subscription = await feed_service.get_subscription(str(subscription_id), current_user.id)
        job_payload = await enqueue_feed_refresh_job(
            session=session,
            redis=redis,
            feed_id=subscription.feed.id,
            feed_title=subscription.custom_title
            or subscription.feed.title
            or subscription.feed.url,
            trigger_type="manual_user",
            backfill_existing_entries=True,
        )
        feed = await session.get(Feed, subscription.feed.id)
        if feed:
            feed.last_fetch_attempt_at = datetime.now(UTC)
            await session.commit()
        return {"status": "queued", **job_payload}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.post("/refresh-all", status_code=status.HTTP_202_ACCEPTED)
async def refresh_all_feeds(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int | str | list[dict[str, str]]]:
    """
    Manually trigger a refresh for all user's subscribed feeds.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Returns:
        Job status with count of queued feeds.
    """
    subscriptions = await feed_service.get_user_subscriptions(current_user.id)
    queued_count = 0
    jobs: list[dict[str, str]] = []
    queued_feed_ids: set[str] = set()

    for index, subscription in enumerate(subscriptions):
        jobs.append(
            await enqueue_feed_refresh_job(
                session=session,
                redis=redis,
                feed_id=subscription.feed.id,
                feed_title=subscription.custom_title
                or subscription.feed.title
                or subscription.feed.url,
                trigger_type="manual_user",
                subscription_id=subscription.id,
                backfill_existing_entries=True,
                queue_depth_ahead=index,
            )
        )
        queued_count += 1
        queued_feed_ids.add(subscription.feed.id)

    if queued_feed_ids:
        attempt_at = datetime.now(UTC)
        result = await session.execute(select(Feed).where(Feed.id.in_(queued_feed_ids)))
        for feed in result.scalars().all():
            feed.last_fetch_attempt_at = attempt_at
        await session.commit()

    return {"status": "queued", "queued_count": queued_count, "jobs": jobs}


@router.post("/refresh-status")
async def get_refresh_status(
    data: RefreshStatusRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, list[dict[str, str | int | None]]]:
    """
    Query refresh job statuses for feeds.

    Args:
        data: Job/feed pairs returned by refresh endpoints.
        current_user: Current authenticated user.
        feed_service: Feed service.
        redis: Redis connection pool for task queue.

    Returns:
        Per-feed refresh status list.
    """
    if not data.items:
        return {"items": []}

    # Ensure requested feed IDs belong to current user subscriptions.
    subscriptions = await feed_service.get_user_subscriptions(current_user.id)
    allowed_feed_ids = {sub.feed.id for sub in subscriptions}

    request_items = [item for item in data.items if item.feed_id in allowed_feed_ids]
    if not request_items:
        return {"items": []}

    feed_ids = {item.feed_id for item in request_items}
    stmt = select(Feed).where(Feed.id.in_(feed_ids))
    result = await feed_service.session.execute(stmt)
    feeds = {feed.id: feed for feed in result.scalars().all()}

    status_items = await build_refresh_status_items(
        redis=redis,
        request_items=[(item.feed_id, item.job_id) for item in request_items],
        feed_map=feeds,
    )

    return {"items": status_items}


@router.get("/{feed_id}/fetch-runs/latest")
async def get_latest_feed_fetch_run(
    feed_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object | None]:
    """Return the latest persisted fetch run for one user-owned feed."""
    ownership_result = await session.execute(
        select(Subscription.id).where(
            Subscription.user_id == current_user.id,
            Subscription.feed_id == feed_id,
        )
    )
    if ownership_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    feed = await session.get(Feed, feed_id)
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    result = await session.execute(
        select(FeedFetchRun)
        .options(selectinload(FeedFetchRun.stage_events))
        .where(FeedFetchRun.feed_id == feed_id)
        .order_by(FeedFetchRun.created_at.desc())
        .limit(1)
    )
    latest_run = result.scalar_one_or_none()
    if latest_run is None:
        return {
            "feed_id": feed_id,
            "next_fetch_at": feed.next_fetch_at.isoformat() if feed.next_fetch_at else None,
            "last_fetch_attempt_at": feed.last_fetch_attempt_at.isoformat()
            if feed.last_fetch_attempt_at
            else None,
            "last_fetch_success_at": feed.last_fetch_success_at.isoformat()
            if feed.last_fetch_success_at
            else None,
            "last_fetched_at": feed.last_fetched_at.isoformat() if feed.last_fetched_at else None,
            "stages": [],
        }
    return serialize_feed_fetch_run(
        latest_run,
        next_fetch_at=feed.next_fetch_at,
        last_fetch_attempt_at=feed.last_fetch_attempt_at,
        last_fetch_success_at=feed.last_fetch_success_at,
        last_fetched_at=feed.last_fetched_at,
    )


@router.post("/fetch-runs/latest")
async def get_latest_feed_fetch_runs(
    request: FeedFetchRunBatchRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, list[dict[str, object | None]]]:
    """Return latest persisted fetch run snapshots for many user-owned feeds."""
    if not request.feed_ids:
        return {"items": []}

    requested_feed_ids = list(dict.fromkeys(request.feed_ids))
    ownership_result = await session.execute(
        select(Subscription.feed_id).where(
            Subscription.user_id == current_user.id,
            Subscription.feed_id.in_(requested_feed_ids),
        )
    )
    allowed_feed_ids = list(ownership_result.scalars().all())
    if not allowed_feed_ids:
        return {"items": []}

    feeds_result = await session.execute(select(Feed).where(Feed.id.in_(allowed_feed_ids)))
    feeds = {feed.id: feed for feed in feeds_result.scalars().all()}
    latest_by_feed = await load_latest_feed_fetch_runs(session, allowed_feed_ids)

    items: list[dict[str, object | None]] = []
    for feed_id in requested_feed_ids:
        feed = feeds.get(feed_id)
        if feed is None:
            continue
        latest_run = latest_by_feed.get(feed_id)
        if latest_run is None:
            items.append(
                {
                    "feed_id": feed_id,
                    "next_fetch_at": feed.next_fetch_at.isoformat() if feed.next_fetch_at else None,
                    "last_fetch_attempt_at": feed.last_fetch_attempt_at.isoformat()
                    if feed.last_fetch_attempt_at
                    else None,
                    "last_fetch_success_at": feed.last_fetch_success_at.isoformat()
                    if feed.last_fetch_success_at
                    else None,
                    "last_fetched_at": feed.last_fetched_at.isoformat()
                    if feed.last_fetched_at
                    else None,
                    "stages": [],
                }
            )
            continue
        items.append(
            serialize_feed_fetch_run(
                latest_run,
                next_fetch_at=feed.next_fetch_at,
                last_fetch_attempt_at=feed.last_fetch_attempt_at,
                last_fetch_success_at=feed.last_fetch_success_at,
                last_fetched_at=feed.last_fetched_at,
                include_stages=False,
            )
        )

    return {"items": items}


@router.get("/fetch-runs/active")
async def get_active_feed_fetch_runs(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, list[dict[str, object | None]]]:
    """Return queued/running fetch runs visible to the current user."""
    ownership_result = await session.execute(
        select(Subscription.feed_id).where(Subscription.user_id == current_user.id)
    )
    feed_ids = ownership_result.scalars().all()
    await reconcile_active_feed_fetch_runs(session, redis, feed_ids=list(feed_ids))
    active_runs = await load_active_feed_fetch_runs(session, feed_ids=list(feed_ids))

    items: list[dict[str, object | None]] = []
    for run, feed in active_runs:
        item = serialize_feed_fetch_run(
            run,
            next_fetch_at=feed.next_fetch_at,
            last_fetch_attempt_at=feed.last_fetch_attempt_at,
            last_fetch_success_at=feed.last_fetch_success_at,
            last_fetched_at=feed.last_fetched_at,
        )
        item["feed_title"] = feed.title
        item["feed_url"] = feed.url
        items.append(item)
    return {"items": items}


@router.get("/{feed_id}/fetch-runs/history")
async def get_feed_fetch_run_history(
    feed_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object]:
    """Return recent persisted fetch run history for one user-owned feed."""
    ownership_result = await session.execute(
        select(Subscription.id).where(
            Subscription.user_id == current_user.id,
            Subscription.feed_id == feed_id,
        )
    )
    if ownership_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    feed = await session.get(Feed, feed_id)
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    result = await session.execute(
        select(FeedFetchRun)
        .options(selectinload(FeedFetchRun.stage_events))
        .where(FeedFetchRun.feed_id == feed_id)
        .order_by(FeedFetchRun.created_at.desc())
        .limit(10)
    )
    runs = result.scalars().all()
    return {
        "feed_id": feed_id,
        "next_fetch_at": feed.next_fetch_at.isoformat() if feed.next_fetch_at else None,
        "items": [
            serialize_feed_fetch_run(
                run,
                next_fetch_at=feed.next_fetch_at,
                last_fetch_attempt_at=feed.last_fetch_attempt_at,
                last_fetch_success_at=feed.last_fetch_success_at,
                last_fetched_at=feed.last_fetched_at,
            )
            for run in runs
        ],
    }


@router.post("/import")
async def import_opml(
    file: UploadFile,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    folder_service: Annotated[FolderService, Depends(get_folder_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int]:
    """
    Import subscriptions from OPML file with folder structure.

    Args:
        file: OPML file upload.
        current_user: Current authenticated user.
        feed_service: Feed service.
        folder_service: Folder service.
        redis: Redis connection pool for task queue.

    Returns:
        Import statistics (success, failed, and folder counts).

    Raises:
        HTTPException: If file is invalid.
    """
    try:
        content = await file.read()
        opml_result = parse_opml_with_folders(content.decode("utf-8"))

        success_count = 0
        failed_count = 0
        folder_count = 0
        updated_count = 0

        # Build existing folder mapping first (name -> id), reusing same-name folders.
        folder_id_map: dict[str, str] = {}
        existing_folders = await folder_service.get_folders_tree(current_user.id, "feed")

        def collect_existing(nodes: list[FolderTreeNode]) -> None:
            for node in nodes:
                # Keep first seen folder id for a given name.
                folder_id_map.setdefault(node.name, node.id)
                if node.children:
                    collect_existing(node.children)

        collect_existing(existing_folders.folders)

        # Create only missing folders from OPML.
        for folder_name in opml_result.folders:
            if folder_name in folder_id_map:
                continue
            folder = await folder_service.create_folder(
                current_user.id,
                FolderCreate(name=folder_name, type="feed"),
            )
            folder_id_map[folder_name] = folder.id
            folder_count += 1

        # Build desired folder assignment by feed URL.
        # If duplicate URLs appear in OPML, last occurrence wins.
        desired_folder_by_url: dict[str, str | None] = {}
        desired_title_by_url: dict[str, str] = {}
        for opml_feed in opml_result.feeds:
            feed_url = opml_feed.xml_url.strip()
            folder_id = folder_id_map.get(opml_feed.folder) if opml_feed.folder else None
            desired_folder_by_url[feed_url] = folder_id
            desired_title_by_url[feed_url] = opml_feed.title

        # Bulk load existing subscriptions for OPML URLs and update folder assignment.
        existing_subscriptions_by_url: dict[str, Subscription] = {}
        if desired_folder_by_url:
            existing_stmt = (
                select(Subscription, Feed.url)
                .join(Feed, Subscription.feed_id == Feed.id)
                .where(Subscription.user_id == current_user.id, Feed.url.in_(desired_folder_by_url))
            )
            existing_result = await feed_service.session.execute(existing_stmt)
            for subscription, feed_url in existing_result.all():
                existing_subscriptions_by_url[feed_url] = subscription

        for feed_url, existing_subscription in existing_subscriptions_by_url.items():
            target_folder_id = desired_folder_by_url[feed_url]
            if existing_subscription.folder_id != target_folder_id:
                existing_subscription.folder_id = target_folder_id
                updated_count += 1

        if updated_count > 0:
            await feed_service.session.commit()

        # Import feeds with folder assignment.
        for opml_feed in opml_result.feeds:
            feed_url = opml_feed.xml_url.strip()
            folder_id = desired_folder_by_url[feed_url]

            if feed_url in existing_subscriptions_by_url:
                success_count += 1
                continue

            try:
                subscription = await feed_service.create_subscription(
                    current_user.id,
                    feed_url,
                    desired_title_by_url[feed_url],
                    folder_id,
                )
                await enqueue_feed_refresh_job(
                    session=session,
                    redis=redis,
                    feed_id=subscription.feed.id,
                    feed_title=subscription.custom_title
                    or subscription.feed.title
                    or subscription.feed.url,
                    trigger_type="subscription_bootstrap",
                    subscription_id=subscription.id,
                )
                success_count += 1
            except ValueError:
                # Invalid feed or other create failure
                failed_count += 1

        return {
            "success": success_count,
            "failed": failed_count,
            "total": len(opml_result.feeds),
            "folders_created": folder_count,
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None


@router.get("/export")
async def export_opml(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    folder_service: Annotated[FolderService, Depends(get_folder_service)],
) -> Response:
    """
    Export subscriptions as OPML file with folder structure.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.
        folder_service: Folder service.

    Returns:
        OPML file download.
    """
    subscriptions = await feed_service.get_user_subscriptions(current_user.id)

    # Build folder_id -> folder_name mapping
    folder_tree = await folder_service.get_folders_tree(current_user.id, "feed")
    folder_id_to_name: dict[str, str] = {}

    def collect_folders(folders: list[FolderTreeNode]) -> None:
        for folder in folders:
            folder_id_to_name[folder.id] = folder.name
            if folder.children:
                collect_folders(folder.children)

    collect_folders(folder_tree.folders)

    feeds = [
        {
            "title": sub.custom_title or sub.feed.title,
            "url": sub.feed.url,
            "site_url": sub.feed.site_url,
            "folder": folder_id_to_name.get(sub.folder_id) if sub.folder_id else None,
        }
        for sub in subscriptions
    ]

    opml_content = generate_opml(feeds)

    return Response(
        content=opml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=glean-subscriptions.opml"},
    )
