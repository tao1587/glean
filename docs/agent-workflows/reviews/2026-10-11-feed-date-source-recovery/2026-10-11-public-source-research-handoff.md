# Public source identity and full-text research handoff

Research date: 2026-10-11. This pass uses official publisher/author pages, their advertised public links and bounded ordinary webpage requests. It does not access the NAS, inspect private subscriptions, fetch account-personal feeds, subscribe anything or alter application code/data.

## Confirmed public identities and feed pointers

These are **publisher-advertised pointers**, not a claim that this generator validated XML, GUID overlap, stored ownership or every feed's freshness. Root owns those checks before any subscription/address mutation.

| Requested source | Official identity/page | Advertised RSS pointer | Scope/access finding |
|---|---|---|---|
| Interconnects | [Interconnects AI](https://www.interconnects.ai/about), operated by Nathan Lambert; author [homepage](https://natolambert.com/) links the publication | `https://www.interconnects.ai/feed`, read from homepage RSS autodiscovery | AI newsletter. Publisher's About page describes paid essays/roundups alongside public material; do not promise all posts are freely readable. |
| 莫尔索 AI 周刊 | [AI 周刊](https://liduos.com/weekly) on 莫尔索随笔; author [morsoli](https://github.com/morsoli) links back to liduos.com | Homepage RSS anchor is `https://liduos.com/rss.xml`; category/head autodiscovery uses the same `/rss.xml/` URL | This is an author-wide pointer, **not a proven weekly-only feed**. No separate category/tag RSS is advertised on the examined weekly page. Root must establish whether the actual items include `/weekly/` and whether a broader author feed meets the user's requested scope. Do not invent `/weekly/rss.xml` or a tag route. |
| Claude.dev | [claude.dev](https://claude.dev/) identifies itself as Anthropic developers' writing; [Anthropic privacy documentation](https://privacy.claude.com/en/articles/10023541-what-cookies-does-anthropic-use) also names this domain | `https://claude.dev/rss.xml`, advertised in the official homepage and article HTML | Public developer articles, not the unrelated older “Claude Dev” editor project. Full article text is directly available through official HTML/Markdown links; see the focused evidence below. |
| 晚点聊 | [晚点聊 LateTalk](https://podcast.latepost.com/), a podcast produced by 晚点 LatePost; [official subscribe page](https://podcast.latepost.com/subscribe) | `https://podcast.latepost.com/rss`; the subscribe page also advertises `/json` | Podcast episodes/audio/show notes; do not replace it with a LatePost news/WeChat feed. Show notes or an audio enclosure are not evidence of a full written transcript. |
| Every / existing Superorganizers | [Superorganizers](https://every.to/superorganizers), a specific Every publication | Its official HTML advertises `https://every.to/superorganizers/feed.xml` | Preserve this publication's scope. An older `/superorganizers/feed` may remain an alias; compare real XML/GUID overlap before changing it. Do not substitute Every's general homepage/newsletters. The examined Newest index begins with 2025-05-06, which is evidence of visible archive freshness, not a formal closure announcement. |
| Existing Lightcone | [Lightcone Podcast official Spotify profile](https://creators.spotify.com/pod/profile/lightconepodcast/) (old podcasters.spotify.com page redirects here); [YC official library](https://www.ycombinator.com/library/MV-alexandr-wang-building-scale-ai-transforming-work-with-agents-competing-with-china) identifies its Lightcone programme | Official profile still advertises `https://anchor.fm/s/f58d3330/podcast/rss` | This matches the already identified podcast. A website-host redirect does not establish an RSS migration. Do not replace it with YC's general blog, broader podcast/library feed or a same-named blog. Some YC library episode pages provide transcripts, but that does not prove the podcast RSS contains every transcript. |
| The Batch | [DeepLearning.AI The Batch](https://www.deeplearning.ai/the-batch), with [official About page](https://www.deeplearning.ai/the-batch/about) | No official RSS link was discovered in the examined landing/About HTML | The existing RSSHub route is a third-party adapter, not a publisher-native feed. No verified replacement is established by this research. Root should verify that route against the official archive before accepting an “expired URL” diagnosis. |
| AI 开发者日报 | [Official site](https://ainews.liduos.com/) explicitly says it is maintained by 莫尔索 and links to liduos.com | `https://ainews.liduos.com/rss.xml`, advertised in the official homepage head | Identity matches the named Chinese developer digest. The currently visible index's first post is 2026-09-14. A quiet publication/date window does not itself establish a broken address. Its public sample page has substantial text. |

## Claude.dev: summary versus real body

- The official [article page](https://claude.dev/blog/building-effective-agent-automations/) publishes a named author, 2026-10-08 publication date, nine-minute reading time and long public sections. A bounded direct HTML request returns HTTP 200, approximately 127 KB of HTML. No `<article>` element is present in that sample, so an extractor relying on that tag alone could miss the body. This is a diagnostic clue, not a proved cause of the stored short content.
- The article's **Copy markdown** control and alternate link explicitly point to [the Markdown body](https://claude.dev/blog/building-effective-agent-automations.md). A direct anonymous request returns **HTTP 200, `text/markdown`, 19,837 bytes, 202 nonempty lines and 21 Markdown headings**. No login or paid-content bypass was used. This proves substantial public article content exists for this sample.
- [Official llms.txt](https://claude.dev/llms.txt) returns HTTP 200 and lists article Markdown URLs. The `.md` form is publisher-advertised; use each real article's link/canonical association rather than synthesizing arbitrary URLs or treating the homepage's marketing text as an article.
- Another advertised example is [A harness for every task](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code.md). This research did not copy article bodies into repository documents.
- Root should compare a small current RSS sample against these public canonical identities, then evaluate the real extractor and any narrow existing-entry full-text repair. Preserve existing publication dates, GUIDs and unrelated content; short RSS descriptions alone do not prove a paywall.

Four current official homepage article links for canonical matching:

| Article identifier | Public canonical HTML URL |
|---|---|
| Automations walkthrough (2026-10-08) | `https://claude.dev/blog/building-effective-agent-automations/` |
| Cloud-session guide (2026-10-06) | `https://claude.dev/blog/claude-code-in-the-cloud/` |
| Mods introduction (2026-10-01) | `https://claude.dev/blog/getting-started-with-claude-code-mods/` |
| Evaluation/hillclimbing guide (2026-09-28) | `https://claude.dev/blog/automating-eval-design-and-hillclimbing/` |

## Weekly scope and cached-search limitation

The direct official [weekly index](https://liduos.com/weekly) currently begins with Vol.120, then 119/118/117. Its newest `<time datetime>` is **2026-10-04T08:00:00.000Z**, displayed as October 4, 16:00. The [Vol.120 body](https://liduos.com/weekly/the-weekly-gradient-120) is public HTTP 200, with roughly 7,184 article-text characters and 24 headings. Search-tool cached views showed Vol.115/August 9; those stale cached results must not be used to declare the weekly inactive.

The weekly page's only RSS autodiscovery still points to the author-wide `/rss.xml/`. An “edit this page” link points to an author GitHub repository, but that repository/raw source was unavailable (404), so its RSS generation/collection inclusion could not be independently proved from author code. No weekly-specific feed was guessed or probed.

The [2026-09-14 developer daily sample](https://ainews.liduos.com/post/2026-09-14) returns public HTTP 200 with roughly 17,109 main-text characters. The daily and weekly are distinct publications on different paths/hosts, despite sharing an author.

## Paid content and remaining decisions

- Interconnects explicitly advertises paid essays and paid roundup access on its [About page](https://www.interconnects.ai/about). Public RSS access cannot be assumed to unlock those posts.
- Every's [official account help](https://help.every.to/en/articles/13199150-navigating-your-every-account) describes an account-personal RSS URL; its [pricing page](https://every.to/pricing) distinguishes free newsletters from paid article/archive access. Only the account's authorized feed/access may provide paid material. Personal tokenized URLs belong in private authorized configuration, never public handoffs.
- Publisher-advertised URLs are research candidates; Root verifies HTTP/XML/entries/date/GUID/canonical overlap and subscriber ownership. An already successful old feed must not be changed merely because the user's referenced external report called it obsolete.
- The user subsequently authorized independent address research and removal of publications that no longer update. Root's contract requires at least six months without new publication plus official corroboration, while preserving historical data. A weekly-native RSS pointer remains unverified; the follow-up below identifies supported alternatives without claiming their deployed availability. No changes were made to source identities, private inventories, subscriptions or the six original local files.

## Follow-up: programme activity and weekly delivery

The following checks were ordinary anonymous GETs of public official pages, not RSSHub/feed probes or NAS requests. Requests returned HTTP 200 unless a limitation is stated. Root retains responsibility for deployed-route XML, dates, identity/GUID overlap and ownership verification before changing subscriptions.

### Lightcone continues on its official video channel

The current [YC Library](https://www.ycombinator.com/library) has a **Lightcone Podcast** carousel with recent episodes. The official [Open Models episode page](https://www.ycombinator.com/library/Ye-open-models-change-the-economics-of-ai) embeds public page metadata identifying `series_name=Lightcone`, `carouselName=Lightcone Podcast`, the YouTube video `rY0wnfFHYbs` and `created_at=2026-09-04T14:00:10.000Z`. Its ordinary [official YouTube watch page](https://www.youtube.com/watch?v=rY0wnfFHYbs) independently reports `publishDate` and `uploadDate` of **2026-09-04T07:00:10-07:00**, the same UTC timestamp, with owner **Y Combinator**. This is a new programme publication roughly 37 days before the research date, not merely an old article modification.

The [official YC channel playlists page](https://www.youtube.com/@ycombinator/playlists) lists **Lightcone Podcast** with playlist ID `PLQ-uHSnFig5Ob4XXhgSK26Smb4oRhzFmK`. Its [public playlist](https://www.youtube.com/playlist?list=PLQ-uHSnFig5Ob4XXhgSK26Smb4oRhzFmK) therefore provides the same programme's current video delivery identity. The old Anchor audio RSS being stale is insufficient to conclude that Lightcone itself stopped publishing. Do not unsubscribe it under a whole-programme inactivity claim.

RSSHub's [official playlist route source](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/youtube/playlist.ts) supports `/youtube/playlist/:id/:embed?`, with optional `YOUTUBE_KEY` and an alternate YouTube client path. A documented candidate for Root to verify is `/youtube/playlist/PLQ-uHSnFig5Ob4XXhgSK26Smb4oRhzFmK`. It is a video-playlist adapter; the source declares no podcast support, so it must not be described as a migrated audio RSS or promised to contain audio enclosures/transcripts. This generator did not request that endpoint or validate the deployed route.

### Superorganizers has no verified new issue after May 2025

The [official Newest archive](https://every.to/superorganizers?sort=newest) still begins with the [Craig Mod interview](https://every.to/superorganizers/walking-through-productivity-with-craig-mod), published **2025-05-06**. It corroborates a long interval without a new issue in this particular publication. A [March 2025 interview](https://every.to/superorganizers/he-built-his-own-encyclopedia-he-says-learning-everything-isn-t-everything) displays **Updated May 11, 2026**; that is a revision of an old issue, not evidence of a newly published newsletter issue. No formal closure announcement was found in this bounded research. Any removal should be described as the user's requested cleanup of a long-inactive new-issue subscription, not a claim that Every as a whole or its archive is abandoned.

### A supported weekly-only HTML transformation exists

The direct [weekly index](https://liduos.com/weekly) currently has four entries. On the actual HTML, `main > ul > li` matches exactly four cards, each containing one `a[href^="/weekly/the-weekly-gradient-"]` and a `time[datetime]`. The dates are October 4, September 20, September 6 and August 30, 2026. The [latest body](https://liduos.com/weekly/the-weekly-gradient-120) is contained in `article#article`; its text has approximately 7,184 characters. These selectors target the weekly publication, without substituting the author's broader posts collection.

RSSHub's [official HTML transformation source](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/rsshub/transform/html.ts) defines `/rsshub/transform/html/:url/:routeParams`. Both path parameters require URI encoding; rules are a query-string value. It supports CSS extraction, a publication-date attribute and optional linked-page content, with a 20-item cap. The verified page supports this candidate rule set:

| Parameter | Candidate value |
|---|---|
| `url` | `https://liduos.com/weekly` |
| `title` | `莫尔索 AI 周刊` |
| `item` | `main > ul > li` |
| `itemTitle` / `itemLink` | `a[href^="/weekly/the-weekly-gradient-"]` |
| `itemPubDate` / `itemPubDateAttr` | `time` / `datetime` |
| `itemContent` (optional) | `article#article` |

The route is gated by **`ALLOW_USER_SUPPLY_UNSAFE_DOMAIN=true`**. Root subsequently corrected an initial configuration lookup and verified that this gate is **already enabled** on the existing instance; no setting change or new wrapper is needed merely to enable the weekly candidate. To bound the existing route's simultaneous child-page requests, Root can use `main > ul > li:nth-child(-n+4)`, limiting this recipe to the four verified newest cards. Optional full-text extraction fetches linked articles; the original handler uses `Promise.all`, not concurrency two. No native weekly RSS address was invented, and no generic-transform endpoint was probed by this generator.

### Daily recipe metadata boundary

The official [daily homepage](https://ainews.liduos.com/) currently has one title-bearing link matching `main a[href^="/post/"][title]`, pointing to the [September 14 edition](https://ainews.liduos.com/post/2026-09-14). The sample article has exact matching `og:url`, `og:title=AI 开发者日报 2026-09-14` and `article:published_time=2026-09-14T00:00:00.000Z`. Its head has no canonical link or JSON-LD. The publisher supplies a midnight timestamp; it must not be described as an independently verified clock time of publication.

The substantive body is `main .prose[role="tabpanel"][data-state="active"]` (approximately 16,603 text characters). The inactive prose panel is an empty podcast panel. This body selector excludes the broader card/navigation shell. The homepage's matching titled anchor has no publication-date attribute, and the homepage has no `<time>` or publication metadata.

The existing HTML transformation's `itemContent` step changes only `description`; it does **not** merge the child article's `article:published_time` into the feed item. Therefore the homepage recipe can restore body content but cannot, by itself, establish a dated daily feed. Using the single known article as the route input could extract its advertised title, identity and date, but would remain a fixed edition instead of automatically selecting future daily editions. Root must verify this boundary before choosing an address repair; do not claim a fully dated automatic feed from a homepage recipe that only fills content.

Root stopped the proposed broader fixed-source wrapper after verifying the existing gate. At that point this generator had not created adapter, patcher, test or fixture files, installed dependencies or changed Docker configuration. Root subsequently authorized only the necessary daily publication-date recipe; its separate [implementation handoff](2026-10-11-ainews-date-implementation-handoff.md) records tests and the narrowed boundary. The weekly continues through the original generic route.

### Remaining freshness limits

- The Batch and the developer daily have no six-month inactivity evidence in this task. An empty feed or a stale third-party adapter does not prove that either publication stopped. Keep those decisions with Root's official-page and actual-feed verification.
- Root separately reports that the current Glean extractor retrieves substantial Claude.dev HTML body content. The public Markdown research establishes an alternate official body format, but does not justify an extraction-code change when the existing extractor already succeeds.
- This follow-up adds public evidence only. It does not mutate subscriptions, NAS configuration, source URLs, old articles, application code or any of the six original local edits.
