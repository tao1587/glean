"""
RSS feed discovery.

Discovers RSS/Atom feeds from websites, with fallbacks for HTML-only sites:
suffix probing, JSON-LD ItemList synthesis, and sitemap.xml synthesis.
"""

import asyncio
import os
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .parser import parse_feed
from .synthetic import (
    MAX_SITEMAP_BODY_BYTES,
    MAX_SITEMAP_CHILD_FETCHES,
    SitemapEntry,
    SyntheticEntry,
    canonicalize_entry_url,
    extract_jsonld_itemlist,
    filter_sitemap_entries,
    parse_sitemap_xml,
)

_USER_AGENT = "Mozilla/5.0 (compatible; GleanRSSReader/1.0; +https://github.com/glean)"

_FEED_ROOT_TOKENS = ("<?xml", "<rss", "<feed", "<rdf:rdf", "<rdf ")

SOURCE_TYPE_FEED = "feed"
SOURCE_TYPE_SYNTHETIC_JSONLD = "synthetic_jsonld"
SOURCE_TYPE_SYNTHETIC_SITEMAP = "synthetic_sitemap"

_SUFFIX_CANDIDATES: tuple[str, ...] = (
    "/feed",
    "/rss",
    "/atom.xml",
    "/feed.xml",
    "/index.xml",
    "/rss.xml",
    "/feeds/all.atom.xml",
)


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", ""}


def _suffix_probing_enabled() -> bool:
    return _env_flag("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", True)


def _jsonld_fallback_enabled() -> bool:
    return _env_flag("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", True)


def _sitemap_fallback_enabled() -> bool:
    return _env_flag("GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED", True)


def _looks_like_feed_document(body: str) -> bool:
    """Return True iff `body` begins (ignoring BOM/whitespace) with a feed root."""
    stripped = body.lstrip("\ufeff \t\r\n").lower()
    return any(stripped.startswith(token) for token in _FEED_ROOT_TOKENS)


class FeedNotFoundError(ValueError):
    """Raised when a URL is reachable but exposes no discoverable RSS/Atom feed."""


def _origin(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


async def _try_parse_feed_response(client: httpx.AsyncClient, url: str) -> tuple[str, str] | None:
    """Fetch `url` and try to parse as a feed. Return (url, title) or None."""
    try:
        response = await client.get(url)
        response.raise_for_status()
    except httpx.HTTPError:
        return None
    body = response.text
    content_type = response.headers.get("content-type", "").lower()
    looks_feed = (
        "xml" in content_type
        or "rss" in content_type
        or "atom" in content_type
        or _looks_like_feed_document(body)
    )
    if not looks_feed:
        return None
    try:
        feed = await parse_feed(body, url)
    except ValueError:
        return None
    return url, str(feed.title)


async def _stage_a_suffix_probe(
    client: httpx.AsyncClient, source_url: str
) -> tuple[str, str] | None:
    """Probe well-known feed suffixes in parallel; return first hit."""
    origin = _origin(source_url)
    if not origin:
        return None
    candidates = [f"{origin}{suffix}" for suffix in _SUFFIX_CANDIDATES]
    tasks = [asyncio.create_task(_try_parse_feed_response(client, c)) for c in candidates]
    try:
        for coro in asyncio.as_completed(tasks):
            result = await coro
            if result is not None:
                return result
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
    return None


async def _stage_c_fetch_sitemap_entries(
    client: httpx.AsyncClient, source_url: str
) -> list[SitemapEntry]:
    """Try /sitemap.xml then /sitemap_index.xml; follow up to N child sitemaps."""
    origin = _origin(source_url)
    if not origin:
        return []

    collected: list[SitemapEntry] = []
    for root_path in ("/sitemap.xml", "/sitemap_index.xml"):
        root_url = f"{origin}{root_path}"
        try:
            response = await client.get(root_url)
            response.raise_for_status()
        except httpx.HTTPError:
            continue
        if len(response.content) > MAX_SITEMAP_BODY_BYTES:
            continue
        entries, children = parse_sitemap_xml(response.text)
        if entries:
            collected.extend(entries)
        fetched_children = 0
        for child_url in children:
            if fetched_children >= MAX_SITEMAP_CHILD_FETCHES:
                break
            try:
                child_response = await client.get(child_url)
                child_response.raise_for_status()
            except httpx.HTTPError:
                continue
            if len(child_response.content) > MAX_SITEMAP_BODY_BYTES:
                continue
            child_entries, _ = parse_sitemap_xml(child_response.text)
            collected.extend(child_entries)
            fetched_children += 1
        if collected:
            break
    return collected


async def discover_feed(url: str, timeout: int = 30) -> tuple[str, str, str]:
    """
    Discover RSS feed URL from a given URL.

    Tries, in order:
    1. Parse URL directly as RSS (when content-type indicates XML/RSS/Atom).
    2. Find RSS link in HTML page.
    3. Body-guard fallback: parse URL as RSS if body starts with a feed root token.
    4. Stage A (suffix probing): /feed, /rss, /atom.xml, ...
    5. Stage B (JSON-LD ItemList synthesis).
    6. Stage C (sitemap.xml synthesis).

    Returns:
        Tuple of (feed_url, feed_title, source_type).

    Raises:
        FeedNotFoundError: URL is reachable but no feed found.
        ValueError: URL could not be fetched.
    """
    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
    ) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(f"Failed to fetch URL: {e}") from e

        content_type = response.headers.get("content-type", "").lower()
        landing_body = response.text

        if "xml" in content_type or "rss" in content_type or "atom" in content_type:
            try:
                feed = await parse_feed(landing_body, url)
                return url, str(feed.title), SOURCE_TYPE_FEED
            except ValueError:
                pass

        if "html" in content_type or not content_type:
            soup = BeautifulSoup(response.content, "lxml")
            feed_links = soup.find_all(
                "link",
                attrs={"type": ["application/rss+xml", "application/atom+xml", "application/xml"]},
            )
            for link in feed_links:
                href = link.get("href")
                if not href:
                    continue
                feed_url_str = str(href) if not isinstance(href, str) else href
                if not feed_url_str.startswith("http"):
                    feed_url_str = urljoin(url, feed_url_str)
                try:
                    feed_response = await client.get(feed_url_str)
                    feed_response.raise_for_status()
                    feed = await parse_feed(feed_response.text, feed_url_str)
                    return feed_url_str, str(feed.title), SOURCE_TYPE_FEED
                except (httpx.HTTPError, ValueError):
                    continue

        if _looks_like_feed_document(landing_body):
            try:
                feed = await parse_feed(landing_body, url)
                return url, str(feed.title), SOURCE_TYPE_FEED
            except ValueError:
                pass

        if _suffix_probing_enabled():
            hit = await _stage_a_suffix_probe(client, url)
            if hit is not None:
                feed_url_str, title = hit
                return feed_url_str, title, SOURCE_TYPE_FEED

        if _jsonld_fallback_enabled() and ("html" in content_type or not content_type):
            title, entries = extract_jsonld_itemlist(landing_body)
            if entries:
                return url, title or url, SOURCE_TYPE_SYNTHETIC_JSONLD

        if _sitemap_fallback_enabled():
            sitemap_entries = await _stage_c_fetch_sitemap_entries(client, url)
            if sitemap_entries:
                origin = _origin(url)
                kept = filter_sitemap_entries(sitemap_entries, origin=origin)
                if kept:
                    sitemap_url = f"{origin}/sitemap.xml"
                    title = _extract_html_title(landing_body) or origin
                    return sitemap_url, title, SOURCE_TYPE_SYNTHETIC_SITEMAP

        raise FeedNotFoundError(
            "No RSS/Atom feed found at this URL "
            '(no <link rel="alternate"> tag and response is not a feed document)'
        )


def _extract_html_title(html: str) -> str:
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        return ""
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return ""


async def _synthesize_from_landing(client: httpx.AsyncClient, landing_url: str) -> str | None:
    """Fetch landing URL and synthesize RSS from JSON-LD ItemList. Return XML or None."""
    try:
        response = await client.get(landing_url)
        response.raise_for_status()
    except httpx.HTTPError:
        return None
    title, entries = extract_jsonld_itemlist(response.text)
    if not entries:
        return None
    from .synthetic import synthesize_rss

    return synthesize_rss(title or landing_url, landing_url, entries)


async def _synthesize_from_sitemap(client: httpx.AsyncClient, sitemap_url: str) -> str | None:
    """Fetch sitemap and synthesize RSS from its URL entries. Return XML or None."""
    origin = _origin(sitemap_url)
    sitemap_entries = await _stage_c_fetch_sitemap_entries(client, sitemap_url)
    if not sitemap_entries:
        return None
    kept = filter_sitemap_entries(sitemap_entries, origin=origin)
    if not kept:
        return None
    syn_entries: list[SyntheticEntry] = []
    for e in kept:
        try:
            canonical = canonicalize_entry_url(e.loc)
        except ValueError:
            continue
        syn_entries.append(
            SyntheticEntry(
                title="",
                link=canonical,
                guid=canonical,
                published_at=e.lastmod,
            )
        )
    if not syn_entries:
        return None
    from .synthetic import synthesize_rss

    return synthesize_rss(origin or sitemap_url, origin or sitemap_url, syn_entries)


async def fetch_or_synthesize_feed(
    url: str,
    source_type: str,
    etag: str | None = None,
    last_modified: str | None = None,
) -> tuple[str, dict[str, str]] | None:
    """Dispatch by source_type: direct fetch for feed/rsshub, synthesize for synthetic_*.

    Synthetic feeds ignore etag/last_modified and always re-synthesize.
    """
    if source_type in (SOURCE_TYPE_SYNTHETIC_JSONLD, SOURCE_TYPE_SYNTHETIC_SITEMAP):
        async with httpx.AsyncClient(
            timeout=30, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
        ) as client:
            if source_type == SOURCE_TYPE_SYNTHETIC_JSONLD:
                xml = await _synthesize_from_landing(client, url)
            else:
                xml = await _synthesize_from_sitemap(client, url)
            if xml is None:
                raise ValueError(
                    f"Failed to synthesize feed from {source_type} source: no entries extractable"
                )
            return xml, {}

    return await fetch_feed(url, etag=etag, last_modified=last_modified)


async def fetch_feed(
    url: str, etag: str | None = None, last_modified: str | None = None
) -> tuple[str, dict[str, str]] | None:
    """
    Fetch feed content with conditional request support.

    Retries once on server errors (5xx) to handle CDN warmup issues.
    """
    headers = {"User-Agent": _USER_AGENT}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = await client.get(url)

                if response.status_code == 304:
                    return None

                if response.status_code >= 500 and attempt == 0:
                    await asyncio.sleep(1)
                    continue

                response.raise_for_status()

                cache_headers: dict[str, str] = {}
                if "etag" in response.headers:
                    cache_headers["etag"] = response.headers["etag"]
                if "last-modified" in response.headers:
                    cache_headers["last-modified"] = response.headers["last-modified"]

                return response.text, cache_headers

            except httpx.HTTPError as e:
                last_error = e
                # Immediate retries amplify upstream limits and cannot repair client errors.
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500:
                    break
                if attempt == 0:
                    await asyncio.sleep(1)

        raise ValueError(f"Failed to fetch feed: {last_error!r}") from last_error
