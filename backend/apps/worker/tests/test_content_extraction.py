"""Tests for content extraction error normalization."""

from unittest.mock import AsyncMock, patch

import pytest

from glean_worker.tasks.content_extraction import extract_entry_content_update


class TestExtractEntryContentUpdate:
    """Ensure extractor failures preserve their specific reasons."""

    @pytest.mark.asyncio
    async def test_preserves_specific_extraction_error_reason(self):
        with patch(
            "glean_worker.tasks.content_extraction.fetch_and_extract_fulltext",
            new=AsyncMock(
                return_value=type(
                    "Result",
                    (),
                    {
                        "content": None,
                        "used_browser": False,
                        "error_reason": "browser_client_error_page",
                    },
                )()
            ),
        ):
            result = await extract_entry_content_update("https://example.com/article")

        assert result.content is None
        assert result.source is None
        assert result.error == "browser_client_error_page"

    @pytest.mark.asyncio
    async def test_falls_back_to_empty_extraction_when_reason_is_missing(self):
        with patch(
            "glean_worker.tasks.content_extraction.fetch_and_extract_fulltext",
            new=AsyncMock(return_value=None),
        ):
            result = await extract_entry_content_update("https://example.com/article")

        assert result.content is None
        assert result.source is None
        assert result.error == "empty_extraction"
