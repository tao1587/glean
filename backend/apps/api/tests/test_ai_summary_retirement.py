"""Retired summary URLs stay unavailable without authenticating or opening a DB."""

import pytest
from httpx import ASGITransport, AsyncClient

from glean_api.main import create_app


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/today/ai/summary:lookup"),
        ("POST", "/api/today/ai/summary:generate"),
        ("POST", "/api/today/ai/summary:retry"),
        ("GET", "/api/system/ai-integration"),
        ("GET", "/api/admin/settings/ai-integration"),
        ("POST", "/api/admin/settings/ai-integration"),
        ("GET", "/api/ai/today-entries"),
        ("POST", "/api/ai/today-summary"),
    ],
)
async def test_retired_summary_urls_return_404(method: str, path: str) -> None:
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, path, json={"period": "day", "date": "2026-10-10"})

    assert response.status_code == 404


def test_openapi_preserves_reader_and_translation_without_summary_endpoints() -> None:
    schema = create_app().openapi()
    paths = schema["paths"]

    assert "/api/entries" in paths
    assert "/api/entries/translate-texts" in paths
    assert "/api/feeds/discover" in paths
    assert "/api/system/vectorization-status" in paths
    assert not any("/ai" in path for path in paths)
    assert "AIIntegrationConfigResponse" not in schema["components"]["schemas"]
