"""HTML → plain text extraction and length-based truncation for LLM input.

Article bodies arrive as untrusted HTML. We strip scripts/styles/iframes,
walk block-level descendants to preserve paragraph boundaries, and (when the
result exceeds a budget) keep the head and tail with an explicit truncation
marker in between.

The truncation strategy is deliberately simple — no semantic chunking —
so behavior is predictable across every feed shape.
"""

import re

from bs4 import BeautifulSoup, Tag

_REMOVE_TAGS = ("script", "style", "svg", "iframe", "noscript", "form")
_BLOCK_TAGS = {
    "p", "div", "section", "article", "header", "footer", "main", "aside",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "pre", "tr", "td", "th",
}
_TRUNCATION_MARKER = "\n\n[...truncated...]\n\n"


def extract_plain_text(html: str | None) -> str:
    """Return article body as plain text.

    Block-level elements (`<p>`, `<div>`, headings, list items, …) become
    paragraph boundaries (joined by `\\n\\n`). Whitespace inside an element
    collapses to single spaces.
    """
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag_name in _REMOVE_TAGS:
        for node in soup.find_all(tag_name):
            node.decompose()

    paragraphs: list[str] = []

    def visit(node: Tag) -> None:
        if node.name in _BLOCK_TAGS:
            text = re.sub(r"\s+", " ", node.get_text(separator=" ")).strip()
            if text:
                paragraphs.append(text)
            return
        for child in node.children:
            if isinstance(child, Tag):
                visit(child)

    for child in soup.children:
        if isinstance(child, Tag):
            visit(child)

    if paragraphs:
        return "\n\n".join(paragraphs)

    # No block-level structure (e.g. raw text or only inline tags) — collapse all.
    return re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()


def truncate_for_llm(text: str, max_chars: int) -> str:
    """If text exceeds max_chars, return head + marker + tail; else return as-is.

    Head is 2/3 of the budget, tail is 1/3 (4000 + 2000 at the default 6000).
    """
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    if len(text) <= max_chars:
        return text
    head_size = (max_chars * 2) // 3
    tail_size = max_chars - head_size
    return text[:head_size] + _TRUNCATION_MARKER + text[-tail_size:]
