"""Tests for RSSHub conversion rules and candidate generation."""

from unittest.mock import AsyncMock, patch

import pytest

from glean_core.schemas import RSSHubConfig
from glean_core.schemas.rsshub_ruleset import RSSHUB_RULESET_VERSION
from glean_core.services.rsshub_service import RSSHubService


def _service() -> RSSHubService:
    return RSSHubService(AsyncMock())


def test_rsshub_config_has_versioned_ruleset_default() -> None:
    """RSSHub config should carry the versioned builtin ruleset marker."""
    config = RSSHubConfig()
    assert config.ruleset_version == RSSHUB_RULESET_VERSION
    assert "youtube_channel" in config.builtin_rules
    assert "github_repo" in config.builtin_rules


def test_builtin_bilibili_space_generates_multiple_candidates() -> None:
    service = _service()
    candidates = service._match_builtin_rules(
        "https://space.bilibili.com/946974/dynamic",
        {"bilibili_space": True},
    )
    assert "/bilibili/user/dynamic/946974" in candidates
    assert "/bilibili/user/video/946974" in candidates


def test_builtin_youtube_handle_generates_channel_and_user_candidates() -> None:
    service = _service()
    candidates = service._match_builtin_rules(
        "https://www.youtube.com/@OpenAI",
        {"youtube_channel": True},
    )
    assert "/youtube/channel/@OpenAI" in candidates
    assert "/youtube/user/OpenAI" in candidates


def test_builtin_github_repo_generates_multiple_candidates() -> None:
    service = _service()
    candidates = service._match_builtin_rules(
        "https://github.com/openai/openai-python",
        {"github_repo": True},
    )
    assert "/github/release/openai/openai-python" in candidates
    assert "/github/commit/openai/openai-python" in candidates
    assert "/github/issue/openai/openai-python" in candidates


def test_builtin_xiaoyuzhou_podcast_generates_candidate_from_podcast_url() -> None:
    service = _service()
    candidates = service._match_builtin_rules(
        "https://www.xiaoyuzhoufm.com/podcast/5e280f5db6d15b1cddc84e6f",
        {"xiaoyuzhou_podcast": True},
    )
    assert "/xiaoyuzhou/podcast/5e280f5db6d15b1cddc84e6f" in candidates


def test_builtin_xiaoyuzhou_podcast_generates_candidate_from_episode_url() -> None:
    service = _service()
    candidates = service._match_builtin_rules(
        "https://www.xiaoyuzhoufm.com/episode/67cc640d13fd28d6dd449355",
        {"xiaoyuzhou_podcast": True},
    )
    assert "/xiaoyuzhou/podcast/67cc640d13fd28d6dd449355" in candidates


def test_convert_with_config_prefers_custom_rules_and_deduplicates() -> None:
    service = _service()
    config = RSSHubConfig(
        enabled=True,
        base_url="https://rsshub.example.com",
        custom_rules=[
            {
                "name": "custom-gh",
                "enabled": True,
                "pattern": r"https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/?#]+)",
                "path_template": "/github/release/{owner}/{repo}",
            }
        ],
    )
    urls = service._convert_with_config("https://github.com/openai/openai-python", config)
    assert urls[0] == "https://rsshub.example.com/github/release/openai/openai-python"
    # Dedup keeps only one release URL even though builtin also emits it.
    assert urls.count("https://rsshub.example.com/github/release/openai/openai-python") == 1


@pytest.mark.asyncio
async def test_convert_for_subscribe_returns_empty_when_disabled() -> None:
    service = _service()
    with patch.object(
        service,
        "get_config",
        new=AsyncMock(return_value=RSSHubConfig(enabled=False)),
    ):
        urls = await service.convert_for_subscribe("https://x.com/openai")
    assert urls == []
