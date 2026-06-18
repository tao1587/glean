# HTML-Only Feed Discovery Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "HTML-only site" gap in the subscription-discovery pipeline by adding three layered fallback stages inside `discover_feed` (suffix probing, JSON-LD ItemList, sitemap.xml synthesis), persisting the provenance via new `source_type` variants, and teaching `fetch_feed_task` to refresh synthetic feeds.

**Architecture:** Three new stages run after the existing `<link rel="alternate">` scan, before raising `FeedNotFoundError`. Stage A finds real feeds the site didn't advertise (stored as `source_type="feed"`). Stages B/C synthesize an RSS document string from structured data on the page or the site's sitemap. The worker refresh path dispatches on `source_type` and re-runs the same synthesis step on each refresh so stable guids → no duplicates. Each stage is gated behind an independent env-var feature flag for rollback.

**Tech Stack:** Python 3.11, `httpx` (already used), `BeautifulSoup` + `lxml` (already used), `feedparser` (already used via `parse_feed`), no new dependencies.

---

## Design Note (Read Before Implementing)

### 1. `source_type` variants: drop `synthetic_suffix`, keep `synthetic_jsonld` and `synthetic_sitemap`

The task brief lists three new variants: `synthetic_suffix`, `synthetic_jsonld`, `synthetic_sitemap`. But the acceptance criteria state Stage A (suffix probing) returns `source_type="feed"`. That's correct: when `/feed.xml` is a real RSS document that `parse_feed` accepts, it is a normal feed — just one the site didn't advertise via `<link>`. Storing it as `synthetic_suffix` would require special refresh handling for no gain (the URL is a real feed and `fetch_feed_task` handles it unchanged).

**Decision: only add `synthetic_jsonld` and `synthetic_sitemap`** to the `CHECK` constraint and `FeedSourceType` enum. Stage A produces `source_type="feed"`.

### 2. Refresh behavior for synthetic feeds

`fetch_feed_task` currently calls `fetch_feed(feed.url, …)` → `parse_feed(xml, …)`. For synthetic sources, `feed.url` is the landing page URL (Stage B) or the sitemap URL (Stage C). Feeding those into `parse_feed` would produce `bozo=True`, no entries, and a fetch failure.

**Decision: introduce a thin indirection `fetch_or_synthesize_feed(feed) -> tuple[str, dict[str, str]] | None`** in `glean_rss` that dispatches on `feed.source_type`:

- `"feed"` / `"rsshub"` → `fetch_feed(feed.url, etag, last_modified)` (unchanged).
- `"synthetic_jsonld"` → refetch the landing page URL, re-scan JSON-LD `ItemList`, synthesize an RSS 2.0 XML string, return `(xml, {})`. Conditional headers are ignored (the landing page won't have stable ETag/Last-Modified matching the synthetic content).
- `"synthetic_sitemap"` → refetch the sitemap URL, re-build the filtered entry list, synthesize RSS 2.0, return `(xml, {})`. Same: no conditional headers.

The synthesized RSS string flows through the existing `parse_feed` path unchanged, so all entry dedup / insert logic in `fetch_feed_task` works identically. This is the minimal-blast-radius change: one call site in `fetch_feed_task` swaps `fetch_feed` for `fetch_or_synthesize_feed`.

**Deletions:** ignored. If a previously-listed item disappears from the landing page or sitemap on refresh, the existing row stays in the DB. The fetch pipeline already works this way for normal feeds (it never deletes rows based on absence).

### 3. GUID stability — URL canonicalization for synthetic guids

Sitemap `<lastmod>` can change per refresh (republish, typo fix). JSON-LD `ItemList` can reorder. Raw URLs can carry tracking params (`?utm_source=…`). Using the raw URL as `guid` would produce spurious duplicates on refresh.

**Decision: introduce `canonicalize_entry_url(url) -> str`** in a new `glean_rss.synthetic` module, applied to both `guid` and `link` of every synthesized entry (and once at subscription time to the stored feed URL if it is the landing page):

- Lowercase scheme and host; strip default ports (`:80`, `:443`).
- Remove `#fragment`.
- Drop query params with keys matching: `utm_*`, `fbclid`, `gclid`, `mc_*`, `_ga`, `ref`, `source`, `campaign`, `spm`.
- Sort remaining query params lexicographically.
- Remove trailing slash except for the root path (`/`).

This is applied uniformly. `guid = link = canonicalize_entry_url(raw_url)` makes the guid stable across refreshes even when tracking params change.

### 4. Extractor interaction — confirmed no changes needed

Synthetic entries have `content = None` / `has_full_content = False`. The fetch pipeline branch `E2` in `feed-fetch-flow.md` routes these through `extract_entry_content_update(entry.url)`, which is the Playwright/readability per-entry fetch. That path is already validated for arbitrary web URLs.

`content_backfill.py:_entry_uses_rsshub_source` checks `source_type == "rsshub"` — synthetic types fall through, extraction runs. `feed_fetcher._feed_uses_rsshub` returns False for synthetic types. Both behaviors are correct by default.

**Confirmed: no `extractor.py` or `content_backfill.py` changes required.**

### 5. Feature flags — per-stage env vars

Rollback is required per stage. Three module-level env-var booleans, read once at import:

- `GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED` (default `true`).
- `GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED` (default `true`).
- `GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED` (default `true`).

Set to `false` (or `0`) to disable a stage. Turning a stage off makes `discover_feed` behave as if that stage does not exist. Refresh logic is always on — a previously-synthesized feed continues to refresh even if the corresponding stage is disabled for new subscriptions (rollback by disabling new creations, not by breaking existing ones).

Document these in `.env.example`.

### 6. Risks

- **Expensive landing pages.** A publisher's landing page could be slow. Stage A probes are parallel with a tight per-request timeout (5s). Stage B reuses the landing-page response we already have from the `<link>` scan — no extra request. Stage C makes one additional HTTP request (`/sitemap.xml`) and at most one recursive fetch per child sitemap, capped at 3 children.
- **Sitemap abuse / giant sitemaps.** Cap at 50 entries after filtering and 3 child sitemaps on recursion. Reject sitemap XML bodies over 5 MB.
- **Non-article sitemap entries.** Heuristic filter (see task spec) excludes `/tag/`, `/tags/`, `/category/`, `/categories/`, `/page/`, and common image/asset extensions. Prefer same-origin URLs with path depth ≥ 1.
- **GUID collisions across canonicalization.** Two originally-distinct URLs could canonicalize to the same string (e.g., `/a/` and `/a`). Acceptable — they represent the same article; dedup is desired behavior.

---

## File Structure

**New files:**
- `backend/packages/rss/glean_rss/synthetic.py` — canonical-URL normalization, JSON-LD extraction, sitemap parsing, RSS 2.0 XML synthesis. All pure / sync helpers where possible; only the sitemap fetcher needs `httpx`.
- `backend/packages/rss/tests/test_synthetic.py` — unit tests for canonicalization, JSON-LD parsing, sitemap parsing, RSS synthesis.
- `backend/packages/database/glean_database/migrations/versions/<rev>_extend_feed_source_type_with_synthetic.py` — Alembic migration dropping and recreating the `ck_feeds_source_type` CHECK constraint with the new values.

**Modified files:**
- `backend/packages/rss/glean_rss/discoverer.py` — `discover_feed` gets three new fallback stages; exports `fetch_or_synthesize_feed`.
- `backend/packages/rss/glean_rss/__init__.py` — export `fetch_or_synthesize_feed` and the new `SYNTHETIC_JSONLD_SOURCE_TYPE` / `SYNTHETIC_SITEMAP_SOURCE_TYPE` sentinel constants.
- `backend/packages/rss/tests/test_discoverer.py` — add test classes for each new stage; existing tests unchanged.
- `backend/packages/database/glean_database/models/feed.py` — extend `FeedSourceType` enum.
- `backend/apps/api/glean_api/routers/feeds.py:discover_feed_url` — `discover_feed` already returns the full tuple; extend it to also return `source_type` and thread through to `create_subscription`.
- `backend/packages/rss/glean_rss/discoverer.py` — `discover_feed` return type becomes `tuple[str, str, str]` (url, title, source_type). All call sites updated.
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py` — swap the primary-URL `fetch_feed(...)` call for `fetch_or_synthesize_feed(feed, ...)`.
- `backend/apps/worker/tests/test_feed_fetcher.py` — add tests covering synthetic refresh.
- `.env.example` — document the three new env vars.
- `docs/architecture/feed-discovery-flow.md` — update Invariants §2, Pipeline §4 (insert stages), and Known Gaps §8.

---

## Task Breakdown

### Task 1: Scaffold `glean_rss.synthetic` with canonical-URL normalization

**Files:**
- Create: `backend/packages/rss/glean_rss/synthetic.py`
- Test: `backend/packages/rss/tests/test_synthetic.py`

- [ ] **Step 1: Write failing tests for `canonicalize_entry_url`**

```python
# backend/packages/rss/tests/test_synthetic.py
import pytest

from glean_rss.synthetic import canonicalize_entry_url


class TestCanonicalizeEntryUrl:
    def test_lowercases_scheme_and_host(self) -> None:
        assert canonicalize_entry_url("HTTPS://Example.COM/Path") == "https://example.com/Path"

    def test_strips_fragment(self) -> None:
        assert canonicalize_entry_url("https://example.com/a#section") == "https://example.com/a"

    def test_removes_utm_params(self) -> None:
        url = "https://example.com/a?utm_source=x&utm_medium=y&id=42"
        assert canonicalize_entry_url(url) == "https://example.com/a?id=42"

    def test_removes_trailing_slash_except_root(self) -> None:
        assert canonicalize_entry_url("https://example.com/a/") == "https://example.com/a"
        assert canonicalize_entry_url("https://example.com/") == "https://example.com/"

    def test_sorts_remaining_query_params(self) -> None:
        url = "https://example.com/a?b=2&a=1"
        assert canonicalize_entry_url(url) == "https://example.com/a?a=1&b=2"

    def test_strips_default_ports(self) -> None:
        assert canonicalize_entry_url("https://example.com:443/a") == "https://example.com/a"
        assert canonicalize_entry_url("http://example.com:80/a") == "http://example.com/a"

    def test_drops_ref_fbclid_gclid(self) -> None:
        url = "https://example.com/a?fbclid=x&gclid=y&ref=z&id=1"
        assert canonicalize_entry_url(url) == "https://example.com/a?id=1"

    def test_rejects_non_http_url(self) -> None:
        with pytest.raises(ValueError):
            canonicalize_entry_url("mailto:foo@bar.com")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py -v`
Expected: `ModuleNotFoundError: No module named 'glean_rss.synthetic'` or similar.

- [ ] **Step 3: Implement `canonicalize_entry_url`**

```python
# backend/packages/rss/glean_rss/synthetic.py
"""Synthetic feed synthesis: landing-page and sitemap-based fallbacks.

Used when a site exposes no RSS/Atom feed via content-type, <link> tag, or
suffix probe, but we can still build a synthetic entry list from structured
data (JSON-LD ItemList) or sitemap.xml.
"""

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

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
    if parsed.scheme not in ("http", "https"):
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py -v`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/glean_rss/synthetic.py backend/packages/rss/tests/test_synthetic.py
git commit -m "feat(rss): add canonical entry URL normalization for synthetic feeds"
```

---

### Task 2: JSON-LD ItemList extractor

**Files:**
- Modify: `backend/packages/rss/glean_rss/synthetic.py` — add `extract_jsonld_itemlist`.
- Modify: `backend/packages/rss/tests/test_synthetic.py` — add tests.

- [ ] **Step 1: Write failing tests**

```python
# Append to test_synthetic.py
from glean_rss.synthetic import SyntheticEntry, extract_jsonld_itemlist


_LANDING_WITH_ITEMLIST = """<!DOCTYPE html>
<html><head>
<title>My Blog</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Recent Posts",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "url": "https://example.com/post-a", "name": "Post A"},
    {"@type": "ListItem", "position": 2, "url": "https://example.com/post-b?utm_source=home", "name": "Post B"}
  ]
}
</script>
</head><body></body></html>
"""


_LANDING_NO_ITEMLIST = """<!DOCTYPE html>
<html><head>
<title>Empty</title>
<script type="application/ld+json">{"@type": "WebSite"}</script>
</head><body></body></html>
"""


class TestExtractJsonldItemlist:
    def test_extracts_entries_with_canonical_urls(self) -> None:
        title, entries = extract_jsonld_itemlist(_LANDING_WITH_ITEMLIST)
        assert title == "My Blog"
        assert len(entries) == 2
        assert entries[0] == SyntheticEntry(
            title="Post A", link="https://example.com/post-a", guid="https://example.com/post-a"
        )
        assert entries[1].link == "https://example.com/post-b"  # utm stripped
        assert entries[1].guid == "https://example.com/post-b"

    def test_returns_empty_when_no_itemlist(self) -> None:
        title, entries = extract_jsonld_itemlist(_LANDING_NO_ITEMLIST)
        assert entries == []

    def test_ignores_itemlist_with_empty_urls(self) -> None:
        html = '<html><head><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"url":""}]}</script></head></html>'
        _title, entries = extract_jsonld_itemlist(html)
        assert entries == []

    def test_falls_back_to_page_title_when_itemlist_has_no_name(self) -> None:
        html = _LANDING_WITH_ITEMLIST.replace('"name": "Recent Posts",', "")
        title, entries = extract_jsonld_itemlist(html)
        assert title == "My Blog"
        assert len(entries) == 2
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py::TestExtractJsonldItemlist -v`
Expected: `ImportError: cannot import name 'SyntheticEntry'`.

- [ ] **Step 3: Implement `SyntheticEntry` and `extract_jsonld_itemlist`**

```python
# Append to backend/packages/rss/glean_rss/synthetic.py
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class SyntheticEntry:
    """One entry in a synthesized feed."""

    title: str
    link: str
    guid: str
    published_at: datetime | None = None


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


def _extract_page_title(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return ""


def extract_jsonld_itemlist(html: str) -> tuple[str, list[SyntheticEntry]]:
    """Return (feed_title, entries) synthesized from JSON-LD ItemList blocks.

    Title preference: ItemList.name -> page <title>. Entries are taken from
    the first ItemList that yields at least one entry with a URL.
    """
    page_title = _extract_page_title(html)
    for block in _iter_jsonld_blocks(html):
        for itemlist in _iter_itemlist_nodes(block):
            name = str(itemlist.get("name", "")).strip() or page_title
            elements = itemlist.get("itemListElement", [])
            if not isinstance(elements, list):
                continue
            entries: list[SyntheticEntry] = []
            for element in elements:
                if not isinstance(element, dict):
                    continue
                url = str(element.get("url") or "").strip()
                if not url:
                    continue
                try:
                    canonical = canonicalize_entry_url(url)
                except ValueError:
                    continue
                title = str(element.get("name") or "").strip()
                entries.append(SyntheticEntry(title=title, link=canonical, guid=canonical))
            if entries:
                return name, entries
    return page_title, []
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py::TestExtractJsonldItemlist -v`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/glean_rss/synthetic.py backend/packages/rss/tests/test_synthetic.py
git commit -m "feat(rss): extract JSON-LD ItemList for synthetic feed candidates"
```

---

### Task 3: Sitemap.xml parser + filter

**Files:**
- Modify: `backend/packages/rss/glean_rss/synthetic.py` — add sitemap helpers.
- Modify: `backend/packages/rss/tests/test_synthetic.py` — tests.

- [ ] **Step 1: Write failing tests**

```python
# Append to test_synthetic.py
from glean_rss.synthetic import (
    SitemapEntry,
    parse_sitemap_xml,
    filter_sitemap_entries,
    MAX_SITEMAP_ENTRIES,
)


_SITEMAP_URLSET = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/posts/a</loc><lastmod>2026-04-20T10:00:00Z</lastmod></url>
  <url><loc>https://example.com/posts/b</loc><lastmod>2026-04-15T10:00:00Z</lastmod></url>
  <url><loc>https://example.com/tag/rss</loc></url>
  <url><loc>https://example.com/images/hero.jpg</loc></url>
  <url><loc>https://example.com/</loc></url>
</urlset>
"""

_SITEMAP_INDEX = """<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap>
</sitemapindex>
"""


class TestParseSitemapXml:
    def test_parses_urlset_with_lastmod(self) -> None:
        entries, child_sitemaps = parse_sitemap_xml(_SITEMAP_URLSET)
        assert child_sitemaps == []
        assert len(entries) == 5
        assert entries[0].loc == "https://example.com/posts/a"
        assert entries[0].lastmod is not None
        assert entries[0].lastmod.year == 2026

    def test_parses_sitemap_index(self) -> None:
        entries, child_sitemaps = parse_sitemap_xml(_SITEMAP_INDEX)
        assert entries == []
        assert child_sitemaps == ["https://example.com/sitemap-a.xml", "https://example.com/sitemap-b.xml"]

    def test_malformed_xml_returns_empty(self) -> None:
        entries, child_sitemaps = parse_sitemap_xml("not xml")
        assert entries == []
        assert child_sitemaps == []


class TestFilterSitemapEntries:
    def test_excludes_tags_categories_pages_and_images(self) -> None:
        raw = [
            SitemapEntry(loc="https://example.com/posts/a", lastmod=None),
            SitemapEntry(loc="https://example.com/tag/rss", lastmod=None),
            SitemapEntry(loc="https://example.com/category/news", lastmod=None),
            SitemapEntry(loc="https://example.com/page/2", lastmod=None),
            SitemapEntry(loc="https://example.com/images/hero.jpg", lastmod=None),
            SitemapEntry(loc="https://example.com/", lastmod=None),
        ]
        kept = filter_sitemap_entries(raw, origin="https://example.com")
        assert [e.loc for e in kept] == ["https://example.com/posts/a"]

    def test_excludes_cross_origin(self) -> None:
        raw = [
            SitemapEntry(loc="https://example.com/posts/a", lastmod=None),
            SitemapEntry(loc="https://other.com/posts/x", lastmod=None),
        ]
        kept = filter_sitemap_entries(raw, origin="https://example.com")
        assert [e.loc for e in kept] == ["https://example.com/posts/a"]

    def test_sorts_by_lastmod_desc_and_caps(self) -> None:
        raw = [
            SitemapEntry(
                loc=f"https://example.com/posts/{i}", lastmod=datetime(2026, 4, i + 1, tzinfo=UTC)
            )
            for i in range(MAX_SITEMAP_ENTRIES + 10)
        ]
        kept = filter_sitemap_entries(raw, origin="https://example.com")
        assert len(kept) == MAX_SITEMAP_ENTRIES
        # Most recent first (highest i).
        assert kept[0].loc == f"https://example.com/posts/{MAX_SITEMAP_ENTRIES + 9}"
```

Make sure the test file imports `datetime` and `UTC` at the top:
```python
from datetime import UTC, datetime
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py::TestParseSitemapXml packages/rss/tests/test_synthetic.py::TestFilterSitemapEntries -v`
Expected: `ImportError: cannot import name 'SitemapEntry'`.

- [ ] **Step 3: Implement sitemap parser and filter**

```python
# Append to backend/packages/rss/glean_rss/synthetic.py
from datetime import UTC
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

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
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
    ".css", ".js", ".pdf", ".zip", ".mp4", ".mp3",
)


@dataclass(frozen=True)
class SitemapEntry:
    loc: str
    lastmod: datetime | None


def _parse_sitemap_datetime(text: str) -> datetime | None:
    text = text.strip()
    if not text:
        return None
    # Handle trailing Z
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

    Either list may be empty. For a `<urlset>` doc, only entries are populated.
    For a `<sitemapindex>` doc, only child_sitemap_urls are populated. On parse
    failure returns ([], []).
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
            lastmod = _parse_sitemap_datetime(lastmod_node.text) if lastmod_node is not None and lastmod_node.text else None
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py -v`
Expected: all synthetic tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/glean_rss/synthetic.py backend/packages/rss/tests/test_synthetic.py
git commit -m "feat(rss): parse and filter sitemap.xml for synthetic feed synthesis"
```

---

### Task 4: Synthesize RSS 2.0 XML from synthetic entries

**Files:**
- Modify: `backend/packages/rss/glean_rss/synthetic.py`
- Modify: `backend/packages/rss/tests/test_synthetic.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to test_synthetic.py
from glean_rss.synthetic import synthesize_rss


class TestSynthesizeRss:
    @pytest.mark.asyncio
    async def test_synthesizes_parseable_rss_from_entries(self) -> None:
        from glean_rss.parser import parse_feed

        entries = [
            SyntheticEntry(
                title="Post A",
                link="https://example.com/a",
                guid="https://example.com/a",
                published_at=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
            ),
            SyntheticEntry(
                title="",
                link="https://example.com/b",
                guid="https://example.com/b",
                published_at=None,
            ),
        ]

        xml = synthesize_rss(
            feed_title="Test Blog",
            site_url="https://example.com",
            entries=entries,
        )

        parsed = await parse_feed(xml, "https://example.com/synthesized")
        assert parsed.title == "Test Blog"
        assert len(parsed.entries) == 2
        assert parsed.entries[0].guid == "https://example.com/a"
        assert parsed.entries[0].url == "https://example.com/a"
        assert parsed.entries[0].title == "Post A"
        assert parsed.entries[1].title == ""  # No title in entry is allowed

    @pytest.mark.asyncio
    async def test_synthesized_feed_is_stable_given_same_input(self) -> None:
        entries = [SyntheticEntry(title="x", link="https://example.com/a", guid="https://example.com/a")]
        xml1 = synthesize_rss("Blog", "https://example.com", entries)
        xml2 = synthesize_rss("Blog", "https://example.com", entries)
        assert xml1 == xml2

    def test_escapes_special_characters(self) -> None:
        entries = [
            SyntheticEntry(title="A & B <c>", link="https://example.com/a?x=1&y=2", guid="https://example.com/a?x=1&y=2")
        ]
        xml = synthesize_rss("Title & More", "https://example.com", entries)
        assert "&amp;" in xml
        assert "<c>" not in xml or "&lt;c&gt;" in xml
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py::TestSynthesizeRss -v`
Expected: `ImportError: cannot import name 'synthesize_rss'`.

- [ ] **Step 3: Implement `synthesize_rss`**

```python
# Append to backend/packages/rss/glean_rss/synthetic.py
from email.utils import format_datetime
from xml.sax.saxutils import escape as xml_escape


def _rfc822(dt: datetime) -> str:
    return format_datetime(dt)


def synthesize_rss(
    feed_title: str,
    site_url: str,
    entries: list[SyntheticEntry],
) -> str:
    """Produce an RSS 2.0 XML document suitable for feedparser.

    Entries with no title are rendered with an empty <title/> so parse_feed
    still emits them as entries (guid is what matters for dedup).
    """
    items_xml: list[str] = []
    for entry in entries:
        pub = f"<pubDate>{_rfc822(entry.published_at)}</pubDate>" if entry.published_at else ""
        title_text = xml_escape(entry.title or "")
        link_text = xml_escape(entry.link)
        guid_text = xml_escape(entry.guid)
        items_xml.append(
            f"<item>"
            f"<title>{title_text}</title>"
            f"<link>{link_text}</link>"
            f"<guid isPermaLink=\"false\">{guid_text}</guid>"
            f"{pub}"
            f"</item>"
        )

    channel_title = xml_escape(feed_title or site_url or "Synthesized Feed")
    channel_link = xml_escape(site_url or "")
    body = "".join(items_xml)

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0">'
        f"<channel>"
        f"<title>{channel_title}</title>"
        f"<link>{channel_link}</link>"
        f"<description>Synthesized by glean</description>"
        f"{body}"
        f"</channel>"
        f"</rss>"
    )
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_synthetic.py -v`
Expected: all synthetic tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/glean_rss/synthetic.py backend/packages/rss/tests/test_synthetic.py
git commit -m "feat(rss): synthesize RSS 2.0 XML from synthetic entries"
```

---

### Task 5: Database migration — extend `source_type` CHECK constraint

**Files:**
- Create: `backend/packages/database/glean_database/migrations/versions/<rev>_extend_feed_source_type_with_synthetic.py`
- Modify: `backend/packages/database/glean_database/models/feed.py` — extend `FeedSourceType` enum.

- [ ] **Step 1: Generate a new revision id**

Run (from repo root):
```bash
cd backend && uv run alembic -c packages/database/alembic.ini revision -m "extend feed source_type with synthetic variants"
```

This creates a new file in `packages/database/glean_database/migrations/versions/`. Note the generated revision id (shown in the filename and the file header).

- [ ] **Step 2: Fill the generated migration**

Replace the auto-generated file body with (keeping the generated `revision` id and `down_revision` pointing at the latest head at generation time):

```python
"""extend feed source_type with synthetic variants

Revision ID: <generated-id>
Revises: <previous-head>
Create Date: 2026-04-22 ...
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "<generated-id>"
down_revision: Union[str, Sequence[str], None] = "<previous-head>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_feeds_source_type", "feeds", type_="check")
    op.create_check_constraint(
        "ck_feeds_source_type",
        "feeds",
        "source_type IN ('feed', 'rsshub', 'synthetic_jsonld', 'synthetic_sitemap')",
    )


def downgrade() -> None:
    # Revert rows that can't satisfy the old constraint before reinstating it.
    op.execute(
        "UPDATE feeds SET source_type = 'feed' "
        "WHERE source_type IN ('synthetic_jsonld', 'synthetic_sitemap')"
    )
    op.drop_constraint("ck_feeds_source_type", "feeds", type_="check")
    op.create_check_constraint(
        "ck_feeds_source_type",
        "feeds",
        "source_type IN ('feed', 'rsshub')",
    )
```

- [ ] **Step 3: Extend `FeedSourceType` enum**

Edit `backend/packages/database/glean_database/models/feed.py`:

```python
class FeedSourceType(str, Enum):
    """Feed source type enumeration."""

    FEED = "feed"
    RSSHUB = "rsshub"
    SYNTHETIC_JSONLD = "synthetic_jsonld"
    SYNTHETIC_SITEMAP = "synthetic_sitemap"
```

- [ ] **Step 4: Apply migration to the test DB**

```bash
cd backend && make test-db-up && uv run alembic -c packages/database/alembic.ini upgrade head
```

Expected: migration runs cleanly, `\d feeds` in psql shows the updated CHECK constraint.

- [ ] **Step 5: Run existing tests to confirm no regression**

```bash
cd backend && uv run pytest packages/database/tests -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/packages/database/
git commit -m "feat(db): extend feed source_type with synthetic_jsonld and synthetic_sitemap"
```

---

### Task 6: Wire discovery stages into `discover_feed`

**Files:**
- Modify: `backend/packages/rss/glean_rss/discoverer.py`
- Modify: `backend/packages/rss/glean_rss/__init__.py`
- Modify: `backend/packages/rss/tests/test_discoverer.py`

- [ ] **Step 1: Add module-level feature flags + helpers to `discoverer.py`**

Prepend near the top of `backend/packages/rss/glean_rss/discoverer.py` (after existing imports, before `_USER_AGENT`):

```python
import os
from urllib.parse import urljoin, urlparse

from .synthetic import (
    MAX_SITEMAP_CHILD_FETCHES,
    MAX_SITEMAP_BODY_BYTES,
    SyntheticEntry,
    canonicalize_entry_url,
    extract_jsonld_itemlist,
    filter_sitemap_entries,
    parse_sitemap_xml,
    synthesize_rss,
)


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


SUFFIX_PROBING_ENABLED = _env_flag("GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED", True)
JSONLD_FALLBACK_ENABLED = _env_flag("GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED", True)
SITEMAP_FALLBACK_ENABLED = _env_flag("GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED", True)

_COMMON_FEED_SUFFIXES: tuple[str, ...] = (
    "/feed",
    "/feed.xml",
    "/rss",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/feeds/all.atom.xml",
)

SOURCE_TYPE_FEED = "feed"
SOURCE_TYPE_SYNTHETIC_JSONLD = "synthetic_jsonld"
SOURCE_TYPE_SYNTHETIC_SITEMAP = "synthetic_sitemap"
```

- [ ] **Step 2: Change `discover_feed` signature to return a `source_type` tuple**

Update the signature in the same file to return `tuple[str, str, str]` (url, title, source_type). Update the existing three success returns in the function body to append `SOURCE_TYPE_FEED`:

```python
async def discover_feed(url: str, timeout: int = 30) -> tuple[str, str, str]:
    """...existing docstring.

    Returns:
        Tuple of (feed_url, feed_title, source_type).
    """
    # ... existing body until the final raise ...
    # Change the three "return url, str(feed.title)" / "return feed_url_str, str(feed.title)" sites:
    # return url, str(feed.title), SOURCE_TYPE_FEED
    # return feed_url_str, str(feed.title), SOURCE_TYPE_FEED
```

- [ ] **Step 3: Update the existing discoverer tests to unpack the 3-tuple**

Find each occurrence in `backend/packages/rss/tests/test_discoverer.py` of:

```python
feed_url, title = await discover_feed(...)
```

Replace with:

```python
feed_url, title, source_type = await discover_feed(...)
assert source_type == "feed"
```

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py -v`
Expected: all existing tests still pass.

- [ ] **Step 4: Write failing tests for Stage A (suffix probing)**

Add a new class at the end of `test_discoverer.py`:

```python
class TestDiscoverFeedSuffixProbing:
    @pytest.mark.asyncio
    async def test_finds_feed_at_feed_xml_when_html_has_no_link(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})
            if request.url.path == "/feed.xml":
                return httpx.Response(200, text=_RSS_DOC, headers={"content-type": "application/rss+xml"})
            return httpx.Response(404)

        _install_mock_transport(handler)
        feed_url, title, source_type = await discover_feed("https://example.com/")
        assert feed_url == "https://example.com/feed.xml"
        assert source_type == "feed"

    @pytest.mark.asyncio
    async def test_rejects_html_response_at_suffix(self) -> None:
        """A suffix that returns HTML must not be treated as a feed."""
        call_count = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            call_count["n"] += 1
            # Landing page: HTML without <link>.
            if request.url.path == "/":
                return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})
            # Every suffix returns HTML (not a feed).
            return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})

        _install_mock_transport(handler)
        with pytest.raises(FeedNotFoundError):
            await discover_feed("https://example.com/")
```

- [ ] **Step 5: Implement Stage A in `discover_feed`**

Just before the final `raise FeedNotFoundError(...)` in `discover_feed`, insert:

```python
        # Stage A: probe common feed suffixes when <link> autodiscovery failed.
        if SUFFIX_PROBING_ENABLED:
            stage_a_hit = await _try_suffix_probing(client, url)
            if stage_a_hit is not None:
                return stage_a_hit

        # Stage B and C go here in later tasks.
```

And add these helpers (same module, module-level):

```python
async def _try_suffix_probing(
    client: httpx.AsyncClient, base_url: str
) -> tuple[str, str, str] | None:
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    async def probe(suffix: str) -> tuple[str, str, str] | None:
        candidate = f"{origin}{suffix}"
        try:
            response = await client.get(candidate, timeout=5)
        except httpx.HTTPError:
            return None
        if response.status_code >= 400:
            return None
        body = response.text
        if not _looks_like_feed_document(body):
            return None
        try:
            feed = await parse_feed(body, candidate)
        except ValueError:
            return None
        if not feed.entries and not getattr(feed, "title", None):
            return None
        return candidate, str(feed.title), SOURCE_TYPE_FEED

    tasks = [probe(suffix) for suffix in _COMMON_FEED_SUFFIXES]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, tuple):
            return result
    return None
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py -v`
Expected: all tests pass including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add backend/packages/rss/
git commit -m "feat(rss): probe common feed suffixes when autodiscovery fails"
```

---

### Task 7: Stage B — JSON-LD ItemList synthesis inside `discover_feed`

**Files:**
- Modify: `backend/packages/rss/glean_rss/discoverer.py`
- Modify: `backend/packages/rss/tests/test_discoverer.py`

- [ ] **Step 1: Write failing tests**

Append to `test_discoverer.py`:

```python
_HTML_WITH_JSONLD = """<!DOCTYPE html>
<html><head>
<title>MM Guo</title>
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"ItemList",
  "name":"Recent Posts",
  "itemListElement":[
    {"@type":"ListItem","position":1,"url":"https://mmguo.dev/post-1","name":"Post 1"},
    {"@type":"ListItem","position":2,"url":"https://mmguo.dev/post-2","name":"Post 2"}
  ]
}
</script>
</head><body></body></html>
"""


class TestDiscoverFeedJsonldFallback:
    @pytest.mark.asyncio
    async def test_synthesizes_feed_from_jsonld_itemlist(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            # Landing page has JSON-LD but no <link> and no known suffix.
            if request.url.path == "/":
                return httpx.Response(200, text=_HTML_WITH_JSONLD, headers={"content-type": "text/html"})
            return httpx.Response(404)

        _install_mock_transport(handler)
        feed_url, title, source_type = await discover_feed("https://mmguo.dev/")
        assert source_type == "synthetic_jsonld"
        # Stored feed URL is the landing page (so refresh knows where to re-scan).
        assert feed_url == "https://mmguo.dev/"
        assert title == "Recent Posts"
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py::TestDiscoverFeedJsonldFallback -v`
Expected: `FeedNotFoundError` raised (not the synthetic path).

- [ ] **Step 3: Implement Stage B**

In `discover_feed`, the landing HTML is already fetched as `response.text` when the content-type is HTML. Refactor so `response.text` is captured before Stage A, then after Stage A fails insert:

```python
        # Stage B: JSON-LD ItemList synthesis from the already-fetched HTML.
        if JSONLD_FALLBACK_ENABLED and ("html" in content_type or not content_type):
            stage_b_hit = _try_jsonld_synthesis(response.text, url)
            if stage_b_hit is not None:
                return stage_b_hit
```

Add the helper:

```python
def _try_jsonld_synthesis(html: str, landing_url: str) -> tuple[str, str, str] | None:
    title, entries = extract_jsonld_itemlist(html)
    if not entries:
        return None
    canonical_landing = canonicalize_entry_url(landing_url)
    return canonical_landing, title or canonical_landing, SOURCE_TYPE_SYNTHETIC_JSONLD
```

Note: Stage B is gated by the same `"html" in content_type or not content_type` check that already protects the `<link>` scan, ensuring we don't try JSON-LD on an XML response.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py -v`
Expected: new test plus all previous tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/
git commit -m "feat(rss): synthesize feed from JSON-LD ItemList when suffix probe fails"
```

---

### Task 8: Stage C — sitemap.xml synthesis inside `discover_feed`

**Files:**
- Modify: `backend/packages/rss/glean_rss/discoverer.py`
- Modify: `backend/packages/rss/tests/test_discoverer.py`

- [ ] **Step 1: Write failing tests**

Append to `test_discoverer.py`:

```python
_SITEMAP_XML = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://static.example/posts/a</loc><lastmod>2026-04-20T10:00:00Z</lastmod></url>
  <url><loc>https://static.example/posts/b</loc><lastmod>2026-04-10T10:00:00Z</lastmod></url>
  <url><loc>https://static.example/tag/x</loc></url>
</urlset>
"""


class TestDiscoverFeedSitemapFallback:
    @pytest.mark.asyncio
    async def test_synthesizes_feed_from_sitemap(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/":
                return httpx.Response(200, text=_HTML_NO_FEED, headers={"content-type": "text/html"})
            if request.url.path == "/sitemap.xml":
                return httpx.Response(200, text=_SITEMAP_XML, headers={"content-type": "application/xml"})
            # All other requests (suffix probes, etc.) return 404.
            return httpx.Response(404)

        _install_mock_transport(handler)
        feed_url, title, source_type = await discover_feed("https://static.example/")
        assert source_type == "synthetic_sitemap"
        # Feed URL stores sitemap URL so refresh knows where to re-fetch.
        assert feed_url == "https://static.example/sitemap.xml"
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py::TestDiscoverFeedSitemapFallback -v`
Expected: `FeedNotFoundError`.

- [ ] **Step 3: Implement Stage C**

Add helpers in `discoverer.py`:

```python
async def _fetch_sitemap(client: httpx.AsyncClient, url: str) -> str | None:
    try:
        response = await client.get(url, timeout=10)
    except httpx.HTTPError:
        return None
    if response.status_code >= 400:
        return None
    if len(response.content) > MAX_SITEMAP_BODY_BYTES:
        return None
    return response.text


async def _try_sitemap_synthesis(
    client: httpx.AsyncClient, landing_url: str
) -> tuple[str, str, str] | None:
    parsed = urlparse(landing_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    candidates = [f"{origin}/sitemap.xml", f"{origin}/sitemap_index.xml"]
    sitemap_url = None
    raw_xml: str | None = None
    for candidate in candidates:
        raw_xml = await _fetch_sitemap(client, candidate)
        if raw_xml is not None:
            sitemap_url = candidate
            break
    if raw_xml is None or sitemap_url is None:
        return None

    entries, child_sitemaps = parse_sitemap_xml(raw_xml)
    if child_sitemaps and not entries:
        # sitemap index: fetch up to MAX_SITEMAP_CHILD_FETCHES children and merge.
        merged: list = []
        for child_url in child_sitemaps[:MAX_SITEMAP_CHILD_FETCHES]:
            child_xml = await _fetch_sitemap(client, child_url)
            if not child_xml:
                continue
            child_entries, _ = parse_sitemap_xml(child_xml)
            merged.extend(child_entries)
        entries = merged

    filtered = filter_sitemap_entries(entries, origin=origin)
    if not filtered:
        return None

    synthetic_entries = [
        SyntheticEntry(
            title="",
            link=canonicalize_entry_url(entry.loc),
            guid=canonicalize_entry_url(entry.loc),
            published_at=entry.lastmod,
        )
        for entry in filtered
    ]
    title = urlparse(landing_url).netloc
    return sitemap_url, title, SOURCE_TYPE_SYNTHETIC_SITEMAP
```

Then in `discover_feed`, after the Stage B block, add:

```python
        # Stage C: sitemap.xml synthesis.
        if SITEMAP_FALLBACK_ENABLED:
            stage_c_hit = await _try_sitemap_synthesis(client, url)
            if stage_c_hit is not None:
                return stage_c_hit
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && uv run pytest packages/rss/tests/test_discoverer.py -v`
Expected: all tests pass including the new sitemap test.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/rss/
git commit -m "feat(rss): synthesize feed from sitemap.xml when JSON-LD fallback fails"
```

---

### Task 9: Thread `source_type` through the router and `create_subscription`

**Files:**
- Modify: `backend/apps/api/glean_api/routers/feeds.py`
- Modify: `backend/packages/rss/glean_rss/__init__.py`

- [ ] **Step 1: Export the source-type constants**

Edit `backend/packages/rss/glean_rss/__init__.py` — add to the imports from `.discoverer`:

```python
from .discoverer import (
    FeedNotFoundError,
    SOURCE_TYPE_FEED,
    SOURCE_TYPE_SYNTHETIC_JSONLD,
    SOURCE_TYPE_SYNTHETIC_SITEMAP,
    discover_feed,
    fetch_feed,
)
```

And add the constants to `__all__`.

- [ ] **Step 2: Update the router to use the returned `source_type`**

In `backend/apps/api/glean_api/routers/feeds.py:discover_feed_url`, find:

```python
try:
    feed_url, feed_title = await discover_feed(source_url)
except FeedNotFoundError as exc:
    ...
```

Replace with:

```python
discovered_source_type: str | None = None
try:
    feed_url, feed_title, discovered_source_type = await discover_feed(source_url)
except FeedNotFoundError as exc:
    feed_not_found_error = str(exc)
except ValueError:
    pass
```

Then below, after the validation/RSSHub-fallback block, before `create_subscription`, update the `source_type` assignment:

```python
# The router's default is "feed" for non-RSSHub cases. If discovery produced
# a synthetic source_type, prefer that.
if source_type != "rsshub" and discovered_source_type:
    source_type = discovered_source_type
```

- [ ] **Step 3: Run router / feed discovery integration tests**

```bash
cd backend && uv run pytest apps/api/tests -k "discover" -v
```

Expected: all pass (update any test that calls `discover_feed(...)` directly).

- [ ] **Step 4: Commit**

```bash
git add backend/apps/api/ backend/packages/rss/glean_rss/__init__.py
git commit -m "feat(api): persist synthetic source_type on discovered subscriptions"
```

---

### Task 10: `fetch_or_synthesize_feed` for synthetic refresh

**Files:**
- Modify: `backend/packages/rss/glean_rss/discoverer.py`
- Modify: `backend/packages/rss/glean_rss/__init__.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`

- [ ] **Step 1: Write failing test for synthetic refresh**

Append this new class to `backend/apps/worker/tests/test_feed_fetcher.py` (mirrors the existing `TestFetchFeedTask` MagicMock style; no real DB needed):

```python
class TestSyntheticFeedRefresh:
    """Verify synthetic_* feeds refresh by re-running synthesis, not fetch_feed."""

    @pytest.mark.asyncio
    async def test_synthetic_jsonld_refresh_calls_synthesize_not_fetch_feed(self):
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://mmguo.dev/"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.source_type = "synthetic_jsonld"
        mock_feed.title = "MM Guo"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        synthesized_xml = (
            '<?xml version="1.0"?>'
            '<rss version="2.0"><channel>'
            '<title>MM Guo</title><link>https://mmguo.dev/</link>'
            '<description>Synthesized by glean</description>'
            '<item><title>Post 1</title><link>https://mmguo.dev/post-1</link>'
            '<guid isPermaLink="false">https://mmguo.dev/post-1</guid></item>'
            '</channel></rss>'
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed
        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        synthesize_mock = AsyncMock(return_value=(synthesized_xml, {}))

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_or_synthesize_feed", new=synthesize_mock
            ),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed") as fetch_feed_mock,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            await fetch_feed_task({}, feed_id="feed-1")

        # Primary URL was routed through the synthesize dispatcher, not fetch_feed.
        synthesize_mock.assert_awaited()
        args, _kwargs = synthesize_mock.await_args
        assert args[0] == "https://mmguo.dev/"
        assert args[1] == "synthetic_jsonld"
        fetch_feed_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_regular_feed_still_uses_fetch_feed(self):
        """Sanity check: non-synthetic source_type delegates to the unchanged path."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-2"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.source_type = "feed"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed
        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        # Simulate 304 so we can assert dispatcher was invoked and exit early.
        synthesize_mock = AsyncMock(return_value=None)

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_or_synthesize_feed", new=synthesize_mock
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-2")

        synthesize_mock.assert_awaited()
        args, _kwargs = synthesize_mock.await_args
        assert args[1] == "feed"
        assert result == {"status": "not_modified", "new_entries": 0}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest apps/worker/tests/test_feed_fetcher.py::TestSyntheticFeedRefresh -v`
Expected: failure — no entries inserted / parse_feed rejects HTML as RSS.

- [ ] **Step 3: Implement `fetch_or_synthesize_feed`**

Append to `backend/packages/rss/glean_rss/discoverer.py`:

```python
async def fetch_or_synthesize_feed(
    url: str,
    source_type: str,
    etag: str | None = None,
    last_modified: str | None = None,
) -> tuple[str, dict[str, str]] | None:
    """Dispatch fetch based on source_type.

    For real feeds this delegates to `fetch_feed`. For synthetic_* types it
    re-runs the synthesis step so refresh produces a stable XML document.
    """
    if source_type not in (SOURCE_TYPE_SYNTHETIC_JSONLD, SOURCE_TYPE_SYNTHETIC_SITEMAP):
        return await fetch_feed(url, etag, last_modified)

    async with httpx.AsyncClient(
        timeout=30, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
    ) as client:
        if source_type == SOURCE_TYPE_SYNTHETIC_JSONLD:
            response = await client.get(url)
            response.raise_for_status()
            title, entries = extract_jsonld_itemlist(response.text)
            if not entries:
                raise ValueError(
                    f"Synthetic JSON-LD refresh: no ItemList entries at {url}"
                )
            xml = synthesize_rss(
                feed_title=title or url,
                site_url=url,
                entries=entries,
            )
            return xml, {}

        # SOURCE_TYPE_SYNTHETIC_SITEMAP: url is the sitemap URL itself.
        raw_xml = await _fetch_sitemap(client, url)
        if raw_xml is None:
            raise ValueError(f"Synthetic sitemap refresh: fetch failed for {url}")
        entries, child_sitemaps = parse_sitemap_xml(raw_xml)
        if child_sitemaps and not entries:
            merged = []
            for child_url in child_sitemaps[:MAX_SITEMAP_CHILD_FETCHES]:
                child_xml = await _fetch_sitemap(client, child_url)
                if not child_xml:
                    continue
                child_entries, _ = parse_sitemap_xml(child_xml)
                merged.extend(child_entries)
            entries = merged
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        filtered = filter_sitemap_entries(entries, origin=origin)
        if not filtered:
            raise ValueError(f"Synthetic sitemap refresh: no entries after filter for {url}")
        synthetic_entries = [
            SyntheticEntry(
                title="",
                link=canonicalize_entry_url(entry.loc),
                guid=canonicalize_entry_url(entry.loc),
                published_at=entry.lastmod,
            )
            for entry in filtered
        ]
        xml = synthesize_rss(feed_title=parsed.netloc, site_url=origin, entries=synthetic_entries)
        return xml, {}
```

- [ ] **Step 4: Export `fetch_or_synthesize_feed`**

In `backend/packages/rss/glean_rss/__init__.py` add the import and append to `__all__`:

```python
from .discoverer import (
    ...
    fetch_or_synthesize_feed,
)
```

- [ ] **Step 5: Swap the worker call site**

In `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`:

- Change the top-of-file import `from glean_rss import fetch_feed, parse_feed, postprocess_html` to also include `fetch_or_synthesize_feed`.
- At the primary-URL attempt inside `fetch_feed_task` (around line 478), replace `fetch_feed(attempt_url, etag, last_modified)` for `idx == 0` with:

```python
                    if idx == 0:
                        fetch_result = await fetch_or_synthesize_feed(
                            attempt_url,
                            getattr(feed, "source_type", "feed") or "feed",
                            feed.etag if use_conditional else None,
                            feed.last_modified if use_conditional else None,
                        )
                    else:
                        fetch_result = await fetch_feed(
                            attempt_url,
                            feed.etag if use_conditional else None,
                            feed.last_modified if use_conditional else None,
                        )
```

Rationale: the RSSHub-converted fallback URLs (`idx > 0`) are always real feeds and should use the existing code path. Only the primary `feed.url` attempt needs to dispatch on source_type.

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && uv run pytest apps/worker/tests/test_feed_fetcher.py -v`
Expected: all pass including the new synthetic refresh test.

- [ ] **Step 7: Commit**

```bash
git add backend/packages/rss/ backend/apps/worker/
git commit -m "feat(worker): refresh synthetic feeds by re-running discovery synthesis"
```

---

### Task 11: Document env vars and update architecture docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/architecture/feed-discovery-flow.md`

- [ ] **Step 1: Add env-var documentation to `.env.example`**

Append (near existing RSS/feed-related config):

```
# Feed discovery fallback stages. Set to 0/false to disable a stage for new
# subscriptions. Existing synthetic feeds continue to refresh regardless.
GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED=true
GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED=true
GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED=true
```

- [ ] **Step 2: Update `feed-discovery-flow.md` §2 Invariants**

Edit I1 and add I7:

```markdown
| I1 | Discovery accepts a feed from any of: (a) the source URL itself, (b) an HTML `<link rel="alternate">` tag, (c) a common feed suffix (Stage A), (d) structured JSON-LD ItemList or sitemap.xml synthesis (Stages B/C, `source_type` synthetic_*), or (e) a matching RSSHub route. |
| I7 | Synthetic sources (`source_type` prefix `synthetic_`) store the *landing page URL* or *sitemap URL* as `feed.url`. Refresh dispatches on `source_type` and re-runs the original synthesis step; guids are canonicalized URLs, stable across refreshes. |
```

- [ ] **Step 3: Update §4 Pipeline Stages — insert new table entries**

Between the current Stage D table and "Exceptions" block, add:

```markdown
#### Stage D-A — Suffix probing (inside `discover_feed`)

Runs only if `GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED` is true and the `<link>` scan found nothing.

| Step | Action | Next on success | Next on failure |
|---|---|---|---|
| DA1 | Parallel GET each of `/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/index.xml`, `/feeds/all.atom.xml` on the source origin; 5s per request | DA2 | continue to D-B |
| DA2 | Require `_looks_like_feed_document` AND `parse_feed` success with a title or entries; first hit wins | return `(url, title, "feed")` | continue to D-B |

#### Stage D-B — JSON-LD ItemList synthesis

Runs only if `GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED` is true and Stage D-A did not hit.

| Step | Action | Next on success | Next on failure |
|---|---|---|---|
| DB1 | Scan all `<script type="application/ld+json">` blocks in the already-fetched landing HTML; find the first `@type == ItemList` with non-empty `itemListElement[].url` | DB2 | continue to D-C |
| DB2 | Synthesize `SyntheticEntry`s: `guid = link = canonicalize_entry_url(url)`, `title = element.name`; feed title from `ItemList.name` falling back to page `<title>` | return `(landing_url, title, "synthetic_jsonld")` | — |

#### Stage D-C — sitemap.xml synthesis

Runs only if `GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED` is true and Stage D-B did not hit.

| Step | Action | Next on success | Next on failure |
|---|---|---|---|
| DC1 | GET `{origin}/sitemap.xml`, then `{origin}/sitemap_index.xml`; accept first with body ≤ 5 MB | DC2 | raise `FeedNotFoundError` |
| DC2 | If `<sitemapindex>`, fetch up to 3 child sitemaps; collect `<url>` entries | DC3 | raise `FeedNotFoundError` |
| DC3 | `filter_sitemap_entries`: same-origin, not `/tag/\|/tags/\|/category/\|/categories/\|/page/`, not image/asset suffix; sort by `<lastmod>` desc; cap 50 | return `(sitemap_url, netloc, "synthetic_sitemap")` | raise `FeedNotFoundError` |

**Synthetic feed refresh.** `fetch_feed_task` calls `fetch_or_synthesize_feed(feed.url, feed.source_type, ...)`. For `synthetic_jsonld` the landing page is refetched and Stage D-B re-runs; for `synthetic_sitemap` the sitemap URL is refetched and Stage D-C re-runs. The synthesized RSS 2.0 XML flows through `parse_feed` identically to a real feed. Guids are canonicalized URLs, so refreshes produce stable identifiers → existing entries are recognized by the `uq_feed_guid` unique key and no duplicates are inserted.
```

- [ ] **Step 4: Update §8 Known Gaps**

Remove the bullets that are now closed:
- "No heuristic suffix probing." — remove.
- "No website-to-feed synthesis." — remove.
- "No sitemap.xml / JSON-LD ItemList fallback." — remove.

Keep the remaining bullets (Playwright, LLM, content-type override).

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/architecture/feed-discovery-flow.md
git commit -m "docs: document HTML-only feed discovery fallback stages"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Ensure test DB is up and migrations applied**

```bash
cd backend && make test-db-up && uv run alembic -c packages/database/alembic.ini upgrade head
```

- [ ] **Step 2: Run the full backend test suite**

```bash
cd backend && make test
```

Expected: all pass.

- [ ] **Step 3: Manually verify acceptance scenarios with the dev stack**

1. Start dev stack: `make up && make db-upgrade && make api & make worker &`.
2. Subscribe to a site with no `<link>` but a reachable `/feed.xml` → expect 201 with `source_type="feed"`.
3. Subscribe to `https://mmguo.dev/` (JSON-LD ItemList, no RSS) → expect 201 with `source_type="synthetic_jsonld"`; manually refresh; no duplicate entries.
4. Subscribe to a static blog with only `/sitemap.xml` → expect 201 with `source_type="synthetic_sitemap"`.
5. Subscribe to a pure HTML page with none of the above → expect 400.

Document any gaps found. No auto-reverts — if a regression is discovered, create a follow-up task.

- [ ] **Step 4: Final commit / PR prep**

```bash
git log --oneline main..HEAD
```

Confirm commit sequence is clean, each commit stands on its own.

---

## Test Strategy Summary

| Layer | Test file | What it covers |
|---|---|---|
| Unit | `tests/test_synthetic.py` | `canonicalize_entry_url`, `extract_jsonld_itemlist`, `parse_sitemap_xml`, `filter_sitemap_entries`, `synthesize_rss` |
| Integration (pure) | `tests/test_discoverer.py` | Stage A/B/C dispatch via `MockTransport`; existing tests unchanged |
| Integration (DB + worker) | `apps/worker/tests/test_feed_fetcher.py` | synthetic refresh path — landing page re-scan, entries inserted; guid stability (no duplicates on repeat run) |
| Migration | `packages/database/tests` | existing schema tests continue to pass |

The `MockTransport` helper from `test_discoverer.py` is reused everywhere — no respx dependency.

## Risk & Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Stage A slow on sites with many 5xx suffix responses | 5s per-request timeout; parallel `gather` | `GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED=false` |
| Stage B synthesizes a useless "feed" from a JSON-LD ItemList that isn't actually posts | Only entries with non-empty `url` are kept; list restricted to `ItemList`; if post-subscription user sees noise, disable per-subscription by the user deleting it | `GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED=false` |
| Stage C producers huge sitemaps | 5 MB body cap; 3 child sitemap cap; 50-entry result cap | `GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED=false` |
| Synthetic feed guids drift across refreshes | Canonical URL normalization (strip tracking, sort params, normalize trailing slash) | If drift still occurs, a follow-up can add URL→guid mapping per-feed in DB |
| Worker fetch breaks for existing feeds | `fetch_or_synthesize_feed` delegates to unchanged `fetch_feed` when source_type is `feed` / `rsshub` / unknown; RSSHub fallback URLs (`idx > 0`) always use `fetch_feed` directly | Revert the worker-side change (single line) |
| Migration leaves orphan rows on downgrade | Downgrade explicitly resets any `synthetic_*` rows to `feed` before reinstating the old constraint | Migration is reversible |

---

## Handoff

Plan saved to `docs/exec-plans/active/2026-04-22-html-only-feed-discovery-fallback.md`. **Pausing for user review before implementation begins.** Please confirm the design-note decisions (especially §1: dropping `synthetic_suffix`, §2: refresh model, §3: canonicalization rules, §5: env-var flags) or request changes.
