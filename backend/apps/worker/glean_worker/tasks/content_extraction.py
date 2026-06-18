"""Shared helpers for extracting and evaluating entry full text."""

import re
from dataclasses import dataclass

from glean_rss import fetch_and_extract_fulltext

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SUMMARY_ONLY_MULTIPLIER = 1.25
_MIN_MEANINGFUL_CONTENT_LENGTH = 400


@dataclass(slots=True)
class EntryContentUpdate:
    """Normalized content extraction result for entry pipelines."""

    content: str | None
    source: str | None
    error: str | None = None


def strip_html_to_text(html: str | None) -> str:
    """Convert a small HTML snippet to normalized plain text."""
    if not html:
        return ""
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", html)).strip()


def content_is_summary_like(content: str | None, summary: str | None) -> bool:
    """Return True when entry content is missing or effectively just the summary teaser."""
    content_text = strip_html_to_text(content)
    if not content_text:
        return True

    summary_text = strip_html_to_text(summary)
    if not summary_text:
        return len(content_text) < _MIN_MEANINGFUL_CONTENT_LENGTH

    if content_text == summary_text:
        return True

    if len(content_text) < _MIN_MEANINGFUL_CONTENT_LENGTH:
        return True

    return content_text.startswith(summary_text) and len(content_text) <= int(
        len(summary_text) * _SUMMARY_ONLY_MULTIPLIER
    )


def should_backfill_entry(
    *,
    content: str | None,
    summary: str | None,
    content_source: str | None,
    content_backfill_status: str | None,
    force: bool,
) -> bool:
    """Determine whether an entry should run through content backfill."""
    if force:
        return True

    if content_source == "feed_summary_only":
        return True

    if content_backfill_status in {"pending", "failed"}:
        return True

    return content_is_summary_like(content, summary)


async def extract_entry_content_update(url: str) -> EntryContentUpdate:
    """Fetch full text for one entry URL and normalize the source label."""
    result = await fetch_and_extract_fulltext(url)
    if not result or not result.content:
        return EntryContentUpdate(
            content=None,
            source=None,
            error=(result.error_reason if result else None) or "empty_extraction",
        )

    source = "backfill_browser" if result.used_browser else "backfill_http"
    return EntryContentUpdate(content=result.content, source=source)
