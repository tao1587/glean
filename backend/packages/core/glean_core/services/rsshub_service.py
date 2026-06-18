"""
RSSHub conversion service.

Converts source URLs into RSSHub routes using builtin and custom rules.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas import RSSHubConfig

from .typed_config_service import TypedConfigService


class RSSHubService:
    """Service for RSSHub route conversion."""

    def __init__(self, session: AsyncSession) -> None:
        self._typed_config = TypedConfigService(session)

    async def get_config(self) -> RSSHubConfig:
        return await self._typed_config.get(RSSHubConfig)

    async def convert_for_subscribe(self, source_url: str) -> list[str]:
        """Convert source URL to candidate RSSHub feed URLs for subscription fallback."""
        config = await self.get_config()
        if not config.enabled or not config.auto_convert_on_subscribe:
            return []
        return self._convert_with_config(source_url, config)

    async def convert_for_fetch(self, source_url: str) -> list[str]:
        """Convert source URL to candidate RSSHub feed URLs for fetch fallback."""
        config = await self.get_config()
        if not config.enabled or not config.fallback_on_fetch:
            return []
        return self._convert_with_config(source_url, config)

    def _convert_with_config(self, source_url: str, config: RSSHubConfig) -> list[str]:
        base = (config.base_url or "").strip().rstrip("/")
        if not base or not base.startswith(("http://", "https://")):
            return []

        paths: list[str] = []
        paths.extend(self._match_custom_rules(source_url, config.custom_rules))
        paths.extend(self._match_builtin_rules(source_url, config.builtin_rules))
        # Preserve order while deduplicating
        seen: set[str] = set()
        urls: list[str] = []
        for path in paths:
            normalized = path.strip()
            if not normalized:
                continue
            url = urljoin(base + "/", normalized.lstrip("/"))
            if url in seen:
                continue
            seen.add(url)
            urls.append(url)
        return urls

    def _match_custom_rules(
        self, source_url: str, custom_rules: list[dict[str, str | bool]]
    ) -> list[str]:
        paths: list[str] = []
        for rule in custom_rules:
            if not bool(rule.get("enabled", True)):
                continue

            pattern = str(rule.get("pattern", "")).strip()
            template = str(rule.get("path_template", "")).strip()
            if not pattern or not template:
                continue

            try:
                match = re.search(pattern, source_url)
            except re.error:
                continue
            if not match:
                continue

            try:
                # Named groups are supported by str.format(**groupdict()).
                path = template.format(**match.groupdict())
            except Exception:
                continue

            if path:
                paths.append(path)
        return paths

    def _match_builtin_rules(self, source_url: str, toggles: dict[str, bool]) -> list[str]:
        parsed = urlparse(source_url)
        host = parsed.netloc.lower()
        path = parsed.path.strip("/")
        segments = [seg for seg in path.split("/") if seg]
        candidates: list[str] = []

        if (
            toggles.get("bilibili_space", True)
            and "space.bilibili.com" in host
            and segments
            and segments[0].isdigit()
        ):
            uid = segments[0]
            candidates.extend(
                [
                    f"/bilibili/user/dynamic/{uid}",
                    f"/bilibili/user/video/{uid}",
                ]
            )

        if (
            toggles.get("bilibili_video", True)
            and host.endswith("bilibili.com")
            and len(segments) >= 2
            and segments[0] == "video"
        ):
            bvid = segments[1]
            if bvid:
                candidates.append(f"/bilibili/video/{bvid}")

        if toggles.get("youtube_channel", True) and host in {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
        }:
            if len(segments) >= 2 and segments[0] == "channel":
                candidates.append(f"/youtube/channel/{segments[1]}")
            if segments and segments[0].startswith("@"):
                handle = segments[0]
                candidates.extend(
                    [
                        f"/youtube/channel/{handle}",
                        f"/youtube/user/{handle.lstrip('@')}",
                    ]
                )
            if len(segments) >= 2 and segments[0] == "user":
                candidates.append(f"/youtube/user/{segments[1]}")

        if toggles.get("youtube_playlist", True) and host in {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
        }:
            query = parsed.query
            match = re.search(r"(?:^|&)list=([^&]+)", query)
            if match:
                candidates.append(f"/youtube/playlist/{match.group(1)}")

        if toggles.get("zhihu_column", True) and "zhuanlan.zhihu.com" in host and segments:
            candidates.append(f"/zhihu/zhuanlan/{segments[0]}")

        if (
            toggles.get("zhihu_people", True)
            and host.endswith("zhihu.com")
            and len(segments) >= 2
            and segments[0] == "people"
        ):
            uid = segments[1]
            candidates.extend(
                [
                    f"/zhihu/people/{uid}/answers",
                    f"/zhihu/people/{uid}/articles",
                ]
            )

        if (
            toggles.get("zhihu_question", True)
            and host.endswith("zhihu.com")
            and len(segments) >= 2
            and segments[0] == "question"
        ):
            candidates.append(f"/zhihu/question/{segments[1]}")

        if toggles.get("x_user", True) and host in {"x.com", "twitter.com", "www.twitter.com"}:
            blocked = {
                "home",
                "explore",
                "search",
                "notifications",
                "messages",
                "settings",
                "i",
            }
            if segments and segments[0] not in blocked and not segments[0].startswith("@"):
                user = segments[0]
                candidates.extend([f"/x/user/{user}", f"/twitter/user/{user}"])

        if (
            toggles.get("github_repo", True)
            and host in {"github.com", "www.github.com"}
            and len(segments) >= 2
        ):
            owner = segments[0]
            repo = segments[1].removesuffix(".git")
            blocked = {"orgs", "topics", "marketplace", "features", "about", "login", "explore"}
            if owner not in blocked and repo:
                candidates.extend(
                    [
                        f"/github/release/{owner}/{repo}",
                        f"/github/commit/{owner}/{repo}",
                        f"/github/issue/{owner}/{repo}",
                    ]
                )

        if (
            toggles.get("reddit_subreddit", True)
            and host in {
            "reddit.com",
            "www.reddit.com",
            "old.reddit.com",
            }
            and len(segments) >= 2
            and segments[0] == "r"
        ):
            candidates.append(f"/reddit/subreddit/{segments[1]}")

        if (
            toggles.get("reddit_user", True)
            and host in {
            "reddit.com",
            "www.reddit.com",
            "old.reddit.com",
            }
            and len(segments) >= 2
            and segments[0] in {"user", "u"}
        ):
            candidates.append(f"/reddit/user/{segments[1]}")

        if toggles.get("telegram_channel", True) and host in {"t.me", "telegram.me"} and segments:
            channel = segments[0]
            if channel and not channel.startswith("+"):
                candidates.append(f"/telegram/channel/{channel}")

        if (
            toggles.get("weibo_user", True)
            and host in {"weibo.com", "www.weibo.com", "m.weibo.cn"}
            and len(segments) >= 2
            and segments[0] == "u"
            and segments[1].isdigit()
        ):
            candidates.append(f"/weibo/user/{segments[1]}")

        if (
            toggles.get("medium_user", True)
            and host in {"medium.com", "www.medium.com"}
            and segments
            and segments[0].startswith("@")
        ):
            candidates.append(f"/medium/user/{segments[0].lstrip('@')}")

        if toggles.get("medium_publication", True):
            if host in {"medium.com", "www.medium.com"} and segments and not segments[0].startswith("@"):
                publication = segments[0]
                blocked = {"tag", "topic", "search", "m", "p"}
                if publication not in blocked:
                    candidates.append(f"/medium/publication/{publication}")
            if host.endswith(".medium.com"):
                publication = host.split(".")[0]
                if publication and publication not in {"www"}:
                    candidates.append(f"/medium/publication/{publication}")

        if (
            toggles.get("pixiv_user", True)
            and host in {"www.pixiv.net", "pixiv.net"}
            and len(segments) >= 2
            and segments[0] == "users"
            and segments[1].isdigit()
        ):
            candidates.append(f"/pixiv/user/{segments[1]}")

        if toggles.get("xiaoyuzhou_podcast", True) and (
            host.endswith("xiaoyuzhoufm.com") or host.endswith("xiaoyuzhou.fm")
        ) and len(segments) >= 2 and segments[0] in {"podcast", "episode"}:
            podcast_id = segments[1]
            if podcast_id:
                candidates.append(f"/xiaoyuzhou/podcast/{podcast_id}")

        return candidates
