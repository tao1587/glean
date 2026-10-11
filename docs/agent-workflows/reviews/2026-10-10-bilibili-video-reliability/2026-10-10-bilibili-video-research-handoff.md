# Video-provider route research handoff

## Scope and outcome

Read-only generator research for the [video reliability contract](./2026-10-10-bilibili-video-reliability-contract.md). This document contains public route/source evidence only. No NAS/provider API probes, runtime changes, credential changes, queue operations or commits were performed by this generator.

Official GitHub public API and raw source were read on 2026-10-10. The resolved upstream revision was `f9d63f3da1b5145930fd3fcdccf8e205985a4040`. Official documentation pages were blocked in this research environment; route declarations and implementation are the primary evidence. No current route is proven permanently available by this source review.

## Current route semantics

| Candidate | Content and identity | Suitability |
| --- | --- | --- |
| `/bilibili/user/video/:uid/:embed?` | Upload list; canonical BV/AV links; publication time from video `created`. | Keeps the intended video meaning. API failure already triggers browser fallback. |
| `/bilibili/user/dynamic/:uid/:routeParams?` | Mixed social timeline. Default links identify dynamics; time is dynamic `module_author.pub_ts`. | Successful XML alone does not establish video-only recovery. |
| Dynamic with `directLink=1` | Changes direct content links, including forwarded original content. | Can align an original video's BV link, but does not establish original authorship, complete upload coverage or equal dates. |
| `/bilibili/user/video-all/:uid/:embed?` | Same WBI upload endpoint, then every remaining page concurrently. | Does not provide an independent upstream and increases request load. Do not use as a bounded recovery probe. |
| `/bilibili/user/channel/:uid/:sid/:embed?` or `/user/collection/...` | Video subset selected by a series/collection identifier. | Only suitable if the publisher explicitly maintains an equivalent complete collection and the operator verifies coverage. |
| `/bilibili/followings/video/:uid/:embed?` | Logged-in user's followed publishers, using that account's configured cookie. | Different subscription meaning; not a replacement for one publisher's uploads. |

Sources: [video route](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/video.ts), [dynamic route](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/dynamic.ts), [all-videos route](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/video-all.ts), [channel](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/user-channel.ts), [collection](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/user-collection.ts), [followed videos](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/followings-video.ts).

Dynamic's supported route parameters are `showEmoji`, `embed`, `useAvid`, `directLink`, `hideGoods` and `offset`; its sole structural filter is merchandise exclusion. Neither that route nor the generic parameter middleware implements `filter_type` or `filter_link`. Text/author/category filters can match a rendered video reference or a forwarded post and cannot certify original video ownership. [Generic parameter implementation](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/middleware/parameter.ts).

RSSHub RSS/Atom items default to `item.guid || item.link || item.title`. Neither current video nor dynamic supplies a GUID. Glean parses the entry ID before the link and inserts with uniqueness on `(feed_id, guid)`. Thus default dynamic IDs differ from upload BV/AV IDs; switching route semantics can insert duplicate representations without touching old rows. `directLink=1` only makes IDs compatible when the final canonical URL actually matches, including the BV/AV choice. Compare existing IDs before any adjustment. [RSS template](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/views/rss.tsx), [Atom template](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/views/atom.tsx), local callers: `backend/packages/rss/glean_rss/parser.py`, `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`.

## Browser and authentication support

Current video code tries the signed upload API, then opens the publisher's video page with the existing browser helper and waits for one matching upload API response. It validates HTTP status, JSON content type, provider business code and data presence. The response wait is 45 seconds; browser lifetime is bounded at 90 seconds. A browser response with business code `-352` still fails explicitly. No separate current `video-browser` route is defined. [Browser integration PR](https://github.com/DIYgod/RSSHub/pull/21913).

The supported configuration is `BILIBILI_COOKIE_<logged-in-account-uid>` in RSSHub environment configuration, not a feed query parameter. Public route declarations distinguish `SESSDATA` for videos from the full Cookie required by dynamics. The current helper selects among configured account cookies; it does not require a cookie belonging to the publisher. Without configuration it obtains a cached visitor cookie through the browser. Dynamic retries `-352` once through `getCookie(true)`, which deliberately ignores configured account cookies, then reports a verification challenge. This is source behavior, not proof that supplying a session will resolve the live failure. Store only presence/expiry validation metadata outside Git; never print cookie or verification-voucher values. [Cookie helper](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/routes/bilibili/cache.ts), [environment parser](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/config.ts).

## Upstream history and deployed comparison limits

- [2025-05-08 dynamic fallback](https://github.com/DIYgod/RSSHub/commit/e1ae2b02003daebf3ebb819b8ed091cd9a5e92b9) previously selected top-level `MAJOR_TYPE_ARCHIVE` and emitted canonical video links; [2025-05-12 metadata correction](https://github.com/DIYgod/RSSHub/commit/b247c9dab27b073881d3ba3798ffbbd8d3c20229) restored cover/description. This is a useful structured-adapter precedent, not a reason to downgrade the entire service. That fallback is absent in the current handler.
- [2025-11-03 header correction](https://github.com/DIYgod/RSSHub/commit/8d560d18f4646227c2e21fca8b9ec62831483f62) changed API Referer/Origin. [2026-05-05 browser integration](https://github.com/DIYgod/RSSHub/pull/21913) retained video publication metadata; its automatic live check still recorded 412/503, illustrating that integration does not guarantee upstream access.
- [2026-05-06 browser correction](https://github.com/DIYgod/RSSHub/commit/759551073c73b1b12cb354fda029cc84a3342652) waits before one video-page navigation and distinguishes non-200 responses. The latest path-specific change, [2026-10-02 MSW update](https://github.com/DIYgod/RSSHub/commit/3bc1cc248d1cf8d920f32af0bac3581470e867ed), changes a TypeScript assertion to an annotation; it provides no runtime `-352` remedy.

Previously supplied deployed-code evidence already contained the current API/browser fallback, configured-cookie insertion and 45/90-second limits. This research did not read the NAS image anew, so an exact deployed/upstream byte comparison remains the operator's responsibility. There is no source-supported claim here that pulling latest will fix the failure.

## Remote-browser protocol configuration

The operator subsequently identified a remote-browser protocol mismatch. The public implementation confirms these exact mappings; `PLAYWRIGHT_DRIVER_ENDPOINT` is not a supported key:

| Environment configuration | Effective field and connection method |
| --- | --- |
| `PLAYWRIGHT_CDP_ENDPOINT` | `playwrightCDPEndpoint`; `chromium.connectOverCDP`; highest priority. |
| `PLAYWRIGHT_WS_ENDPOINT` | `playwrightWSEndpoint`; `chromium.connect`; used when CDP is absent. |
| `PUPPETEER_WS_ENDPOINT` | Compatibility alias for the WS field when `PLAYWRIGHT_WS_ENDPOINT` is unset; it does not select CDP automatically. |

Browserless documents `/chromium`, `/chrome` and `/` as CDP paths, and `/chromium/playwright` as the native Playwright path. A CDP path configured through the WS alias selects the wrong protocol. A minimal candidate is configuring the existing CDP service URL through `PLAYWRIGHT_CDP_ENDPOINT`, retaining the private token and older alias unchanged. An alternative native endpoint requires compatible client/server Playwright versions. Both are configuration candidates; neither requires changing video items, dates or GUIDs. [RSSHub configuration](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/config.ts), [connection helper](https://github.com/DIYgod/RSSHub/blob/f9d63f3da1b5145930fd3fcdccf8e205985a4040/lib/utils/playwright.ts), [Browserless protocol documentation](https://docs.browserless.io/baas/advanced-configurations/playwright-customizations).

Playwright's `connect` default timeout is unlimited, while `connectOverCDP` defaults to 30 seconds. RSSHub passes no connection timeout and schedules its close timer only after connection/context creation finishes. Thus the route's browser timers do not bound a stalled initial handshake. This is consistent with the operator's consumer timeout, but live RED/GREEN belongs to the operator. [Playwright connection reference](https://playwright.dev/docs/api/class-browsertype#browser-type-connect).

Before selecting CDP, test the actual RSSHub helper's isolated context creation, cookie insertion and request interception with benign local data. Browserless notes that a newly created CDP context may not inherit default-context launch/proxy settings. Verify existing proxy behavior with safe metadata as well as the connection itself, then perform the single authorized video canary. Do not attribute an eventual provider challenge to a still-unproven handshake failure or claim that a protocol correction removes provider verification.

## Smallest next validation matrix

| Gate | Bounded evidence required | Acceptance condition |
| --- | --- | --- |
| Existing video route | One normal-cache request; classify API versus browser result using sanitized status/business-code metadata. Record cache age. | Valid nonempty feed with actual canonical video IDs and dates; distinguish cached from upstream success. |
| Structured dynamic candidate | Reuse one authorized timeline result, inspect item type/major type/author ID/original-post presence privately. Compare overlapping uploads with existing stored records. | Only top-level original uploads by the requested publisher; no text, image, article, live or forwarded items; canonical BV/AV identity and publication date match verified samples. |
| Completeness | Count original uploads in the returned window and note pinned posts/mixed timeline displacement. | Clearly bounded window; no assertion that a mixed timeline contains all latest uploads. Missing required fields must fail or be excluded with explicit aggregate accounting. |
| Limited repeat | At most one later serial sample through normal caching after its ordinary refresh interval. Stop on a verification challenge. | Report both sample outcomes and cache/upstream coverage; do not promise permanent availability. |
| Persistence | Before/after hashes/counts of existing Feed/Subscription/Entry/UserEntryState/bookmark identities, and a single tracked refresh if a candidate passes review. | Existing records unchanged, no duplicate representations of overlapping videos, new entries only for verified new videos. |

If an implementation is authorized after those observations, the narrow maintainable direction is a route-scoped structured fallback that preserves the upload feed contract. Require TDD fixtures for original upload, forwarded upload, text/image/article/live items, absent metadata, invalid dates/IDs, repeated video ID and an empty upload window. Use an inspectable helper and fail-closed compiled-route binding; retain upstream cache/browser/proxy behavior. This is a proposal, not implemented or live verified.

Local Glean's `RSSHubService._match_builtin_rules` currently maps any publisher space URL to dynamic then video without distinguishing `/video`; the worker adds those candidates after the subscribed URL. That explains why a mixed dynamic response can stop fallback. Avoid changing this global policy as part of a one-source adjustment without separate tests and review.

## Verification and reviewer focus

- Official source/history requests only; no Bilibili API or NAS requests were made.
- Repository edits are limited to this research handoff; six original WIP files are untouched.
- Documentation validation and whitespace verification are recorded in the generator report.
- Evaluator should independently verify route parameters, forwarded-content behavior, ID/date differences and the absence of a proven current replacement. Production canary and persistence acceptance remain with the operator under the contract.
