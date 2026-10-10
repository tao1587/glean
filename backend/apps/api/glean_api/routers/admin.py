"""
Admin router.

Provides endpoints for administrative operations.
"""

from datetime import UTC, datetime, timedelta
from math import ceil
from typing import Annotated, Any, Literal

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_core.schemas import (
    EmbeddingConfigUpdateRequest,
    RSSHubConfigUpdateRequest,
)
from glean_core.schemas.admin import (
    AdminBatchEntryRequest,
    AdminBatchFeedRequest,
    AdminContentBackfillCandidateResponse,
    AdminContentBackfillRequest,
    AdminContentBackfillResponse,
    AdminEntryDetailResponse,
    AdminEntryListItem,
    AdminEntryListResponse,
    AdminFeedDetailResponse,
    AdminFeedListItem,
    AdminFeedListResponse,
    AdminFeedUpdateRequest,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminUserResponse,
    DashboardStatsResponse,
    ImportSubscriptionsRequest,
    ImportSubscriptionsResponse,
    ResetPasswordRequest,
    ToggleUserStatusRequest,
    UserListItem,
    UserListResponse,
)
from glean_core.services import AdminService, TypedConfigService
from glean_database.models import Feed, FeedFetchRun
from glean_database.session import get_session

from ..config import settings
from ..dependencies import (
    get_admin_service,
    get_current_admin,
    get_redis_pool,
    get_typed_config_service,
)
from ..feed_fetch_progress import (
    load_active_feed_fetch_runs,
    load_latest_feed_fetch_runs,
    reconcile_active_feed_fetch_runs,
    serialize_feed_fetch_run,
)
from ..feed_refresh import build_refresh_status_items, enqueue_feed_refresh_job

router = APIRouter()


class AdminRefreshJobItem(BaseModel):
    """Queued admin refresh job payload."""

    feed_id: str
    job_id: str = Field(min_length=1)


class AdminRefreshStatusRequest(BaseModel):
    """Admin refresh status query payload."""

    items: list[AdminRefreshJobItem]


class AdminFeedFetchRunBatchRequest(BaseModel):
    """Admin batch latest-run query payload."""

    feed_ids: list[str] = Field(default_factory=list)


@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(
    request: AdminLoginRequest,
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminLoginResponse:
    """
    Admin login endpoint.

    Args:
        request: Login credentials.
        admin_service: Admin service instance.

    Returns:
        Access token and admin info.

    Raises:
        HTTPException: If credentials are invalid.
    """
    admin = await admin_service.authenticate_admin(request.username, request.password)

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Create JWT tokens with admin claims
    now = datetime.now(UTC)
    access_expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    refresh_expire = now + timedelta(days=settings.jwt_refresh_token_expire_days)

    # Handle both enum (in-memory) and string (from database) cases
    role_value = admin.role.value if hasattr(admin.role, "value") else admin.role

    # Access token payload
    access_payload = {
        "sub": admin.id,
        "username": admin.username,
        "role": role_value,
        "type": "admin",
        "exp": int(access_expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    # Refresh token payload
    refresh_payload = {
        "sub": admin.id,
        "type": "admin_refresh",
        "exp": int(refresh_expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    access_token = jwt.encode(access_payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    refresh_token = jwt.encode(
        refresh_payload, settings.secret_key, algorithm=settings.jwt_algorithm
    )

    # Build response with explicit field values to avoid lazy loading issues
    admin_response = AdminUserResponse(
        id=admin.id,
        username=admin.username,
        role=role_value,
        is_active=admin.is_active,
        last_login_at=admin.last_login_at,
        created_at=admin.created_at,
        updated_at=admin.updated_at,
    )

    return AdminLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        admin=admin_response,
    )


@router.post("/auth/refresh")
async def admin_refresh_token(
    request: dict[str, str],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> dict[str, str]:
    """
    Refresh admin access token using refresh token.

    Args:
        request: Request body with refresh_token.
        admin_service: Admin service instance.

    Returns:
        New access and refresh tokens.

    Raises:
        HTTPException: If refresh token is invalid.
    """
    try:
        refresh_token = request.get("refresh_token")
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="refresh_token is required",
            )

        # Verify refresh token
        payload = jwt.decode(
            refresh_token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )

        # Check token type
        if payload.get("type") != "admin_refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type",
            )

        # Get admin ID from token
        admin_id = payload.get("sub")
        if not admin_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        # Verify admin still exists and is active
        admin = await admin_service.get_admin_by_id(admin_id)
        if not admin or not admin.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Admin not found or inactive",
            )

        # Generate new tokens
        now = datetime.now(UTC)
        access_expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
        refresh_expire = now + timedelta(days=settings.jwt_refresh_token_expire_days)

        # Handle both enum (in-memory) and string (from database) cases
        role_value = admin.role.value if hasattr(admin.role, "value") else admin.role

        # Access token payload
        access_payload = {
            "sub": admin.id,
            "username": admin.username,
            "role": role_value,
            "type": "admin",
            "exp": int(access_expire.timestamp()),
            "iat": int(now.timestamp()),
        }

        # Refresh token payload
        refresh_payload = {
            "sub": admin.id,
            "type": "admin_refresh",
            "exp": int(refresh_expire.timestamp()),
            "iat": int(now.timestamp()),
        }

        new_access_token = jwt.encode(
            access_payload, settings.secret_key, algorithm=settings.jwt_algorithm
        )
        new_refresh_token = jwt.encode(
            refresh_payload, settings.secret_key, algorithm=settings.jwt_algorithm
        )

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {str(e)}",
        ) from e


@router.get("/me", response_model=AdminUserResponse)
async def get_current_admin_info(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
) -> AdminUserResponse:
    """
    Get current admin information.

    Args:
        current_admin: Current authenticated admin.

    Returns:
        Admin user information.
    """
    return current_admin


@router.get("/health")
async def admin_health() -> dict[str, str]:
    """
    Admin health check endpoint.

    Returns:
        Health status.
    """
    return {"status": "healthy", "message": "Admin API is running"}


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> DashboardStatsResponse:
    """
    Get dashboard statistics.

    Args:
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Dashboard statistics.
    """
    stats = await admin_service.get_dashboard_stats()
    return DashboardStatsResponse(**stats)


@router.get("/users", response_model=UserListResponse)
async def list_users(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(None, description="Search by email"),
) -> UserListResponse:
    """
    List all users with pagination.

    Args:
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.
        page: Page number.
        per_page: Items per page.
        search: Search query.

    Returns:
        Paginated user list.
    """
    users, total = await admin_service.list_users(page=page, per_page=per_page, search=search)

    return UserListResponse(
        items=[UserListItem.model_validate(user) for user in users],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=ceil(total / per_page) if total > 0 else 1,
    )


@router.patch("/users/{user_id}/status", response_model=UserListItem)
async def toggle_user_status(
    user_id: str,
    request: ToggleUserStatusRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> UserListItem:
    """
    Enable or disable a user account.

    Args:
        user_id: User ID to update.
        request: New status.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Updated user information.

    Raises:
        HTTPException: If user not found.
    """
    user = await admin_service.toggle_user_status(user_id, request.is_active)

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return UserListItem.model_validate(user)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    request: ResetPasswordRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> dict[str, str]:
    """
    Reset a user's password.

    Args:
        user_id: User ID.
        request: New password.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Success message.

    Raises:
        HTTPException: If user not found.
    """
    user = await admin_service.reset_user_password(user_id, request.password)

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"message": "Password reset successfully"}


@router.post("/users/{user_id}/import-subscriptions", response_model=ImportSubscriptionsResponse)
async def import_user_subscriptions(
    user_id: str,
    request: ImportSubscriptionsRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> ImportSubscriptionsResponse:
    """
    Import subscriptions from another user.

    Args:
        user_id: Target user ID.
        request: Source user ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Import result with counts.

    Raises:
        HTTPException: If user not found or same user.
    """
    if user_id == request.source_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot import subscriptions from the same user",
        )

    imported, skipped = await admin_service.import_user_subscriptions(
        user_id, request.source_user_id
    )

    return ImportSubscriptionsResponse(imported=imported, skipped=skipped)


# M2: Feed management endpoints
@router.get("/feeds", response_model=AdminFeedListResponse)
async def list_feeds(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Literal["active", "error", "disabled", "inactive"] | None = Query(
        None, alias="status", description="Filter by status"
    ),
    search: str | None = Query(None, description="Search in title or URL"),
    sort: str = Query("created_at", description="Sort field"),
    order: str = Query("desc", description="Sort order"),
) -> AdminFeedListResponse:
    """
    List all feeds with pagination.

    Args:
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.
        page: Page number.
        per_page: Items per page.
        status_filter: Filter by status.
        search: Search query.
        sort: Sort field.
        order: Sort order.

    Returns:
        Paginated feed list.
    """
    try:
        feeds, total = await admin_service.list_feeds(
            page=page,
            per_page=per_page,
            status=status_filter,
            search=search,
            sort=sort,
            order=order,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    return AdminFeedListResponse(
        items=[AdminFeedListItem(**feed) for feed in feeds],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=ceil(total / per_page) if total > 0 else 1,
    )


@router.get("/feeds/{feed_id}", response_model=AdminFeedDetailResponse)
async def get_feed(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminFeedDetailResponse:
    """
    Get feed details.

    Args:
        feed_id: Feed ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Feed details.

    Raises:
        HTTPException: If feed not found.
    """
    feed = await admin_service.get_feed(feed_id)

    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    return AdminFeedDetailResponse(**feed)


@router.patch("/feeds/{feed_id}", response_model=AdminFeedDetailResponse)
async def update_feed(
    feed_id: str,
    request: AdminFeedUpdateRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminFeedDetailResponse:
    """
    Update a feed.

    Args:
        feed_id: Feed ID.
        request: Update data.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Updated feed.

    Raises:
        HTTPException: If feed not found.
    """
    try:
        feed = await admin_service.update_feed(
            feed_id, url=request.url, title=request.title, status=request.status
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    return AdminFeedDetailResponse(**feed)


@router.post("/feeds/{feed_id}/reset-error", response_model=AdminFeedDetailResponse)
async def reset_feed_error(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminFeedDetailResponse:
    """
    Reset error count for a feed.

    Args:
        feed_id: Feed ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Updated feed.

    Raises:
        HTTPException: If feed not found.
    """
    feed = await admin_service.reset_feed_error(feed_id)

    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    return AdminFeedDetailResponse(**feed)


@router.delete("/feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feed(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> None:
    """
    Delete a feed.

    Args:
        feed_id: Feed ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Raises:
        HTTPException: If feed not found.
    """
    deleted = await admin_service.delete_feed(feed_id)

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")


@router.post("/feeds/batch")
async def batch_feed_operation(
    request: AdminBatchFeedRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> dict[str, int]:
    """
    Perform batch operation on feeds.

    Args:
        request: Batch operation data.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Number of affected feeds.
    """
    count = await admin_service.batch_feed_operation(request.action, request.feed_ids)
    return {"affected": count}


@router.post("/feeds/{feed_id}/refresh", status_code=status.HTTP_202_ACCEPTED)
async def refresh_feed_now(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    """Manually enqueue a refresh task for one feed."""
    feed = await admin_service.get_feed(feed_id)
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    job_payload = await enqueue_feed_refresh_job(
        session=session,
        redis=redis,
        feed_id=feed_id,
        feed_title=feed.get("title") or feed.get("url") or feed_id,
        trigger_type="manual_admin",
        backfill_existing_entries=True,
    )
    db_feed = await session.get(Feed, feed_id)
    if db_feed:
        db_feed.last_fetch_attempt_at = datetime.now(UTC)
        await session.commit()
    return {"status": "queued", **job_payload}


@router.get(
    "/feeds/{feed_id}/backfill-content/candidates",
    response_model=AdminContentBackfillResponse,
)
async def list_feed_content_backfill_candidates(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    limit: int = Query(100, ge=1, le=1000),
    published_after: datetime | None = Query(None),
    published_before: datetime | None = Query(None),
    force: bool = Query(False),
    missing_only: bool = Query(True),
) -> AdminContentBackfillResponse:
    """List entries that would be selected for a content backfill run."""
    result = await admin_service.list_feed_content_backfill_candidates(
        feed_id=feed_id,
        limit=limit,
        published_after=published_after,
        published_before=published_before,
        force=force,
        missing_only=missing_only,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    candidates, matched = result
    return AdminContentBackfillResponse(
        feed_id=feed_id,
        matched=matched,
        enqueued=0,
        skipped=0,
        dry_run=True,
        candidates=[AdminContentBackfillCandidateResponse(**candidate) for candidate in candidates],
    )


@router.post("/feeds/{feed_id}/backfill-content", response_model=AdminContentBackfillResponse)
async def enqueue_feed_content_backfill(
    feed_id: str,
    request: AdminContentBackfillRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> AdminContentBackfillResponse:
    """Queue entry content backfill jobs for a feed."""
    result = await admin_service.list_feed_content_backfill_candidates(
        feed_id=feed_id,
        limit=request.limit,
        published_after=request.published_after,
        published_before=request.published_before,
        force=request.force,
        missing_only=request.missing_only,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    candidates, matched = result
    if not request.dry_run:
        for candidate in candidates:
            await redis.enqueue_job(
                "backfill_entry_content_task", candidate["id"], force=request.force
            )

    return AdminContentBackfillResponse(
        feed_id=feed_id,
        matched=matched,
        enqueued=0 if request.dry_run else matched,
        skipped=0,
        dry_run=request.dry_run,
        candidates=[AdminContentBackfillCandidateResponse(**candidate) for candidate in candidates],
    )


@router.post("/feeds/refresh-all", status_code=status.HTTP_202_ACCEPTED)
@router.post("/feeds/refresh/all", status_code=status.HTTP_202_ACCEPTED)
async def refresh_all_feeds_now(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int | str | list[dict[str, str]]]:
    """Manually enqueue refresh tasks for all non-disabled feeds."""
    result = await session.execute(select(Feed).where(Feed.status != "disabled"))
    feeds = list(result.scalars().all())

    jobs: list[dict[str, str]] = []
    queued_feed_ids: set[str] = set()
    for index, feed in enumerate(feeds):
        jobs.append(
            await enqueue_feed_refresh_job(
                session=session,
                redis=redis,
                feed_id=feed.id,
                feed_title=feed.title or feed.url,
                trigger_type="manual_admin",
                backfill_existing_entries=True,
                queue_depth_ahead=index,
            )
        )
        queued_feed_ids.add(feed.id)

    if queued_feed_ids:
        attempt_at = datetime.now(UTC)
        for feed in feeds:
            if feed.id in queued_feed_ids:
                feed.last_fetch_attempt_at = attempt_at
        await session.commit()

    return {"status": "queued", "queued_count": len(jobs), "jobs": jobs}


@router.post("/feeds/refresh-errored", status_code=status.HTTP_202_ACCEPTED)
async def refresh_errored_feeds_now(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int | str | list[dict[str, str]]]:
    """Manually enqueue refresh tasks for all feeds with errors."""
    result = await session.execute(
        select(Feed).where(or_(Feed.error_count > 0, Feed.status == "error"))
    )
    feeds = list(result.scalars().all())

    jobs: list[dict[str, str]] = []
    queued_feed_ids: set[str] = set()
    for index, feed in enumerate(feeds):
        jobs.append(
            await enqueue_feed_refresh_job(
                session=session,
                redis=redis,
                feed_id=feed.id,
                feed_title=feed.title or feed.url,
                trigger_type="manual_admin",
                backfill_existing_entries=True,
                queue_depth_ahead=index,
            )
        )
        queued_feed_ids.add(feed.id)

    if queued_feed_ids:
        attempt_at = datetime.now(UTC)
        for feed in feeds:
            if feed.id in queued_feed_ids:
                feed.last_fetch_attempt_at = attempt_at
        await session.commit()

    return {"status": "queued", "queued_count": len(jobs), "jobs": jobs}


@router.post("/feeds/refresh-status")
@router.post("/feeds/refresh/status")
async def refresh_status(
    request: AdminRefreshStatusRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, list[dict[str, str | int | None]]]:
    """Query per-feed refresh job status for admin UI."""
    if not request.items:
        return {"items": []}

    feed_ids = {item.feed_id for item in request.items}
    result = await session.execute(select(Feed).where(Feed.id.in_(feed_ids)))
    feed_map = {feed.id: feed for feed in result.scalars().all()}

    items = await build_refresh_status_items(
        redis=redis,
        request_items=[(item.feed_id, item.job_id) for item in request.items],
        feed_map=feed_map,
    )

    return {"items": items}


@router.get("/feeds/{feed_id}/fetch-runs/latest")
async def get_latest_feed_fetch_run_admin(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object | None]:
    """Return the latest persisted fetch run for one feed."""
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
        include_admin_diagnostic=True,
    )


@router.post("/feeds/fetch-runs/latest")
async def get_latest_feed_fetch_runs_admin(
    request: AdminFeedFetchRunBatchRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, list[dict[str, object | None]]]:
    """Return latest persisted fetch run snapshots for many feeds."""
    if not request.feed_ids:
        return {"items": []}

    requested_feed_ids = list(dict.fromkeys(request.feed_ids))
    feeds_result = await session.execute(select(Feed).where(Feed.id.in_(requested_feed_ids)))
    feeds = {feed.id: feed for feed in feeds_result.scalars().all()}
    latest_by_feed = await load_latest_feed_fetch_runs(session, list(feeds.keys()))

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
                include_admin_diagnostic=True,
                include_stages=False,
            )
        )
    return {"items": items}


@router.get("/feeds/fetch-runs/active")
async def get_active_feed_fetch_runs_admin(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, list[dict[str, object | None]]]:
    """Return all queued/running fetch runs for admin diagnostics."""
    del current_admin
    await reconcile_active_feed_fetch_runs(session, redis)
    active_runs = await load_active_feed_fetch_runs(session)

    items: list[dict[str, object | None]] = []
    for run, feed in active_runs:
        item = serialize_feed_fetch_run(
            run,
            next_fetch_at=feed.next_fetch_at,
            last_fetch_attempt_at=feed.last_fetch_attempt_at,
            last_fetch_success_at=feed.last_fetch_success_at,
            last_fetched_at=feed.last_fetched_at,
            include_admin_diagnostic=True,
        )
        item["feed_title"] = feed.title
        item["feed_url"] = feed.url
        items.append(item)
    return {"items": items}


@router.get("/feeds/{feed_id}/fetch-runs/history")
async def get_feed_fetch_run_history_admin(
    feed_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object]:
    """Return recent persisted fetch run history for one feed."""
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
                include_admin_diagnostic=True,
            )
            for run in runs
        ],
    }


# M2: Entry management endpoints
@router.get("/entries", response_model=AdminEntryListResponse)
async def list_entries(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    feed_id: str | None = Query(None, description="Filter by feed"),
    search: str | None = Query(None, description="Search in title"),
    sort: str = Query("created_at", description="Sort field"),
    order: str = Query("desc", description="Sort order"),
) -> AdminEntryListResponse:
    """
    List all entries with pagination.

    Args:
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.
        page: Page number.
        per_page: Items per page.
        feed_id: Filter by feed.
        search: Search query.
        sort: Sort field.
        order: Sort order.

    Returns:
        Paginated entry list.
    """
    entries, total = await admin_service.list_entries(
        page=page,
        per_page=per_page,
        feed_id=feed_id,
        search=search,
        sort=sort,
        order=order,
    )

    return AdminEntryListResponse(
        items=[AdminEntryListItem(**entry) for entry in entries],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=ceil(total / per_page) if total > 0 else 1,
    )


@router.get("/entries/{entry_id}", response_model=AdminEntryDetailResponse)
async def get_entry(
    entry_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminEntryDetailResponse:
    """
    Get entry details.

    Args:
        entry_id: Entry ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Entry details.

    Raises:
        HTTPException: If entry not found.
    """
    entry = await admin_service.get_entry(entry_id)

    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    return AdminEntryDetailResponse(**entry)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: str,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> None:
    """
    Delete an entry.

    Args:
        entry_id: Entry ID.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Raises:
        HTTPException: If entry not found.
    """
    deleted = await admin_service.delete_entry(entry_id)

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")


@router.post("/entries/batch")
async def batch_entry_operation(
    request: AdminBatchEntryRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> dict[str, int]:
    """
    Perform batch operation on entries.

    Args:
        request: Batch operation data.
        current_admin: Current authenticated admin.
        admin_service: Admin service instance.

    Returns:
        Number of affected entries.
    """
    count = await admin_service.batch_entry_operation(request.action, request.entry_ids)
    return {"affected": count}


# =========================
# Embedding configuration
# =========================
@router.get("/embedding/config")
async def get_embedding_config(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Get current embedding configuration.

    Returns typed config with defaults for unset fields.
    """
    from glean_core.schemas.config import EmbeddingConfig
    from glean_core.schemas.config import (
        EmbeddingConfigResponse as TypedEmbeddingConfigResponse,
    )
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)
    return TypedEmbeddingConfigResponse.from_config(config)


@router.post("/embedding/test")
async def test_embedding_provider(
    request: EmbeddingConfigUpdateRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
):
    """
    Test embedding provider and infer dimension without saving configuration.

    This endpoint allows the frontend to test the provider configuration
    and display the inferred dimension to the user before saving.
    """
    from glean_vector.services.validation_service import EmbeddingValidationService

    validation_service = EmbeddingValidationService()

    # Infer dimension from provider
    result = await validation_service.infer_dimension(
        provider=request.provider or "",
        model=request.model or "",
        api_key=request.api_key,
        base_url=request.base_url,
    )

    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=result.message,
        )

    return result


@router.put("/embedding/config")
async def update_embedding_config(
    request: EmbeddingConfigUpdateRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
):
    """
    Update embedding provider configuration.

    If dimension is not provided, it will be auto-inferred from the provider.
    If enabled and config changed, triggers validation and rebuild.
    """
    from glean_core.schemas.config import (
        EmbeddingConfig,
        VectorizationStatus,
    )
    from glean_core.schemas.config import (
        EmbeddingConfigResponse as TypedEmbeddingConfigResponse,
    )
    from glean_core.services import TypedConfigService
    from glean_vector.services.validation_service import EmbeddingValidationService

    config_service = TypedConfigService(session)
    current = await config_service.get(EmbeddingConfig)

    # Build updates dict from request
    updates = request.model_dump(exclude_unset=True)

    # Auto-infer dimension if not provided and provider/model changed
    provider_changed = "provider" in updates or "model" in updates
    if provider_changed and "dimension" not in updates:
        # Use new values or fall back to current
        provider = updates.get("provider", current.provider)
        model = updates.get("model", current.model)
        api_key = updates.get("api_key", current.api_key)
        base_url = updates.get("base_url", current.base_url)

        # Infer dimension
        validation_service = EmbeddingValidationService()
        infer_result = await validation_service.infer_dimension(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )

        if not infer_result.success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to infer dimension: {infer_result.message}",
            )

        # Add inferred dimension to updates
        inferred_dimension = infer_result.details.get("dimension")
        updates["dimension"] = inferred_dimension

    # Check if this is a config change that requires rebuild
    # Only provider, model, and dimension changes require rebuild
    # api_key and base_url changes don't affect embeddings (same model = same vectors)
    config_changed = False
    rebuild_fields = {"provider", "model", "dimension"}
    for field in rebuild_fields:
        if field in updates and getattr(current, field) != updates[field]:
            config_changed = True
            break

    # Apply updates
    updated = await config_service.update(EmbeddingConfig, **updates)

    # If enabled and config changed, trigger rebuild
    if updated.enabled and config_changed:
        # Generate new version and trigger rebuild
        await config_service.update_embedding_version()
        await config_service.update(EmbeddingConfig, status=VectorizationStatus.VALIDATING)
        await redis_pool.enqueue_job("validate_and_rebuild_embeddings")

    return TypedEmbeddingConfigResponse.from_config(updated)


@router.post("/embedding/enable")
async def enable_embedding(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
):
    """
    Enable vectorization.

    Validates provider and Milvus connection, then triggers rebuild.
    """
    from glean_core.schemas.config import (
        EmbeddingConfig,
        VectorizationStatus,
    )
    from glean_core.schemas.config import (
        EmbeddingConfigResponse as TypedEmbeddingConfigResponse,
    )
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    if config.enabled:
        return TypedEmbeddingConfigResponse.from_config(config)

    # Enable and set to validating
    updated = await config_service.update(
        EmbeddingConfig,
        enabled=True,
        status=VectorizationStatus.VALIDATING,
    )

    # Trigger validation and rebuild in background
    await redis_pool.enqueue_job("validate_and_rebuild_embeddings")

    return TypedEmbeddingConfigResponse.from_config(updated)


@router.post("/embedding/disable")
async def disable_embedding(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Disable vectorization.

    Stops processing and sets status to DISABLED.
    """
    from glean_core.schemas.config import (
        EmbeddingConfig,
        VectorizationStatus,
    )
    from glean_core.schemas.config import (
        EmbeddingConfigResponse as TypedEmbeddingConfigResponse,
    )
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    updated = await config_service.update(
        EmbeddingConfig,
        enabled=False,
        status=VectorizationStatus.DISABLED,
        rebuild_id=None,
        rebuild_started_at=None,
    )

    return TypedEmbeddingConfigResponse.from_config(updated)


@router.post("/embedding/validate")
async def validate_embedding_config(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """
    Test provider and Milvus connection without saving.

    Returns validation results.
    """
    from glean_core.schemas.config import EmbeddingConfig
    from glean_core.services import TypedConfigService
    from glean_vector.services import EmbeddingValidationService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    validation_service = EmbeddingValidationService()
    result = await validation_service.validate_full(config, session)

    return {
        "success": result.success,
        "message": result.message,
        "details": result.details,
    }


@router.post("/embedding/rebuild")
async def trigger_embedding_rebuild(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, Any]:
    """
    Manually trigger embedding rebuild.

    Only works if vectorization is enabled.
    """
    from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    if not config.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vectorization is not enabled",
        )

    if config.status == VectorizationStatus.REBUILDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rebuild already in progress",
        )

    # Generate new version and trigger rebuild
    await config_service.update_embedding_version()
    await config_service.update(EmbeddingConfig, status=VectorizationStatus.VALIDATING)
    await redis_pool.enqueue_job("validate_and_rebuild_embeddings")

    return {"message": "Rebuild triggered", "status": "validating"}


@router.post("/embedding/cancel-rebuild")
async def cancel_embedding_rebuild(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """
    Cancel ongoing embedding rebuild.
    """
    from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    if config.status != VectorizationStatus.REBUILDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No rebuild in progress",
        )

    # Set status back to IDLE (or ERROR if there was an error)
    await config_service.update(
        EmbeddingConfig,
        status=VectorizationStatus.IDLE,
        rebuild_id=None,
        rebuild_started_at=None,
    )

    return {"message": "Rebuild cancelled", "status": "idle"}


@router.get("/embedding/status")
async def get_embedding_status(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> dict[str, Any]:
    """
    Get embedding system status and rebuild progress.

    If status is REBUILDING and all entries are processed (done + failed == total),
    automatically updates status to IDLE.
    """
    from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
    from glean_core.services import TypedConfigService

    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)

    # Get progress from entry counts
    progress = await admin_service.get_embedding_progress()

    # Auto-complete rebuild if all entries are processed
    current_status = config.status
    if config.status == VectorizationStatus.REBUILDING:
        total = progress.get("total", 0)
        done = progress.get("done", 0)
        failed = progress.get("failed", 0)

        # If all entries are processed (done + failed == total), mark as complete
        if total > 0 and (done + failed) >= total:
            await config_service.complete_rebuild()
            current_status = VectorizationStatus.IDLE

    return {
        "enabled": config.enabled,
        "status": current_status.value,
        "has_error": current_status == VectorizationStatus.ERROR,
        "error_message": config.last_error,
        "error_count": config.error_count,
        "rebuild_id": config.rebuild_id,
        "rebuild_started_at": (
            config.rebuild_started_at.isoformat() if config.rebuild_started_at else None
        ),
        "progress": progress,
    }


class ModelDownloadRequest(BaseModel):
    model: str = Field(..., min_length=1)
    dimension: int = Field(default=384, ge=1)


@router.post("/embedding/download-model")
async def start_model_download(
    request: ModelDownloadRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, Any]:
    """
    Enqueue a background task to download a sentence-transformers model.

    If the model is already downloading or done, returns the current status without
    re-enqueuing. Frontend polls /download-model/status for progress.
    """
    import json

    from glean_worker.tasks.embedding_worker import (
        MODEL_DOWNLOAD_KEY_PREFIX,
        MODEL_DOWNLOAD_TTL,
    )

    redis_key = f"{MODEL_DOWNLOAD_KEY_PREFIX}{request.model}"

    # Return existing status if already in-progress or done
    existing = await redis_pool.get(redis_key)
    if existing:
        data = json.loads(existing)
        current_status = data.get("status")
        if current_status in ("downloading", "done"):
            return {
                "model": request.model,
                "status": current_status,
                "already_running": True,
            }

    # Mark as pending immediately so the frontend can show a spinner right away
    await redis_pool.set(
        redis_key,
        json.dumps({"status": "pending"}),
        ex=MODEL_DOWNLOAD_TTL,
    )

    await redis_pool.enqueue_job(
        "download_embedding_model",
        model=request.model,
        dimension=request.dimension,
    )

    return {"model": request.model, "status": "pending", "already_running": False}


@router.get("/embedding/download-model/status")
async def get_model_download_status(
    model: Annotated[str, Query(min_length=1)],
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, Any]:
    """Get the current download status of a sentence-transformers model."""
    import json

    from glean_worker.tasks.embedding_worker import MODEL_DOWNLOAD_KEY_PREFIX

    redis_key = f"{MODEL_DOWNLOAD_KEY_PREFIX}{model}"
    raw = await redis_pool.get(redis_key)

    if not raw:
        return {"model": model, "status": "not_started", "error": None}

    data = json.loads(raw)
    return {
        "model": model,
        "status": data.get("status", "unknown"),
        "error": data.get("error"),
    }


# System Settings
@router.get("/settings/registration", response_model=dict[str, bool])
async def get_registration_status(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> dict[str, bool]:
    """
    Get registration enabled status.

    Args:
        current_admin: Current authenticated admin.
        config_service: Typed config service instance.

    Returns:
        Registration status.
    """
    enabled = await config_service.is_registration_enabled()
    return {"enabled": enabled}


@router.post("/settings/registration", response_model=dict[str, bool])
async def set_registration_status(
    enabled: bool,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> dict[str, bool]:
    """
    Set registration enabled status.

    Args:
        enabled: New status.
        current_admin: Current authenticated admin.
        config_service: Typed config service instance.

    Returns:
        New registration status.
    """
    await config_service.set_registration_enabled(enabled)
    return {"enabled": enabled}


@router.get("/settings/rsshub")
async def get_rsshub_settings(
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> dict[str, Any]:
    """Get RSSHub conversion configuration."""
    from glean_core.schemas.config import RSSHubConfig

    config = await config_service.get(RSSHubConfig)
    return config.model_dump(exclude={"NAMESPACE"})


@router.post("/settings/rsshub")
async def update_rsshub_settings(
    request: RSSHubConfigUpdateRequest,
    current_admin: Annotated[AdminUserResponse, Depends(get_current_admin)],
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> dict[str, Any]:
    """Update RSSHub conversion configuration."""
    from glean_core.schemas.config import RSSHubConfig

    updates = request.model_dump(exclude_unset=True)
    updated = await config_service.update(RSSHubConfig, **updates)
    return updated.model_dump(exclude={"NAMESPACE"})
