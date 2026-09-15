"""Tests for translation providers."""

import json
from typing import Any

import pytest

from glean_core.schemas.user import UserSettings
from glean_core.services.translation_providers import (
    DEFAULT_MTRAN_SERVER_URL,
    MTRAN_MAX_PAYLOAD_SIZE,
    FallbackProvider,
    GoogleFreeProvider,
    MTranProvider,
    _parse_openai_batch_response,
    create_translation_provider,
)


class _FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise Exception(f"HTTP Error {self.status_code}")
        return None

    def json(self) -> Any:
        return self._payload

    @property
    def text(self) -> str:
        return json.dumps(self._payload)


class _FakeClient:
    def __init__(self, payload: Any):
        self.payload = payload
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[no-untyped-def]
        return False

    def post(self, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append((url, kwargs))
        json_data = _request_json(kwargs)
        if "texts" not in json_data and "text" not in json_data:
            return _FakeResponse(self.payload)

        # For single translate fallback, _FakeClient usually expects result/translation key
        if "text" in json_data:
            text = json_data["text"]
            # If payload is a list (from batch expectation), this might fail.
            # But _FakeClient is used with specific payload in tests.
            if isinstance(self.payload, dict) and "results" in self.payload:
                return _FakeResponse({"result": f"translated {text}"})

        return _FakeResponse(self.payload)


class _EchoBatchClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __enter__(self) -> "_EchoBatchClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[no-untyped-def]
        return False

    def post(self, url: str, **kwargs: Any) -> _FakeResponse:
        self.calls.append((url, kwargs))
        json_data = _request_json(kwargs)
        if "texts" in json_data:
            texts = json_data["texts"]
            return _FakeResponse({"translations": texts})
        if "text" in json_data:
            text = json_data["text"]
            return _FakeResponse({"translation": text})
        return _FakeResponse({})


def _request_json(kwargs: dict[str, Any]) -> dict[str, Any]:
    content = kwargs.get("content")
    assert isinstance(content, bytes)
    parsed = json.loads(content.decode("utf-8"))
    assert isinstance(parsed, dict)
    return parsed


def _call_json(call: tuple[str, dict[str, Any]]) -> dict[str, Any]:
    return _request_json(call[1])


def _assert_safe_request_bodies(calls: list[tuple[str, dict[str, Any]]]) -> None:
    assert calls
    for _, kwargs in calls:
        content = kwargs.get("content")
        assert isinstance(content, bytes)
        assert len(content) <= MTRAN_MAX_PAYLOAD_SIZE


def test_create_provider_returns_mtran() -> None:
    from unittest.mock import patch

    with patch(
        "glean_core.services.translation_providers._is_mtran_available",
        return_value=True,
    ):
        provider = create_translation_provider(
            {
                "translation_provider": "mtran",
                "translation_base_url": "http://localhost:8080",
                "translation_api_key": "token-123",
                "translation_model": "mtran-large",
            }
        )

    assert isinstance(provider, FallbackProvider)
    assert isinstance(provider.primary, MTranProvider)
    assert provider.primary.base_url == "http://localhost:8080"
    assert provider.primary.api_key == "token-123"
    assert provider.primary.model == "mtran-large"


def test_create_provider_accepts_user_settings_model() -> None:
    from unittest.mock import patch

    with patch(
        "glean_core.services.translation_providers._is_mtran_available",
        return_value=True,
    ):
        provider = create_translation_provider(
            UserSettings(
                translation_provider="mtran",
                translation_base_url="http://localhost:8080",
                translation_api_key="token-123",
                translation_model="mtran-large",
            )
        )

    assert isinstance(provider, FallbackProvider)
    assert isinstance(provider.primary, MTranProvider)
    assert provider.primary.base_url == "http://localhost:8080"


def test_create_provider_falls_back_when_mtran_unavailable() -> None:
    from unittest.mock import patch

    with patch(
        "glean_core.services.translation_providers._is_mtran_available",
        return_value=False,
    ):
        provider = create_translation_provider(
            {
                "translation_provider": "mtran",
                "translation_base_url": "http://localhost:8080",
            }
        )

    assert isinstance(provider, GoogleFreeProvider)


def test_create_provider_falls_back_to_google_for_unknown() -> None:
    provider = create_translation_provider({"translation_provider": "unknown"})
    assert isinstance(provider, GoogleFreeProvider)


def test_mtran_translate_parses_standard_payload(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"result": "你好世界"})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    # 'Hello world' is detected as 'en' by client-side detection
    result = provider.translate("Hello world", "auto", "zh-CN")

    assert result == "你好世界"
    assert fake_client.calls[0][0] == "http://mtran.local/translate"
    assert _call_json(fake_client.calls[0]) == {
        "from": "en",
        "to": "zh-Hans",
        "text": "Hello world",
    }


def test_mtran_translate_detects_english_with_article_punctuation(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"result": "任天堂的秘密帝国"})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    result = provider.translate(
        "Nintendo's Empire of Secrets with Keza MacDonald – Factually with Adam Conover",
        "auto",
        "zh-CN",
    )

    assert result == "任天堂的秘密帝国"
    assert _call_json(fake_client.calls[0])["from"] == "en"
    assert _call_json(fake_client.calls[0])["to"] == "zh-Hans"


def test_mtran_translate_detects_mostly_english_mixed_title(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"result": "中文读写速通 II：字符回旋加速器"})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    result = provider.translate(
        "中文 Literacy Speedrun II: Character Cyclotron",
        "auto",
        "zh-CN",
    )

    assert result == "中文读写速通 II：字符回旋加速器"
    assert _call_json(fake_client.calls[0])["from"] == "en"
    assert _call_json(fake_client.calls[0])["to"] == "zh-Hans"


def test_mtran_batch_parses_payload(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"results": ["你好", "世界"]})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    # 'hello' is detected as 'en'
    result = provider.translate_batch(["hello", "world"], "auto", "zh-CN")

    assert result == ["你好", "世界"]
    assert fake_client.calls[0][0] == "http://mtran.local/translate/batch"
    assert _call_json(fake_client.calls[0]) == {
        "from": "en",
        "to": "zh-Hans",
        "texts": ["hello", "world"],
    }


def test_mtran_batch_stays_auto_for_cjk(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _FakeClient({"results": ["translated", "translated"]})

    def _client_factory(*args: Any, **kwargs: Any) -> _FakeClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    # '你好' contains CJK, so it should stay 'auto'
    result = provider.translate_batch(["你好", "world"], "auto", "en")

    assert result == ["translated", "translated"]
    assert _call_json(fake_client.calls[0])["from"] == "auto"


def test_mtran_batch_chunks_large_payloads(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    texts = [f"text {index}" for index in range(30)]
    result = provider.translate_batch(texts, "auto", "zh-CN")

    assert result == texts
    assert [len(_call_json(call)["texts"]) for call in fake_client.calls] == [24, 6]


def test_mtran_batch_empty_returns_empty_without_request(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")

    assert provider.translate_batch([], "auto", "zh-CN") == []
    assert fake_client.calls == []


def test_mtran_batch_limits_exact_utf8_json_bytes(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    texts = [("汉字🙂" * 8_000) + str(index) for index in range(4)]
    result = provider.translate_batch(texts, "auto", "en")

    assert result == texts
    _assert_safe_request_bodies(fake_client.calls)
    assert all(url.endswith("/translate/batch") for url, _ in fake_client.calls)
    received = [text for call in fake_client.calls for text in _call_json(call)["texts"]]
    assert received == texts


def test_mtran_batch_counts_json_escaping_bytes(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    escaped = '"\\\n\t\r' * 8_000
    texts = [f"{index}:{escaped}" for index in range(3)]
    result = provider.translate_batch(texts, "en", "zh-CN")

    assert result == texts
    _assert_safe_request_bodies(fake_client.calls)
    received = [text for call in fake_client.calls for text in _call_json(call)["texts"]]
    assert received == texts


def test_mtran_translate_splits_oversized_single_text(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    text = ("你" * 20_000) + (" word" * 25_000)
    result = provider.translate(text, "auto", "zh-CN")

    assert result == text
    assert len(fake_client.calls) > 1
    assert all(url.endswith("/translate") for url, _ in fake_client.calls)
    _assert_safe_request_bodies(fake_client.calls)
    payloads = [_call_json(call) for call in fake_client.calls]
    assert "".join(payload["text"] for payload in payloads) == text
    assert {payload["from"] for payload in payloads} == {"en"}


def test_mtran_translate_rejects_impossible_single_character_payload(
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )
    monkeypatch.setattr(
        "glean_core.services.translation_providers.MTRAN_MAX_PAYLOAD_SIZE",
        1,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    with pytest.raises(ValueError, match="cannot fit one source character"):
        provider.translate("🙂", "auto", "zh-CN")

    assert fake_client.calls == []


def test_mtran_batch_splits_oversized_single_item(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    text = "翻译🙂" * 12_000
    detected_texts: list[str] = []

    def _detect_client_side(detected_text: str) -> str:
        detected_texts.append(detected_text)
        return "en"

    monkeypatch.setattr(provider, "_detect_client_side", _detect_client_side)
    result = provider.translate_batch([text], "auto", "en")

    assert result == [text]
    assert detected_texts == [text]
    assert len(fake_client.calls) > 1
    assert all(url.endswith("/translate") for url, _ in fake_client.calls)
    _assert_safe_request_bodies(fake_client.calls)
    payloads = [_call_json(call) for call in fake_client.calls]
    assert "".join(payload["text"] for payload in payloads) == text
    assert {payload["from"] for payload in payloads} == {"en"}


@pytest.mark.parametrize("empty_prefix", ["", " \t\n"])
def test_mtran_batch_reuses_detection_after_empty_prefix(
    monkeypatch,
    empty_prefix: str,
) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    text = "翻译🙂" * 12_000
    detected_texts: list[str] = []

    def _detect_client_side(detected_text: str) -> str:
        detected_texts.append(detected_text)
        return "en"

    monkeypatch.setattr(provider, "_detect_client_side", _detect_client_side)
    result = provider.translate_batch([empty_prefix, text], "auto", "en")

    assert result == [empty_prefix, text]
    assert detected_texts == [text]
    _assert_safe_request_bodies(fake_client.calls)
    single_payloads = [
        _call_json(call) for call in fake_client.calls if call[0].endswith("/translate")
    ]
    assert len(single_payloads) > 1
    assert "".join(payload["text"] for payload in single_payloads) == text
    assert {payload["from"] for payload in single_payloads} == {"en"}


def test_mtran_batch_preserves_order_around_oversized_item(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    fake_client = _EchoBatchClient()

    def _client_factory(*args: Any, **kwargs: Any) -> _EchoBatchClient:
        return fake_client

    monkeypatch.setattr(
        "glean_core.services.translation_providers.httpx.Client",
        _client_factory,
    )

    provider = MTranProvider(base_url="http://mtran.local")
    huge = ('段落🙂\\"\n' * 15_000) + "tail"
    texts = ["small before", huge, "small after"]
    result = provider.translate_batch(texts, "auto", "zh-CN")

    assert result == texts
    _assert_safe_request_bodies(fake_client.calls)
    routes = [url.removeprefix("http://mtran.local") for url, _ in fake_client.calls]
    assert routes[0] == "/translate/batch"
    assert routes[-1] == "/translate/batch"
    assert all(route == "/translate" for route in routes[1:-1])
    assert _call_json(fake_client.calls[0])["texts"] == ["small before"]
    assert _call_json(fake_client.calls[-1])["texts"] == ["small after"]
    assert "".join(_call_json(call)["text"] for call in fake_client.calls[1:-1]) == huge


def test_mtran_default_url_uses_localhost_fallback() -> None:
    provider = MTranProvider()

    assert DEFAULT_MTRAN_SERVER_URL == "http://127.0.0.1:8989"
    assert provider.base_url == "http://127.0.0.1:8989"


def test_parse_openai_batch_response_numbered() -> None:
    raw = """
    [1] 作为 Google 最快、最具成本效益的端点
    [2] 强调低延迟和高吞吐
    """
    parsed = _parse_openai_batch_response(raw, 2)
    assert parsed == ["作为 Google 最快、最具成本效益的端点", "强调低延迟和高吞吐"]


def test_parse_openai_batch_response_json_array() -> None:
    raw = '["第一句翻译", "第二句翻译"]'
    parsed = _parse_openai_batch_response(raw, 2)
    assert parsed == ["第一句翻译", "第二句翻译"]


def test_parse_openai_batch_response_plain_lines_fallback() -> None:
    raw = """
    第一行翻译
    第二行翻译
    """
    parsed = _parse_openai_batch_response(raw, 2)
    assert parsed == ["第一行翻译", "第二行翻译"]


def test_parse_openai_batch_response_incomplete_returns_none() -> None:
    raw = """
    [1] only one line
    """
    parsed = _parse_openai_batch_response(raw, 2)
    assert parsed is None
