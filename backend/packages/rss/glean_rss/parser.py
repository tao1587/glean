"""
RSS/Atom feed parser.

Parses RSS and Atom feeds using feedparser.
"""

import html
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin, urlparse

import feedparser
from bs4 import BeautifulSoup
from feedparser import FeedParserDict

MIN_FULL_CONTENT_TEXT_LENGTH = 200


def _extract_text_content(value: Any) -> str:
    """Return normalized visible text from an HTML fragment or plain string."""
    if value is None:
        return ""

    soup = BeautifulSoup(str(value), "html.parser")
    return " ".join(soup.get_text(" ", strip=True).split())


def _looks_like_full_content(content: Any, summary: Any) -> bool:
    """
    Heuristically determine whether feed-provided content is likely a full article.

    Some publishers expose a `content` field that only contains a teaser sentence.
    Treat those entries as incomplete so the worker can fetch the article URL and
    extract the full body instead of storing the teaser as the article content.
    """
    content_text = _extract_text_content(content)
    if not content_text:
        return False

    summary_text = _extract_text_content(summary)
    if summary_text and content_text == summary_text:
        return False

    if len(content_text) < MIN_FULL_CONTENT_TEXT_LENGTH:
        return False

    return not (summary_text and len(content_text) <= len(summary_text) + 20)


def _get_favicon_url(site_url: str | None) -> str | None:
    """
    Generate favicon URL from site URL.

    Args:
        site_url: Website URL.

    Returns:
        Favicon URL or None if site_url is invalid.
    """
    if not site_url:
        return None

    try:
        parsed = urlparse(site_url)
        if not parsed.scheme or not parsed.netloc:
            return None

        # Use Google's favicon service for reliable favicon fetching
        domain = parsed.netloc
        return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
    except Exception:
        return None


class ParsedFeed:
    """Parsed feed metadata."""

    title: str
    description: str
    site_url: str
    language: str | None
    icon_url: str | None
    entries: list["ParsedEntry"]

    def __init__(self, data: FeedParserDict, feed_url: str):
        """
        Initialize from feedparser data.

        Args:
            data: Parsed feed data from feedparser.
        """
        # feedparser returns a FeedParserDict for the "feed" key
        feed_info: dict[str, Any] = dict(data.get("feed", {}))  # type: ignore[arg-type]
        self.title = html.unescape(str(feed_info.get("title", "")))
        self.description = html.unescape(str(feed_info.get("description", "")))
        self.site_url = str(feed_info.get("link", ""))
        self.language = feed_info.get("language")

        # Try to get icon from feed, fallback to favicon
        icon = feed_info.get("icon") or feed_info.get("logo")
        self.icon_url = str(icon) if icon else _get_favicon_url(self.site_url)

        # Get entries with proper type handling
        entries_data: list[dict[str, Any]] = list(data.get("entries", []))  # type: ignore[arg-type]
        entry_base_url = self.site_url or feed_url
        self.entries = [ParsedEntry(entry, base_url=entry_base_url) for entry in entries_data]


class ParsedEntry:
    """Parsed entry data."""

    def __init__(self, data: dict[str, Any], base_url: str | None = None):
        """
        Initialize from feedparser entry data.

        Args:
            data: Entry data from feedparser.
        """
        raw_guid = str(data.get("id") or data.get("link", ""))
        raw_url = str(data.get("link", ""))
        self.guid = _resolve_entry_url(raw_guid, base_url)
        self.url = _resolve_entry_url(raw_url, base_url)
        # Decode HTML entities in title
        raw_title = data.get("title", "")
        self.title = html.unescape(raw_title) if raw_title else ""
        self.author = data.get("author")
        self.summary = data.get("summary")

        # Get content (prefer content over summary)
        # Track whether the feed provides actual content or just summary/description
        content_list = data.get("content", [])
        if content_list:
            self.content = content_list[0].get("value")
            self.has_full_content = _looks_like_full_content(self.content, self.summary)
        else:
            self.content = data.get("summary")
            self.has_full_content = (
                False  # Only has summary/description, may need full-text extraction
            )

        # Parse published date
        published = data.get("published_parsed") or data.get("updated_parsed")
        if published:
            try:
                self.published_at = datetime(*published[:6], tzinfo=UTC)
            except (TypeError, ValueError):
                self.published_at = None
        else:
            self.published_at = None


async def parse_feed(content: str, url: str) -> ParsedFeed:
    """
    Parse RSS/Atom feed from content.

    Args:
        content: Feed XML content.
        url: Feed URL (used for relative link resolution).

    Returns:
        Parsed feed data.

    Raises:
        ValueError: If feed parsing fails.
    """
    data: FeedParserDict = feedparser.parse(content)  # type: ignore[reportUnknownMemberType]

    bozo: bool = bool(data.get("bozo", False))  # type: ignore[reportUnknownMemberType]
    entries: Any = data.get("entries")  # type: ignore[reportUnknownMemberType]
    if bozo and not entries:
        # feedparser already keeps partial results when *some* entries parse, so
        # reaching here means nothing was salvageable. A common real-world cause
        # is an endpoint that has quietly turned into an HTML page (SPA shell or
        # error page) while still advertising an RSS content-type. Surface that
        # distinctly so it gets triaged as a dead feed rather than transient noise.
        if _looks_like_html_document(content):
            raise ValueError(
                "Failed to parse feed: response body is an HTML document, not a feed "
                "(endpoint likely no longer serves RSS/Atom)"
            )
        raise ValueError(f"Failed to parse feed: {data.get('bozo_exception', 'Unknown error')}")

    return ParsedFeed(data, feed_url=url)


def _looks_like_html_document(content: str) -> bool:
    """Heuristically detect an HTML page being served in place of a feed.

    Some sources return their SPA shell or an error page (with an HTML doctype
    or <html> root) while keeping an RSS/Atom content-type, which feedparser
    cannot turn into entries.
    """
    # Skip a leading XML prolog / BOM / whitespace before sniffing the root element.
    head = content.lstrip("﻿ \t\r\n").lower()
    if head.startswith("<?xml"):
        head = head[head.find("?>") + 2 :].lstrip() if "?>" in head else head
    return head.startswith("<!doctype html") or head.startswith("<html")


def _resolve_entry_url(value: str, base_url: str | None) -> str:
    """Resolve relative feed entry URLs against the best available feed base URL."""
    if not value:
        return ""
    if not base_url:
        return value
    return urljoin(base_url, value)
