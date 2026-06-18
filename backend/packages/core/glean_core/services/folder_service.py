"""
Folder service.

Handles folder CRUD operations and tree management.
"""

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas.folder import (
    FolderCreate,
    FolderMove,
    FolderOrder,
    FolderResponse,
    FolderTreeNode,
    FolderTreeResponse,
    FolderUpdate,
)
from glean_database.models import Folder


class FolderService:
    """Folder management service."""

    MAX_DEPTH = 5  # Maximum folder nesting depth

    def __init__(self, session: AsyncSession):
        """
        Initialize folder service.

        Args:
            session: Database session.
        """
        self.session = session

    async def get_folders_tree(
        self, user_id: str, folder_type: str | None = None
    ) -> FolderTreeResponse:
        """
        Get all folders for a user as a tree structure.

        Args:
            user_id: User identifier.
            folder_type: Optional type filter (feed/bookmark).

        Returns:
            Folder tree response.
        """
        # Build query
        stmt = (
            select(Folder).where(Folder.user_id == user_id).order_by(Folder.position, Folder.name)
        )
        if folder_type:
            stmt = stmt.where(Folder.type == folder_type)

        result = await self.session.execute(stmt)
        all_folders = list(result.scalars().all())

        # Build tree
        folder_map: dict[str, FolderTreeNode] = {}
        root_folders: list[FolderTreeNode] = []

        # First pass: create nodes
        for folder in all_folders:
            folder_map[folder.id] = FolderTreeNode(
                id=folder.id,
                name=folder.name,
                type=folder.type,
                position=folder.position,
                children=[],
            )

        # Second pass: build tree structure
        for folder in all_folders:
            node = folder_map[folder.id]
            if folder.parent_id and folder.parent_id in folder_map:
                folder_map[folder.parent_id].children.append(node)
            else:
                root_folders.append(node)

        return FolderTreeResponse(folders=root_folders)

    async def get_folder(self, folder_id: str, user_id: str) -> FolderResponse:
        """
        Get a specific folder.

        Args:
            folder_id: Folder identifier.
            user_id: User identifier for authorization.

        Returns:
            Folder response.

        Raises:
            ValueError: If folder not found or unauthorized.
        """
        stmt = select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
        result = await self.session.execute(stmt)
        folder = result.scalar_one_or_none()

        if not folder:
            raise ValueError("Folder not found")

        return FolderResponse.model_validate(folder)

    async def create_folder(self, user_id: str, data: FolderCreate) -> FolderResponse:
        """
        Create a new folder.

        Args:
            user_id: User identifier.
            data: Folder creation data.

        Returns:
            Created folder response.

        Raises:
            ValueError: If parent folder not found or max depth exceeded.
        """
        # Validate parent folder
        depth = 1
        if data.parent_id:
            parent = await self._get_folder_or_raise(data.parent_id, user_id)
            depth = await self._get_folder_depth(data.parent_id) + 1
            if depth > self.MAX_DEPTH:
                raise ValueError(f"Maximum folder depth ({self.MAX_DEPTH}) exceeded")
            # Ensure parent has the same type
            if parent.type != data.type:
                raise ValueError("Folder type must match parent folder type")

        # Get next position
        next_position = await self._get_next_position(user_id, data.parent_id, data.type)

        # Create folder
        folder = Folder(
            user_id=user_id,
            parent_id=data.parent_id,
            name=data.name,
            type=data.type,
            position=next_position,
        )
        self.session.add(folder)
        await self.session.commit()
        await self.session.refresh(folder)

        return FolderResponse.model_validate(folder)

    async def update_folder(
        self, folder_id: str, user_id: str, data: FolderUpdate
    ) -> FolderResponse:
        """
        Update a folder.

        Args:
            folder_id: Folder identifier.
            user_id: User identifier for authorization.
            data: Update data.

        Returns:
            Updated folder response.

        Raises:
            ValueError: If folder not found or unauthorized.
        """
        folder = await self._get_folder_or_raise(folder_id, user_id)

        if data.name is not None:
            folder.name = data.name

        await self.session.commit()
        await self.session.refresh(folder)

        return FolderResponse.model_validate(folder)

    async def delete_folder(self, folder_id: str, user_id: str) -> None:
        """
        Delete a folder and handle children.

        Children folders are also deleted (cascade).
        Subscriptions/bookmarks in this folder have their folder_id set to NULL.

        Args:
            folder_id: Folder identifier.
            user_id: User identifier for authorization.

        Raises:
            ValueError: If folder not found or unauthorized.
        """
        folder = await self._get_folder_or_raise(folder_id, user_id)
        await self.session.delete(folder)
        await self.session.commit()

    async def move_folder(self, folder_id: str, user_id: str, data: FolderMove) -> FolderResponse:
        """
        Move a folder to a new parent.

        Args:
            folder_id: Folder identifier.
            user_id: User identifier for authorization.
            data: Move data with new parent_id.

        Returns:
            Updated folder response.

        Raises:
            ValueError: If folder not found, circular reference, or max depth exceeded.
        """
        folder = await self._get_folder_or_raise(folder_id, user_id)

        # Check for circular reference
        if data.parent_id:
            if data.parent_id == folder_id:
                raise ValueError("Cannot move folder to itself")

            # Check if new parent is a descendant
            if await self._is_descendant(data.parent_id, folder_id):
                raise ValueError("Cannot move folder to its own descendant")

            # Check depth
            new_depth = await self._get_folder_depth(data.parent_id) + 1
            subtree_depth = await self._get_subtree_max_depth(folder_id)
            if new_depth + subtree_depth > self.MAX_DEPTH:
                raise ValueError(f"Maximum folder depth ({self.MAX_DEPTH}) exceeded")

            # Validate parent exists and belongs to user
            parent = await self._get_folder_or_raise(data.parent_id, user_id)
            if parent.type != folder.type:
                raise ValueError("Folder type must match parent folder type")

        # Update position to end of new parent
        new_position = await self._get_next_position(user_id, data.parent_id, folder.type)

        folder.parent_id = data.parent_id
        folder.position = new_position

        await self.session.commit()
        await self.session.refresh(folder)

        return FolderResponse.model_validate(folder)

    async def reorder_folders(self, user_id: str, orders: list[FolderOrder]) -> None:
        """
        Batch update folder positions.

        Args:
            user_id: User identifier for authorization.
            orders: List of folder ID and position pairs.
        """
        for order in orders:
            stmt = (
                update(Folder)
                .where(Folder.id == order.id, Folder.user_id == user_id)
                .values(position=order.position)
            )
            await self.session.execute(stmt)
        await self.session.commit()

    async def _get_folder_or_raise(self, folder_id: str, user_id: str) -> Folder:
        """Get a folder by ID or raise ValueError."""
        stmt = select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
        result = await self.session.execute(stmt)
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("Folder not found")
        return folder

    async def _get_folder_depth(self, folder_id: str) -> int:
        """Calculate the depth of a folder in the tree."""
        depth = 0
        current_id = folder_id
        while current_id:
            stmt = select(Folder.parent_id).where(Folder.id == current_id)
            result = await self.session.execute(stmt)
            parent_id = result.scalar_one_or_none()
            if parent_id is None:
                break
            depth += 1
            current_id = parent_id
        return depth

    async def _get_subtree_max_depth(self, folder_id: str) -> int:
        """Get the maximum depth of a folder's subtree."""
        # Use recursive query for efficiency
        max_depth = 0
        to_process = [folder_id]
        current_depth = 0

        while to_process:
            stmt = select(Folder.id).where(Folder.parent_id.in_(to_process))
            result = await self.session.execute(stmt)
            children = [row[0] for row in result.fetchall()]
            if children:
                current_depth += 1
                max_depth = max(max_depth, current_depth)
                to_process = children
            else:
                break

        return max_depth

    async def _is_descendant(self, potential_descendant_id: str, ancestor_id: str) -> bool:
        """Check if a folder is a descendant of another folder."""
        current_id = potential_descendant_id
        while current_id:
            stmt = select(Folder.parent_id).where(Folder.id == current_id)
            result = await self.session.execute(stmt)
            parent_id = result.scalar_one_or_none()
            if parent_id == ancestor_id:
                return True
            current_id = parent_id
        return False

    async def _get_next_position(
        self, user_id: str, parent_id: str | None, folder_type: str
    ) -> int:
        """Get the next position for a folder in a parent."""
        stmt = select(func.max(Folder.position)).where(
            and_(
                Folder.user_id == user_id,
                Folder.parent_id == parent_id if parent_id else Folder.parent_id.is_(None),
                Folder.type == folder_type,
            )
        )
        result = await self.session.execute(stmt)
        max_position = result.scalar_one_or_none()
        return (max_position or 0) + 1
