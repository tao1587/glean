# Feature Change Log

This document tracks feature-level additions and optimizations over time.

## 2026-02-20 Baseline (compare `origin/main...HEAD`)

### Scope
- Branch: `feat/local-docker-release-bundle`
- Compare base: `origin/main`
- Ahead commits: `72`
- Behind commits: `0`
- Diff size: `145 files changed`, `+16140/-2436`

### Feature-Level Changes
1. Reader and list interaction upgrades
- Keyboard navigation between entries.
- Inline original article view with iframe fallback and quick external open.
- Mobile reader navigation and toolbar/list UX improvements.
- Cross-device list anchor persistence and auto-mark-read threshold.

2. Translation system expansion
- Added configurable translation providers (Google/DeepL/OpenAI) and MTranServer support.
- Added paragraph translation cache and immersive bilingual display.
- Added viewport-based sentence-level translation.
- Added pre-block translation toggle for ambiguous content.
- Improved translation persistence, fallback behavior, and list language policy.

3. Recommendation and behavior signal pipeline
- Implemented implicit feedback pipeline.
- Added configurable engagement tracking and recency decay for ranking.

4. Discovery module
- Added discover sources end-to-end routes and UI.
- Added per-user Tavily API key support.

5. Feed refresh and operations
- Unified feed refresh flow and added fetch attempt/success tracking.
- Added admin refresh controls and status polling.
- Worker ingestion robustness fixes (ingested_at + rollback on failure).

6. Import/export and source compatibility
- Added RSSHub auto-fallback flow.
- Fixed OPML export route.
- Improved OPML re-import behavior (reuse folders by name and reorganize subscriptions).

7. Bookmarks information architecture
- Refactored bookmarks page from grid/list switch to source-group board + filtered results list.

8. Admin capabilities
- Added user password reset and subscription import features.

9. Auth and security
- Added/enhanced OIDC support (PKCE, nonce, rate limiting, error handling).
- Merged DB migration heads for OIDC + translation paths.

10. MCP and API token related enhancements
- Improved MCP server configuration and proxy/search support.
- Added/updated API token management and related tests.

11. Build, CI, and Docker engineering improvements
- Fixed electron-builder publish safeguards.
- Fixed CI issues around translation/lint/test flows.
- Optimized backend Docker layer caching and build cache usage.

---

## Update Protocol (for future entries)
When adding a new section:
- Use heading: `## YYYY-MM-DD (compare <base>...<branch_or_HEAD>)`
- Keep only feature-level meaning (user-visible or business capability impact).
- Group by domain (Reader, Translation, Discovery, Admin, etc.).
- Avoid listing raw commit messages directly.

### Entry Template

```md
## YYYY-MM-DD (compare <base>...<target>)

### Scope
- Branch:
- Compare base:
- Ahead commits:
- Behind commits:
- Diff size:

### Feature-Level Changes
1. <Domain>
- <Change>
- <Change>

2. <Domain>
- <Change>
```
