"""
Icon proxy router.

Proxies and caches external favicon/icon images so the browser hits a single
same-origin URL and the backend deduplicates upstream fetches via Redis.
"""

import hashlib
import ipaddress
from typing import Annotated
from urllib.parse import urlsplit

import httpx
from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, Query, Response

from glean_core import get_logger

from ..dependencies import get_redis_pool

logger = get_logger(__name__)

router = APIRouter()

CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
NEGATIVE_CACHE_SECONDS = 5 * 60
MAX_BYTES = 64 * 1024
ALLOWED_PORTS = {80, 443, 8080, 8443}
ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/svg+xml",
    "image/jpeg",
    "image/gif",
    "image/webp",
}
FALLBACK_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c63000100000005000100"
    "0d0a2db40000000049454e44ae426082"
)


def _is_private_host(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        lowered = host.lower()
        return lowered in {"localhost", "ip6-localhost", "ip6-loopback"}
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _validate_url(url: str) -> str | None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"}:
        return "invalid scheme"
    if not parts.hostname:
        return "missing host"
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        return "disallowed port"
    if _is_private_host(parts.hostname):
        return "private host"
    return None


def _normalize_content_type(raw: str | None) -> str:
    if not raw:
        return "image/png"
    head = raw.split(";", 1)[0].strip().lower()
    if head in ALLOWED_CONTENT_TYPES:
        return head
    return "image/png"


def _fallback_response(reason: str) -> Response:
    return Response(
        content=FALLBACK_PNG,
        media_type="image/png",
        headers={
            "Cache-Control": f"public, max-age={NEGATIVE_CACHE_SECONDS}",
            "X-Icon-Proxy": f"fallback:{reason}",
        },
    )


@router.get("")
async def proxy_icon(
    url: Annotated[str, Query(min_length=1, max_length=2048)],
    redis_pool: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> Response:
    reject_reason = _validate_url(url)
    if reject_reason:
        return _fallback_response(reject_reason)

    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    etag = f'"{digest[:16]}"'
    body_key = f"icon:{digest}:body"
    type_key = f"icon:{digest}:type"

    cached_body = await redis_pool.get(body_key)
    if cached_body is not None:
        cached_type = await redis_pool.get(type_key)
        content_type = _normalize_content_type(
            cached_type.decode("utf-8") if isinstance(cached_type, bytes) else cached_type
        )
        return Response(
            content=cached_body,
            media_type=content_type,
            headers={
                "Cache-Control": f"public, max-age={CACHE_TTL_SECONDS}, immutable",
                "ETag": etag,
                "X-Icon-Proxy": "hit",
            },
        )

    try:
        async with (
            httpx.AsyncClient(
                timeout=5.0,
                follow_redirects=True,
                headers={"User-Agent": "Glean-IconProxy/1.0"},
            ) as client,
            client.stream("GET", url) as upstream,
        ):
            if upstream.status_code != 200:
                return _fallback_response(f"upstream:{upstream.status_code}")
            buf = bytearray()
            async for chunk in upstream.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > MAX_BYTES:
                    return _fallback_response("too-large")
            content_type = _normalize_content_type(upstream.headers.get("content-type"))
            body = bytes(buf)
    except httpx.HTTPError as exc:
        logger.warning("icon proxy fetch failed", extra={"url": url, "error": str(exc)})
        return _fallback_response("fetch-error")

    await redis_pool.set(body_key, body, ex=CACHE_TTL_SECONDS)
    await redis_pool.set(type_key, content_type, ex=CACHE_TTL_SECONDS)

    return Response(
        content=body,
        media_type=content_type,
        headers={
            "Cache-Control": f"public, max-age={CACHE_TTL_SECONDS}, immutable",
            "ETag": etag,
            "X-Icon-Proxy": "miss",
        },
    )
