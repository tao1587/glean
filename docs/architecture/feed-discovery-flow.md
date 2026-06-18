# Feed Discovery Flow — Spec

Last updated: 2026-04-22
Status: canonical spec for the subscription-creation pipeline. Prefer this doc over reading the router code for intent; the code is authoritative for exact behavior.

Discovery covers three additional stages beyond `<link>`-tag autodiscovery: suffix probing (Stage A), JSON-LD ItemList synthesis (Stage B), and sitemap.xml synthesis (Stage C). Each is independently controllable via an env flag.

## 1. Scope

Pipeline: resolve a user-supplied URL into a subscribable feed URL and create a `Subscription`.

Entry point: `POST /api/feeds/discover` — `discover_feed_url` in [`backend/apps/api/glean_api/routers/feeds.py`](../../backend/apps/api/glean_api/routers/feeds.py).

Not covered here (see [`feed-fetch-flow.md`](./feed-fetch-flow.md)): scheduled sync, manual refresh, per-entry full-text extraction.

## 2. Hard Invariants

| # | Invariant |
|---|---|
| I1 | Discovery accepts one of: (a) a real RSS/Atom document at the source URL itself, an HTML `<link>`-referenced URL, or a common feed-suffix URL (`/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/index.xml`, `/rss.xml`, `/feeds/all.atom.xml`); (b) a matching RSSHub route; (c) a **synthesized** feed derived from structured landing-page data (JSON-LD `ItemList`) or `sitemap.xml`. Synthetic feeds are opt-outable per stage via env flags. |
| I2 | A URL is only accepted as a **direct** feed when either `parse_feed` returns entries **or** the response body begins (after BOM/whitespace) with a feed root token: `<?xml`, `<rss`, `<feed`, `<rdf:rdf`, `<rdf ` (case-insensitive). Synthetic stages (B, C) never consult this guard — they always produce a parseable RSS 2.0 document for feedparser. |
| I3 | `FeedNotFoundError` means "URL is reachable, no feed is present (after A/B/C)." Plain `ValueError` from `discover_feed` means "URL could not be fetched." The router uses the distinction to decide whether to retry via the validation path. |
| I4 | Validation (`_validate_feed_url`) is the sole authority on "is this URL a subscribable **real** feed." For synthetic source types (`synthetic_jsonld`, `synthetic_sitemap`) the router skips `_validate_feed_url` because the stored URL is the landing/sitemap URL — not an RSS document — and the synthesizer has already produced entries. |
| I5 | `rsshub_path` mode bypasses `discover_feed`, stages A/B/C, and RSSHub auto-conversion. `source_type` is forced to `rsshub`. |
| I6 | Playwright / readability-based extraction (`glean_rss.extractor`) is **per-entry, post-subscription only**. Discovery is pure HTTP + parsing. |
| I7 | Synthetic feeds regenerate on every refresh. The stored feed URL for `synthetic_jsonld` is the landing URL; for `synthetic_sitemap` it is the sitemap URL (`{origin}/sitemap.xml`). The worker dispatches on `source_type` and calls `fetch_or_synthesize_feed`, which produces fresh RSS 2.0 XML that then flows through the standard `parse_feed` pipeline. Entries use `guid = link = canonicalize_entry_url(url)` so tracking params / trailing slashes / param ordering never cause spurious duplicates across refreshes. |

## 3. Request / Response Contract

### Request (`DiscoverFeedRequest`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string (URL) | required unless `rsshub_path` provided | source URL; may be a feed URL or a website URL |
| `rsshub_path` | string | optional | explicit RSSHub route; enables manual mode |
| `folder_id` | UUID | optional | destination folder |

### Response

| Status | Body | Meaning |
|---|---|---|
| 201 | `SubscriptionResponse` | feed discovered/validated, subscription created, bootstrap fetch enqueued |
| 400 | `{detail: "Subscription failed. Source feed unavailable: {reason}"}` | direct discovery failed, no RSSHub candidates |
| 400 | `{detail: "Subscription failed. Source feed and RSSHub fallback both failed: source={s}; rsshub={r1}; {r2}…"}` | direct failed, all RSSHub candidates also failed |
| 400 | `{detail: "…already subscribed…"}` | user already has a subscription for this feed |
| 422 | FastAPI validation error | neither `url` nor `rsshub_path` provided |

## 4. Pipeline Stages

```mermaid
flowchart TD
  A["POST /api/feeds/discover"] --> B{"rsshub_path?"}
  B -->|Yes| Z1["create_subscription (manual RSSHub mode)"]
  B -->|No| D["discover_feed(source_url)"]

  D -->|FeedNotFoundError| E1["is_source_valid = False<br/>source_error = FeedNotFoundError message"]
  D -->|ValueError (transient fetch)| V0["(fall through to validation)"]
  D -->|success → (feed_url, title)| V0

  V0 --> V["_validate_feed_url(feed_url)"]
  V -->|valid| Z1
  V -->|invalid| E1
  E1 --> R["RSSHubService.convert_for_subscribe(source_url)"]
  R -->|no candidates| F400a["400 Source feed unavailable"]
  R -->|candidates exist| RL["_validate_feed_url for each in order"]
  RL -->|first valid| Z1
  RL -->|all invalid| F400b["400 Source + RSSHub both failed"]

  Z1 --> J["enqueue fetch_feed_task<br/>trigger_type=subscription_bootstrap"]
  J --> R201["201 SubscriptionResponse"]
```

### Stage D — `discover_feed(url) -> (feed_url, title)`

Source: [`backend/packages/rss/glean_rss/discoverer.py`](../../backend/packages/rss/glean_rss/discoverer.py).

| Step | Action | Next on success | Next on failure |
|---|---|---|---|
| D1 | `httpx.AsyncClient.get(url)` with RSS-reader UA, `follow_redirects=True`, `timeout=30s` | D2 | raise `ValueError("Failed to fetch URL: …")` |
| D2 | If `content-type` contains `xml`/`rss`/`atom` → `parse_feed(body, url)` | return `(url, title, "feed")` | continue to D3 |
| D3 | If `content-type` contains `html` or is empty → BeautifulSoup(lxml) scan for `<link type in {application/rss+xml, application/atom+xml, application/xml}>` | iterate: for each `href`, urljoin, `get`, `parse_feed` → first success returns `(link_url, title, "feed")` | continue to D4 |
| D4 | **Guarded fallback**: if body begins with a feed root token (I2) → `parse_feed(body, url)` | return `(url, title, "feed")` | continue to D5 |
| D5 | **Stage A — suffix probing.** If `GLEAN_DISCOVERY_SUFFIX_PROBING_ENABLED` (default on): in parallel, GET `{origin}{suffix}` for each suffix in `/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/index.xml`, `/rss.xml`, `/feeds/all.atom.xml`. For each response, accept only if content-type or body root token indicates a feed, then `parse_feed`. | return first-hit `(suffix_url, title, "feed")` | continue to D6 |
| D6 | **Stage B — JSON-LD ItemList.** If `GLEAN_DISCOVERY_JSONLD_FALLBACK_ENABLED` (default on) and landing body is HTML: scan `<script type="application/ld+json">` blocks; recurse into `@graph`; find the first `@type == "ItemList"` whose `itemListElement[].url` yields ≥1 canonicalized entry. | return `(source_url, list_name or <title>, "synthetic_jsonld")` | continue to D7 |
| D7 | **Stage C — sitemap synthesis.** If `GLEAN_DISCOVERY_SITEMAP_FALLBACK_ENABLED` (default on): GET `{origin}/sitemap.xml`, then `{origin}/sitemap_index.xml`. For `<sitemapindex>`, follow up to `MAX_SITEMAP_CHILD_FETCHES=3` child sitemaps. Filter entries by: same-origin, not `/`, not a tag/category/page path, not an asset suffix. Sort by `<lastmod>` desc and cap at `MAX_SITEMAP_ENTRIES=50`. Bodies over `MAX_SITEMAP_BODY_BYTES=5MB` are ignored. | return `({origin}/sitemap.xml, <landing title or origin>, "synthetic_sitemap")` | continue to D8 |
| D8 | raise `FeedNotFoundError(...)` | — | — |

**Synthetic refresh model.** When `source_type` is `synthetic_jsonld` or `synthetic_sitemap`, the worker primary-URL dispatch calls `fetch_or_synthesize_feed(url, source_type)` instead of `fetch_feed`. The function refetches the landing/sitemap URL and re-runs Stage B or Stage C's synthesizer to produce fresh RSS 2.0 XML. That XML is then parsed by the normal `parse_feed` pipeline, so downstream entry handling (storage, dedup by GUID, Playwright backfill when configured) is identical to real feeds. Synthetic primary fetches ignore ETag / Last-Modified headers (they do not meaningfully apply). Fallback URLs (idx ≥ 1 — e.g. a RSSHub rescue URL computed by the worker) always go through the plain `fetch_feed` path.

Exceptions:

- `FeedNotFoundError` (subclass of `ValueError`, exported from `glean_rss`): URL is reachable but exposes no feed. This distinguishes "definitive no" from transient fetch errors.
- `ValueError` (plain): fetch failed (`"Failed to fetch URL: <httpx.*>"`).

### Stage V — `_validate_feed_url(feed_url) -> (valid, error)`

Source: `_validate_feed_url` in `routers/feeds.py`.

Composition: `fetch_feed(feed_url)` (handles 304 and 5xx retry internally) → `parse_feed(body, feed_url)`.

| Return | Meaning |
|---|---|
| `(True, None)` | subscribable; proceed to commit (or a 304, which is treated as success) |
| `(False, str(exc))` | not subscribable; `exc` is whatever `fetch_feed` / `parse_feed` raised |

### Stage R — `RSSHubService.convert_for_subscribe(source_url) -> list[str]`

Source: [`backend/packages/core/glean_core/services/rsshub_service.py`](../../backend/packages/core/glean_core/services/rsshub_service.py).

| Gate | Behavior |
|---|---|
| `rsshub.enabled == False` or `rsshub.auto_convert_on_subscribe == False` | returns `[]`; no fallback attempted |
| otherwise | returns deduplicated ordered candidate URLs (custom rules first, then builtin) |

Each candidate is passed through Stage V. First `(True, None)` wins; all errors accumulated for the 400 response.

See [`../product/rsshub-auto-conversion-enhancement.md`](../product/rsshub-auto-conversion-enhancement.md) for rule format and builtin coverage.

### Stage J — Commit + handoff

1. `feed_service.create_subscription(user_id, feed_url, feed_title, folder_id, rsshub_path, source_type)` — idempotent on `(user, feed)`; creates `Feed` if missing. Raises `ValueError("…already subscribed…")` on duplicate → router translates to 400.
2. `enqueue_feed_refresh_job(trigger_type="subscription_bootstrap", subscription_id=…)` — first `fetch_feed_task` for this subscription.
3. Return `SubscriptionResponse` with HTTP 201.

## 5. Router Error-Message Routing

The router surfaces the cleanest available error, controlled by which exception type discovery raised:

| `discover_feed` outcome | Router behavior | Final `source_error` shown to client |
|---|---|---|
| success, `source_type="feed"` | run Stage V normally | `None` on success; `fetch_feed`/`parse_feed` message on failure |
| success, `source_type` ∈ `{synthetic_jsonld, synthetic_sitemap}` | **skip Stage V** (stored URL is not a feed document); accept synthesized entries directly | `None` |
| `FeedNotFoundError` | **skip Stage V** on the same URL | the `FeedNotFoundError` message |
| plain `ValueError` (fetch failure) | still run Stage V (fetch_feed has retry) | whichever error V produces |

Why skip Stage V when `FeedNotFoundError` is raised: re-running `fetch_feed` + `parse_feed` on the same URL would feed HTML to feedparser and leak `<unknown>:N:M: not well-formed (invalid token)` as the user-visible error, masking the real cause.

## 6. Exception Hierarchy

```
ValueError
└── FeedNotFoundError            # from glean_rss.discoverer
```

Public import: `from glean_rss import FeedNotFoundError`.

Callers MAY still `except ValueError` to catch both, but the router discriminates between the two for diagnostic quality.

## 7. Failure Modes (Reference)

| Situation | `source_error` text | Terminal HTTP (no RSSHub rescue) |
|---|---|---|
| DNS / TLS / connect timeout | `Failed to fetch URL: <httpx error>` (from D1) **or** `Failed to fetch feed: <httpx error>` (from V after D raised transiently) | 400 |
| URL returns HTML with no `<link>` feed tag and body is not a feed document | `No RSS/Atom feed found at this URL (no <link rel="alternate"> tag and response is not a feed document)` | 400 |
| URL returns a feed document that `feedparser` flags `bozo=True` with no entries | `Failed to parse feed: <bozo_exception>` | 400 |
| URL is a feed + content-type is wrong but body starts with feed root token | — (success via D4) | 201 |
| HTML-only site with a valid suffix URL (e.g. `/feed.xml`) | — (success via D5) | 201 with `source_type=feed` |
| HTML-only site with JSON-LD `ItemList` | — (success via D6) | 201 with `source_type=synthetic_jsonld` |
| HTML-only site with usable `sitemap.xml` | — (success via D7) | 201 with `source_type=synthetic_sitemap` |
| Validation fine, already subscribed | from `create_subscription` | 400 |
| Validation fails, first RSSHub candidate valid | (logged, transparent) | 201 with `source_type=rsshub` |

## 8. Known Gaps (Not Currently Supported)

Listed explicitly so AI-generated code doesn't assume these behaviors exist.

- **No LLM- or Playwright-assisted discovery.** Playwright exists in `glean_rss.extractor` but only runs post-subscription, per entry.
- **No content-type override by the client.** Discovery trusts headers advisorily and falls back to content sniffing on the body root token.
- **No arbitrary (non-`ItemList`) JSON-LD shapes.** Stage B only recognizes `@type: "ItemList"` (direct or nested under `@graph`). `BlogPosting`, `Article` arrays on their own, or bespoke microdata are not synthesized.
- **No per-entry content from synthetic feeds.** Stages B and C emit `<title>` / `<link>` / `<guid>` / `<pubDate>` only; there is no `<description>` or full-content `<content:encoded>`. Per-entry body comes later from `glean_rss.extractor` under the existing backfill rules.

## 9. Source References

| Concern | Path |
|---|---|
| API route | `backend/apps/api/glean_api/routers/feeds.py` (`discover_feed_url`, `_validate_feed_url`) |
| Discovery | `backend/packages/rss/glean_rss/discoverer.py` (`discover_feed`, `fetch_feed`, `FeedNotFoundError`, `_looks_like_feed_document`) |
| Parsing | `backend/packages/rss/glean_rss/parser.py` (`parse_feed`, `ParsedFeed`) |
| RSSHub conversion | `backend/packages/core/glean_core/services/rsshub_service.py` |
| Subscription creation | `backend/packages/core/glean_core/services/feed_service.py` (`create_subscription`) |
| Bootstrap enqueue | `backend/apps/api/glean_api/feed_refresh.py` (`enqueue_feed_refresh_job`) |
| Discoverer tests | `backend/packages/rss/tests/test_discoverer.py` |

## 10. See Also

- [`feed-fetch-flow.md`](./feed-fetch-flow.md) — post-subscription fetch/parse pipeline.
- [`../product/rsshub-auto-conversion-enhancement.md`](../product/rsshub-auto-conversion-enhancement.md) — RSSHub rule format, builtin coverage, admin config.
- [`../operations/feed-fetch-guardrails.md`](../operations/feed-fetch-guardrails.md) — runtime invariants shared across discovery and fetch.
