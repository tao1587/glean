"""Translation API errors stay bounded while cached results preserve input order."""

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from glean_api.dependencies import get_current_user, get_translation_service
from glean_api.main import create_app
from glean_core.schemas.user import UserResponse, UserSettings
from glean_core.services.translation_providers import GoogleFreeProvider, MTranProvider


class MemoryTranslations:
    def __init__(self, cached: dict[str, str] | None = None) -> None:
        self.cached = dict(cached or {})

    async def get_paragraph_translations(self, _entry_id: str, _target: str) -> dict[str, str]:
        return self.cached

    async def save_paragraph_translations(
        self, _entry_id: str, _target: str, values: dict[str, str]
    ) -> None:
        self.cached.update(values)


def translation_app(cache: MemoryTranslations | None = None):
    app = create_app()
    user = UserResponse(
        id="test-user",
        email="test@example.com",
        is_active=True,
        is_verified=False,
        created_at=datetime.now(UTC),
        settings=UserSettings(translation_provider="google"),
    )
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_translation_service] = lambda: cache or MemoryTranslations()
    return app


@pytest.mark.asyncio
async def test_google_rate_limit_returns_retry_after_without_repeating_network_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from deep_translator.exceptions import TooManyRequests

    monkeypatch.setattr(GoogleFreeProvider, "_rate_limited_until", 0.0, raising=False)
    requests: list[str] = []

    class RateLimitedGoogleTranslator:
        def __init__(self, **_kwargs: object) -> None:
            pass

        def translate(self, text: str) -> str:
            requests.append(text)
            raise TooManyRequests()

    monkeypatch.setattr("deep_translator.GoogleTranslator", RateLimitedGoogleTranslator)
    app = translation_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = await client.post(
            "/api/entries/translate-texts", json={"texts": ["hello"], "target_language": "zh-CN"}
        )
        second = await client.post(
            "/api/entries/translate-texts", json={"texts": ["another"], "target_language": "zh-CN"}
        )

    assert first.status_code == second.status_code == 429
    assert 1 <= int(first.headers["retry-after"]) <= 60
    assert 1 <= int(second.headers["retry-after"]) <= 60
    assert requests == ["hello"]


@pytest.mark.asyncio
async def test_mtran_rate_limit_preserves_retry_after_without_single_request_fanout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(429, headers={"Retry-After": "7"}, json={"error": "rate limited"})

    real_client = httpx.Client
    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    monkeypatch.setattr(
        "glean_api.routers.entries.create_translation_provider",
        lambda _: MTranProvider(base_url="http://mtran.local"),
    )
    app = translation_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/entries/translate-texts",
            json={"texts": ["first", "second"], "target_language": "zh-CN"},
        )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "7"
    assert [request.url.path for request in requests] == ["/translate/batch"]


@pytest.mark.asyncio
async def test_provider_factory_failure_is_mapped_without_sensitive_exception_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def factory(_settings: object) -> None:
        raise RuntimeError("private-provider-token-do-not-expose")

    monkeypatch.setattr("glean_api.routers.entries.create_translation_provider", factory)
    app = translation_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/entries/translate-texts", json={"texts": ["hello"], "target_language": "zh-CN"}
        )

    assert response.status_code == 502
    assert "private-provider-token" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("translations", [["only one"], ["first", {"invalid": "shape"}]])
async def test_invalid_provider_result_is_502_without_persisting_partial_cache(
    monkeypatch: pytest.MonkeyPatch,
    translations: list[Any],
) -> None:
    class InvalidProvider:
        def translate_batch(self, _texts: list[str], _source: str, _target: str) -> list[Any]:
            return translations

    monkeypatch.setattr(
        "glean_api.routers.entries.create_translation_provider", lambda _: InvalidProvider()
    )
    cache = MemoryTranslations()
    app = translation_app(cache)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/entries/translate-texts",
            json={"texts": ["first", "second"], "target_language": "zh-CN", "entry_id": "entry-id"},
        )

    assert response.status_code == 502
    assert cache.cached == {}


@pytest.mark.asyncio
async def test_translation_preserves_cached_hits_duplicates_empty_inputs_and_language(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Provider:
        def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
            assert texts == ["fresh"]
            assert (source, target) == ("en", "zh-CN")
            return ["新翻译"]

    monkeypatch.setattr(
        "glean_api.routers.entries.create_translation_provider", lambda _: Provider()
    )
    cache = MemoryTranslations({"cached": "已有翻译"})
    app = translation_app(cache)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/entries/translate-texts",
            json={
                "texts": ["cached", "", "fresh", "cached", " \t"],
                "source_language": "en",
                "target_language": "zh-CN",
                "entry_id": "entry-id",
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "translations": ["已有翻译", "", "新翻译", "已有翻译", ""],
        "target_language": "zh-CN",
    }
    assert cache.cached == {"cached": "已有翻译", "fresh": "新翻译"}


@pytest.mark.asyncio
async def test_fully_cached_request_does_not_create_unavailable_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable_factory(_settings: object) -> None:
        raise AssertionError("Cached requests must not contact a provider")

    monkeypatch.setattr(
        "glean_api.routers.entries.create_translation_provider", unavailable_factory
    )
    app = translation_app(MemoryTranslations({"cached": "已有翻译"}))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/entries/translate-texts",
            json={"texts": ["cached", ""], "target_language": "zh-CN", "entry_id": "entry-id"},
        )

    assert response.status_code == 200
    assert response.json()["translations"] == ["已有翻译", ""]
