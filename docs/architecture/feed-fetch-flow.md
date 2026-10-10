# Feed Fetch Flow

Last updated: 2026-10-10

This document describes the current feed fetching pipeline implemented in `glean`, based on the worker task, API refresh entrypoints, and RSS parsing/content extraction packages.

For failure modes and non-obvious invariants learned from recent NAS incidents, also read `docs/operations/feed-fetch-guardrails.md`.

## 1. Scope

The flow below covers:

- automatic scheduled feed sync
- manual feed refresh from API
- single-feed fetch and parse
- entry-level full-text fallback extraction
- retry and failure handling

It does not cover feed discovery during subscription creation except where that path eventually enqueues `fetch_feed_task`. For the discovery pipeline, see [`feed-discovery-flow.md`](./feed-discovery-flow.md).

## 2. Entry Points

There are three ways a feed fetch starts:

1. New subscription enqueue:
   `POST /api/feeds/discover` creates the subscription, then enqueues one `fetch_feed_task`.
2. Manual refresh enqueue:
   `POST /api/feeds/{subscription_id}/refresh` and `POST /api/feeds/refresh-all` enqueue `fetch_feed_task` with `backfill_existing_entries=true`.
3. Scheduled refresh enqueue:
   the worker cron runs according to `FEED_REFRESH_INTERVAL_MINUTES`, finds active feeds whose `next_fetch_at` is due, and enqueues `fetch_feed_task`.

## 3. Flow Diagram

```mermaid
flowchart TD
  subgraph T["Trigger"]
    T1["New subscription"] --> T2["enqueue fetch_feed_task"]
    T3["Manual refresh /api/feeds/{subscription_id}/refresh<br/>backfill_existing_entries=true"] --> T2
    T4["Manual refresh all /api/feeds/refresh-all<br/>backfill_existing_entries=true"] --> T2
    T5["Worker cron based on FEED_REFRESH_INTERVAL_MINUTES"] --> T6["scheduled_fetch -> fetch_all_feeds"]
    T6 --> T7["Select ACTIVE feeds with due next_fetch_at"]
    T7 --> T2
  end

  T2 --> F1["fetch_feed_task(feed_id)"]
  F1 --> F2["Load Feed row and write last_fetch_attempt_at early"]
  F2 --> F3["Build attempt URLs:<br/>feed.url + RSSHub fallback URLs"]
  F3 --> F4{"Try each URL"}

  F4 --> F5["fetch_feed(url, etag, last_modified)"]
  F5 --> F6{"304 Not Modified?"}
  F6 -->|Yes| R1["Clear error state<br/>update success timestamps<br/>next_fetch_at = now + refresh interval<br/>return not_modified"]
  F6 -->|No| F7["parse_feed(xml, attempt_url)"]

  F7 --> F8{"Parse ok?"}
  F8 -->|No| F4
  F8 -->|Yes| F9["Update Feed metadata and cache headers"]
  F9 --> F10["Loop parsed entries"]

  F10 --> E1{"Duplicate GUID in current payload?"}
  E1 -->|Yes| F10
  E1 -->|No| E2{"Feed already has full content?"}

  E2 -->|Yes| E3["postprocess_html(feed content)"]
  E2 -->|No| E4["extract_entry_content_update(entry.url)"]

  subgraph X["Full-Text Extraction"]
    X1["HTTP fetch article page"] --> X2{"Readable full text found?"}
    X2 -->|Yes| X5["Use backfill_http"]
    X2 -->|No| X3{"Browser fallback needed?"}
    X3 -->|Yes| X4["Playwright render page"]
    X4 --> X6{"Readable full text found?"}
    X6 -->|Yes| X7["Use backfill_browser"]
    X6 -->|No| X8["Mark extraction failed"]
    X3 -->|No| X8
  end

  E4 --> X1
  X5 --> E5["Assemble Entry payload"]
  X7 --> E5
  X8 --> E5
  E3 --> E5

  E5 --> E6["INSERT ... ON CONFLICT DO NOTHING (uq_feed_guid)"]
  E6 --> E7{"Inserted?"}

  E7 -->|Yes| E8["new_entries++"]
  E8 --> E9{"Vectorization enabled?"}
  E9 -->|Yes| E10["enqueue generate_entry_embedding"]
  E9 -->|No| E11["Continue"]
  E10 --> E11
  E11 --> E12["Track latest_entry_time<br/>commit every 20 inserts"]
  E12 --> F10

  E7 -->|No| E13{"Manual refresh with backfill_existing_entries?"}
  E13 -->|Yes| E14{"Existing entry still summary-like / pending / failed?"}
  E14 -->|Yes| E15["enqueue backfill_entry_content_task(existing_entry.id)"]
  E14 -->|No| F10
  E15 --> F10
  E13 -->|No| F10

  F10 --> F11["Update last_entry_at and next_fetch_at = now + refresh interval"]
  F11 --> R2["return success(new_entries, total_entries)"]

  F4 --> ERR["All attempts failed or task raised"]
  ERR --> D1{"Duplicate GUID race?"}
  D1 -->|Yes| R3["Treat as success<br/>do not count feed failure"]
  D1 -->|No| D2{"Database index corruption?"}
  D2 -->|Yes| R4["Keep feed ACTIVE<br/>record infra error<br/>next_fetch_at = now + refresh interval"]
  D2 -->|No| D3["error_count++ and save fetch_error_message"]
  D3 --> D4{"Other than a transient RSSHub failure<br/>and error_count >= 10?"}
  D4 -->|Yes| D5["Set feed status = ERROR"]
  D4 -->|No| D6["Keep feed enabled"]
  D5 --> D7["Set capped retry schedule with backoff<br/>raise arq Retry using the scheduled delay"]
  D6 --> D7
```

## 4. Step-by-Step Notes

### 4.1 Scheduling and queueing

- The worker registers `fetch_feed_task` plus cron jobs derived from `FEED_REFRESH_INTERVAL_MINUTES`.
- The interval must evenly divide 1440 minutes so one day can be represented as deterministic cron buckets.
- Scheduled sync does not fetch feeds inline. It first selects due feeds, then enqueues one job per feed.
- Manual refresh endpoints also enqueue jobs instead of performing feed fetch synchronously in the API process.
- At local midnight, the worker can also run a supplemental scheduled batch for active feeds that still have not succeeded since the local day started.

### 4.2 Feed-level fetch behavior

- The worker persists `last_fetch_attempt_at` before doing the remote fetch so the UI can reflect long-running syncs.
- It tries the saved `feed.url` first.
- It then appends RSSHub-converted fallback URLs, usually derived from `feed.site_url` or `feed.url`.
- Conditional request headers (`ETag`, `If-Modified-Since`) are only used for the primary feed URL.

### 4.3 Parsing and metadata updates

- XML is parsed with `feedparser`.
- A malformed feed only hard-fails when parsing errors occur and there are no entries.
- On success, the worker updates feed metadata such as title, description, language, site URL, and icon URL.
- Cache headers are only saved when the primary URL succeeded.

### 4.4 Entry content strategy

- Each parsed entry is checked for duplicate GUIDs within the same payload before any database write.
- If feed content looks complete enough, the worker stores that content after HTML post-processing.
- If content looks like a summary or teaser, the worker fetches the article URL and attempts full-text extraction.
- Extraction tries plain HTTP first, then browser rendering when the page appears blocked, challenge-protected, shell-only, or otherwise not extractable.

### 4.5 Existing entry backfill on manual refresh

- For entries already present in the database, normal fetch does not overwrite the row.
- During manual refresh with `backfill_existing_entries=true`, the worker checks whether the existing row still looks summary-only or has pending/failed backfill state.
- If so, it enqueues `backfill_entry_content_task` for that entry.

### 4.6 Success and failure handling

- `304 Not Modified` is treated as a successful fetch and clears previous feed error state.
- Duplicate GUID insert races are treated as benign idempotency cases.
- Database index corruption is treated as infrastructure failure, not feed failure.
- RSSHub connection failures and HTTP 502/503/504 are possible instance outages, but only a failed origin-root health probe opens a circuit. Circuits are keyed separately by origin, including when the final failed attempt used a different fallback instance. Only feeds on that unavailable instance are deferred, without incrementing their error counts.
- Origin circuits use 2/5/10/20/30-minute backoff and retain the failure counter for 30 minutes beyond the health window. A healthy root or successful feed response clears that origin's circuit.
- A RSSHub route returning HTTP 429 or 5xx while its origin is healthy remains `ACTIVE` even after ten failures. Transport failures at a reachable origin also remain eligible. They retain error details and retry at 15/30/60 minutes (capped), without blocking healthy routes or other instances.
- Other exceptions increment `error_count`, store `fetch_error_message`, schedule exponential backoff, and raise an arq retry. After 10 consecutive errors outside the RSSHub transient exception, the feed status becomes `ERROR`.
- The HTTP fetcher performs at most one immediate retry for server/transport failures. HTTP 4xx, including 429, return immediately to the worker's backoff policy instead of issuing a duplicate request one second later.

### 4.7 Operational guardrails

- Queue views must reconcile persisted active runs against Redis because a database row can outlive its ARQ job.
- Long `queue_wait` durations do not prove a worker is healthy; always check worker liveness separately.
- Terminal feed-fetch stage writes must remain idempotent and concurrency-safe.
- `WORKER_TIMEZONE` controls both cron scheduling and midnight supplementation.
- Named timezones such as `Asia/Shanghai` require timezone data in the worker image, currently provided by the Python `tzdata` dependency.

## 5. Source References

- Worker cron and task registration:
  `backend/apps/worker/glean_worker/main.py`
- Manual refresh API:
  `backend/apps/api/glean_api/routers/feeds.py`
- Feed fetch task:
  `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Feed HTTP fetch and discovery:
  `backend/packages/rss/glean_rss/discoverer.py`
- Feed parsing:
  `backend/packages/rss/glean_rss/parser.py`
- Full-text extraction:
  `backend/packages/rss/glean_rss/extractor.py`
- Entry backfill decision helpers:
  `backend/apps/worker/glean_worker/tasks/content_extraction.py`
