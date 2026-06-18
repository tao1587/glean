"""
Bookmark service.

Handles bookmark CRUD operations and folder associations.
"""

from math import ceil

from arq.connections import ArqRedis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_core import get_logger
from glean_core.schemas.bookmark import (
    BookmarkCreate,
    BookmarkFolderSimple,
    BookmarkListResponse,
    BookmarkResponse,
    BookmarkUpdate,
)
from glean_database.models import (
    Bookmark,
    BookmarkFolder,
    Entry,
    Folder,
)
from glean_rss import strip_html_tags

logger = get_logger(__name__)


class BookmarkService:
    """Bookmark management service."""

    def __init__(self, session: AsyncSession, redis_pool: ArqRedis | None = None):
        """
        Initialize bookmark service.

        Args:
            session: Database session.
            redis_pool: Optional Redis connection pool for task queue.
        """
        self.session = session
        self.redis_pool = redis_pool

    async def get_bookmarks(
        self,
        user_id: str,
        page: int = 1,
        per_page: int = 20,
        folder_id: str | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> BookmarkListResponse:
        """
        Get bookmarks for a user with filtering and pagination.

        Args:
            user_id: User identifier.
            page: Page number (1-based).
            per_page: Items per page.
            folder_id: Filter by folder.
            search: Search in title.
            sort: Sort field (created_at or title).
            order: Sort order (asc or desc).

        Returns:
            Paginated bookmark list response.
        """
        # Base query
        base_query = select(Bookmark).where(Bookmark.user_id == user_id)

        # Filter by folder
        if folder_id:
            base_query = base_query.join(BookmarkFolder).where(
                BookmarkFolder.folder_id == folder_id
            )

        # Search
        if search:
            base_query = base_query.where(Bookmark.title.ilike(f"%{search}%"))

        # Count total
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar_one()

        # Sorting
        order_column = getattr(Bookmark, sort, Bookmark.created_at)
        order_column = order_column.desc() if order == "desc" else order_column.asc()

        # Pagination
        query = (
            base_query.options(
                selectinload(Bookmark.bookmark_folders).selectinload(BookmarkFolder.folder),
            )
            .order_by(order_column)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        result = await self.session.execute(query)
        bookmarks = result.scalars().unique().all()

        # Build response
        items: list[BookmarkResponse] = []
        for bookmark in bookmarks:
            folders = [
                BookmarkFolderSimple(id=bf.folder.id, name=bf.folder.name)
                for bf in bookmark.bookmark_folders
            ]
            items.append(
                BookmarkResponse(
                    id=bookmark.id,
                    user_id=bookmark.user_id,
                    entry_id=bookmark.entry_id,
                    url=bookmark.url,
                    title=bookmark.title,
                    excerpt=bookmark.excerpt,
                    content=bookmark.content,
                    snapshot_status=bookmark.snapshot_status,
                    folders=folders,
                    created_at=bookmark.created_at,
                    updated_at=bookmark.updated_at,
                )
            )

        return BookmarkListResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            pages=ceil(total / per_page) if total > 0 else 1,
        )

    async def get_bookmark(self, bookmark_id: str, user_id: str) -> BookmarkResponse:
        """
        Get a specific bookmark.

        Args:
            bookmark_id: Bookmark identifier.
            user_id: User identifier for authorization.

        Returns:
            Bookmark response.

        Raises:
            ValueError: If bookmark not found or unauthorized.
        """
        stmt = (
            select(Bookmark)
            .where(Bookmark.id == bookmark_id, Bookmark.user_id == user_id)
            .options(
                selectinload(Bookmark.bookmark_folders).selectinload(BookmarkFolder.folder),
            )
        )
        result = await self.session.execute(stmt)
        bookmark = result.scalar_one_or_none()

        if not bookmark:
            raise ValueError("Bookmark not found")

        folders = [
            BookmarkFolderSimple(id=bf.folder.id, name=bf.folder.name)
            for bf in bookmark.bookmark_folders
        ]

        return BookmarkResponse(
            id=bookmark.id,
            user_id=bookmark.user_id,
            entry_id=bookmark.entry_id,
            url=bookmark.url,
            title=bookmark.title,
            excerpt=bookmark.excerpt,
            content=bookmark.content,
            snapshot_status=bookmark.snapshot_status,
            folders=folders,
            created_at=bookmark.created_at,
            updated_at=bookmark.updated_at,
        )

    async def create_bookmark(
        self, user_id: str, data: BookmarkCreate
    ) -> tuple[BookmarkResponse, bool]:
        """
        Create a new bookmark.

        Args:
            user_id: User identifier.
            data: Bookmark creation data.

        Returns:
            Tuple of (created bookmark response, needs_metadata_fetch flag).
            needs_metadata_fetch is True when title/excerpt need to be fetched
            asynchronously for URL bookmarks.

        Raises:
            ValueError: If entry not found or validation fails.
        """
        title = data.title
        excerpt = data.excerpt
        entry_id = data.entry_id
        url = data.url
        needs_metadata_fetch = False

        # If bookmarking an entry, get its details
        if entry_id:
            # Check if bookmark already exists for this entry
            existing_stmt = select(Bookmark).where(
                Bookmark.user_id == user_id,
                Bookmark.entry_id == entry_id,
            )
            existing_result = await self.session.execute(existing_stmt)
            existing_bookmark = existing_result.scalar_one_or_none()
            if existing_bookmark:
                # Return existing bookmark instead of creating duplicate
                return await self.get_bookmark(existing_bookmark.id, user_id), False

            stmt = select(Entry).where(Entry.id == entry_id)
            result = await self.session.execute(stmt)
            entry = result.scalar_one_or_none()
            if not entry:
                raise ValueError("Entry not found")
            url = url or entry.url
            title = title or entry.title
            # Use same logic as article list: content first, then summary
            if not excerpt:
                source_content = entry.content or entry.summary
                if source_content:
                    excerpt = strip_html_tags(source_content, max_length=200)
        elif url:
            # URL bookmark without title - need to fetch metadata asynchronously
            if not title:
                # Use URL as temporary title until metadata is fetched
                title = url
                needs_metadata_fetch = True
            elif not excerpt:
                # Have title but no excerpt - still fetch metadata for excerpt
                needs_metadata_fetch = True

        # Create bookmark
        bookmark = Bookmark(
            user_id=user_id,
            entry_id=entry_id,
            url=url,
            title=title,
            excerpt=excerpt,
            snapshot_status="pending",
        )
        self.session.add(bookmark)
        await self.session.flush()

        # Add folders
        for folder_id in data.folder_ids:
            # Verify folder exists and belongs to user
            folder_stmt = select(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == user_id,
                Folder.type == "bookmark",
            )
            folder_result = await self.session.execute(folder_stmt)
            if folder_result.scalar_one_or_none():
                self.session.add(BookmarkFolder(bookmark_id=bookmark.id, folder_id=folder_id))

        await self.session.commit()

        # Return with associations
        return await self.get_bookmark(bookmark.id, user_id), needs_metadata_fetch

    async def update_bookmark(
        self, bookmark_id: str, user_id: str, data: BookmarkUpdate
    ) -> BookmarkResponse:
        """
        Update a bookmark.

        Args:
            bookmark_id: Bookmark identifier.
            user_id: User identifier for authorization.
            data: Update data.

        Returns:
            Updated bookmark response.

        Raises:
            ValueError: If bookmark not found or unauthorized.
        """
        bookmark = await self._get_bookmark_or_raise(bookmark_id, user_id)

        if data.title is not None:
            bookmark.title = data.title
        if data.excerpt is not None:
            bookmark.excerpt = data.excerpt

        await self.session.commit()
        return await self.get_bookmark(bookmark_id, user_id)

    async def delete_bookmark(self, bookmark_id: str, user_id: str) -> None:
        """
        Delete a bookmark.

        Args:
            bookmark_id: Bookmark identifier.
            user_id: User identifier for authorization.

        Raises:
            ValueError: If bookmark not found or unauthorized.
        """
        bookmark = await self._get_bookmark_or_raise(bookmark_id, user_id)
        await self.session.delete(bookmark)
        await self.session.commit()

    async def add_folder(self, bookmark_id: str, user_id: str, folder_id: str) -> BookmarkResponse:
        """
        Add a folder to a bookmark.

        Args:
            bookmark_id: Bookmark identifier.
            user_id: User identifier for authorization.
            folder_id: Folder identifier.

        Returns:
            Updated bookmark response.

        Raises:
            ValueError: If bookmark/folder not found or unauthorized.
        """
        await self._get_bookmark_or_raise(bookmark_id, user_id)

        # Verify folder exists and belongs to user
        folder_stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user_id,
            Folder.type == "bookmark",
        )
        folder_result = await self.session.execute(folder_stmt)
        if not folder_result.scalar_one_or_none():
            raise ValueError("Folder not found")

        # Check if already exists
        existing_stmt = select(BookmarkFolder).where(
            BookmarkFolder.bookmark_id == bookmark_id,
            BookmarkFolder.folder_id == folder_id,
        )
        existing_result = await self.session.execute(existing_stmt)
        if not existing_result.scalar_one_or_none():
            self.session.add(BookmarkFolder(bookmark_id=bookmark_id, folder_id=folder_id))
            await self.session.commit()

        return await self.get_bookmark(bookmark_id, user_id)

    async def remove_folder(
        self, bookmark_id: str, user_id: str, folder_id: str
    ) -> BookmarkResponse:
        """
        Remove a folder from a bookmark.

        Args:
            bookmark_id: Bookmark identifier.
            user_id: User identifier for authorization.
            folder_id: Folder identifier.

        Returns:
            Updated bookmark response.

        Raises:
            ValueError: If bookmark not found or unauthorized.
        """
        await self._get_bookmark_or_raise(bookmark_id, user_id)

        stmt = select(BookmarkFolder).where(
            BookmarkFolder.bookmark_id == bookmark_id,
            BookmarkFolder.folder_id == folder_id,
        )
        result = await self.session.execute(stmt)
        bf = result.scalar_one_or_none()
        if bf:
            await self.session.delete(bf)
            await self.session.commit()

        return await self.get_bookmark(bookmark_id, user_id)

    async def _get_bookmark_or_raise(self, bookmark_id: str, user_id: str) -> Bookmark:
        """Get a bookmark by ID or raise ValueError."""
        stmt = select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == user_id)
        result = await self.session.execute(stmt)
        bookmark = result.scalar_one_or_none()
        if not bookmark:
            raise ValueError("Bookmark not found")
        return bookmark
