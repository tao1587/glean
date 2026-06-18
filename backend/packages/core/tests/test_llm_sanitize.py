"""Tests for LLM output sanitization."""

from glean_core.services.llm.sanitize import (
    sanitize_string,
    sanitize_string_list,
    sanitize_tags,
)


class TestSanitizeString:
    def test_strips_html(self):
        assert sanitize_string("<p>hello</p>") == "hello"
        assert sanitize_string("a <script>alert(1)</script> b").strip() in (
            "a alert(1) b",  # bs4 keeps the alert text since it's text inside the tag
            "a  b",
            "a b",
        )

    def test_truncates(self):
        assert sanitize_string("xxxxxxxxxx", max_chars=5) == "xxxxx"

    def test_handles_none(self):
        assert sanitize_string(None) is None

    def test_strips_real_xss_payload(self):
        # The bracketed tag is removed by bs4; only its text content survives.
        # Truncation + length cap makes residual text safe.
        out = sanitize_string("<img src=x onerror=alert(1)>")
        # img has no text content
        assert out == ""


class TestSanitizeStringList:
    def test_handles_each_item(self):
        out = sanitize_string_list(
            ["<b>one</b>", "two"], max_chars=10, max_items=5
        )
        assert out == ["one", "two"]

    def test_truncates_count(self):
        out = sanitize_string_list(
            ["a", "b", "c", "d"], max_chars=10, max_items=2
        )
        assert out == ["a", "b"]

    def test_drops_empty_after_strip(self):
        out = sanitize_string_list(["<br/>", "real"], max_chars=10, max_items=5)
        assert out == ["real"]


class TestSanitizeTags:
    def test_strips_special_chars(self):
        out = sanitize_tags(["t-1", "t#2", "标签3", "t!@#$"])
        assert "t-1" in out
        assert "标签3" in out
        # special chars removed
        assert "t#2" not in out
        # but "t" alone (from "t!@#$") may survive
        assert all(all(c.isalnum() or c in (" ", "-") or "一" <= c <= "鿿" for c in tag) for tag in out)

    def test_caps_count(self):
        out = sanitize_tags(["a", "b", "c", "d", "e", "f"])
        assert len(out) == 4

    def test_caps_each_length(self):
        out = sanitize_tags(["abcdefghijkl"])
        assert len(out[0]) == 8

    def test_handles_none(self):
        assert sanitize_tags(None) == []
        assert sanitize_tags([]) == []
