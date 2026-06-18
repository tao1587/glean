"""Startup smoke check for the configured LLM provider.

Calls summarize_day once with a tiny known input. Failures are categorized
and returned as a SmokeCheckResult; the caller decides what to do (typically
disable AI integration with a warning log).
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    RateLimitError,
)

from glean_core.services.llm.client import (
    LLMBadResponseError,
    LLMRefusalError,
    OpenAICompatibleClient,
)

log = logging.getLogger(__name__)

FailureReason = Literal[
    "auth",
    "json_mode_unsupported",
    "network",
    "rate_limited",
    "refused",
    "unknown",
]

# Indirection so tests can patch out the real sleep.
_SLEEP = asyncio.sleep
_NETWORK_RETRIES = 3
_NETWORK_BACKOFF_SECONDS = (1, 4, 16)


@dataclass(frozen=True)
class SmokeCheckResult:
    ready: bool
    failure_reason: FailureReason | None = None


async def run_startup_smoke_check(
    client: OpenAICompatibleClient, *, target_language: str
) -> SmokeCheckResult:
    """Try once (or 3x for network errors) to call summarize_day.

    Returns ready=True on success. On failure, returns ready=False with a
    classified reason and logs at WARNING level. Never raises.
    """
    last_exc: Exception | None = None

    for attempt in range(_NETWORK_RETRIES):
        try:
            await client.summarize_day(
                items=[
                    {
                        "entry_id": "smoke",
                        "title": "smoke test",
                        "content": "Hello world.",
                    }
                ],
                target_language=target_language,
            )
            return SmokeCheckResult(ready=True)
        except AuthenticationError as exc:
            log.warning("LLM smoke check failed: auth — %s", exc)
            return SmokeCheckResult(ready=False, failure_reason="auth")
        except LLMBadResponseError as exc:
            log.warning("LLM smoke check failed: JSON mode unsupported — %s", exc)
            return SmokeCheckResult(
                ready=False, failure_reason="json_mode_unsupported"
            )
        except LLMRefusalError as exc:
            log.warning("LLM smoke check failed: provider refused — %s", exc)
            return SmokeCheckResult(ready=False, failure_reason="refused")
        except RateLimitError as exc:
            log.warning("LLM smoke check failed: rate limited — %s", exc)
            return SmokeCheckResult(ready=False, failure_reason="rate_limited")
        except (APIConnectionError, APITimeoutError, APIError) as exc:
            last_exc = exc
            log.info(
                "LLM smoke check transient error (attempt %d/%d): %s",
                attempt + 1,
                _NETWORK_RETRIES,
                exc,
            )
            if attempt + 1 < _NETWORK_RETRIES:
                await _SLEEP(_NETWORK_BACKOFF_SECONDS[attempt])
        except Exception:  # pragma: no cover — safety net
            log.exception("LLM smoke check unknown error")
            return SmokeCheckResult(ready=False, failure_reason="unknown")

    log.warning(
        "LLM smoke check failed after %d attempts: %s", _NETWORK_RETRIES, last_exc
    )
    return SmokeCheckResult(ready=False, failure_reason="network")
