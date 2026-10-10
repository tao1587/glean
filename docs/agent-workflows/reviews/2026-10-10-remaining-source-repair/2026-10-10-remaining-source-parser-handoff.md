# Remaining source parser repair handoff

## Confirmed root cause

A bounded NAS probe found a legacy feed URL returning HTTP 200 with a well-formed HTML document. `feedparser` reported no format version, no entries and `bozo=False`. The parser checked for HTML only inside `if bozo and not entries`, so the worker treated that response as a successful empty feed and cleared failure state. Private subscribed-source addresses and inventories remain outside this repository.

## What changed

- Reject HTML documents with no salvageable entries before evaluating the `bozo` flag.
- Preserve valid empty RSS/Atom feeds, malformed feeds with salvageable entries and HTML-wrapped feed entries.
- Keep the existing HTML error classification/message and all other parsing behavior.
- Decode byte bodies for root sniffing, skip leading XML declarations/comments, and require an exact HTML root name so an Atom namespace prefix such as `html:feed` remains valid.
- Add one architecture note explaining the distinction. No retry, scheduler, proxy, feed URL or database changes are included.

## Files touched

- `backend/packages/rss/glean_rss/parser.py`
- `backend/packages/rss/tests/test_parser.py`
- `docs/architecture/feed-fetch-flow.md`
- This handoff

## Verification

- RED: `uv run --no-sync pytest --no-cov packages/rss/tests/test_parser.py -q --tb=short` returned one intended failure (`DID NOT RAISE ValueError` for well-formed HTML) and 22 passes. The benign fixture reproduced `bozo=False` and zero entries without mocking `feedparser`.
- GREEN: parser, discovery, HTTP retry, synthetic-feed, worker fetch and RSSHub reliability targets passed all 98 tests. Existing suite warnings are the Query deprecation and AsyncMock session-add fixtures.
- Independent evaluation caught three boundary regressions before deployment: valid empty RSS bytes raised a type error, `html:feed` Atom was misclassified, and a leading-comment HTML page bypassed the guard. Five new cases reproduced those boundaries plus UTF-8/UTF-16 HTML bytes: five intended failures and 23 passes before correcting the sniffer.
- Final GREEN: the same combined parser/discovery/retry/synthetic/worker/RSSHub targets passed all 103 tests after the exact-root and bytes correction.
- Ruff check and format check passed for both changed Python files.
- Targeted Pyright: zero errors; one existing third-party `FeedParserDict.get` unknown-member warning on the unchanged malformed-feed error expression.
- Repository docs validation and `git diff --check` passed.

All commands used `UV_CACHE_DIR=/private/tmp/glean-rsshub-uv-cache` to avoid writing outside the workspace sandbox.

## Reviewer focus and deployment gap

Verify the no-entry HTML guard runs regardless of `bozo`, byte bodies and leading comments are handled, and `html:feed` remains a valid empty Atom feed. Four valid empty-feed fixtures and both salvage fixtures remain accepted. The generator performed no NAS requests or mutations for this repair, made no commits and left the six pre-existing dirty files untouched. Root owns the separate targeted source/proxy repairs, deployment and post-rollout checks. No speculative worker retry/fallback changes were implemented.
