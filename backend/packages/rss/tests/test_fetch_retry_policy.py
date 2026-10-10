"""HTTP-boundary regression tests for feed retry amplification."""

from unittest.mock import patch

import httpx
import pytest

from glean_rss.discoverer import fetch_feed


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 404, 429])
async def test_client_errors_are_not_immediately_requested_again(status):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(status, request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    with (
        patch("glean_rss.discoverer.httpx.AsyncClient", return_value=client),
        pytest.raises(ValueError) as failure,
    ):
        await fetch_feed("https://example.test/feed.xml")

    assert len(requests) == 1
    assert isinstance(failure.value.__cause__, httpx.HTTPStatusError)
    assert failure.value.__cause__.response.status_code == status


@pytest.mark.asyncio
async def test_temporary_server_error_still_gets_one_bounded_retry():
    requests = []

    def respond(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(200, text="<rss />", headers={"etag": "canary"}, request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    with patch("glean_rss.discoverer.httpx.AsyncClient", return_value=client):
        result = await fetch_feed("https://example.test/feed.xml")

    assert result == ("<rss />", {"etag": "canary"})
    assert len(requests) == 2
