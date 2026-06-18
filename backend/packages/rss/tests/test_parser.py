"""Tests for RSS parser."""

import pytest

from glean_rss.parser import (
    MIN_FULL_CONTENT_TEXT_LENGTH,
    ParsedEntry,
    _extract_text_content,
    _get_favicon_url,
    _looks_like_full_content,
    _looks_like_html_document,
    parse_feed,
)


class TestFaviconURL:
    """Test favicon URL generation."""

    def test_get_favicon_url_valid_http(self) -> None:
        """Test favicon URL generation with valid HTTP URL."""
        url = "http://example.com/blog"
        result = _get_favicon_url(url)
        assert result == "https://www.google.com/s2/favicons?domain=example.com&sz=64"

    def test_get_favicon_url_valid_https(self) -> None:
        """Test favicon URL generation with valid HTTPS URL."""
        url = "https://example.com/blog"
        result = _get_favicon_url(url)
        assert result == "https://www.google.com/s2/favicons?domain=example.com&sz=64"

    def test_get_favicon_url_with_subdomain(self) -> None:
        """Test favicon URL generation with subdomain."""
        url = "https://blog.example.com"
        result = _get_favicon_url(url)
        assert result == "https://www.google.com/s2/favicons?domain=blog.example.com&sz=64"

    def test_get_favicon_url_with_port(self) -> None:
        """Test favicon URL generation with port."""
        url = "http://example.com:8080/blog"
        result = _get_favicon_url(url)
        assert result == "https://www.google.com/s2/favicons?domain=example.com:8080&sz=64"

    def test_get_favicon_url_none(self) -> None:
        """Test favicon URL generation with None."""
        result = _get_favicon_url(None)
        assert result is None

    def test_get_favicon_url_empty(self) -> None:
        """Test favicon URL generation with empty string."""
        result = _get_favicon_url("")
        assert result is None

    def test_get_favicon_url_invalid(self) -> None:
        """Test favicon URL generation with invalid URL."""
        result = _get_favicon_url("not-a-url")
        assert result is None

    def test_get_favicon_url_relative(self) -> None:
        """Test favicon URL generation with relative URL."""
        result = _get_favicon_url("/blog/feed")
        assert result is None


class TestContentDetection:
    """Test heuristics for feed-provided entry content."""

    def test_extract_text_content_strips_html(self) -> None:
        """HTML fragments should be normalized to visible text."""
        assert _extract_text_content("<p>Hello <strong>world</strong></p>") == "Hello world"

    def test_short_content_field_is_not_treated_as_full_article(self) -> None:
        """Short teaser content should still trigger full-text extraction later."""
        teaser = "We’re enhancing AI-driven news discovery and delivery."
        entry = ParsedEntry(
            {
                "link": "https://openai.com/index/conde-nast/",
                "title": "OpenAI partners with Condé Nast",
                "summary": teaser,
                "content": [{"value": f"<p>{teaser}</p>"}],
            }
        )

        assert entry.content == f"<p>{teaser}</p>"
        assert entry.has_full_content is False

    def test_long_content_field_is_treated_as_full_article(self) -> None:
        """Substantial HTML content should be kept without extra fetches."""
        body_text = " ".join(["full article content"] * (MIN_FULL_CONTENT_TEXT_LENGTH // 4 + 20))
        entry = ParsedEntry(
            {
                "link": "https://example.com/post",
                "title": "Long Post",
                "summary": "Short summary",
                "content": [{"value": f"<div><p>{body_text}</p></div>"}],
            }
        )

        assert entry.has_full_content is True

    def test_matching_summary_and_content_is_not_full_content(self) -> None:
        """Duplicated summary/content pairs are teasers, not article bodies."""
        teaser = "A concise introduction to the announcement."
        assert _looks_like_full_content(f"<p>{teaser}</p>", teaser) is False

    def test_relative_entry_url_resolves_against_feed_site(self) -> None:
        """Relative entry links should be normalized before downstream storage."""
        entry = ParsedEntry(
            {
                "link": "/blog/iccv-2021/",
                "title": "ICCV 2021",
            },
            base_url="http://ai.stanford.edu/blog/",
        )

        assert entry.url == "http://ai.stanford.edu/blog/iccv-2021/"
        assert entry.guid == "http://ai.stanford.edu/blog/iccv-2021/"


class TestParseFeed:
    """Feed parsing should normalize relative entry URLs."""

    @pytest.mark.asyncio
    async def test_parse_feed_resolves_relative_links(self) -> None:
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Stanford AI Lab Blog</title>
            <link>http://ai.stanford.edu/blog/</link>
            <description>Test feed</description>
            <item>
              <title>ICCV 2021</title>
              <link>/blog/iccv-2021/</link>
              <description>Summary only</description>
            </item>
          </channel>
        </rss>
        """

        parsed = await parse_feed(xml, "http://ai.stanford.edu/blog/feed.xml")

        assert parsed.entries[0].url == "http://ai.stanford.edu/blog/iccv-2021/"
        assert parsed.entries[0].guid == "http://ai.stanford.edu/blog/iccv-2021/"

    @pytest.mark.asyncio
    async def test_parse_feed_rejects_html_masquerading_as_feed(self) -> None:
        # Endpoint that turned into an SPA shell but still advertises RSS.
        # Unescaped inline JS makes feedparser bail with bozo + zero entries,
        # mirroring the real jina.ai/feed.rss breakage.
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<!DOCTYPE html><html><head><script>if (a && b) c < d;</script></head>"
            "<body>Not a feed</body></html>"
        )

        with pytest.raises(ValueError, match="HTML document, not a feed"):
            await parse_feed(body, "https://example.com/feed.rss")


class TestLooksLikeHtmlDocument:
    """HTML-as-feed detection used to triage dead endpoints."""

    def test_detects_doctype_after_xml_prolog(self) -> None:
        assert _looks_like_html_document('<?xml version="1.0"?>\n<!DOCTYPE html><html></html>')

    def test_detects_bare_html_root(self) -> None:
        assert _looks_like_html_document("<html><body>hi</body></html>")

    def test_real_feed_is_not_html(self) -> None:
        assert not _looks_like_html_document(
            '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'
        )
