"""
Entry service.

Handles entry retrieval and user-specific entry state management.
"""

import time as _time
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core import get_logger
from glean_core.schemas import (
    EntryListResponse,
    EntryResponse,
    UpdateEntryStateRequest,
)
from glean_core.server_time import get_server_day_range
from glean_database.models import (
    Bookmark,
    Entry,
    Feed,
    Folder,
    Subscription,
    User,
    UserEntry,
)

logger = get_logger(__name__)


class EntryService:
    """Entry management service."""

    def __init__(self, session: AsyncSession, redis_pool: ArqRedis | None = None):
        """
        Initialize entry service.

        Args:
            session: Database session.
            redis_pool: Optional Redis connection pool for task queue.
        """
        self.session = session
        self.redis_pool = redis_pool

    async def _get_folder_tree_ids(self, folder_id: str, user_id: str) -> list[str]:
        """
        Get all folder IDs in a folder tree (including the folder itself and all descendants).

        Args:
            folder_id: Root folder identifier.
            user_id: User identifier for authorization.

        Returns:
            List of folder IDs.
        """
        result_ids = [folder_id]

        # Find all child folders recursively
        async def get_children(parent_id: str) -> list[str]:
            stmt = select(Folder.id).where(
                Folder.parent_id == parent_id,
                Folder.user_id == user_id,
                Folder.type == "feed",
            )
            result = await self.session.execute(stmt)
            child_ids = [str(row[0]) for row in result.all()]

            all_ids = child_ids.copy()
            for child_id in child_ids:
                all_ids.extend(await get_children(child_id))
            return all_ids

        result_ids.extend(await get_children(folder_id))
        return result_ids

    async def get_entries(
        self,
        user_id: str,
        feed_id: str | None = None,
        folder_id: str | None = None,
        is_read: bool | None = None,
        read_later: bool | None = None,
        collected_after: datetime | None = None,
        collected_before: datetime | None = None,
        page: int = 1,
        per_page: int = 20,
        view: str = "timeline",
    ) -> EntryListResponse:
        """
        Get entries for a user with filtering and pagination.

        Args:
            user_id: User identifier.
            feed_id: Optional feed filter.
            folder_id: Optional folder filter (gets entries from all feeds in folder).
            is_read: Optional read status filter (None = all, True = read only, False = unread only).
            read_later: Optional read later filter.
            collected_after: Optional inclusive lower bound for collection-time filtering.
            collected_before: Optional exclusive upper bound for collection-time filtering.
            page: Page number (1-indexed).
            per_page: Items per page.
            view: View mode ("timeline" or "today-board").

        Returns:
            Paginated entry list response.
        """

        # Get user's subscribed feed IDs, optionally filtered by folder
        subscriptions_stmt = select(Subscription.feed_id).where(Subscription.user_id == user_id)

        # If folder_id is provided, get feeds in that folder (including nested folders)
        if folder_id:
            # Get all folder IDs (the folder itself and all its descendants)
            folder_ids = await self._get_folder_tree_ids(folder_id, user_id)
            subscriptions_stmt = subscriptions_stmt.where(Subscription.folder_id.in_(folder_ids))

        result = await self.session.execute(subscriptions_stmt)
        feed_ids = [row[0] for row in result.all()]

        if not feed_ids:
            return EntryListResponse(items=[], total=0, page=page, per_page=per_page, total_pages=0)

        collection_timestamp = func.coalesce(Entry.ingested_at, Entry.created_at, Entry.published_at)

        # Subquery to get bookmark_id for entry (limit 1 in case of duplicates)
        bookmark_id_subq = (
            select(Bookmark.id)
            .where(Bookmark.user_id == user_id)
            .where(Bookmark.entry_id == Entry.id)
            .correlate(Entry)
            .limit(1)
            .scalar_subquery()
        )

        # Build query for entries with bookmark info and feed info
        stmt = (
            select(
                Entry,
                UserEntry,
                bookmark_id_subq.label("bookmark_id"),
                Feed.title.label("feed_title"),
                Feed.icon_url.label("feed_icon_url"),
            )
            .join(Feed, Entry.feed_id == Feed.id)
            .outerjoin(
                UserEntry,
                (Entry.id == UserEntry.entry_id) & (UserEntry.user_id == user_id),
            )
            .where(Entry.feed_id.in_(feed_ids))
        )

        # Apply filters
        if feed_id:
            stmt = stmt.where(Entry.feed_id == feed_id)
        if is_read is not None:
            if is_read:
                stmt = stmt.where(UserEntry.is_read.is_(True))
            else:
                stmt = stmt.where((UserEntry.is_read.is_(False)) | (UserEntry.is_read.is_(None)))
        if read_later is not None:
            stmt = stmt.where(UserEntry.read_later == read_later)
        if collected_after is not None:
            stmt = stmt.where(collection_timestamp >= collected_after)
        if collected_before is not None:
            stmt = stmt.where(collection_timestamp < collected_before)

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0

        order_column = collection_timestamp if view == "today-board" else Entry.published_at
        stmt = stmt.order_by(desc(order_column), desc(Entry.id)).limit(per_page).offset((page - 1) * per_page)

        result = await self.session.execute(stmt)
        rows = result.all()

        # Build response items
        items: list[EntryResponse] = []
        for entry, user_entry, bookmark_id, feed_title, feed_icon_url in rows:
            items.append(
                EntryResponse(
                    id=str(entry.id),
                    feed_id=str(entry.feed_id),
                    url=str(entry.url),
                    title=str(entry.title),
                    author=entry.author,
                    content=entry.content,
                    summary=entry.summary,
                    content_backfill_status=entry.content_backfill_status,
                    content_backfill_attempts=entry.content_backfill_attempts,
                    content_backfill_at=entry.content_backfill_at,
                    content_backfill_error=entry.content_backfill_error,
                    content_source=entry.content_source,
                    published_at=entry.published_at,
                    ingested_at=entry.ingested_at,
                    created_at=entry.created_at,
                    is_read=bool(user_entry.is_read) if user_entry else False,
                    read_later=bool(user_entry.read_later) if user_entry else False,
                    read_later_until=(user_entry.read_later_until if user_entry else None),
                    read_at=user_entry.read_at if user_entry else None,
                    is_bookmarked=bookmark_id is not None,
                    bookmark_id=str(bookmark_id) if bookmark_id else None,
                    feed_title=feed_title,
                    feed_icon_url=feed_icon_url,
                )
            )

        # Calculate total pages
        total_pages = (total + per_page - 1) // per_page if total > 0 else 0

        return EntryListResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
        )

    async def get_entry(self, entry_id: str, user_id: str) -> EntryResponse:
        """
        Get a specific entry.

        Args:
            entry_id: Entry identifier.
            user_id: User identifier.

        Returns:
            Entry response.

        Raises:
            ValueError: If entry not found or user not subscribed.
        """
        # Subquery to get bookmark_id for entry (limit 1 in case of duplicates)
        bookmark_id_subq = (
            select(Bookmark.id)
            .where(Bookmark.user_id == user_id)
            .where(Bookmark.entry_id == Entry.id)
            .correlate(Entry)
            .limit(1)
            .scalar_subquery()
        )

        stmt = (
            select(
                Entry,
                UserEntry,
                bookmark_id_subq.label("bookmark_id"),
                Feed.title.label("feed_title"),
                Feed.icon_url.label("feed_icon_url"),
            )
            .join(Feed, Entry.feed_id == Feed.id)
            .outerjoin(
                UserEntry,
                (Entry.id == UserEntry.entry_id) & (UserEntry.user_id == user_id),
            )
            .where(Entry.id == entry_id)
        )
        result = await self.session.execute(stmt)
        row = result.one_or_none()

        if not row:
            raise ValueError("Entry not found")

        entry, user_entry, bookmark_id, feed_title, feed_icon_url = row

        # Verify user is subscribed to this feed
        sub_stmt = select(Subscription).where(
            Subscription.user_id == user_id, Subscription.feed_id == entry.feed_id
        )
        sub_result = await self.session.execute(sub_stmt)
        if not sub_result.scalar_one_or_none():
            raise ValueError("Not subscribed to this feed")

        return EntryResponse(
            id=str(entry.id),
            feed_id=str(entry.feed_id),
            url=str(entry.url),
            title=str(entry.title),
            author=entry.author,
            content=entry.content,
            summary=entry.summary,
            content_backfill_status=entry.content_backfill_status,
            content_backfill_attempts=entry.content_backfill_attempts,
            content_backfill_at=entry.content_backfill_at,
            content_backfill_error=entry.content_backfill_error,
            content_source=entry.content_source,
            published_at=entry.published_at,
            ingested_at=entry.ingested_at,
            created_at=entry.created_at,
            is_read=bool(user_entry.is_read) if user_entry else False,
            read_later=bool(user_entry.read_later) if user_entry else False,
            read_later_until=user_entry.read_later_until if user_entry else None,
            read_at=user_entry.read_at if user_entry else None,
            is_bookmarked=bookmark_id is not None,
            bookmark_id=str(bookmark_id) if bookmark_id else None,
            feed_title=feed_title,
            feed_icon_url=feed_icon_url,
        )

    async def update_entry_state(
        self, entry_id: str, user_id: str, update: UpdateEntryStateRequest
    ) -> EntryResponse:
        """
        Update user-specific entry state.

        Args:
            entry_id: Entry identifier.
            user_id: User identifier.
            update: State update data.

        Returns:
            Updated entry response.

        Raises:
            ValueError: If entry not found.
        """
        # Verify entry exists and user has access
        entry_stmt = select(Entry).where(Entry.id == entry_id)
        entry_result = await self.session.execute(entry_stmt)
        entry = entry_result.scalar_one_or_none()

        if not entry:
            raise ValueError("Entry not found")

        # Verify user is subscribed to this feed
        sub_stmt = select(Subscription).where(
            Subscription.user_id == user_id, Subscription.feed_id == entry.feed_id
        )
        sub_result = await self.session.execute(sub_stmt)
        if not sub_result.scalar_one_or_none():
            raise ValueError("Not subscribed to this feed")

        # Get or create UserEntry
        stmt = select(UserEntry).where(UserEntry.entry_id == entry_id, UserEntry.user_id == user_id)
        result = await self.session.execute(stmt)
        user_entry = result.scalar_one_or_none()

        if not user_entry:
            # Create new UserEntry
            user_entry = UserEntry(entry_id=entry_id, user_id=user_id)
            self.session.add(user_entry)

        # Update fields
        # Use model_dump(exclude_unset=True) to only update explicitly set fields
        now = datetime.now(UTC)
        update_data = update.model_dump(exclude_unset=True)

        if "is_read" in update_data and update.is_read is not None:
            user_entry.is_read = update.is_read
            if update.is_read:
                user_entry.read_at = now

        if "read_later" in update_data and update.read_later is not None:
            user_entry.read_later = update.read_later
            # Set read_later_until based on read_later_days
            if update.read_later:
                # Use days from request, then user settings, then default to 7
                days = update.read_later_days
                if days is None:
                    # Get user's default from settings
                    user_stmt = select(User).where(User.id == user_id)
                    user_result = await self.session.execute(user_stmt)
                    user = user_result.scalar_one_or_none()
                    if user and user.settings:
                        days = user.settings.get("read_later_days")
                    if days is None:
                        days = 7  # System default
                if days > 0:
                    user_entry.read_later_until = now + timedelta(days=days)
                else:
                    # 0 = never expire
                    user_entry.read_later_until = None
            else:
                # Clearing read_later, also clear read_later_until
                user_entry.read_later_until = None

        await self.session.commit()

        # Return updated entry
        return await self.get_entry(entry_id, user_id)

    async def search_entries(
        self,
        user_id: UUID,
        query: str,
        scope: Literal["all", "date", "week"] = "all",
        date: str | None = None,
        limit: int = 30,
    ) -> tuple[list[EntryResponse], int, int]:
        """
        Search entries by keyword across title and summary.

        Args:
            user_id: User identifier.
            query: Search query string (min 2, max 200 chars).
            scope: Time scope — 'all', 'date' (requires date param), or 'week'.
            date: ISO date string (YYYY-MM-DD), required when scope='date'.
            limit: Maximum number of results to return (capped at 100).

        Returns:
            Tuple of (items, total, took_ms).
        """
        user_id_str = str(user_id)
        query = query.strip()
        if len(query) < 2:
            return [], 0, 0

        limit = min(limit, 100)
        q_pattern = f"%{query}%"

        # Get subscribed feed IDs for this user
        subscriptions_stmt = select(Subscription.feed_id).where(
            Subscription.user_id == user_id_str
        )
        result = await self.session.execute(subscriptions_stmt)
        feed_ids = [row[0] for row in result.all()]

        if not feed_ids:
            return [], 0, 0

        # Subquery to get bookmark_id for entry (limit 1 in case of duplicates)
        bookmark_id_subq = (
            select(Bookmark.id)
            .where(Bookmark.user_id == user_id_str)
            .where(Bookmark.entry_id == Entry.id)
            .correlate(Entry)
            .limit(1)
            .scalar_subquery()
        )

        # Build base query
        stmt = (
            select(
                Entry,
                UserEntry,
                bookmark_id_subq.label("bookmark_id"),
                Feed.title.label("feed_title"),
                Feed.icon_url.label("feed_icon_url"),
            )
            .join(Feed, Entry.feed_id == Feed.id)
            .outerjoin(
                UserEntry,
                (Entry.id == UserEntry.entry_id) & (UserEntry.user_id == user_id_str),
            )
            .where(Entry.feed_id.in_(feed_ids))
            .where(or_(Entry.title.ilike(q_pattern), Entry.summary.ilike(q_pattern)))
        )

        # Apply scope filter
        if scope == "date":
            if date:
                from datetime import date as date_type

                try:
                    parsed_date = date_type.fromisoformat(date)
                except ValueError:
                    return [], 0, 0
                collected_after, collected_before, _ = get_server_day_range(parsed_date)
                stmt = stmt.where(Entry.published_at >= collected_after).where(
                    Entry.published_at < collected_before
                )
        elif scope == "week":
            week_ago = datetime.now(UTC) - timedelta(days=7)
            stmt = stmt.where(Entry.published_at >= week_ago)

        # Measure query time
        t0 = _time.perf_counter()

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Fetch results ordered by published_at DESC
        items_stmt = stmt.order_by(desc(Entry.published_at), desc(Entry.id)).limit(limit)
        result = await self.session.execute(items_stmt)
        rows = result.all()

        took_ms = int((_time.perf_counter() - t0) * 1000)

        items: list[EntryResponse] = []
        for entry, user_entry, bookmark_id, feed_title, feed_icon_url in rows:
            items.append(
                EntryResponse(
                    id=str(entry.id),
                    feed_id=str(entry.feed_id),
                    url=str(entry.url),
                    title=str(entry.title),
                    author=entry.author,
                    content=entry.content,
                    summary=entry.summary,
                    content_backfill_status=entry.content_backfill_status,
                    content_backfill_attempts=entry.content_backfill_attempts,
                    content_backfill_at=entry.content_backfill_at,
                    content_backfill_error=entry.content_backfill_error,
                    content_source=entry.content_source,
                    published_at=entry.published_at,
                    ingested_at=entry.ingested_at,
                    created_at=entry.created_at,
                    is_read=bool(user_entry.is_read) if user_entry else False,
                    read_later=bool(user_entry.read_later) if user_entry else False,
                    read_later_until=user_entry.read_later_until if user_entry else None,
                    read_at=user_entry.read_at if user_entry else None,
                    is_bookmarked=bookmark_id is not None,
                    bookmark_id=str(bookmark_id) if bookmark_id else None,
                    feed_title=feed_title,
                    feed_icon_url=feed_icon_url,
                )
            )

        return items, total, took_ms

    async def mark_all_read(
        self, user_id: str, feed_id: str | None = None, folder_id: str | None = None
    ) -> None:
        """
        Mark all entries as read.

        Args:
            user_id: User identifier.
            feed_id: Optional feed filter.
            folder_id: Optional folder filter.
        """
        # Get user's subscribed feed IDs
        subscriptions_stmt = select(Subscription.feed_id).where(Subscription.user_id == user_id)

        # If folder_id is provided, filter by feeds in that folder
        if folder_id:
            folder_ids = await self._get_folder_tree_ids(folder_id, user_id)
            subscriptions_stmt = subscriptions_stmt.where(Subscription.folder_id.in_(folder_ids))

        result = await self.session.execute(subscriptions_stmt)
        feed_ids = [row[0] for row in result.all()]

        if not feed_ids:
            return

        # Get all entries
        entries_stmt = select(Entry.id).where(Entry.feed_id.in_(feed_ids))
        if feed_id:
            entries_stmt = entries_stmt.where(Entry.feed_id == feed_id)

        result = await self.session.execute(entries_stmt)
        entry_ids = [row[0] for row in result.all()]

        # Update or create UserEntry records
        now = datetime.now(UTC)
        for entry_id in entry_ids:
            stmt = select(UserEntry).where(
                UserEntry.entry_id == entry_id, UserEntry.user_id == user_id
            )
            result = await self.session.execute(stmt)
            user_entry = result.scalar_one_or_none()

            if user_entry:
                user_entry.is_read = True
                user_entry.read_at = now
            else:
                user_entry = UserEntry(
                    entry_id=entry_id, user_id=user_id, is_read=True, read_at=now
                )
                self.session.add(user_entry)

        await self.session.commit()
