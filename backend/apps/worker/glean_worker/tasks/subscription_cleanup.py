"""
Subscription cleanup tasks.

This module handles cleanup of orphan data when subscriptions are deleted.
With pgvector, entry_embeddings has ON DELETE CASCADE from entries, so
embeddings are automatically cleaned up when entries are deleted.
"""

from typing import Any

from glean_core import get_logger

logger = get_logger(__name__)


async def cleanup_orphan_embeddings(
    ctx: dict[str, Any], feed_id: str, entry_ids: list[str]
) -> dict[str, Any]:
    """
    Clean up embeddings for deleted entries.

    With pgvector and ON DELETE CASCADE, embeddings are removed automatically
    when entries are deleted from PostgreSQL. This task is kept for compatibility
    with the worker task registry but performs no additional work.

    Args:
        ctx: Worker context.
        feed_id: The deleted feed ID (for logging).
        entry_ids: List of entry IDs whose embeddings should be deleted.

    Returns:
        Result dict with success status and counts.
    """
    logger.info(
        f"Embedding cleanup for feed {feed_id} handled by CASCADE "
        f"({len(entry_ids)} entries)"
    )
    return {
        "success": True,
        "feed_id": feed_id,
        "deleted": len(entry_ids),
        "failed": 0,
    }
