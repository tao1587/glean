"""
RSS processing package.

Provides RSS/Atom parsing, feed discovery, and OPML import/export.
"""

from .discoverer import (
    SOURCE_TYPE_FEED,
    SOURCE_TYPE_SYNTHETIC_JSONLD,
    SOURCE_TYPE_SYNTHETIC_SITEMAP,
    FeedNotFoundError,
    discover_feed,
    fetch_feed,
    fetch_or_synthesize_feed,
)
from .extractor import (
    ExtractionResult,
    extract_fulltext,
    fetch_and_extract_fulltext,
    postprocess_html,
)
from .opml import OPMLFeed, OPMLParseResult, generate_opml, parse_opml, parse_opml_with_folders
from .parser import ParsedEntry, ParsedFeed, parse_feed
from .utils import strip_html_tags

__all__ = [
    "parse_feed",
    "ParsedFeed",
    "ParsedEntry",
    "discover_feed",
    "FeedNotFoundError",
    "fetch_feed",
    "fetch_or_synthesize_feed",
    "SOURCE_TYPE_FEED",
    "SOURCE_TYPE_SYNTHETIC_JSONLD",
    "SOURCE_TYPE_SYNTHETIC_SITEMAP",
    "extract_fulltext",
    "ExtractionResult",
    "fetch_and_extract_fulltext",
    "postprocess_html",
    "parse_opml",
    "parse_opml_with_folders",
    "generate_opml",
    "OPMLFeed",
    "OPMLParseResult",
    "strip_html_tags",
]
