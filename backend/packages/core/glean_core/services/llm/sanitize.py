"""Sanitize LLM string outputs before persisting / rendering.

Defense in depth — even with the prompt-level "untrusted data" framing, a model
may echo malicious content from the article block into its structured output.
We strip HTML, enforce length, and constrain tag character sets.
"""

import re

from bs4 import BeautifulSoup

# Allow alphanumerics, CJK characters, spaces, and hyphens. Drop everything else.
_TAG_ALLOWED = re.compile(r"[^\w\s一-鿿-]")
_DEFAULT_MAX_TAGS = 4
_DEFAULT_TAG_CHARS = 8


def sanitize_string(value: str | None, *, max_chars: int = 1000) -> str | None:
    """Strip HTML, collapse whitespace, and truncate to max_chars."""
    if value is None:
        return None
    text = BeautifulSoup(value, "html.parser").get_text()
    return text[:max_chars]


def sanitize_string_list(
    values: list[str] | None, *, max_chars: int, max_items: int
) -> list[str]:
    """Apply sanitize_string to each item, drop empties, cap to max_items."""
    if not values:
        return []
    cleaned: list[str] = []
    for raw in values[:max_items]:
        s = sanitize_string(raw, max_chars=max_chars)
        if s:
            cleaned.append(s)
    return cleaned


def sanitize_tags(
    values: list[str] | None,
    *,
    max_items: int = _DEFAULT_MAX_TAGS,
    max_chars: int = _DEFAULT_TAG_CHARS,
) -> list[str]:
    """Tags allow alphanumerics, CJK, spaces, hyphens; everything else stripped."""
    if not values:
        return []
    out: list[str] = []
    for raw in values[:max_items]:
        cleaned = _TAG_ALLOWED.sub("", raw or "").strip()
        if cleaned:
            out.append(cleaned[:max_chars])
    return out
