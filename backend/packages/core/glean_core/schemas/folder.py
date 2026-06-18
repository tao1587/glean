"""
Folder schemas.

Pydantic models for folder-related API request/response handling.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderBase(BaseModel):
    """Base folder schema with common fields."""

    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(feed|bookmark)$")


class FolderCreate(FolderBase):
    """Schema for creating a new folder."""

    parent_id: str | None = None


class FolderUpdate(BaseModel):
    """Schema for updating a folder."""

    name: str | None = Field(None, min_length=1, max_length=100)


class FolderMove(BaseModel):
    """Schema for moving a folder."""

    parent_id: str | None = None


class FolderOrder(BaseModel):
    """Schema for reordering folders."""

    id: str
    position: int


class FolderReorder(BaseModel):
    """Schema for batch reordering folders."""

    orders: list[FolderOrder]


class FolderResponse(FolderBase):
    """Response schema for a single folder."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    parent_id: str | None
    position: int
    created_at: datetime
    updated_at: datetime


class FolderTreeNode(BaseModel):
    """Response schema for a folder tree node with children."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    type: str
    position: int
    children: list["FolderTreeNode"] = []


class FolderTreeResponse(BaseModel):
    """Response schema for the folder tree."""

    folders: list[FolderTreeNode]
