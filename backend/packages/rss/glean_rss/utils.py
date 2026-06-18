"""
Utility functions for text processing.

Provides HTML stripping and text cleaning utilities.
"""

from bs4 import BeautifulSoup


def strip_html_tags(html: str | None, max_length: int = 300) -> str | None:
    """
    Strip HTML tags from a string and return plain text.

    Uses BeautifulSoup for robust HTML parsing.

    Args:
        html: HTML string to strip.
        max_length: Maximum length of the returned string.

    Returns:
        Plain text with HTML tags removed, or None if input is None/empty.
    """
    if not html:
        return None

    # Parse with BeautifulSoup
    soup = BeautifulSoup(html, "lxml")

    # Remove unwanted elements
    for tag in soup(["script", "style", "img", "iframe", "svg"]):
        tag.decompose()

    # Get text content
    text = soup.get_text(separator=" ")

    # Normalize whitespace
    text = " ".join(text.split())

    if not text:
        return None

    # Truncate if too long
    if len(text) > max_length:
        text = text[: max_length - 3].rsplit(" ", 1)[0] + "..."

    return text
