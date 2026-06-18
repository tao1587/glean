"""
Feed and subscription service.

Handles feed discovery, subscription management, and OPML import/export.
"""

import hashlib
import math
from urllib.parse import urljoin

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_core.schemas import (
    RSSHubConfig,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionSyncResponse,
)
from glean_core.services.typed_config_service import TypedConfigService
from glean_database.models import (
    Bookmark,
    Entry,
    Feed,
    FeedSourceType,
    Subscription,
    UserEntry,
)

# Sentinel for unset values
UNSET: object = object()


class FeedService:
    """Feed and subscription management service."""

    def __init__(self, session: AsyncSession):
        """
        Initialize feed service.

        Args:
            session: Database session.
        """
        self.session = session
        self._typed_config = TypedConfigService(session)

    async def _preserve_entry_bookmark_urls_for_feed(self, feed_id: str) -> None:
        """Backfill bookmark URLs before deleting a feed's entries."""
        entry_url_subquery = (
            select(Entry.url).where(Entry.id == Bookmark.entry_id).scalar_subquery()
        )
        feed_entry_ids = select(Entry.id).where(Entry.feed_id == feed_id)

        await self.session.execute(
            update(Bookmark)
            .where(Bookmark.entry_id.in_(feed_entry_ids), Bookmark.url.is_(None))
            .values(url=entry_url_subquery)
        )

    async def _build_rsshub_feed_url(self, rsshub_path: str) -> str:
        """
        Build absolute RSSHub feed URL from configured base_url and path.

        Args:
            rsshub_path: RSSHub path, e.g. "/bilibili/user/dynamic/123".

        Returns:
            Absolute RSSHub feed URL.

        Raises:
            ValueError: If RSSHub config is disabled/missing or path is invalid.
        """
        normalized_path = (rsshub_path or "").strip()
        if not normalized_path:
            raise ValueError("rsshub_path cannot be empty")

        config = await self._typed_config.get(RSSHubConfig)
        if not config.enabled:
            raise ValueError("RSSHub conversion is disabled by admin")
        if not config.base_url:
            raise ValueError("RSSHub base URL is not configured")

        base = config.base_url.strip().rstrip("/")
        if not base.startswith(("http://", "https://")):
            raise ValueError("RSSHub base URL must start with http:// or https://")

        path = normalized_path.lstrip("/")
        return urljoin(base + "/", path)

    async def get_user_subscriptions(
        self, user_id: str, folder_id: str | None = None
    ) -> list[SubscriptionResponse]:
        """
        Get all subscriptions for a user (unpaginated, for internal use).

        Args:
            user_id: User identifier.
            folder_id: Optional folder filter. If provided, returns only subscriptions in that folder.
                       Use empty string "" to get ungrouped subscriptions (folder_id is None).

        Returns:
            List of subscription responses.
        """
        stmt = (
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .options(selectinload(Subscription.feed))
            .order_by(Subscription.created_at.desc())
        )

        # Apply folder filter if provided
        if folder_id == "":
            # Empty string means get ungrouped subscriptions
            stmt = stmt.where(Subscription.folder_id.is_(None))
        elif folder_id is not None:
            stmt = stmt.where(Subscription.folder_id == folder_id)

        result = await self.session.execute(stmt)
        subscriptions = result.scalars().all()

        # Calculate unread counts for each subscription
        responses: list[SubscriptionResponse] = []
        for sub in subscriptions:
            # Count entries in this feed that are either:
            # 1. Not in user_entries (never seen)
            # 2. In user_entries but is_read = False
            unread_stmt = (
                select(func.count(Entry.id))
                .where(Entry.feed_id == sub.feed_id)
                .outerjoin(
                    UserEntry,
                    (UserEntry.entry_id == Entry.id) & (UserEntry.user_id == user_id),
                )
                .where((UserEntry.id.is_(None)) | (UserEntry.is_read.is_(False)))
            )
            unread_result = await self.session.execute(unread_stmt)
            unread_count = unread_result.scalar() or 0

            # Create response with unread count
            response_dict = {
                "id": sub.id,
                "user_id": sub.user_id,
                "feed_id": sub.feed_id,
                "custom_title": sub.custom_title,
                "folder_id": sub.folder_id,
                "created_at": sub.created_at,
                "feed": sub.feed,
                "unread_count": unread_count,
            }
            responses.append(SubscriptionResponse.model_validate(response_dict))

        return responses

    async def get_user_subscriptions_sync(self, user_id: str) -> SubscriptionSyncResponse:
        """
        Get all subscriptions for a user with ETag for sync.

        This method returns all subscriptions along with an ETag that can be used
        for caching. The ETag is based on subscription IDs, updated_at timestamps,
        and unread counts.

        Args:
            user_id: User identifier.

        Returns:
            Sync response with subscriptions and ETag.
        """
        # Get all subscriptions
        subscriptions = await self.get_user_subscriptions(user_id)

        # Compute ETag based on subscription data
        etag = self._compute_subscriptions_etag(subscriptions)

        return SubscriptionSyncResponse(items=subscriptions, etag=etag)

    def _compute_subscriptions_etag(self, subscriptions: list[SubscriptionResponse]) -> str:
        """
        Compute an ETag for subscription list.

        The ETag is based on:
        - Subscription IDs (for add/remove detection)
        - Feed updated_at timestamps (for feed data changes)
        - Unread counts (for state changes)
        - Custom titles and folder assignments

        Args:
            subscriptions: List of subscriptions.

        Returns:
            ETag string (MD5 hash).
        """
        # Build a string that uniquely identifies the current state
        parts: list[str] = []
        for sub in sorted(subscriptions, key=lambda s: s.id):
            parts.append(
                f"{sub.id}:{sub.feed.last_fetched_at or ''}:{sub.unread_count}:"
                f"{sub.custom_title or ''}:{sub.folder_id or ''}"
            )
        content = "|".join(parts)
        return hashlib.md5(content.encode()).hexdigest()

    async def get_user_subscriptions_paginated(
        self,
        user_id: str,
        page: int = 1,
        per_page: int = 20,
        folder_id: str | None = None,
        search: str | None = None,
    ) -> SubscriptionListResponse:
        """
        Get paginated subscriptions for a user.

        Args:
            user_id: User identifier.
            page: Page number (1-indexed).
            per_page: Items per page.
            folder_id: Optional folder filter. If provided, returns only subscriptions in that folder.
                       Use empty string "" to get ungrouped subscriptions (folder_id is None).
            search: Optional search query to filter by title or URL.

        Returns:
            Paginated subscription list response.
        """
        # Build base query
        base_stmt = select(Subscription).where(Subscription.user_id == user_id)

        # Apply folder filter if provided
        if folder_id == "":
            # Empty string means get ungrouped subscriptions
            base_stmt = base_stmt.where(Subscription.folder_id.is_(None))
        elif folder_id is not None:
            base_stmt = base_stmt.where(Subscription.folder_id == folder_id)

        # Apply search filter if provided
        if search:
            search_term = f"%{search.lower()}%"
            base_stmt = base_stmt.join(Subscription.feed).where(
                (func.lower(Subscription.custom_title).like(search_term))
                | (func.lower(Feed.title).like(search_term))
                | (func.lower(Feed.url).like(search_term))
            )

        # Get total count
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Calculate pagination
        total_pages = math.ceil(total / per_page) if total > 0 else 1
        offset = (page - 1) * per_page

        # Get paginated items
        stmt = (
            base_stmt.options(selectinload(Subscription.feed))
            .order_by(Subscription.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        result = await self.session.execute(stmt)
        subscriptions = result.scalars().all()

        # Calculate unread counts for each subscription
        responses: list[SubscriptionResponse] = []
        for sub in subscriptions:
            # Count entries in this feed that are either:
            # 1. Not in user_entries (never seen)
            # 2. In user_entries but is_read = False
            unread_stmt = (
                select(func.count(Entry.id))
                .where(Entry.feed_id == sub.feed_id)
                .outerjoin(
                    UserEntry,
                    (UserEntry.entry_id == Entry.id) & (UserEntry.user_id == user_id),
                )
                .where((UserEntry.id.is_(None)) | (UserEntry.is_read.is_(False)))
            )
            unread_result = await self.session.execute(unread_stmt)
            unread_count = unread_result.scalar() or 0

            # Create response with unread count
            response_dict = {
                "id": sub.id,
                "user_id": sub.user_id,
                "feed_id": sub.feed_id,
                "custom_title": sub.custom_title,
                "folder_id": sub.folder_id,
                "created_at": sub.created_at,
                "feed": sub.feed,
                "unread_count": unread_count,
            }
            responses.append(SubscriptionResponse.model_validate(response_dict))

        return SubscriptionListResponse(
            items=responses,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
        )

    async def get_subscription(self, subscription_id: str, user_id: str) -> SubscriptionResponse:
        """
        Get a specific subscription.

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.

        Returns:
            Subscription response.

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id, Subscription.user_id == user_id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        return SubscriptionResponse.model_validate(subscription)

    async def create_subscription(
        self,
        user_id: str,
        feed_url: str | None,
        feed_title: str | None = None,
        folder_id: str | None = None,
        rsshub_path: str | None = None,
        source_type: FeedSourceType | str | None = None,
    ) -> SubscriptionResponse:
        """
        Create a new subscription.

        Args:
            user_id: User identifier.
            feed_url: Feed URL.
            feed_title: Optional feed title (if None, uses URL as title).
            folder_id: Optional folder to place the subscription in.
            rsshub_path: Optional RSSHub path. If provided, overrides feed_url.
            source_type: Optional explicit feed source type for discovered fallback cases.

        Returns:
            Subscription response.

        Raises:
            ValueError: If subscription already exists.
        """
        source_type_value = source_type or (FeedSourceType.RSSHUB if rsshub_path else FeedSourceType.FEED)
        resolved_source_type = FeedSourceType(source_type_value)
        if rsshub_path:
            feed_url = await self._build_rsshub_feed_url(rsshub_path)
        elif not feed_url:
            raise ValueError("Either feed_url or rsshub_path is required")

        # Check if feed exists
        stmt = select(Feed).where(Feed.url == feed_url)
        result = await self.session.execute(stmt)
        feed = result.scalar_one_or_none()

        if not feed:
            # Create new feed
            title = feed_title if feed_title else feed_url
            feed = Feed(
                url=feed_url,
                title=title,
                status="active",
                source_type=resolved_source_type,
            )
            self.session.add(feed)
            await self.session.flush()
        elif resolved_source_type == FeedSourceType.RSSHUB:
            feed.source_type = FeedSourceType.RSSHUB

        # Check if subscription already exists
        stmt = select(Subscription).where(
            Subscription.user_id == user_id, Subscription.feed_id == feed.id
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            raise ValueError("Already subscribed to this feed")

        # Create subscription
        subscription = Subscription(user_id=user_id, feed_id=feed.id, folder_id=folder_id)
        self.session.add(subscription)
        await self.session.flush()

        # Load feed relationship before commit
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription.id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one()

        # Validate to Pydantic model while session is still open
        response = SubscriptionResponse.model_validate(subscription)

        await self.session.commit()

        return response

    async def delete_subscription(
        self, subscription_id: str, user_id: str
    ) -> tuple[str | None, list[str]]:
        """
        Delete a subscription and clean up related data.

        This method:
        1. Deletes the user's UserEntry records for entries in this feed
        2. Deletes the subscription
        3. If no other users subscribe to the feed, deletes the feed and its entries

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.

        Returns:
            Tuple of (orphaned_feed_id, entry_ids).
            - orphaned_feed_id: feed_id if deleted, None if still has subscribers.
            - entry_ids: List of entry IDs that were deleted (for Milvus cleanup).

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = select(Subscription).where(
            Subscription.id == subscription_id, Subscription.user_id == user_id
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        feed_id = subscription.feed_id

        # 1. Delete user's UserEntry records for entries in this feed
        # This also cascades to UserEntryTag via relationship
        delete_user_entries_stmt = delete(UserEntry).where(
            UserEntry.user_id == user_id,
            UserEntry.entry_id.in_(select(Entry.id).where(Entry.feed_id == feed_id)),
        )
        await self.session.execute(delete_user_entries_stmt)

        # 2. Delete the subscription
        await self.session.delete(subscription)

        # 3. Check if feed has any other subscribers
        orphaned_feed_id, entry_ids = await self._cleanup_orphan_feed(feed_id)

        await self.session.commit()
        return orphaned_feed_id, entry_ids

    async def _cleanup_orphan_feed(self, feed_id: str) -> tuple[str | None, list[str]]:
        """
        Delete a feed if it has no subscribers.

        This also deletes all entries via CASCADE, which will need
        to be cleaned up from Milvus separately.

        Args:
            feed_id: Feed identifier.

        Returns:
            Tuple of (feed_id, entry_ids) if deleted, (None, []) if still has subscribers.
            entry_ids are needed for Milvus embedding cleanup.
        """
        # Count remaining subscriptions for this feed
        count_stmt = select(func.count(Subscription.id)).where(Subscription.feed_id == feed_id)
        result = await self.session.execute(count_stmt)
        count = result.scalar() or 0

        if count == 0:
            await self._preserve_entry_bookmark_urls_for_feed(feed_id)

            # No more subscribers - get entry IDs before deleting
            entry_stmt = select(Entry.id).where(Entry.feed_id == feed_id)
            entry_result = await self.session.execute(entry_stmt)
            entry_ids = [row[0] for row in entry_result.all()]

            # Delete the feed (entries cascade)
            feed_stmt = select(Feed).where(Feed.id == feed_id)
            feed_result = await self.session.execute(feed_stmt)
            feed = feed_result.scalar_one_or_none()
            if feed:
                await self.session.delete(feed)
                return feed_id, entry_ids

        return None, []

    async def update_subscription(
        self,
        subscription_id: str,
        user_id: str,
        custom_title: str | None = None,
        folder_id: str | None | object = UNSET,
        feed_url: str | None = None,
        rsshub_path: str | None = None,
    ) -> SubscriptionResponse:
        """
        Update subscription settings.

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.
            custom_title: Custom title override. None clears the title.
            folder_id: Folder to move subscription to. None removes from folder.
                       Use UNSET sentinel to keep unchanged.
            feed_url: New URL for the feed. Updates the underlying feed.
            rsshub_path: Optional RSSHub path. If provided, takes precedence over feed_url.

        Returns:
            Updated subscription response.

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id, Subscription.user_id == user_id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        if custom_title is not None or custom_title is None:
            subscription.custom_title = custom_title

        # Only update folder_id if explicitly provided (not the sentinel)
        if folder_id is not UNSET:
            subscription.folder_id = folder_id  # type: ignore[assignment]

        # Update feed URL if provided
        resolved_feed_url = feed_url
        source_type = FeedSourceType.FEED if feed_url else None
        if rsshub_path:
            resolved_feed_url = await self._build_rsshub_feed_url(rsshub_path)
            source_type = FeedSourceType.RSSHUB

        if resolved_feed_url and subscription.feed:
            subscription.feed.url = resolved_feed_url
            if source_type is not None:
                subscription.feed.source_type = source_type

        await self.session.commit()

        # Reload with feed
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one()

        return SubscriptionResponse.model_validate(subscription)

    async def batch_delete_subscriptions(
        self, subscription_ids: list[str], user_id: str
    ) -> tuple[int, int, dict[str, list[str]]]:
        """
        Delete multiple subscriptions at once, with cleanup.

        This method performs the same cleanup as delete_subscription for each
        subscription, including UserEntry cleanup and orphan feed deletion.

        Args:
            subscription_ids: List of subscription identifiers.
            user_id: User identifier for authorization.

        Returns:
            Tuple of (deleted_count, failed_count, orphaned_feeds).
            orphaned_feeds is a dict mapping feed_id to list of entry_ids
            for feeds that were deleted because they no longer have any subscribers.
        """
        deleted_count = 0
        failed_count = 0
        feeds_to_check: list[str] = []

        for subscription_id in subscription_ids:
            stmt = select(Subscription).where(
                Subscription.id == subscription_id, Subscription.user_id == user_id
            )
            result = await self.session.execute(stmt)
            subscription = result.scalar_one_or_none()

            if subscription:
                feed_id = subscription.feed_id

                # 1. Delete user's UserEntry records for entries in this feed
                delete_user_entries_stmt = delete(UserEntry).where(
                    UserEntry.user_id == user_id,
                    UserEntry.entry_id.in_(select(Entry.id).where(Entry.feed_id == feed_id)),
                )
                await self.session.execute(delete_user_entries_stmt)

                # 2. Delete the subscription
                await self.session.delete(subscription)
                deleted_count += 1

                # Track feed_id for orphan check later (after all deletions)
                if feed_id not in feeds_to_check:
                    feeds_to_check.append(feed_id)
            else:
                failed_count += 1

        # 3. Check and cleanup orphan feeds
        orphaned_feeds: dict[str, list[str]] = {}
        for feed_id in feeds_to_check:
            orphaned_feed_id, entry_ids = await self._cleanup_orphan_feed(feed_id)
            if orphaned_feed_id:
                orphaned_feeds[orphaned_feed_id] = entry_ids

        await self.session.commit()
        return deleted_count, failed_count, orphaned_feeds
