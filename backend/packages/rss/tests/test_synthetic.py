"""Tests for synthetic feed synthesis helpers."""

from datetime import UTC, datetime

import pytest

from glean_rss.synthetic import (
    MAX_SITEMAP_ENTRIES,
    SitemapEntry,
    SyntheticEntry,
    canonicalize_entry_url,
    extract_jsonld_itemlist,
    filter_sitemap_entries,
    parse_sitemap_xml,
    synthesize_rss,
)


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


_LANDING_WITH_WEBSITE_GRAPH = """<!DOCTYPE html>
<html><head>
<title>mmguo</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "WebSite", "name": "mm guo", "url": "https://example.com/"},
    {"@type": "Person", "name": "Lingbo Guo"},
    {
      "@type": "ItemList",
      "name": "All Content",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "url": "https://example.com/post-a", "name": "Post A"}
      ]
    }
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
        assert entries[1].link == "https://example.com/post-b"
        assert entries[1].guid == "https://example.com/post-b"

    def test_returns_empty_when_no_itemlist(self) -> None:
        _title, entries = extract_jsonld_itemlist(_LANDING_NO_ITEMLIST)
        assert entries == []

    def test_ignores_itemlist_with_empty_urls(self) -> None:
        html = (
            '<html><head><script type="application/ld+json">'
            '{"@type":"ItemList","itemListElement":[{"url":""}]}'
            "</script></head></html>"
        )
        _title, entries = extract_jsonld_itemlist(html)
        assert entries == []

    def test_falls_back_to_page_title_when_itemlist_has_no_name(self) -> None:
        html = _LANDING_WITH_ITEMLIST.replace('"name": "Recent Posts",', "")
        title, entries = extract_jsonld_itemlist(html)
        assert title == "My Blog"
        assert len(entries) == 2

    def test_prefers_website_name_over_itemlist_name_in_graph(self) -> None:
        title, entries = extract_jsonld_itemlist(_LANDING_WITH_WEBSITE_GRAPH)
        assert title == "mm guo"
        assert len(entries) == 1


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
        assert child_sitemaps == [
            "https://example.com/sitemap-a.xml",
            "https://example.com/sitemap-b.xml",
        ]

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
                loc=f"https://example.com/posts/{i}",
                lastmod=datetime(2026, 4, 1, tzinfo=UTC) + (datetime(2026, 4, 2, tzinfo=UTC) - datetime(2026, 4, 1, tzinfo=UTC)) * i,
            )
            for i in range(MAX_SITEMAP_ENTRIES + 10)
        ]
        kept = filter_sitemap_entries(raw, origin="https://example.com")
        assert len(kept) == MAX_SITEMAP_ENTRIES
        assert kept[0].loc == f"https://example.com/posts/{MAX_SITEMAP_ENTRIES + 9}"


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
        assert parsed.entries[1].title == ""

    def test_synthesized_feed_is_stable_given_same_input(self) -> None:
        entries = [
            SyntheticEntry(title="x", link="https://example.com/a", guid="https://example.com/a")
        ]
        xml1 = synthesize_rss("Blog", "https://example.com", entries)
        xml2 = synthesize_rss("Blog", "https://example.com", entries)
        assert xml1 == xml2

    def test_escapes_special_characters(self) -> None:
        entries = [
            SyntheticEntry(
                title="A & B <c>",
                link="https://example.com/a?x=1&y=2",
                guid="https://example.com/a?x=1&y=2",
            )
        ]
        xml = synthesize_rss("Title & More", "https://example.com", entries)
        assert "&amp;" in xml
        assert "<c>" not in xml
        assert "&lt;c&gt;" in xml
