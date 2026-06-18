"""Synthetic feed synthesis: landing-page and sitemap-based fallbacks.

Used when a site exposes no RSS/Atom feed via content-type, <link> tag, or
suffix probe, but we can still build a synthetic entry list from structured
data (JSON-LD ItemList) or sitemap.xml.
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import format_datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

from bs4 import BeautifulSoup

_TRACKING_PARAM_PREFIXES: tuple[str, ...] = ("utm_", "mc_")
_TRACKING_PARAM_KEYS: frozenset[str] = frozenset(
    {"fbclid", "gclid", "_ga", "ref", "source", "campaign", "spm"}
)
_DEFAULT_PORTS: dict[str, int] = {"http": 80, "https": 443}


def canonicalize_entry_url(url: str) -> str:
    """Return a normalized form of `url` suitable for stable guid/link usage.

    Normalizations:
    - Scheme/host lowercased; default port stripped.
    - Fragment removed.
    - Tracking query params removed (utm_*, mc_*, fbclid, gclid, _ga, ref,
      source, campaign, spm).
    - Remaining query params sorted lexicographically.
    - Trailing slash removed except on the root path.
    """
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {url!r}")

    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    port = parsed.port
    if port is not None and _DEFAULT_PORTS.get(scheme) == port:
        netloc = hostname
    elif port is not None:
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname

    path = parsed.path
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    if not path:
        path = "/"

    cleaned_params: list[tuple[str, str]] = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        lower_key = key.lower()
        if lower_key in _TRACKING_PARAM_KEYS:
            continue
        if any(lower_key.startswith(prefix) for prefix in _TRACKING_PARAM_PREFIXES):
            continue
        cleaned_params.append((key, value))
    cleaned_params.sort()
    query = urlencode(cleaned_params)

    return urlunparse((scheme, netloc, path, "", query, ""))


@dataclass(frozen=True)
class SyntheticEntry:
    """One entry in a synthesized feed."""

    title: str
    link: str
    guid: str
    published_at: datetime | None = None
    description: str = ""


def _iter_jsonld_blocks(html: str) -> list[Any]:
    soup = BeautifulSoup(html, "lxml")
    blocks: list[Any] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return blocks


def _iter_itemlist_nodes(node: Any) -> list[dict[str, Any]]:
    """Yield dicts whose @type == ItemList from arbitrary JSON-LD shapes."""
    if isinstance(node, dict):
        node_type = node.get("@type")
        types = node_type if isinstance(node_type, list) else [node_type]
        if "ItemList" in types:
            return [node]
        graph = node.get("@graph")
        if isinstance(graph, list):
            results: list[dict[str, Any]] = []
            for child in graph:
                results.extend(_iter_itemlist_nodes(child))
            return results
    if isinstance(node, list):
        results = []
        for child in node:
            results.extend(_iter_itemlist_nodes(child))
        return results
    return []


def _iter_website_names(node: Any) -> list[str]:
    """Yield `name` values from any JSON-LD node whose @type is WebSite."""
    if isinstance(node, dict):
        node_type = node.get("@type")
        types = node_type if isinstance(node_type, list) else [node_type]
        if "WebSite" in types:
            name = node.get("name")
            if isinstance(name, str) and name.strip():
                return [name.strip()]
        graph = node.get("@graph")
        if isinstance(graph, list):
            results: list[str] = []
            for child in graph:
                results.extend(_iter_website_names(child))
            return results
    if isinstance(node, list):
        results = []
        for child in node:
            results.extend(_iter_website_names(child))
        return results
    return []


def _extract_page_title(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return ""


def extract_jsonld_itemlist(html: str) -> tuple[str, list[SyntheticEntry]]:
    """Return (feed_title, entries) synthesized from JSON-LD ItemList blocks.

    Title preference: WebSite.name (from @graph) → page <title> → ItemList.name.
    WebSite.name wins because ItemList.name is often a generic section label
    like "All Content" or "Recent Posts", whereas WebSite.name is the site's
    brand/display name and what users expect as the feed title.
    """
    page_title = _extract_page_title(html)
    website_name = ""
    for block in _iter_jsonld_blocks(html):
        names = _iter_website_names(block)
        if names:
            website_name = names[0]
            break

    for block in _iter_jsonld_blocks(html):
        for itemlist in _iter_itemlist_nodes(block):
            itemlist_name = str(itemlist.get("name", "")).strip()
            name = website_name or page_title or itemlist_name
            elements = itemlist.get("itemListElement", [])
            if not isinstance(elements, list):
                continue
            entries: list[SyntheticEntry] = []
            for element in elements:
                if not isinstance(element, dict):
                    continue
                item = element.get("item") if isinstance(element.get("item"), dict) else element
                url = str(item.get("url") or element.get("url") or "").strip()
                if not url:
                    continue
                try:
                    canonical = canonicalize_entry_url(url)
                except ValueError:
                    continue
                title = str(item.get("name") or element.get("name") or "").strip()
                description = str(
                    item.get("description") or element.get("description") or ""
                ).strip()
                entries.append(
                    SyntheticEntry(
                        title=title,
                        link=canonical,
                        guid=canonical,
                        description=description,
                    )
                )
            if entries:
                return name, entries
    return website_name or page_title, []


MAX_SITEMAP_ENTRIES = 50
MAX_SITEMAP_CHILD_FETCHES = 3
MAX_SITEMAP_BODY_BYTES = 5 * 1024 * 1024

_SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
_EXCLUDED_PATH_PREFIXES = (
    "/tag/",
    "/tags/",
    "/category/",
    "/categories/",
    "/page/",
)
_EXCLUDED_ASSET_SUFFIXES = (
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".css",
    ".js",
    ".pdf",
    ".zip",
    ".mp4",
    ".mp3",
)


@dataclass(frozen=True)
class SitemapEntry:
    loc: str
    lastmod: datetime | None


def _parse_sitemap_datetime(text: str) -> datetime | None:
    text = text.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def parse_sitemap_xml(xml: str) -> tuple[list[SitemapEntry], list[str]]:
    """Parse a sitemap.xml body. Returns (url_entries, child_sitemap_urls).

    For a `<urlset>` doc, only entries are populated. For a `<sitemapindex>`
    doc, only child_sitemap_urls are populated. On parse failure returns
    ([], []).
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return [], []

    tag = root.tag
    if tag == f"{_SITEMAP_NS}urlset":
        entries: list[SitemapEntry] = []
        for url_node in root.findall(f"{_SITEMAP_NS}url"):
            loc_node = url_node.find(f"{_SITEMAP_NS}loc")
            if loc_node is None or not loc_node.text:
                continue
            lastmod_node = url_node.find(f"{_SITEMAP_NS}lastmod")
            lastmod = (
                _parse_sitemap_datetime(lastmod_node.text)
                if lastmod_node is not None and lastmod_node.text
                else None
            )
            entries.append(SitemapEntry(loc=loc_node.text.strip(), lastmod=lastmod))
        return entries, []

    if tag == f"{_SITEMAP_NS}sitemapindex":
        children: list[str] = []
        for sm_node in root.findall(f"{_SITEMAP_NS}sitemap"):
            loc_node = sm_node.find(f"{_SITEMAP_NS}loc")
            if loc_node is not None and loc_node.text:
                children.append(loc_node.text.strip())
        return [], children

    return [], []


def _origin_of(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def filter_sitemap_entries(entries: list[SitemapEntry], origin: str) -> list[SitemapEntry]:
    """Filter to same-origin, non-tag/non-asset URLs; sort by lastmod desc; cap."""
    origin = origin.rstrip("/").lower()
    kept: list[SitemapEntry] = []
    for entry in entries:
        entry_origin = _origin_of(entry.loc)
        if origin and entry_origin and entry_origin != origin:
            continue
        parsed = urlparse(entry.loc)
        path = parsed.path or "/"
        if path == "/":
            continue
        if any(path.startswith(prefix) for prefix in _EXCLUDED_PATH_PREFIXES):
            continue
        lower_path = path.lower()
        if any(lower_path.endswith(suffix) for suffix in _EXCLUDED_ASSET_SUFFIXES):
            continue
        kept.append(entry)

    def sort_key(e: SitemapEntry) -> datetime:
        return e.lastmod or datetime.min.replace(tzinfo=UTC)

    kept.sort(key=sort_key, reverse=True)
    return kept[:MAX_SITEMAP_ENTRIES]


def _rfc822(dt: datetime) -> str:
    return format_datetime(dt)


def synthesize_rss(
    feed_title: str,
    site_url: str,
    entries: list[SyntheticEntry],
) -> str:
    """Produce an RSS 2.0 XML document suitable for feedparser.

    Entries with no title are rendered with an empty `<title/>` so parse_feed
    still emits them as entries (guid is what matters for dedup).
    """
    items_xml: list[str] = []
    for entry in entries:
        pub = f"<pubDate>{_rfc822(entry.published_at)}</pubDate>" if entry.published_at else ""
        title_text = xml_escape(entry.title or "")
        link_text = xml_escape(entry.link)
        guid_text = xml_escape(entry.guid)
        desc = (
            f"<description>{xml_escape(entry.description)}</description>"
            if entry.description
            else ""
        )
        items_xml.append(
            "<item>"
            f"<title>{title_text}</title>"
            f"<link>{link_text}</link>"
            f'<guid isPermaLink="false">{guid_text}</guid>'
            f"{desc}"
            f"{pub}"
            "</item>"
        )

    channel_title = xml_escape(feed_title or site_url or "Synthesized Feed")
    channel_link = xml_escape(site_url or "")
    body = "".join(items_xml)

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0">'
        "<channel>"
        f"<title>{channel_title}</title>"
        f"<link>{channel_link}</link>"
        "<description>Synthesized by glean</description>"
        f"{body}"
        "</channel>"
        "</rss>"
    )
