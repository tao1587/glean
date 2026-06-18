"""Server timezone helpers."""

import os
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SERVER_TIMEZONE_FALLBACK = "UTC"
ZONEINFO_MARKER = "zoneinfo/"


def get_system_timezone_name() -> str | None:
    """Best-effort read of the operating system timezone name."""
    timezone_file = Path("/etc/timezone")
    if timezone_file.exists():
        timezone_name = timezone_file.read_text(encoding="utf-8").strip()
        if timezone_name:
            return timezone_name

    localtime_file = Path("/etc/localtime")
    if localtime_file.is_symlink():
        target = str(localtime_file.resolve())
        if ZONEINFO_MARKER in target:
            return target.split(ZONEINFO_MARKER, 1)[1]

    return None


def get_server_timezone_name() -> str:
    """Return the server-configured IANA timezone name."""
    return os.environ.get("TZ") or get_system_timezone_name() or SERVER_TIMEZONE_FALLBACK


def get_server_timezone() -> ZoneInfo:
    """Return the server-configured timezone."""
    timezone_name = get_server_timezone_name()
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Invalid server timezone: {timezone_name}") from exc


def get_server_now() -> datetime:
    """Return current time in the server-configured timezone."""
    return datetime.now(get_server_timezone())


def get_server_date() -> date:
    """Return current date in the server-configured timezone."""
    return get_server_now().date()


def get_server_day_range(server_date: date) -> tuple[datetime, datetime, str]:
    """Convert a server-local date to a UTC half-open range."""
    timezone_name = get_server_timezone_name()
    timezone = get_server_timezone()
    start_local = datetime.combine(server_date, time.min, timezone)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC), timezone_name
