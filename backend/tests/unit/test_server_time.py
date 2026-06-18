"""Tests for server timezone helpers."""

from datetime import UTC, date, datetime

from glean_core.server_time import get_server_day_range, get_server_timezone_name


def test_server_timezone_uses_tz_environment(monkeypatch):
    monkeypatch.setenv("TZ", "America/Los_Angeles")

    assert get_server_timezone_name() == "America/Los_Angeles"


def test_server_day_range_uses_server_timezone(monkeypatch):
    monkeypatch.setenv("TZ", "America/Los_Angeles")

    start_utc, end_utc, timezone = get_server_day_range(date(2026, 4, 18))

    assert timezone == "America/Los_Angeles"
    assert start_utc == datetime(2026, 4, 18, 7, 0, tzinfo=UTC)
    assert end_utc == datetime(2026, 4, 19, 7, 0, tzinfo=UTC)
