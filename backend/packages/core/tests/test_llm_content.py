"""Tests for HTML extraction and LLM input truncation."""

import pytest

from glean_core.services.llm.content import extract_plain_text, truncate_for_llm


class TestExtractPlainText:
    def test_strips_script_style_iframe(self):
        html = """
            <p>Real content.</p>
            <script>alert('x')</script>
            <style>.red{color:red}</style>
            <iframe src="evil"></iframe>
            <noscript>noscript text</noscript>
            <form><input/></form>
            <p>More content.</p>
        """
        out = extract_plain_text(html)
        assert "alert" not in out
        assert "color:red" not in out
        assert "evil" not in out
        assert "noscript text" not in out
        assert "Real content." in out
        assert "More content." in out

    def test_preserves_paragraph_breaks(self):
        html = "<p>First.</p><p>Second.</p><p>Third.</p>"
        out = extract_plain_text(html)
        assert out.count("\n\n") >= 2

    def test_collapses_whitespace_within_paragraphs(self):
        html = "<p>Hello    world\n\n\n  there.</p>"
        out = extract_plain_text(html)
        assert out == "Hello world there."

    def test_handles_empty_input(self):
        assert extract_plain_text("") == ""
        assert extract_plain_text(None) == ""

    def test_handles_malformed_html(self):
        out = extract_plain_text("<p>unclosed <strong>tag")
        assert "unclosed" in out
        assert "tag" in out


class TestTruncateForLlm:
    def test_short_text_unchanged(self):
        text = "Hello world."
        assert truncate_for_llm(text, max_chars=100) == text

    def test_long_text_head_plus_tail(self):
        head = "A" * 4000
        middle = "B" * 5000
        tail = "C" * 2000
        text = head + middle + tail
        out = truncate_for_llm(text, max_chars=6000)
        assert out.startswith("A" * 4000)
        assert out.endswith("C" * 2000)
        assert "[...truncated...]" in out
        assert "B" not in out

    def test_at_threshold_unchanged(self):
        text = "x" * 6000
        assert truncate_for_llm(text, max_chars=6000) == text

    def test_one_over_threshold_truncates(self):
        text = "x" * 6001
        out = truncate_for_llm(text, max_chars=6000)
        assert "[...truncated...]" in out
        assert len(out) < 6500

    def test_invalid_max_chars_raises(self):
        with pytest.raises(ValueError):
            truncate_for_llm("abc", max_chars=0)
