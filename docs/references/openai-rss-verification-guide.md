# OpenAI RSS Verification Guide

This guide documents the repeatable verification flow we used to validate OpenAI RSS full-text extraction in Docker, especially for pages that may return `403` to plain HTTP and require browser fallback.

## Scope

Use this guide when you need to verify any of the following:

- the worker image contains the latest RSS/browser extraction code
- OpenAI RSS can be fetched end-to-end in Docker
- browser fallback works for `openai.com/index/*` article pages
- client-side error pages are not stored as article content

## Preconditions

- Docker Desktop is running
- project root is the current working directory
- local stack uses `docker-compose.yml` with `docker-compose.override.yml`

## 1. Rebuild and restart the worker

Rebuild the worker so the latest extractor changes are active:

```bash
docker compose up -d --build worker
```

If backend changes are also relevant, rebuild both services:

```bash
docker compose up -d --build backend worker
```

## 2. Follow logs

Watch worker logs while triggering the feed fetch:

```bash
docker compose logs -f worker --since=20s
```

Backend logs are optional but useful when validating API-triggered subscription/refresh:

```bash
docker compose logs -f backend --since=20s
```

## 3. Trigger an OpenAI RSS fetch

### Option A: Use the web UI

- open `http://localhost`
- log in with a normal user account
- subscribe to `https://openai.com/news/rss.xml`

### Option B: Use the API directly

Important: the web client hashes passwords with SHA-256 before sending them. If you create test users via the raw API and want them to remain web-login compatible, hash the password before calling `/api/auth/register` and `/api/auth/login`.

Example flow with Node:

```bash
node -e "
const crypto = require('crypto');
const base = 'http://127.0.0.1:8000';
const email = 'openai-rss-test-' + Date.now() + '@example.com';
const plainPassword = 'Password123!';
const password = crypto.createHash('sha256').update(plainPassword).digest('hex');

async function req(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(base + path, { ...options, headers });
  const body = await res.json();
  return { status: res.status, body };
}

(async () => {
  const register = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name: 'OpenAI RSS Test', password }),
  });
  if (register.status !== 201) {
    console.log(JSON.stringify({ step: 'register', register }, null, 2));
    process.exit(1);
  }

  const token = register.body.tokens.access_token;
  const discover = await req('/api/feeds/discover', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: JSON.stringify({ url: 'https://openai.com/news/rss.xml' }),
  });

  console.log(JSON.stringify({ email, discover }, null, 2));
})();
"
```

## 4. What success looks like

For the feed itself:

- `HTTP Request: GET https://openai.com/news/rss.xml "HTTP/1.1 200 OK"`
- `Parsed feed`

For article extraction:

- `Entry has no full content, fetching from URL`
- one of:
  - plain HTTP success, often `308 -> 200` or direct `200`
  - plain HTTP `403` followed by browser fallback success
- `Successfully extracted full text`

Typical acceptable patterns:

```text
HTTP Request: GET https://openai.com/index/... "HTTP/1.1 403 Forbidden"
Successfully extracted full text
... 'backfill_browser' ...
```

```text
HTTP Request: GET https://openai.com/index/.../ "HTTP/1.1 200 OK"
Successfully extracted full text
... 'backfill_http' ...
```

## 5. What failure looks like

These patterns should be treated as failures or regressions:

- client-side exception HTML stored as content
- repeated `403` without a later success path
- `Browser extraction failed`
- `Full text extraction returned empty, using summary` for URLs that previously worked

This specific string is a red flag and should not appear in stored article content:

```text
Application error: a client-side exception has occurred while loading
```

To explicitly check for that regression:

```bash
docker compose logs worker --since=10m | rg "Application error: a client-side exception|see the browser console for more information"
```

No output is the expected result.

## 6. Verify persisted rows

Inspect stored OpenAI entries:

```bash
docker exec glean-postgres psql -U glean -d glean -c "
select url, content_source, content_backfill_status, content_backfill_error
from entries
where feed_id in (
  select id from feeds where url = 'https://openai.com/news/rss.xml'
)
order by ingested_at desc
limit 20;
"
```

Expected:

- `content_backfill_status = done`
- `content_source` is either `backfill_http` or `backfill_browser`
- `content_backfill_error` is empty for successful rows

## 7. Important notes

### Restart behavior

Worker restart does not blindly fetch all feeds at startup.

- startup only initializes services and logs registered jobs
- scheduled feed fetch runs every 15 minutes
- due feeds are selected from the database using `status` and `next_fetch_at`
- any already queued Redis jobs may run immediately after restart

### Why OpenAI logs can look noisy

OpenAI article pages are mixed:

- some URLs work over plain HTTP
- some return `403` to plain HTTP and need browser fallback
- behavior can vary between article URLs in the same RSS feed

That means `403` in logs is not automatically a failure. The final stored `content_source` and absence of client-error HTML matter more than the initial article GET status.
