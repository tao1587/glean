"""
Full-text content extractor.

Uses readability-lxml (Mozilla's Readability algorithm) to extract main content from web pages.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, cast
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag
from readability import Document

if TYPE_CHECKING:
    from playwright.async_api import Browser, Playwright, Route

try:
    from playwright.async_api import async_playwright
except ImportError:  # pragma: no cover - exercised in environments without Playwright installed
    async_playwright = None

# Minimum content length threshold for successful extraction.
# 100 characters is chosen as a reasonable minimum to avoid storing
# snippets from failed extractions while still capturing short-form content.
MIN_CONTENT_LENGTH = 100
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_BROWSER_MAX_CONCURRENCY = 1
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; GleanBot/1.0)"
SEMANTIC_CONTENT_SELECTORS = (
    "article",
    "main article",
    "[role='main'] article",
    "main",
)
CHALLENGE_MARKERS = (
    "enable javascript and cookies to continue",
    "challenge-error-text",
    "cf-chl-",
    "attention required!",
)
CLIENT_ERROR_MARKERS = (
    "application error: a client-side exception has occurred while loading",
    "see the browser console for more information",
)
SHELL_MARKERS = (
    "<!--$?-->",
    "<template id=\"b:",
    "self.__next_f.push",
    "next_redirect",
)
BLOCKED_STATUS_CODES = {401, 403, 429, 503}

logger = logging.getLogger(__name__)
_playwright_instance: Playwright | None = None
_browser_instance: Browser | None = None
_browser_lock = asyncio.Lock()
_browser_semaphore: asyncio.Semaphore | None = None


@dataclass
class FetchResult:
    """HTML fetch result used by HTTP and browser acquisition paths."""

    html: str
    fetched_url: str
    status_code: int | None = None
    challenge_detected: bool = False
    used_browser: bool = False


@dataclass
class ExtractionResult:
    """Structured extraction result for downstream logging and storage decisions."""

    content: str | None
    method: str
    fetched_url: str
    status_code: int | None = None
    challenge_detected: bool = False
    used_browser: bool = False
    error_reason: str | None = None


def _is_relative_url(url: str) -> bool:
    """Check if a URL is relative."""
    parsed = urlparse(url)
    return not parsed.scheme and not parsed.netloc


def _get_timeout_seconds() -> float:
    """Return configured extraction timeout in seconds."""
    raw_value = os.getenv("BROWSER_EXTRACTION_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return float(DEFAULT_TIMEOUT_SECONDS)


def _is_browser_extraction_enabled() -> bool:
    """Return whether browser fallback is enabled."""
    return os.getenv("BROWSER_EXTRACTION_ENABLED", "true").lower() not in {"0", "false", "no"}


def _get_browser_semaphore() -> asyncio.Semaphore:
    """Return the shared concurrency limiter for browser fetches."""
    global _browser_semaphore
    if _browser_semaphore is None:
        raw_value = os.getenv(
            "BROWSER_EXTRACTION_MAX_CONCURRENCY",
            str(DEFAULT_BROWSER_MAX_CONCURRENCY),
        )
        try:
            limit = max(1, int(raw_value))
        except ValueError:
            limit = DEFAULT_BROWSER_MAX_CONCURRENCY
        _browser_semaphore = asyncio.Semaphore(limit)
    return _browser_semaphore


def _looks_like_challenge_page(html: str, status_code: int | None = None) -> bool:
    """Detect common anti-bot challenge pages."""
    lowered = html.lower()
    if status_code in BLOCKED_STATUS_CODES:
        return True
    return any(marker in lowered for marker in CHALLENGE_MARKERS)


def _looks_like_client_error_page(html: str) -> bool:
    """Detect client-rendered error pages returned instead of article content."""
    lowered = html.lower()
    return all(marker in lowered for marker in CLIENT_ERROR_MARKERS)


def _looks_like_shell_page(html: str) -> bool:
    """Detect thin shell pages that likely need browser rendering."""
    lowered = html.lower()
    if _looks_like_client_error_page(html):
        return True
    if any(marker in lowered for marker in SHELL_MARKERS):
        return True

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    body_text = " ".join(soup.get_text(" ", strip=True).split())
    if len(body_text) < MIN_CONTENT_LENGTH:
        return True

    semantic_match = any(soup.select(selector) for selector in SEMANTIC_CONTENT_SELECTORS)
    return not semantic_match and len(body_text) < MIN_CONTENT_LENGTH * 3


async def _block_non_essential_resources(route: Route) -> None:
    """Abort non-essential resources to reduce Playwright overhead."""
    if route.request.resource_type in {"image", "media", "font"}:
        await route.abort()
        return
    await route.continue_()


async def _get_browser() -> Browser:
    """Create or reuse the shared Playwright browser instance."""
    global _playwright_instance, _browser_instance
    if async_playwright is None:
        raise RuntimeError("Playwright is not installed in this environment")
    async with _browser_lock:
        if _browser_instance is not None and _browser_instance.is_connected():
            return _browser_instance

        pw = await async_playwright().start()
        _playwright_instance = pw
        ws_endpoint = os.getenv("BROWSER_WS_ENDPOINT", "").strip()
        cdp_endpoint = os.getenv("BROWSER_CDP_ENDPOINT", "").strip()
        if ws_endpoint:
            _browser_instance = await pw.chromium.connect(ws_endpoint)
        elif cdp_endpoint:
            _browser_instance = await pw.chromium.connect_over_cdp(cdp_endpoint)
        else:
            _browser_instance = await pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-renderer-backgrounding",
                    "--disable-extensions",
                ],
            )
        return _browser_instance


async def _fetch_html_http(url: str) -> FetchResult | None:
    """Fetch article HTML with plain HTTP."""
    async with httpx.AsyncClient(
        timeout=_get_timeout_seconds(),
        headers={"User-Agent": DEFAULT_USER_AGENT},
        follow_redirects=True,
    ) as client:
        try:
            response = await client.get(url)
        except Exception:
            return None

    return FetchResult(
        html=response.text,
        fetched_url=str(response.url),
        status_code=response.status_code,
        challenge_detected=_looks_like_challenge_page(response.text, response.status_code),
        used_browser=False,
    )


async def _fetch_html_browser(url: str) -> FetchResult | None:
    """Fetch article HTML with Playwright after browser rendering."""
    timeout_ms = int(_get_timeout_seconds() * 1000)
    semaphore = _get_browser_semaphore()
    async with semaphore:
        browser = await _get_browser()
        context = await browser.new_context(
            user_agent=DEFAULT_USER_AGENT,
            service_workers="block",
            viewport={"width": 1280, "height": 720},
        )
        await context.route("**/*", _block_non_essential_resources)
        page = await context.new_page()
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_selector("body", timeout=timeout_ms)
            # Many sites keep background requests open; DOM content is enough for extraction.
            with suppress(Exception):
                await page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 5000))
            html = await page.content()
            return FetchResult(
                html=html,
                fetched_url=page.url,
                status_code=response.status if response else None,
                challenge_detected=_looks_like_challenge_page(
                    html,
                    response.status if response else None,
                ),
                used_browser=True,
            )
        except Exception:
            return None
        finally:
            await context.close()


def _convert_backticks_to_code(soup: BeautifulSoup) -> None:
    """
    Convert backtick-wrapped text to <code> tags using proper HTML parsing.

    This function finds all text nodes containing backticks and converts them
    to alternating text and <code> elements. BeautifulSoup handles HTML entity
    escaping automatically when setting tag.string.

    Args:
        soup: BeautifulSoup object to process in-place.
    """
    # Find all text nodes (NavigableString) in the document
    # Collect them first to avoid modifying during iteration
    text_nodes = list(soup.find_all(string=True))

    for element in text_nodes:
        # Skip if parent is already code/pre/script/style
        if element.parent and element.parent.name in ["code", "pre", "script", "style"]:
            continue

        text = str(element)
        if "`" not in text:
            continue

        # Split on backticks and create alternating text/<code> nodes
        parts = text.split("`")
        if len(parts) <= 1:
            continue

        # Create fragment with alternating text and <code> elements
        fragment: list[NavigableString | Tag] = []
        for i, part in enumerate(parts):
            if i % 2 == 0:
                # Even indices: plain text
                if part:
                    fragment.append(NavigableString(part))
            else:
                # Odd indices: code content
                # BeautifulSoup automatically escapes HTML entities when setting .string
                code_tag = soup.new_tag("code")
                code_tag.string = part
                fragment.append(code_tag)

        # Replace original text node with fragment
        if fragment:
            element.replace_with(*fragment)


async def postprocess_html(html: str, base_url: str | None = None) -> str:
    """
    Post-process extracted HTML to fix common issues.

    - Converts relative URLs to absolute URLs for images and links
    - Converts backtick-wrapped text to <code> tags

    Runs CPU-intensive BeautifulSoup parsing in a thread pool to avoid
    blocking the event loop.

    Args:
        html: Extracted HTML content.
        base_url: Base URL for resolving relative paths.

    Returns:
        Processed HTML content.
    """
    # Parse HTML in thread pool (CPU-intensive operation)
    soup = await asyncio.to_thread(BeautifulSoup, html, "html.parser")

    # Fix relative URLs for images
    if base_url:
        for img in soup.find_all("img"):
            src = img.get("src")
            if isinstance(src, str) and _is_relative_url(src):
                img["src"] = urljoin(base_url, src)
            # Also handle data-src for lazy-loaded images
            data_src = img.get("data-src")
            if isinstance(data_src, str) and _is_relative_url(data_src):
                img["data-src"] = urljoin(base_url, data_src)
                # If src is missing or a placeholder, use data-src
                if not src or (isinstance(src, str) and ("data:" in src or "placeholder" in src)):
                    img["src"] = urljoin(base_url, data_src)
            # Handle srcset attribute on img elements (used by Astro, responsive images, etc.)
            img_srcset = img.get("srcset")
            if isinstance(img_srcset, str):
                img_srcset_parts = img_srcset.split(",")
                img_srcset_fixed: list[str] = []
                for img_srcset_part in img_srcset_parts:
                    img_srcset_part = img_srcset_part.strip()
                    if img_srcset_part:
                        img_url_parts = img_srcset_part.split()
                        if img_url_parts and _is_relative_url(img_url_parts[0]):
                            img_url_parts[0] = urljoin(base_url, img_url_parts[0])
                        img_srcset_fixed.append(" ".join(img_url_parts))
                img["srcset"] = ", ".join(img_srcset_fixed)

        # Fix relative URLs for links
        for a in soup.find_all("a"):
            href = a.get("href")
            if isinstance(href, str) and _is_relative_url(href):
                a["href"] = urljoin(base_url, href)

        # Fix relative URLs for source tags (picture elements)
        for source in soup.find_all("source"):
            source_srcset = source.get("srcset")
            if isinstance(source_srcset, str) and _is_relative_url(source_srcset.split()[0]):
                # srcset can have multiple URLs with sizes, handle them all
                source_parts = source_srcset.split(",")
                source_fixed_parts: list[str] = []
                for source_part in source_parts:
                    source_part = source_part.strip()
                    if source_part:
                        source_url_parts = source_part.split()
                        source_url_parts[0] = urljoin(base_url, source_url_parts[0])
                        source_fixed_parts.append(" ".join(source_url_parts))
                source["srcset"] = ", ".join(source_fixed_parts)

    # Convert backtick-wrapped text to <code> tags using proper HTML parsing
    _convert_backticks_to_code(soup)

    # Convert back to string in thread pool
    return await asyncio.to_thread(str, soup)


def _extract_structured_article_text(soup: BeautifulSoup) -> str | None:
    """Try to recover article text from JSON-LD blocks."""
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            payload = json.loads(raw_json)
        except json.JSONDecodeError:
            continue

        candidates = payload if isinstance(payload, list) else [payload]
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue

            article_body = candidate.get("articleBody")
            if isinstance(article_body, str) and len(article_body.strip()) > MIN_CONTENT_LENGTH:
                paragraphs = "".join(
                    f"<p>{line.strip()}</p>"
                    for line in article_body.splitlines()
                    if line.strip()
                )
                return paragraphs

    return None


def _extract_semantic_html(html: str) -> str | None:
    """
    Recover article HTML from semantic containers when Readability fails.

    This helps with modern marketing/news pages where the document structure is
    clean enough for `article` or `main`, but Readability still returns an empty
    or too-short summary.
    """
    soup = BeautifulSoup(html, "html.parser")

    structured = _extract_structured_article_text(soup)
    if structured:
        return structured

    best_candidate: Tag | None = None
    best_text_length = 0

    for selector in SEMANTIC_CONTENT_SELECTORS:
        for candidate in soup.select(selector):
            text_length = len(candidate.get_text(" ", strip=True))
            if text_length > best_text_length:
                best_candidate = candidate
                best_text_length = text_length

    if best_candidate and best_text_length > MIN_CONTENT_LENGTH:
        return str(best_candidate)

    return None


async def extract_fulltext(html: str, url: str | None = None) -> str | None:
    """
    Extract main content from HTML using Mozilla's Readability algorithm.

    Args:
        html: Raw HTML content.
        url: Optional URL for better extraction context.

    Returns:
        Extracted HTML content or None if extraction fails.
    """
    try:
        doc = Document(html, url=url)
        content = cast(str, doc.summary())
        if content and len(content) > MIN_CONTENT_LENGTH:
            return await postprocess_html(content, base_url=url)

        semantic_content = await asyncio.to_thread(_extract_semantic_html, html)
        if semantic_content and len(semantic_content) > MIN_CONTENT_LENGTH:
            return await postprocess_html(semantic_content, base_url=url)

        return None
    except Exception:
        return None


async def fetch_and_extract_fulltext(url: str) -> ExtractionResult | None:
    """
    Fetch a URL and extract its main content.

    Args:
        url: URL to fetch and extract content from.

    Returns:
        Structured extraction result or None if all strategies fail.
    """
    http_is_client_error = False
    http_looks_like_shell = False
    http_result = await _fetch_html_http(url)
    if http_result is None:
        if not _is_browser_extraction_enabled():
            return ExtractionResult(
                content=None,
                method="http",
                fetched_url=url,
                used_browser=False,
                error_reason="http_fetch_failed",
            )
    else:
        http_is_client_error = _looks_like_client_error_page(http_result.html)
        http_looks_like_shell = _looks_like_shell_page(http_result.html)

    if (
        http_result is not None
        and not http_result.challenge_detected
        and not http_is_client_error
    ):
        extracted = await extract_fulltext(http_result.html, url=http_result.fetched_url)
        if extracted and not http_looks_like_shell:
            return ExtractionResult(
                content=extracted,
                method="http",
                fetched_url=http_result.fetched_url,
                status_code=http_result.status_code,
                challenge_detected=False,
                used_browser=False,
            )
        if not http_looks_like_shell:
            return ExtractionResult(
                content=None,
                method="http",
                fetched_url=http_result.fetched_url,
                status_code=http_result.status_code,
                challenge_detected=False,
                used_browser=False,
                error_reason="http_readability_empty",
            )

    should_try_browser = _is_browser_extraction_enabled()
    if should_try_browser and (
        http_result is None
        or http_result.challenge_detected
        or http_result.status_code in BLOCKED_STATUS_CODES
        or http_is_client_error
        or http_looks_like_shell
    ):
        browser_result = await _fetch_html_browser(url)
        if browser_result is None:
            logger.debug(f"Browser extraction failed for article_url={url}")
            return ExtractionResult(
                content=None,
                method="browser",
                fetched_url=http_result.fetched_url if http_result is not None else url,
                status_code=http_result.status_code if http_result is not None else None,
                challenge_detected=False,
                used_browser=True,
                error_reason="browser_fetch_failed",
            )

        browser_is_client_error = _looks_like_client_error_page(browser_result.html)
        if browser_result.challenge_detected:
            logger.debug(f"Browser extraction failed for article_url={url}")
            return ExtractionResult(
                content=None,
                method="browser",
                fetched_url=browser_result.fetched_url,
                status_code=browser_result.status_code,
                challenge_detected=True,
                used_browser=True,
                error_reason="browser_challenge_page",
            )
        if browser_is_client_error:
            logger.debug(f"Browser extraction failed for article_url={url}")
            return ExtractionResult(
                content=None,
                method="browser",
                fetched_url=browser_result.fetched_url,
                status_code=browser_result.status_code,
                challenge_detected=False,
                used_browser=True,
                error_reason="browser_client_error_page",
            )

        extracted = await extract_fulltext(browser_result.html, url=browser_result.fetched_url)
        if extracted:
            return ExtractionResult(
                content=extracted,
                method="browser",
                fetched_url=browser_result.fetched_url,
                status_code=browser_result.status_code,
                challenge_detected=False,
                used_browser=True,
            )

        logger.debug(f"Browser extraction failed for article_url={url}")
        return ExtractionResult(
            content=None,
            method="browser",
            fetched_url=browser_result.fetched_url,
            status_code=browser_result.status_code,
            challenge_detected=False,
            used_browser=True,
            error_reason="browser_readability_empty",
        )

    if http_result is None:
        return ExtractionResult(
            content=None,
            method="http",
            fetched_url=url,
            used_browser=False,
            error_reason="http_fetch_failed",
        )
    if http_result.challenge_detected:
        return ExtractionResult(
            content=None,
            method="http",
            fetched_url=http_result.fetched_url,
            status_code=http_result.status_code,
            challenge_detected=True,
            used_browser=False,
            error_reason="http_challenge_page",
        )
    if http_is_client_error:
        return ExtractionResult(
            content=None,
            method="http",
            fetched_url=http_result.fetched_url,
            status_code=http_result.status_code,
            challenge_detected=False,
            used_browser=False,
            error_reason="http_client_error_page",
        )
    if http_looks_like_shell:
        return ExtractionResult(
            content=None,
            method="http",
            fetched_url=http_result.fetched_url,
            status_code=http_result.status_code,
            challenge_detected=False,
            used_browser=False,
            error_reason="http_shell_page",
        )

    return ExtractionResult(
        content=None,
        method="http",
        fetched_url=http_result.fetched_url,
        status_code=http_result.status_code,
        challenge_detected=False,
        used_browser=False,
        error_reason="empty_extraction",
    )
