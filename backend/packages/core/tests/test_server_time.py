"""Tests for server_time helpers."""

from datetime import date

import pytest

from glean_core.server_time import get_server_day_range, get_server_period_range


@pytest.fixture(autouse=True)
def force_utc(monkeypatch: pytest.MonkeyPatch):
    """Pin all tests to UTC so assertions are deterministic."""
    monkeypatch.setenv("TZ", "UTC")


class TestGetServerPeriodRange:
    def test_week_anchor_mid_week_returns_monday_to_sunday(self):
        """2026-06-17 is a Wednesday; week should be Mon 2026-06-15 .. Sun 2026-06-21."""
        anchor = date(2026, 6, 17)
        after, before, tz = get_server_period_range(anchor, "week")

        expected_after, _, _ = get_server_day_range(date(2026, 6, 15))   # Monday
        _, expected_before, _ = get_server_day_range(date(2026, 6, 21))  # Sunday

        assert after == expected_after
        assert before == expected_before
        assert tz == "UTC"

    def test_week_anchor_monday_same_week(self):
        """Anchor on Monday should still return that week's range."""
        anchor = date(2026, 6, 15)  # Monday
        after, before, tz = get_server_period_range(anchor, "week")

        expected_after, _, _ = get_server_day_range(date(2026, 6, 15))
        _, expected_before, _ = get_server_day_range(date(2026, 6, 21))

        assert after == expected_after
        assert before == expected_before

    def test_week_anchor_sunday_same_week(self):
        """Anchor on Sunday should still return that same week's range."""
        anchor = date(2026, 6, 21)  # Sunday
        after, before, _ = get_server_period_range(anchor, "week")

        expected_after, _, _ = get_server_day_range(date(2026, 6, 15))
        _, expected_before, _ = get_server_day_range(date(2026, 6, 21))

        assert after == expected_after
        assert before == expected_before

    def test_month_june_2026_spans_full_month(self):
        """2026-06 should span 2026-06-01 00:00 UTC .. 2026-07-01 00:00 UTC."""
        anchor = date(2026, 6, 17)
        after, before, tz = get_server_period_range(anchor, "month")

        expected_after, _, _ = get_server_day_range(date(2026, 6, 1))
        _, expected_before, _ = get_server_day_range(date(2026, 6, 30))

        assert after == expected_after
        assert before == expected_before
        assert tz == "UTC"

    def test_month_january_31_days(self):
        """January has 31 days; end should align with Feb 1 start."""
        anchor = date(2026, 1, 15)
        after, before, _ = get_server_period_range(anchor, "month")

        expected_after, _, _ = get_server_day_range(date(2026, 1, 1))
        _, expected_before, _ = get_server_day_range(date(2026, 1, 31))

        assert after == expected_after
        assert before == expected_before

    def test_returns_timezone_name(self):
        """tz return value should match what get_server_day_range returns."""
        _, _, tz_period = get_server_period_range(date(2026, 6, 17), "week")
        _, _, tz_day = get_server_day_range(date(2026, 6, 15))
        assert tz_period == tz_day
