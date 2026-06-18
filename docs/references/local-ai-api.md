# Local AI API Reference

This document is written for local AI agents that read Today's Intake and write AI summaries back to Glean.

> **Note (2026-06-12):** The per-article supplement endpoints (`PUT /api/ai/entries/{id}/supplement`, `GET /api/ai/entries/{id}/supplement`) and the `AIEntrySupplement` model were removed when the Today Board AI switched to daily/weekly summaries generated automatically by the worker cron. The write-back path for today-summary (`PUT /api/ai/today-summary`) remains. See `docs/superpowers/specs/2026-06-12-daily-weekly-summary-design.md` for the current design.

## Core Rules

- Use `Authorization: Bearer <GLEAN_API_TOKEN>` for all `/api/ai/*` calls.
- Do not send timezone to `/api/ai/*`. Daily summary and Today entries use the server-configured timezone internally.
- Use the server date from `GET /api/system/time` when deciding the default day to process.
- Send dates as `YYYY-MM-DD`.
- Entry IDs referenced in summary writeback must belong to feeds subscribed by the token owner.

## Get Server Date

Use this before generating a Today summary.

```http
GET /api/system/time
Authorization: Bearer <GLEAN_API_TOKEN>
```

Response:

```json
{
  "timezone": "America/Los_Angeles",
  "current_time": "2026-04-18T06:40:00-07:00",
  "current_date": "2026-04-18"
}
```

Use `current_date` as the default `date` for `/api/ai/today-entries` and `/api/ai/today-summary`.

## List Today Entries

```http
GET /api/ai/today-entries?date=2026-04-18&include_content=false&limit=500
Authorization: Bearer <GLEAN_API_TOKEN>
```

Query parameters:

- `date`: required server-local date, `YYYY-MM-DD`.
- `include_content`: optional boolean. Default `false`. Use `true` only when the local model needs full entry content.
- `limit`: optional integer, `1..500`. Default `500`.

The server converts `date` into a UTC half-open collection window using the server timezone, then returns entries collected in that window.

Response shape:

```json
{
  "date": "2026-04-18",
  "total": 2,
  "items": [
    {
      "id": "entry-id",
      "title": "Entry title",
      "url": "https://example.com/article",
      "author": null,
      "feed_id": "feed-id",
      "feed_title": "Feed title",
      "published_at": "2026-04-18T10:00:00Z",
      "ingested_at": "2026-04-18T13:00:00Z",
      "summary": "Short summary",
      "content": null,
      "content_available": true,
      "is_read": false,
      "is_bookmarked": false,
      "ai_summary_available": false
    }
  ]
}
```

Use `items[].ai_summary_available` to decide whether a today-level daily summary has been generated for this date yet. As of 2026-06-12, the per-article `ai_supplement_available` field was removed along with the supplement model.

## Get Entry Detail

```http
GET /api/ai/entries/{entry_id}
Authorization: Bearer <GLEAN_API_TOKEN>
```

Use this when the Today list item has `content_available: true` but `content` is omitted, or when the model needs complete article text.

Response shape:

```json
{
  "id": "entry-id",
  "title": "Entry title",
  "url": "https://example.com/article",
  "author": null,
  "feed_id": "feed-id",
  "feed_title": "Feed title",
  "published_at": "2026-04-18T10:00:00Z",
  "ingested_at": "2026-04-18T13:00:00Z",
  "summary": "Short summary",
  "content": "Full article content",
  "content_source": "extracted"
}
```

## Write Today Summary

```http
PUT /api/ai/today-summary
Authorization: Bearer <GLEAN_API_TOKEN>
Content-Type: application/json
```

Request body:

```json
{
  "date": "2026-04-18",
  "model": "local-qwen",
  "title": "Daily Brief",
  "summary": "One concise overview of today's intake.",
  "highlights": [
    {
      "entry_id": "entry-id",
      "title": "Entry title",
      "reason": "Why this item matters"
    }
  ],
  "topics": [
    {
      "name": "AI",
      "entry_ids": ["entry-id"]
    }
  ],
  "recommended_entry_ids": ["entry-id"],
  "metadata": {
    "generated_by": "local-ai"
  }
}
```

Notes:

- The call is an upsert for `(user_id, date, server_timezone)`.
- `highlights[*].entry_id`, `topics[*].entry_ids`, and `recommended_entry_ids` are validated against subscribed entries.

Response:

```json
{
  "id": "summary-id",
  "user_id": "user-id",
  "date": "2026-04-18",
  "model": "local-qwen",
  "title": "Daily Brief",
  "summary": "One concise overview of today's intake.",
  "highlights": [],
  "topics": [],
  "recommended_entry_ids": [],
  "metadata": {},
  "created_at": "2026-04-18T13:30:00Z",
  "updated_at": "2026-04-18T13:30:00Z"
}
```

## Read Today Summary

```http
GET /api/ai/today-summary?date=2026-04-18
Authorization: Bearer <GLEAN_API_TOKEN>
```

Query parameters:

- `date`: required server-local date, `YYYY-MM-DD`.

Returns `404` when no summary exists for `(user_id, date, server_timezone)`.

## Common Status Codes

- `401`: missing or invalid token.
- `403`: Local AI integration or the user's AI integration setting is disabled.
- `404`: entry or summary not found.
- `422`: invalid date, invalid payload, or references to entries outside the user's subscriptions.

> **Removed (2026-06-12):** `PUT /api/ai/entries/{id}/supplement` and `GET /api/ai/entries/{id}/supplement` no longer exist. The `AIEntrySupplement` table was dropped; per-article AI summaries were replaced by daily and weekly summaries generated automatically by the worker cron.
