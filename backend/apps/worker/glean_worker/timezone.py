"""Worker timezone helpers."""

from datetime import UTC, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from glean_core import get_logger

logger = get_logger(__name__)
UTC_TIMEZONE_NAME = "UTC"


def resolve_worker_timezone(timezone_name: str) -> tzinfo:
    """Return the configured worker timezone, or UTC when unavailable."""
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning(
            "Worker timezone unavailable, falling back to UTC: "
            f"requested={timezone_name!r}. Install tzdata or use WORKER_TIMEZONE=UTC."
        )
        return UTC
