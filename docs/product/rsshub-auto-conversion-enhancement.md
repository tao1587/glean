# RSSHub Auto-Conversion Enhancement

Last updated: 2026-02-18

## Goal

Provide robust fallback subscription/fetch behavior:

1. Try source feed directly.
2. If source fails, try RSSHub conversion candidates.
3. If all attempts fail, report explicit failure.

## Implemented Architecture

### 1) Config and Admin Control

- Config namespace: `rsshub`
- Fields:
  - `enabled`
  - `base_url`
  - `auto_convert_on_subscribe`
  - `fallback_on_fetch`
  - `ruleset_version`
  - `builtin_rules`
  - `custom_rules`
- Admin endpoints:
  - `GET /api/admin/settings/rsshub`
  - `POST /api/admin/settings/rsshub`

### 2) Rule Engine

- Service: `RSSHubService`
- Inputs:
  - source URL
  - config (builtin toggles + custom regex rules)
- Output:
  - ordered candidate RSSHub feed URLs
- Behavior:
  - custom rules evaluated first
  - builtin rules appended
  - duplicate candidates removed while preserving order

### 3) Subscription Flow

Route: `POST /api/feeds/discover`

- Attempt source discovery + validation.
- On failure, get RSSHub candidates and validate sequentially.
- First valid candidate is used for subscription.
- If none succeed, return combined source/RSSHub failure reason.

### 4) Fetch Flow (Worker)

Task: `fetch_feed_task`

- Attempt order:
  - `feed.url` (primary, with conditional headers)
  - RSSHub candidate URLs (fallback, no conditional headers)
- First successful parse continues normal pipeline.
- If fallback used, logs source and fallback URL for observability.

## Builtin Rule Coverage (Current)

- bilibili: user space, video
- youtube: channel, handle, user, playlist
- zhihu: column, people answers/articles, question
- x/twitter: user
- github: release/commit/issue
- reddit: subreddit, user
- telegram: channel
- weibo: user
- medium: user, publication
- pixiv: user

## Custom Rule Format

`custom_rules` is a JSON array:

```json
[
  {
    "name": "example-rule",
    "enabled": true,
    "pattern": "https://example.com/u/(?P<uid>[^/?#]+)",
    "path_template": "/example/user/{uid}"
  }
]
```

Notes:

- `pattern` supports Python regex.
- `path_template` supports named capture interpolation via `{name}`.
- Invalid regex/template entries are skipped.

## Known Limits

- Rule matching is URL-pattern based, not semantic content parsing.
- Some platforms have many route variants; coverage is strong but not exhaustive.
- Candidate validity still depends on target RSSHub deployment support.

## Next Recommended Enhancements

1. Add fixture-driven rule tests per platform variant.
2. Add metrics counters for:
   - source success
   - fallback success
   - fallback failure
3. Add admin preview API:
   - input source URL
   - return candidate list + match source (builtin/custom)
4. Add per-rule priority and explicit ordering controls in admin UI.
