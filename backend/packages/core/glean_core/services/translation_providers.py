"""
Translation provider abstraction.

Supports Google Translate (free), DeepL, and OpenAI as configurable
translation backends. Users configure their preferred provider and
API key via user settings; no key falls back to Google free.
"""

import json
import os
import re
import unicodedata
from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Any

import httpx

from glean_core import get_logger

logger = get_logger(__name__)

# Google Translate has a ~5000 character limit per request
_CHUNK_SIZE = 4500
_SEPARATOR = " ||| "
DEFAULT_MTRAN_SERVER_URL = "http://127.0.0.1:8989"
MTRAN_BATCH_SIZE = 24
MTRAN_MAX_PAYLOAD_SIZE = 100 * 1024  # 100KB limit for MTranServer


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

        if isinstance(data, list) and len(data) == expected_count and all(
            isinstance(item, str) for item in data
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


class FallbackProvider(TranslationProvider):
    """Provider wrapper that falls back to another provider on failures."""

    def __init__(self, primary: TranslationProvider, fallback: TranslationProvider) -> None:
        self.primary = primary
        self.fallback = fallback

    def translate(self, text: str, source: str, target: str) -> str:
        try:
            return self.primary.translate(text, source, target)
        except Exception:
            logger.exception("Primary translation provider failed; using fallback")
            return self.fallback.translate(text, source, target)

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        try:
            return self.primary.translate_batch(texts, source, target)
        except Exception:
            logger.exception("Primary batch translation failed; using fallback")
            return self.fallback.translate_batch(texts, source, target)


class GoogleFreeProvider(TranslationProvider):
    """Free Google Translate via deep-translator."""

    def translate(self, text: str, source: str, target: str) -> str:
        from deep_translator import GoogleTranslator

        if not text or not text.strip():
            return text
        translator = GoogleTranslator(source=source, target=target)
        result: str = translator.translate(text[:_CHUNK_SIZE])
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
                translated_combined: str = translator.translate(combined)
                translated_parts = translated_combined.split("|||")
                for j, idx in enumerate(batch_indices):
                    results[idx] = translated_parts[j].strip() if j < len(translated_parts) else ""
            else:
                for j, idx in enumerate(batch_indices):
                    result: str = translator.translate(batch_texts[j][:_CHUNK_SIZE])
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

    def _payload(self, text: str, source: str, target: str) -> dict[str, Any]:
        source_code = self._language_code(source)
        if source_code == "auto":
            source_code = self._detect_client_side(text)

        return {
            "text": text,
            "from": source_code,
            "to": self._language_code(target),
        }

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

    def translate(self, text: str, source: str, target: str) -> str:
        if not text or not text.strip():
            return text

        payload = self._payload(text, source, target)
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                f"{self.base_url}/translate",
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            translated = self._extract_single(response.json())
            if translated is None:
                raise ValueError("MTranServer response does not contain translated text")
            return translated

    def translate_batch(self, texts: list[str], source: str, target: str) -> list[str]:
        if not texts:
            return []

        results: list[str] = []
        batch_start = 0
        while batch_start < len(texts):
            current_batch: list[str] = []
            current_size = 0

            # Approximate JSON overhead: {"texts": [...], "from": "...", "to": "..."}
            base_overhead = 100

            for i in range(batch_start, len(texts)):
                text = texts[i]
                # Each string in JSON is escaped and quoted.
                # We use a safe estimate: len(text) * 1.1 + 10
                estimated_item_size = int(len(text) * 1.1) + 10

                if len(current_batch) >= MTRAN_BATCH_SIZE:
                    break
                if current_batch and (
                    base_overhead + current_size + estimated_item_size > MTRAN_MAX_PAYLOAD_SIZE
                ):
                    break

                current_batch.append(text)
                current_size += estimated_item_size

            if not current_batch:
                # Should not happen unless a single text is huge,
                # but let's handle it by taking at least one item
                current_batch = [texts[batch_start]]

            results.extend(self._translate_batch_chunk(current_batch, source, target))
            batch_start += len(current_batch)

        return results

    def _translate_batch_chunk(self, texts: list[str], source: str, target: str) -> list[str]:
        source_code = self._language_code(source)
        if source_code == "auto" and texts:
            # Detect based on the first non-empty text in the batch
            for text in texts:
                if text.strip():
                    source_code = self._detect_client_side(text)
                    break

        payload: dict[str, Any] = {
            "texts": texts,
            "from": source_code,
            "to": self._language_code(target),
        }

        response: httpx.Response | None = None
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/translate/batch",
                    json=payload,
                    headers=self._headers(),
                )

                # Check for Payload Too Large specifically
                if response.status_code == 413:
                    raise ValueError("Payload too large for MTranServer")

                response.raise_for_status()
                parsed = self._extract_batch(response.json(), len(texts))
                if parsed is not None:
                    return parsed
                raise ValueError("MTranServer batch response is not parseable")
        except Exception as exc:
            # If it's a "No model found" error, don't bother with single requests
            err_text = ""
            try:
                err_text = response.text if response is not None else str(exc)
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


def _is_mtran_available(base_url: str, timeout: float = 0.8) -> bool:
    """Check whether MTranServer is reachable."""
    check_urls = [f"{base_url}/health", base_url]
    with httpx.Client(timeout=timeout) as client:
        for url in check_urls:
            try:
                response = client.get(url)
                # Any HTTP response means the server is reachable.
                if response.status_code >= 100:
                    return True
            except httpx.RequestError:
                continue
    return False


def create_translation_provider(settings: Any | None) -> TranslationProvider:
    """
    Create a translation provider from user settings.

    Settings keys:
        - translation_provider: "google" | "deepl" | "openai" | "mtran"
        - translation_api_key: API key for non-Google providers
        - translation_model: Model name for OpenAI/MTran (default: "gpt-4o-mini")
        - translation_base_url: Base URL for MTranServer (optional)

    Falls back to GoogleFreeProvider when provider is google, no key is
    provided for non-google providers, or settings are empty.
    """
    normalized_settings = _normalize_translation_settings(settings)
    if not normalized_settings:
        return GoogleFreeProvider()

    provider = normalized_settings.get("translation_provider", "google")
    api_key = normalized_settings.get("translation_api_key", "")
    raw_model = normalized_settings.get("translation_model")
    model = raw_model if isinstance(raw_model, str) else None
    raw_base_url = normalized_settings.get("translation_base_url")
    base_url = raw_base_url if isinstance(raw_base_url, str) else ""

    if provider == "deepl" and api_key:
        logger.info("Using DeepL translation provider")
        return DeepLProvider(api_key)

    if provider == "openai" and api_key:
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
        if not _is_mtran_available(resolved_base_url):
            logger.warning(
                "MTranServer is not reachable; falling back to Google Translate",
                extra={"base_url": resolved_base_url},
            )
            return GoogleFreeProvider()

        return FallbackProvider(
            primary=MTranProvider(
                base_url=resolved_base_url,
                api_key=api_key,
                model=model or "",
            ),
            fallback=GoogleFreeProvider(),
        )

    return GoogleFreeProvider()
