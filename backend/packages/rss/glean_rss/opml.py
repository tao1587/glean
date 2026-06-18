"""
OPML import/export.

Handles OPML file parsing and generation for feed subscription management.
"""

from datetime import UTC, datetime
from typing import Any
from xml.etree import ElementTree as ET


class OPMLFeed:
    """OPML feed entry."""

    def __init__(
        self,
        title: str,
        xml_url: str,
        html_url: str | None = None,
        folder: str | None = None,
    ):
        """
        Initialize OPML feed entry.

        Args:
            title: Feed title.
            xml_url: Feed XML URL.
            html_url: Optional feed website URL.
            folder: Optional folder/category name.
        """
        self.title = title
        self.xml_url = xml_url
        self.html_url = html_url
        self.folder = folder


class OPMLParseResult:
    """Result of OPML parsing with feeds and folder information."""

    def __init__(self, feeds: list[OPMLFeed], folders: list[str]):
        """
        Initialize OPML parse result.

        Args:
            feeds: List of feed entries.
            folders: List of unique folder names (in order of appearance).
        """
        self.feeds = feeds
        self.folders = folders


def parse_opml(content: str) -> list[OPMLFeed]:
    """
    Parse OPML file (legacy function for backward compatibility).

    Args:
        content: OPML XML content.

    Returns:
        List of OPML feed entries.

    Raises:
        ValueError: If OPML parsing fails.
    """
    result = parse_opml_with_folders(content)
    return result.feeds


def parse_opml_with_folders(content: str) -> OPMLParseResult:
    """
    Parse OPML file with folder structure.

    Args:
        content: OPML XML content.

    Returns:
        OPMLParseResult with feeds and folders.

    Raises:
        ValueError: If OPML parsing fails.
    """
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f"Invalid OPML format: {e}") from e

    feeds: list[OPMLFeed] = []
    folders: list[str] = []
    seen_folders: set[str] = set()
    body = root.find("body")
    if body is None:
        return OPMLParseResult(feeds=feeds, folders=folders)

    def process_outline(outline: ET.Element, parent_folder: str | None = None) -> None:
        """Recursively process outline elements."""
        xml_url = outline.get("xmlUrl")

        if xml_url:
            # This is a feed entry
            title = outline.get("title") or outline.get("text", "")
            html_url = outline.get("htmlUrl")
            feeds.append(
                OPMLFeed(
                    title=title,
                    xml_url=xml_url,
                    html_url=html_url,
                    folder=parent_folder,
                )
            )
        else:
            # This is a folder/category - process children
            folder_name = outline.get("title") or outline.get("text")
            if folder_name:
                # Track unique folders in order of appearance
                if folder_name not in seen_folders:
                    folders.append(folder_name)
                    seen_folders.add(folder_name)

                # Process child elements with this folder as parent
                for child in outline:
                    process_outline(child, folder_name)
            else:
                # No folder name, process children without folder
                for child in outline:
                    process_outline(child, parent_folder)

    # Process top-level outlines
    for outline in body:
        process_outline(outline)

    return OPMLParseResult(feeds=feeds, folders=folders)


def generate_opml(feeds: list[dict[str, Any]], title: str = "Glean Subscriptions") -> str:
    """
    Generate OPML file from feeds with folder structure.

    Args:
        feeds: List of feed dictionaries with 'title', 'url', optional 'site_url',
               and optional 'folder' (folder name).
        title: OPML document title.

    Returns:
        OPML XML string.
    """
    # Create root element
    opml = ET.Element("opml", version="2.0")

    # Create head
    head = ET.SubElement(opml, "head")
    title_elem = ET.SubElement(head, "title")
    title_elem.text = title

    date_created = ET.SubElement(head, "dateCreated")
    date_created.text = datetime.now(UTC).strftime("%a, %d %b %Y %H:%M:%S GMT")

    # Create body
    body = ET.SubElement(opml, "body")

    # Group feeds by folder
    folder_map: dict[str | None, list[dict[str, Any]]] = {}
    for feed in feeds:
        folder_name = feed.get("folder")
        if folder_name not in folder_map:
            folder_map[folder_name] = []
        folder_map[folder_name].append(feed)

    def add_feed_outline(parent: ET.Element, feed: dict[str, Any]) -> None:
        """Add a feed outline element to parent."""
        outline = ET.SubElement(
            parent,
            "outline",
            type="rss",
            text=feed.get("title", ""),
            title=feed.get("title", ""),
            xmlUrl=feed.get("url", ""),
        )
        if feed.get("site_url"):
            outline.set("htmlUrl", feed["site_url"])

    # Add ungrouped feeds first (those without folder)
    for feed in folder_map.get(None, []):
        add_feed_outline(body, feed)

    # Add folder groups
    for folder_name, folder_feeds in folder_map.items():
        if folder_name is None:
            continue  # Already handled above

        # Create folder outline
        folder_outline = ET.SubElement(
            body,
            "outline",
            text=folder_name,
            title=folder_name,
        )

        # Add feeds to folder
        for feed in folder_feeds:
            add_feed_outline(folder_outline, feed)

    # Generate XML
    tree = ET.ElementTree(opml)
    ET.indent(tree, space="  ")

    import io

    output = io.BytesIO()
    tree.write(output, encoding="utf-8", xml_declaration=True)
    return output.getvalue().decode("utf-8")
