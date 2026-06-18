# Backend Logging Baseline

This document records the current backend logging baseline for Glean and the review standard to use when adding or modifying logs.

## Goal

Backend logs should optimize for production operations, not step-by-step execution tracing.

Keep logs when they help answer one of these questions:

- Did a request succeed, fail, or run slowly?
- Did a business state transition complete?
- Did a task cross a system boundary?
- Did a fallback, retry, or degradation path trigger?
- Did something fail and require action?

Do not keep logs whose main value is:

- loop-by-loop progress
- per-row insert visibility
- per-item queue success visibility
- repeated success-path confirmations
- debounce-hit or cache-hit chatter
- ORM/SQL statement tracing during normal operation

## Global Baseline

Logging configuration lives in [backend/packages/core/glean_core/logging_config.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/logging_config.py).

Current defaults:

- `LOG_LEVEL=INFO`
- `LOG_THIRD_PARTY_LEVEL=INFO`
- `LOG_SQLALCHEMY_LEVEL=WARNING`

Interpretation:

- application and framework lifecycle logs remain visible
- SQLAlchemy engine/pool/dialect logs are treated as noise unless explicitly debugging DB behavior

## Current Retained Log Types

### Request Baseline

File: [backend/apps/api/glean_api/middleware/logging.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/middleware/logging.py)

Retained:

- one request-completion log per HTTP request
- slow requests as `warning`
- non-2xx/3xx responses as `warning`
- unhandled exceptions as `exception`

Purpose:

- preserve auditability and latency visibility

### API And Worker Lifecycle

Files:

- [backend/apps/api/glean_api/main.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/main.py)
- [backend/apps/worker/glean_worker/main.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/main.py)

Retained:

- app startup/shutdown
- Redis/MCP initialization
- worker startup/shutdown
- registered task and cron overview

Purpose:

- confirm service boot state and runtime configuration

### RSS Subscription And Feed Fetching

Files:

- [backend/apps/api/glean_api/routers/feeds.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/routers/feeds.py)
- [backend/apps/worker/glean_worker/tasks/feed_fetcher.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/tasks/feed_fetcher.py)

Retained:

- RSSHub fallback selected during subscribe
- feed not found
- fetch attempt failure
- fallback source used successfully
- feed fetch completed
- fetch task timeout/cancellation
- fetch exception
- DB index corruption
- feed disabled after repeated failures
- retry/backoff scheduling
- scheduled queue summary

Removed:

- requesting/parsing progress logs
- duplicate-guid skip logs
- per-entry content extraction success logs
- per-entry embedding queue success logs

### User Reading State / Preference Signals

Files:

- [backend/packages/core/glean_core/services/entry_service.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/services/entry_service.py)
- [backend/packages/core/glean_core/services/bookmark_service.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/services/bookmark_service.py)

Retained:

- preference update queue failure

Removed:

- preference update queued
- debounce-hit logs

Rationale:

- the user action is already persisted; only queue failures matter operationally

### Translation

Files:

- [backend/apps/api/glean_api/routers/entries.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/routers/entries.py)
- [backend/packages/core/glean_core/services/translation_service.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/services/translation_service.py)
- [backend/apps/worker/glean_worker/tasks/translation.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/tasks/translation.py)
- [backend/packages/core/glean_core/services/translation_providers.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/services/translation_providers.py)

Retained:

- paragraph translation cache load failure
- translation provider failure
- paragraph translation persistence failure
- translation task record missing
- translation task completion
- translation task exception
- provider fallback / degraded behavior

Removed:

- translation batch start
- title translated
- content translated
- translation task queued

### Bookmark Metadata

File: [backend/apps/worker/glean_worker/tasks/bookmark_metadata.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/tasks/bookmark_metadata.py)

Retained:

- bookmark not found
- bookmark missing URL
- content extraction failure
- HTTP error
- request error
- task exception

Removed:

- task start
- fetching URL
- extracted content success
- updated title/excerpt/content
- success completion

### Discovery

File: [backend/packages/core/glean_core/services/discovery_service.py](/Users/taro/Sites/github/glean/backend/packages/core/glean_core/services/discovery_service.py)

Retained:

- Tavily key missing
- discovery search request failure

Removed:

- no-candidate summaries
- refresh summary info logs

### MCP Tool Access

Files:

- [backend/apps/api/glean_api/mcp/tools/entries.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/mcp/tools/entries.py)
- [backend/apps/api/glean_api/mcp/tools/subscriptions.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/mcp/tools/subscriptions.py)

Retained:

- none on normal success path

Rationale:

- MCP reads are high-frequency and success logs add little operational value

## Review Rules For Future Changes

When reviewing a new log line, ask:

1. Is this a request boundary, task boundary, state transition, fallback, retry, or failure?
2. Would removing it make on-call diagnosis materially harder?
3. Is this log emitted once per user action, or once per row/item/loop iteration?
4. Can the same information already be inferred from request logs, task status, or database state?

Default decisions:

- keep `warning`, `error`, `exception` unless clearly redundant
- keep one success log for long-running async task completion
- keep one summary log for batch scheduling, not per-item scheduling
- remove per-item success logs inside loops
- remove SQL/ORM trace logs from normal production baseline

## How To Temporarily Increase Verbosity

For infrastructure or DB debugging, prefer environment variables over permanent code changes.

Examples:

```bash
LOG_LEVEL=DEBUG
LOG_THIRD_PARTY_LEVEL=DEBUG
LOG_SQLALCHEMY_LEVEL=INFO
```

After debugging, revert to the baseline.
