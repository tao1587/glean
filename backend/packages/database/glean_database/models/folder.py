"""
Folder model definition.

This module defines the Folder model for organizing subscriptions and bookmarks.
"""

from enum import Enum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class FolderType(str, Enum):
    """Folder type enumeration."""

    FEED = "feed"
    BOOKMARK = "bookmark"


class Folder(Base, TimestampMixin):
    """
    Folder model for organizing content.

    Supports hierarchical structure with parent-child relationships.
    Can be used for both feed subscriptions and bookmarks.

    Attributes:
        id: Unique folder identifier (UUID).
        user_id: Owner user reference.
        parent_id: Parent folder reference (null for root folders).
        name: Folder name.
        type: Folder type (feed or bookmark).
        position: Sort order position.
    """

    __tablename__ = "folders"

    # Primary key
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

    # Foreign keys
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Folder properties
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user = relationship("User", back_populates="folders")
    parent = relationship("Folder", back_populates="children", remote_side=[id])
    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="folder")
    bookmark_folders = relationship(
        "BookmarkFolder", back_populates="folder", cascade="all, delete-orphan"
    )

    # Constraints
    __table_args__ = (
        UniqueConstraint("user_id", "parent_id", "name", "type", name="uq_folder_name"),
        CheckConstraint("type IN ('feed', 'bookmark')", name="ck_folder_type"),
    )
