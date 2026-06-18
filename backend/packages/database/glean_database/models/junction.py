"""
Junction table models.

This module defines many-to-many relationship tables.
"""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class BookmarkFolder(Base):
    """
    Bookmark-Folder many-to-many relationship.

    Links bookmarks to folders (one bookmark can be in multiple folders).
    """

    __tablename__ = "bookmark_folders"

    bookmark_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookmarks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    folder_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("folders.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    bookmark = relationship("Bookmark", back_populates="bookmark_folders")
    folder = relationship("Folder", back_populates="bookmark_folders")
