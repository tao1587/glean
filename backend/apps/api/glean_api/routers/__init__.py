"""
API router modules.

This package contains all API route handlers organized by domain.
"""

from . import (
    admin,
    ai,
    api_tokens,
    auth,
    bookmarks,
    entries,
    feeds,
    folders,
    system,
)

__all__ = [
    "auth",
    "feeds",
    "entries",
    "admin",
    "ai",
    # M2 routers
    "folders",
    "bookmarks",
    "system",
    # MCP routers
    "api_tokens",
]
