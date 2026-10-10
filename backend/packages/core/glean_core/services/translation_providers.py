"""
Translation provider abstraction.

Supports Google Translate (free), DeepL, OpenAI, and MTran as configurable
translation backends. Explicit selections remain selected, and paid providers
require an API key. An unset preference uses server-configured MTran, or
Google when no local service is configured, without stale user overrides.
"""

import json
import os
import re
import unicodedata
from abc import ABC, abstractmethod
from collections.abc import Mapping
from math import ceil
from threading import Lock
from time import monotonic
from typing import Any, ClassVar

import httpx

from glean_core import get_logger

logger = get_logger(__name__)

# Google Translate has a ~5000 character limit per request
_CHUNK_SIZE = 4500
_SEPARATOR = " ||| "
DEFAULT_MTRAN_SERVER_URL = "http://127.0.0.1:8989"
MTRAN_BATCH_SIZE = 24
MTRAN_MAX_PAYLOAD_SIZE = 100 * 1024  # 100KB limit for MTranServer
GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS = 60


class TranslationRateLimitError(RuntimeError):
    """A provider rejected requests; callers should wait before retrying."""

    def __init__(self, provider: str, retry_after: int = 60) -> None:
        self.provider = provider
        self.retry_after = max(1, retry_after)
        super().__init__(f"Translation rate limit reached for {provider}; retry later.")


class TranslationConfigurationError(RuntimeError):
    """The explicitly selected provider lacks required configuration."""


def _encode_mtran_payload(payload: dict[str, Any]) -> bytes:
    """Serialize an MTran request exactly as it will be sent."""
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


class TranslationProvider(ABC):
    """Base class for translation providers."""

    @abstractmethod
    def translate(self, text: str, source: str, target: str) -> str:
        """Translate a single text string."""

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        """Translate a list of texts. Default: translate one by one."""
        return [self.translate(t, source, target) for t in texts]


def _normalize_translation_settings(settings: Any | None) -> dict[str, Any]:
    """Accept dict-like settings and Pydantic models."""
    if not settings:
        return {}

    if isinstance(settings, Mapping):
        return dict(settings)

    model_dump = getattr(settings, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump(exclude_none=True)
        if isinstance(dumped, dict):
            return dumped

    return {}


def _resolve_mtran_base_url(base_url: str | None = None) -> str:
    configured = base_url.strip() if isinstance(base_url, str) else ""
    env_value = os.getenv("MTRAN_SERVER_URL", "").strip()
    return configured or env_value or DEFAULT_MTRAN_SERVER_URL


def _parse_openai_batch_response(raw: str, expected_count: int) -> list[str] | None:
    """Parse batch translation output from OpenAI-compatible models."""
    if expected_count <= 0:
        return []

    text = raw.strip()
    if not text:
        return None

    # Try strict JSON first.
    def _parse_json_payload(payload: str) -> list[str] | None:
        try:
            data = json.loads(payload)
        except Exception:
            return None

        if (
            isinstance(data, list)
            and len(data) == expected_count
            and all(isinstance(item, str) for item in data)
        ):
            return [item.strip() for item in data]

        if isinstance(data, dict):
            items = data.get("translations")
            if (
                isinstance(items, list)
                and len(items) == expected_count
                and all(isinstance(item, str) for item in items)
            ):
                return [item.strip() for item in items]
        return None

    parsed_json = _parse_json_payload(text)
    if parsed_json is not None:
        return parsed_json

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        parsed_json = _parse_json_payload(fenced.group(1).strip())
        if parsed_json is not None:
            return parsed_json

    # Parse numbered lines: [1] ... or 1. ... or 1) ...
    numbered: list[str] = [""] * expected_count
    matched = 0
    for line in text.splitlines():
        item = line.strip()
        if not item:
            continue
        match = re.match(r"^(?:\[(\d+)\]|(\d+)[\).])\s*(.+)$", item)
        if not match:
            continue
        number = match.group(1) or match.group(2)
        content = (match.group(3) or "").strip()
        if not number or not content:
            continue
        idx = int(number) - 1
        if 0 <= idx < expected_count:
            numbered[idx] = content
            matched += 1

    if matched == expected_count and all(numbered):
        return numbered

    # Fallback: one translation per non-empty line in order.
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) == expected_count:
        return lines

    return None


class GoogleFreeProvider(TranslationProvider):
    """Free Google Translate via deep-translator."""

    _request_lock = Lock()
    _rate_limited_until: ClassVar[float] = 0.0

    def _translate_request(self, translator: Any, text: str) -> str:
        from deep_translator.exceptions import TooManyRequests

        # Google limits apply to the process/source IP, not one provider instance.
        # Serializing requests means callers already waiting cannot issue more
        # upstream requests after the first rate-limit response.
        with self._request_lock:
            remaining = ceil(GoogleFreeProvider._rate_limited_until - monotonic())
            if remaining > 0:
                raise TranslationRateLimitError("google", remaining)
            try:
                result: str = translator.translate(text)
                return result
            except TooManyRequests as exc:
                GoogleFreeProvider._rate_limited_until = (
                    monotonic() + GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
                )
                raise TranslationRateLimitError(
                    "google", GOOGLE_RATE_LIMIT_COOLDOWN_SECONDS
                ) from exc

    def translate(self, text: str, source: str, target: str) -> str:
        from deep_translator import GoogleTranslator

        if not text or not text.strip():
            return text
        translator = GoogleTranslator(source=source, target=target)
        result = self._translate_request(translator, text[:_CHUNK_SIZE])
        return result

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        """Batch translate using ||| separator for efficiency."""
        from deep_translator import GoogleTranslator

        if not texts:
            return []

        translator = GoogleTranslator(source=source, target=target)
        results: list[str] = [""] * len(texts)

        batch_start = 0
        while batch_start < len(texts):
            batch_texts: list[str] = []
            batch_indices: list[int] = []
            current_length = 0

            for i in range(batch_start, len(texts)):
                text = texts[i]
                needed = len(text) + len(_SEPARATOR)
                if current_length + needed > _CHUNK_SIZE and batch_texts:
                    break
                batch_texts.append(text)
                batch_indices.append(i)
                current_length += needed

            if not batch_texts:
                break

            combined = _SEPARATOR.join(batch_texts)

            if len(combined) <= _CHUNK_SIZE:
                translated_combined = self._translate_request(translator, combined)
                translated_parts = translated_combined.split("|||")
                if len(translated_parts) != len(batch_indices):
                    raise ValueError("Google translation result count did not match the batch")
                for j, idx in enumerate(batch_indices):
                    results[idx] = translated_parts[j].strip()
            else:
                for j, idx in enumerate(batch_indices):
                    result = self._translate_request(translator, batch_texts[j][:_CHUNK_SIZE])
                    results[idx] = result

            batch_start += len(batch_texts)

        return results


class DeepLProvider(TranslationProvider):
    """DeepL translation provider."""

    # DeepL uses different language codes than standard
    _LANG_MAP: dict[str, str] = {
        "zh-CN": "ZH-HANS",
        "zh-TW": "ZH-HANT",
        "en": "EN-US",
        "pt": "PT-BR",
    }

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def _map_lang(self, lang: str, *, is_source: bool = False) -> str | None:
        if is_source and lang == "auto":
            return None
        mapped = self._LANG_MAP.get(lang, lang.upper())
        return mapped

    def translate(self, text: str, source: str, target: str) -> str:
        import deepl

        if not text or not text.strip():
            return text

        translator = deepl.Translator(self.api_key)
        source_lang = self._map_lang(source, is_source=True)
        target_lang = self._map_lang(target)
        result = translator.translate_text(
            text,
            source_lang=source_lang,
            target_lang=target_lang,  # type: ignore[arg-type]
        )
        return str(result)

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        import deepl

        if not texts:
            return []

        translator = deepl.Translator(self.api_key)
        source_lang = self._map_lang(source, is_source=True)
        target_lang = self._map_lang(target)
        results = translator.translate_text(
            texts,
            source_lang=source_lang,
            target_lang=target_lang,  # type: ignore[arg-type]
        )
        if isinstance(results, list):
            return [str(r) for r in results]
        return [str(results)]


class OpenAIProvider(TranslationProvider):
    """OpenAI translation provider."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model

    def translate(self, text: str, source: str, target: str) -> str:
        from openai import OpenAI

        if not text or not text.strip():
            return text

        client = OpenAI(api_key=self.api_key)
        source_desc = "the source language" if source == "auto" else source
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a translator. Translate the following text from "
                        f"{source_desc} to {target}. Output only the translation, "
                        f"nothing else."
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        from openai import OpenAI

        if not texts:
            return []

        client = OpenAI(api_key=self.api_key)
        source_desc = "the source language" if source == "auto" else source
        numbered = "\n".join(f"[{i + 1}] {t}" for i, t in enumerate(texts))
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a translator. Translate each numbered line from "
                        f"{source_desc} to {target}. Keep each item independent and "
                        f"do not merge or split entries. Return exactly {len(texts)} lines in "
                        f"the format [N] translation."
                    ),
                },
                {"role": "user", "content": numbered},
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content or ""
        parsed = _parse_openai_batch_response(raw, len(texts))
        if parsed is not None:
            return parsed

        logger.warning(
            "OpenAI batch response unparsable; falling back to single-item translation",
            extra={"model": self.model, "expected_count": len(texts)},
        )
        return [self.translate(text, source, target) for text in texts]


class MTranProvider(TranslationProvider):
    """MTranServer translation provider via local HTTP service."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str = "",
        model: str = "",
        timeout: float = 20.0,
    ) -> None:
        self.base_url = _resolve_mtran_base_url(base_url).rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _language_code(self, lang: str) -> str:
        normalized = lang.strip()
        if not normalized:
            return "auto"
        if normalized.lower() == "auto":
            return "auto"
        primary = re.split(r"[-_]", normalized, maxsplit=1)[0].lower()
        if primary in {"zh", "cmn", "yue"}:
            return "zh-Hans"
        return primary

    def _detect_client_side(self, text: str) -> str:
        """Simple client-side detection to avoid server-side mis-detection."""
        # Check for CJK characters
        cjk_pattern = re.compile(r"[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]")
        cjk_count = len(cjk_pattern.findall(text))
        if cjk_count > 0:
            if self._latin_word_count(text) > cjk_count:
                return "en"
            # If it has Japanese chars, it might be Japanese, but MTran is often used for zh.
            # For now, if it has any CJK, we'll let the server decide or just return 'zh'
            # but usually 'auto' is safer for CJK.
            # The main problem is English being mis-detected as 'ha' or 'mr'.
            return "auto"

        if self._looks_like_latin_text(text):
            return "en"

        return "auto"

    def _looks_like_latin_text(self, text: str) -> bool:
        """Return true for Latin-script article text with normal punctuation."""
        has_latin_letter = False

        for char in text:
            if char.isspace() or char.isdigit():
                continue

            category = unicodedata.category(char)
            if category[0] in {"P", "S"}:
                continue

            if char.isalpha():
                name = unicodedata.name(char, "")
                if "LATIN" not in name:
                    return False
                has_latin_letter = True
                continue

            return False

        return has_latin_letter

    def _latin_word_count(self, text: str) -> int:
        return len(re.findall(r"[A-Za-z][A-Za-z'-]*", text))

    def _resolved_source_code(self, text: str, source: str) -> str:
        source_code = self._language_code(source)
        if source_code == "auto":
            source_code = self._detect_client_side(text)
        return source_code

    def _single_payload(
        self, text: str, resolved_source: str, resolved_target: str
    ) -> dict[str, Any]:
        return {
            "text": text,
            "from": resolved_source,
            "to": resolved_target,
        }

    def _batch_payload(self, texts: list[str], source: str, target: str) -> dict[str, Any]:
        source_code = self._language_code(source)
        if source_code == "auto":
            for text in texts:
                if text.strip():
                    source_code = self._detect_client_side(text)
                    break

        return self._batch_payload_with_codes(
            texts,
            source_code,
            self._language_code(target),
        )

    def _batch_payload_with_codes(
        self, texts: list[str], resolved_source: str, resolved_target: str
    ) -> dict[str, Any]:
        return {
            "texts": texts,
            "from": resolved_source,
            "to": resolved_target,
        }

    def _payload_fits(self, payload: dict[str, Any]) -> bool:
        return len(_encode_mtran_payload(payload)) <= MTRAN_MAX_PAYLOAD_SIZE

    def _post_payload(
        self, client: httpx.Client, path: str, payload: dict[str, Any]
    ) -> httpx.Response:
        encoded = _encode_mtran_payload(payload)
        if len(encoded) > MTRAN_MAX_PAYLOAD_SIZE:
            raise ValueError(
                f"MTranServer request body exceeds {MTRAN_MAX_PAYLOAD_SIZE}-byte payload limit"
            )
        response = client.post(
            f"{self.base_url}{path}",
            content=encoded,
            headers=self._headers(),
        )
        if response.status_code == 429:
            raw_retry_after = response.headers.get("Retry-After", "")
            retry_after = (
                max(1, min(300, int(raw_retry_after))) if raw_retry_after.isdigit() else 60
            )
            raise TranslationRateLimitError("mtran", retry_after)
        return response

    def _translate_single_request(
        self,
        client: httpx.Client,
        text: str,
        resolved_source: str,
        resolved_target: str,
    ) -> str:
        response = self._post_payload(
            client,
            "/translate",
            self._single_payload(text, resolved_source, resolved_target),
        )
        response.raise_for_status()
        translated = self._extract_single(response.json())
        if translated is None:
            raise ValueError("MTranServer response does not contain translated text")
        return translated

    def _split_oversized_text(
        self, text: str, resolved_source: str, resolved_target: str
    ) -> list[str]:
        pieces: list[str] = []
        start = 0
        preferred_boundaries = frozenset("\n.!?。！？;；")

        while start < len(text):
            remaining = text[start:]
            low = 1
            high = len(remaining)
            largest_fitting = 0

            while low <= high:
                midpoint = (low + high) // 2
                payload = self._single_payload(
                    remaining[:midpoint],
                    resolved_source,
                    resolved_target,
                )
                if self._payload_fits(payload):
                    largest_fitting = midpoint
                    low = midpoint + 1
                else:
                    high = midpoint - 1

            if largest_fitting == 0:
                raise ValueError(
                    "MTranServer payload limit cannot fit one source character "
                    "with the JSON request envelope"
                )

            cut = largest_fitting
            if largest_fitting < len(remaining):
                lower_bound = largest_fitting // 2
                for index in range(largest_fitting - 1, lower_bound - 1, -1):
                    char = remaining[index]
                    if char in preferred_boundaries or char.isspace():
                        cut = index + 1
                        break

            pieces.append(remaining[:cut])
            start += cut

        return pieces

    def _extract_single(self, data: Any) -> str | None:
        if isinstance(data, str):
            return data

        if isinstance(data, dict):
            for key in ("translation", "translated_text", "text", "result"):
                value = data.get(key)
                if isinstance(value, str):
                    return value

            nested = data.get("data")
            if isinstance(nested, dict):
                for key in ("translation", "translated_text", "text", "result"):
                    value = nested.get(key)
                    if isinstance(value, str):
                        return value
        return None

    def _extract_batch(self, data: Any, expected_count: int) -> list[str] | None:
        items: Any | None = None
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for key in ("translations", "translated_texts", "results", "data"):
                value = data.get(key)
                if isinstance(value, list):
                    items = value
                    break

        if not isinstance(items, list):
            return None

        parsed: list[str] = []
        for item in items:
            single = self._extract_single(item)
            if single is None:
                return None
            parsed.append(single)

        if len(parsed) != expected_count:
            return None
        return parsed

    def _translate_resolved(self, text: str, resolved_source: str, resolved_target: str) -> str:
        if not text or not text.strip():
            return text

        payload = self._single_payload(text, resolved_source, resolved_target)
        pieces = (
            [text]
            if self._payload_fits(payload)
            else self._split_oversized_text(text, resolved_source, resolved_target)
        )

        with httpx.Client(timeout=self.timeout) as client:
            translated_pieces = [
                self._translate_single_request(
                    client,
                    piece,
                    resolved_source,
                    resolved_target,
                )
                for piece in pieces
            ]
        return "".join(translated_pieces)

    def translate(self, text: str, source: str, target: str) -> str:
        if not text or not text.strip():
            return text

        resolved_source = self._resolved_source_code(text, source)
        resolved_target = self._language_code(target)
        return self._translate_resolved(text, resolved_source, resolved_target)

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        if not texts:
            return []

        results: list[str] = []
        pending: list[str] = []

        for text in texts:
            candidate = [*pending, text]
            candidate_payload: dict[str, Any] | None = None
            candidate_fits = False
            if len(candidate) <= MTRAN_BATCH_SIZE:
                candidate_payload = self._batch_payload(candidate, source, target)
                candidate_fits = self._payload_fits(candidate_payload)
                if candidate_fits:
                    pending = candidate
                    continue

            if pending:
                pending_has_nonempty_text = any(pending_text.strip() for pending_text in pending)
                results.extend(self._translate_batch_chunk(pending, source, target))
                pending = []
                if candidate_payload is not None and not pending_has_nonempty_text:
                    one_item_payload = self._batch_payload_with_codes(
                        [text],
                        candidate_payload["from"],
                        candidate_payload["to"],
                    )
                else:
                    one_item_payload = self._batch_payload([text], source, target)
                one_item_fits = self._payload_fits(one_item_payload)
            else:
                # With no pending items, candidate is this exact one-item batch.
                assert candidate_payload is not None
                one_item_payload = candidate_payload
                one_item_fits = candidate_fits

            if one_item_fits:
                pending = [text]
            else:
                resolved_source = one_item_payload["from"]
                resolved_target = one_item_payload["to"]
                results.append(self._translate_resolved(text, resolved_source, resolved_target))

        if pending:
            results.extend(self._translate_batch_chunk(pending, source, target))

        return results

    def _translate_batch_chunk(self, texts: list[str], source: str, target: str) -> list[str]:
        payload = self._batch_payload(texts, source, target)

        response: httpx.Response | None = None
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = self._post_payload(client, "/translate/batch", payload)

                # Check for Payload Too Large specifically
                if response.status_code == 413:
                    raise ValueError("Payload too large for MTranServer")

                response.raise_for_status()
                parsed = self._extract_batch(response.json(), len(texts))
                if parsed is not None:
                    return parsed
                raise ValueError("MTranServer batch response is not parseable")
        except Exception as exc:
            # An outage, timeout or rate limit cannot be repaired by multiplying
            # the same batch into individual upstream requests.
            if response is None or response.status_code == 429 or response.status_code >= 500:
                raise
            # If it's a "No model found" error, don't bother with single requests
            err_text = ""
            try:
                err_text = response.text
            except Exception:
                err_text = str(exc)

            if "No model found" in err_text:
                logger.warning(
                    "MTranServer does not support this language pair; failing fast",
                    extra={"source": source, "target": target},
                )
                raise

            logger.exception("MTranServer batch translation failed; fallback to single requests")
            return [self.translate(t, source, target) for t in texts]


def resolve_translation_provider_name(settings: Any | None) -> str:
    """Respect an explicit preference; use configured local MTran as the default."""
    normalized = _normalize_translation_settings(settings)
    configured = normalized.get("translation_provider")
    if isinstance(configured, str) and configured.strip():
        return configured.strip()
    return "mtran" if os.getenv("MTRAN_SERVER_URL", "").strip() else "google"


def create_translation_provider(settings: Any | None) -> TranslationProvider:
    """
    Create a translation provider from user settings.

    Settings keys:
        - translation_provider: "google" | "deepl" | "openai" | "mtran"
        - translation_api_key: API key for non-Google providers
        - translation_model: Model name for OpenAI/MTran (default: "gpt-4o-mini")
        - translation_base_url: Base URL for MTranServer (optional)

    Explicit selections never switch provider after a failure. An unset
    preference uses the configured MTran service, or Google when no local
    service is configured. Missing paid-provider keys are reported to callers.
    """
    normalized_settings = _normalize_translation_settings(settings)
    provider = resolve_translation_provider_name(normalized_settings)
    configured_provider = normalized_settings.get("translation_provider")
    if not isinstance(configured_provider, str) or not configured_provider.strip():
        # Automatic means server defaults. Previous provider credentials/model
        # settings must not redirect requests or be sent to the default service.
        normalized_settings = {}
    api_key = normalized_settings.get("translation_api_key", "")
    raw_model = normalized_settings.get("translation_model")
    model = raw_model if isinstance(raw_model, str) else None
    raw_base_url = normalized_settings.get("translation_base_url")
    base_url = raw_base_url if isinstance(raw_base_url, str) else ""

    if provider in {"deepl", "openai"} and not api_key:
        raise TranslationConfigurationError(f"Configure an API key for {provider} translation.")

    if provider == "deepl":
        logger.info("Using DeepL translation provider")
        return DeepLProvider(api_key)

    if provider == "openai":
        openai_model = model or "gpt-4o-mini"
        logger.info(
            "Using OpenAI translation provider",
            extra={"model": openai_model},
        )
        return OpenAIProvider(api_key, openai_model)

    if provider == "mtran":
        resolved_base_url = _resolve_mtran_base_url(base_url)
        logger.info(
            "Using MTran translation provider",
            extra={"base_url": resolved_base_url},
        )
        return MTranProvider(
            base_url=resolved_base_url,
            api_key=api_key,
            model=model or "",
        )

    return GoogleFreeProvider()
