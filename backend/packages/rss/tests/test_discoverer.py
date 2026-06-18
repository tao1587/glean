"""Tests for RSS feed discovery."""

from collections.abc import Callable
from unittest.mock import patch

import httpx
import pytest

from glean_rss.discoverer import (
    SOURCE_TYPE_FEED,
    SOURCE_TYPE_SYNTHETIC_JSONLD,
    SOURCE_TYPE_SYNTHETIC_SITEMAP,
    FeedNotFoundError,
    discover_feed,
)

_HTML_NO_FEED = """<!DOCTYPE html>
<html>
<head><title>Example</title></head>
<body><h1>No feed here</h1></body>
</html>
"""

_HTML_WITH_LINK = """<!DOCTYPE html>
<html>
<head>
<link rel="alternate" type="application/rss+xml" href="/feed.xml" />
</head>
<body></body>
</html>
"""

_RSS_DOC = """<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
    <item>
      <title>Post</title>
      <link>https://example.com/post</link>
      <guid>1</guid>
    </item>
  </channel>
</rss>
"""


def _install_mock_transport(handler: Callable[[httpx.Request], httpx.Response]) -> None:
    """Patch httpx.AsyncClient so every instance uses a MockTransport.

    The discoverer constructs its own `AsyncClient`; wrapping the constructor
    lets us intercept requests without depending on respx or monkeypatching the
    module under test.
    """
    original_init = httpx.AsyncClient.__init__

    def patched_init(self: httpx.AsyncClient, *args: object, **kwargs: object) -> None:
        kwargs["transport"] = httpx.MockTransport(handler)
        original_init(self, *args, **kwargs)  # type: ignore[arg-type]

    patcher = patch.object(httpx.AsyncClient, "__init__", patched_init)
    patcher.start()


@pytest.fixture(autouse=True)
def _restore_httpx() -> None:
    """Ensure patching from `_install_mock_transport` is torn down."""
    yield
    patch.stopall()


class TestDiscoverFeedNotFound:
    """Assert the dedicated `FeedNotFoundError` is raised when no feed exists."""

    @pytest.mark.asyncio
    async def test_html_without_feed_link_raises_feed_not_found(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError) as exc_info:
            await discover_feed("https://example.com/")

        message = str(exc_info.value)
        assert "No RSS/Atom feed found" in message
        # Must still be a ValueError for callers that catch the base class.
        assert isinstance(exc_info.value, ValueError)

    @pytest.mark.asyncio
    async def test_html_without_feed_does_not_leak_parser_bozo_message(self) -> None:
        """Regression: router used to surface `<unknown>:N:M: not well-formed`."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError) as exc_info:
            await discover_feed("https://example.com/")

        assert "not well-formed" not in str(exc_info.value)
        assert "invalid token" not in str(exc_info.value)


class TestDiscoverFeedHappyPaths:
    """Ensure existing success paths still work with the new exception class."""

    @pytest.mark.asyncio
    async def test_direct_xml_url_returns_same_url(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                text=_RSS_DOC,
                headers={"content-type": "application/rss+xml"},
            )

        _install_mock_transport(handler)

        feed_url, title, _source_type = await discover_feed("https://example.com/feed.xml")

        assert feed_url == "https://example.com/feed.xml"
        assert title == "Example Feed"

    @pytest.mark.asyncio
    async def test_html_with_alternate_link_follows_and_parses(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200,
                    text=_HTML_WITH_LINK,
                    headers={"content-type": "text/html"},
                )
            if request.url.path == "/feed.xml":
                return httpx.Response(
                    200,
                    text=_RSS_DOC,
                    headers={"content-type": "application/rss+xml"},
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        feed_url, title, _source_type = await discover_feed("https://example.com/")

        assert feed_url == "https://example.com/feed.xml"
        assert title == "Example Feed"

    @pytest.mark.asyncio
    async def test_mislabelled_content_type_falls_back_to_body_parse(self) -> None:
        """CDN returns text/plain but body is RSS: fallback at end of discoverer."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text=_RSS_DOC, headers={"content-type": "text/plain"})

        _install_mock_transport(handler)

        feed_url, title, _source_type = await discover_feed("https://example.com/rss")

        assert feed_url == "https://example.com/rss"
        assert title == "Example Feed"


class TestDiscoverFeedTransient:
    """Transient fetch failures remain plain `ValueError` (not FeedNotFoundError)."""

    @pytest.mark.asyncio
    async def test_http_error_is_plain_value_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="service unavailable")

        _install_mock_transport(handler)

        with pytest.raises(ValueError) as exc_info:
            await discover_feed("https://example.com/")

        assert not isinstance(exc_info.value, FeedNotFoundError)
        assert "Failed to fetch URL" in str(exc_info.value)


_HTML_WITH_JSONLD = """<!DOCTYPE html>
<html><head>
<title>Blog Home</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Latest Posts",
  "itemListElement": [
    {"@type": "ListItem", "url": "https://example.com/post-a", "name": "Post A"},
    {"@type": "ListItem", "url": "https://example.com/post-b", "name": "Post B"}
  ]
}
</script>
</head><body><h1>Blog</h1></body></html>
"""

_SITEMAP_XML = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/posts/a</loc><lastmod>2026-04-20T10:00:00Z</lastmod></url>
  <url><loc>https://example.com/posts/b</loc><lastmod>2026-04-15T10:00:00Z</lastmod></url>
</urlset>
"""


class TestDiscoverFeedStageASuffixProbing:
    """Stage A: probe /feed, /rss, /atom.xml, ... when <link> autodiscovery fails."""

    @pytest.mark.asyncio
    async def test_suffix_probe_finds_feed_xml(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_NO_FEED, headers={"content-type": "text/html"}
                )
            if request.url.path == "/feed.xml":
                return httpx.Response(
                    200, text=_RSS_DOC, headers={"content-type": "application/rss+xml"}
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        feed_url, title, source_type = await discover_feed("https://example.com/")

        assert feed_url == "https://example.com/feed.xml"
        assert title == "Example Feed"
        assert source_type == SOURCE_TYPE_FEED

    @pytest.mark.asyncio
    async def test_suffix_hit_with_html_body_is_rejected(self) -> None:
        """Some sites return HTML at /feed — must not subscribe as empty feed."""

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_NO_FEED, headers={"content-type": "text/html"}
                )
            # Every suffix returns HTML (no feed body).
            return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError):
            await discover_feed("https://example.com/")

    @pytest.mark.asyncio
    async def test_suffix_probing_disabled_via_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED", "false")

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_NO_FEED, headers={"content-type": "text/html"}
                )
            if request.url.path == "/feed.xml":
                return httpx.Response(
                    200, text=_RSS_DOC, headers={"content-type": "application/rss+xml"}
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError):
            await discover_feed("https://example.com/")


class TestDiscoverFeedStageBJsonLd:
    """Stage B: synthesize feed from JSON-LD ItemList when suffix probes fail."""

    @pytest.mark.asyncio
    async def test_jsonld_itemlist_synthesizes_feed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", "false")

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_WITH_JSONLD, headers={"content-type": "text/html"}
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        feed_url, title, source_type = await discover_feed("https://example.com/")

        assert feed_url == "https://example.com/"
        assert title == "Blog Home"
        assert source_type == SOURCE_TYPE_SYNTHETIC_JSONLD

    @pytest.mark.asyncio
    async def test_jsonld_fallback_disabled_falls_through(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED", "false")

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, text=_HTML_WITH_JSONLD, headers={"content-type": "text/html"}
            )

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError):
            await discover_feed("https://example.com/")


class TestDiscoverFeedStageCSitemap:
    """Stage C: synthesize feed from sitemap.xml when JSON-LD is absent."""

    @pytest.mark.asyncio
    async def test_sitemap_synthesizes_feed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", "false")

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_NO_FEED, headers={"content-type": "text/html"}
                )
            if request.url.path == "/sitemap.xml":
                return httpx.Response(
                    200, text=_SITEMAP_XML, headers={"content-type": "application/xml"}
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        feed_url, _title, source_type = await discover_feed("https://example.com/")

        assert feed_url == "https://example.com/sitemap.xml"
        assert source_type == SOURCE_TYPE_SYNTHETIC_SITEMAP

    @pytest.mark.asyncio
    async def test_sitemap_disabled_via_env_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", "false")
        monkeypatch.setenv("GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED", "false")

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(
                    200, text=_HTML_NO_FEED, headers={"content-type": "text/html"}
                )
            if request.url.path == "/sitemap.xml":
                return httpx.Response(
                    200, text=_SITEMAP_XML, headers={"content-type": "application/xml"}
                )
            return httpx.Response(404)

        _install_mock_transport(handler)

        with pytest.raises(FeedNotFoundError):
            await discover_feed("https://example.com/")
