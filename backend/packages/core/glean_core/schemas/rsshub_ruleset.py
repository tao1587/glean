"""Versioned builtin RSSHub ruleset defaults."""

from __future__ import annotations

RSSHUB_RULESET_VERSION = "2026.03.12"

RSSHUB_BUILTIN_RULES_DEFAULTS: dict[str, bool] = {
    "bilibili_space": True,
    "bilibili_video": True,
    "youtube_channel": True,
    "youtube_playlist": True,
    "zhihu_column": True,
    "zhihu_people": True,
    "zhihu_question": True,
    "x_user": True,
    "github_repo": True,
    "reddit_subreddit": True,
    "reddit_user": True,
    "telegram_channel": True,
    "weibo_user": True,
    "medium_user": True,
    "medium_publication": True,
    "pixiv_user": True,
    "xiaoyuzhou_podcast": True,
}
