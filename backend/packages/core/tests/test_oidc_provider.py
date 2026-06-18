"""Unit tests for OIDC provider behavior."""

from typing import Any

import pytest

from glean_core.auth.providers.oidc_provider import OIDCProvider


class _FakeHTTPResponse:
    def __init__(
        self, status_code: int, payload: dict[str, Any] | None = None, text: str = ""
    ) -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeHTTPClient:
    def __init__(self, get_responses: list[_FakeHTTPResponse] | None = None) -> None:
        self._get_responses = get_responses or []
        self.get_calls: list[str] = []
        self.post_calls: list[tuple[str, dict[str, Any]]] = []

    async def get(self, url: str) -> _FakeHTTPResponse:
        self.get_calls.append(url)
        if self._get_responses:
            return self._get_responses.pop(0)
        raise AssertionError("Unexpected GET call")

    async def post(self, url: str, data: dict[str, Any]) -> _FakeHTTPResponse:
        self.post_calls.append((url, data))
        return _FakeHTTPResponse(
            200,
            {
                "id_token": "id-token",
                "access_token": "access-token",
                "token_type": "Bearer",
            },
        )


def _make_provider(**overrides: Any) -> OIDCProvider:
    base_config: dict[str, Any] = {
        "client_id": "client-id",
        "client_secret": "secret",
        "issuer": "https://issuer.example.com",
        "redirect_uri": "http://localhost:3000/auth/callback",
        "jwks_cache_ttl_seconds": 5,
    }
    base_config.update(overrides)
    return OIDCProvider("oidc", base_config)


@pytest.mark.asyncio
async def test_prepare_loads_discovery_configuration() -> None:
    provider = _make_provider()
    fake_client = _FakeHTTPClient(
        [
            _FakeHTTPResponse(
                200,
                {
                    "authorization_endpoint": "https://issuer.example.com/oauth/authorize",
                    "token_endpoint": "https://issuer.example.com/oauth/token",
                    "jwks_uri": "https://issuer.example.com/.well-known/jwks.json",
                },
            )
        ]
    )
    provider._http_client = fake_client

    await provider.prepare()
    auth_url = provider.get_authorization_url(
        "state",
        provider.config["redirect_uri"],
        nonce="nonce",
        code_challenge="pkce-challenge",
    )

    assert "authorization_endpoint" in provider._oidc_config
    assert "state=state" in auth_url
    assert len(fake_client.get_calls) == 1


@pytest.mark.asyncio
async def test_authenticate_requires_nonce() -> None:
    provider = _make_provider()

    with pytest.raises(ValueError, match="Nonce is required"):
        await provider.authenticate({"code": "abc", "redirect_uri": "http://localhost/callback"})


@pytest.mark.asyncio
async def test_verify_id_token_rejects_nonce_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    from glean_core.auth.providers import oidc_provider as module

    provider = _make_provider()
    monkeypatch.setattr(module.jwt, "get_unverified_header", lambda _token: {"kid": "key-1"})
    monkeypatch.setattr(module.jwk, "construct", lambda _jwk_data: object())
    monkeypatch.setattr(
        module.jwt,
        "decode",
        lambda *_args, **_kwargs: {
            "sub": "provider-user",
            "nonce": "different-nonce",
            "iat": 1,
            "exp": 9999999999,
            "iss": provider.issuer,
            "aud": provider.client_id,
        },
    )

    async def _fake_get_jwks(_oidc_config: dict[str, Any]) -> dict[str, Any]:
        return {"keys": [{"kid": "key-1", "alg": "RS256"}]}

    provider._get_jwks = _fake_get_jwks  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="Nonce mismatch"):
        await provider._verify_id_token(
            "id-token",
            {"jwks_uri": "https://issuer.example.com/jwks"},
            nonce="expected-nonce",
            access_token="access-token",
        )


@pytest.mark.asyncio
async def test_get_jwks_uses_ttl_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    from glean_core.auth.providers import oidc_provider as module

    provider = _make_provider(jwks_cache_ttl_seconds=5)
    fake_client = _FakeHTTPClient(
        [
            _FakeHTTPResponse(200, {"keys": [{"kid": "key-1"}]}),
            _FakeHTTPResponse(200, {"keys": [{"kid": "key-2"}]}),
        ]
    )
    provider._http_client = fake_client

    monotonic_values = iter([100.0, 101.0, 200.0, 201.0])
    monkeypatch.setattr(module, "monotonic", lambda: next(monotonic_values))

    first = await provider._get_jwks({"jwks_uri": "https://issuer.example.com/jwks"})
    second = await provider._get_jwks({"jwks_uri": "https://issuer.example.com/jwks"})
    third = await provider._get_jwks({"jwks_uri": "https://issuer.example.com/jwks"})

    assert first == {"keys": [{"kid": "key-1"}]}
    assert second == first
    assert third == {"keys": [{"kid": "key-2"}]}
    assert len(fake_client.get_calls) == 2
