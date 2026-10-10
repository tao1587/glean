# Translation reliability repair handoff

## Reproduced cause and live evidence

- NAS fixed-text canary (`Hello world`, en → zh-CN) through Google failed with `TooManyRequests` in 2,044 ms. The same canary through configured MTran succeeded in 478 ms, with a changed/nonempty result containing Chinese characters. No article text, tokens or user IDs were exported.
- Read-only aggregate user settings show one account with **no explicit provider preference** (previously defaulted to Google), and one account explicitly selecting MTran. The automatic account has no custom translation model/base URL/API key; the explicit MTran account has a custom URL and no model/key.
- `MTRAN_SERVER_URL` is configured with HTTP/port 8989 and no embedded URL credentials. The prior audited HTTP 502 correlates with Google rate limiting, not the MTran byte-limit fix.
- No NAS user settings, files, containers or deployment configuration were changed by this generator. The root owns rollout and post-rollout API canaries.

## What changed

- Unset/null provider preference uses configured MTran; without a configured local service it retains Google as the default. Explicit Google/MTran/DeepL/OpenAI choices remain explicit. MTran no longer silently switches to Google after failures, and paid-provider missing keys produce a configuration error instead of changing provider.
- Automatic ignores stale per-user base URL/model/API key from previous providers, using only the server's MTran defaults. Both missing and explicit-null preferences are covered; existing stored dictionaries remain untouched. Explicit MTran continues to honor custom configuration.
- Removed synchronous MTran availability preflight and the unused cross-provider fallback wrapper. API provider creation and translation now run together inside the guarded thread operation, so factory failures cannot block the event loop or escape as an unhandled 500.
- Google has a 60-second per-process cooldown after `TooManyRequests`. One lock serializes upstream requests, including concurrent callers/batch chunks, so callers already waiting do not issue additional Google requests after the first limit response. API returns 429 with a bounded `Retry-After` and useful retry/settings guidance.
- MTran upstream 429 preserves numeric Retry-After (bounded to 1–300 seconds, otherwise 60). MTran batch outages, transport failures and limits fail immediately rather than multiplying a failed batch into individual requests. Existing successful payload splitting, exact JSON byte sizing, language resolution, ordering and compatibility parsing remain intact.
- API validates provider result types/counts before merging or persisting cache. Malformed responses return controlled 502 without partial writes. Google separator loss now fails rather than inventing empty successful translations. Generic errors return stable text without embedding raw provider exceptions or URLs.
- Worker creates the selected provider inside its existing guarded translation flow after loading the persisted job record, so missing configuration ends in `failed` instead of stranding `pending`.
- Translation settings show **Automatic / 自动** for unset preferences, with “Use the server's default translation service / 使用服务器默认翻译服务”. Saving an unrelated option preserves null automatic selection; explicitly chosen providers remain selected. EN/ZH missing-key copy no longer promises a Google fallback.
- Corrected an existing settings bug: an MTran account with no model would save `gpt-4o-mini` when changing an unrelated option. MTran now defaults to an empty optional model, while OpenAI retains its own default. Returning to Automatic clears provider-specific configuration from the submitted preference.

## Files touched

- `backend/packages/core/glean_core/services/translation_providers.py`
- `backend/packages/core/tests/test_translation_providers.py`
- `backend/apps/api/glean_api/routers/entries.py`
- `backend/apps/api/tests/test_translation_reliability.py`
- `backend/apps/worker/glean_worker/tasks/translation.py`
- `backend/apps/worker/tests/test_translation_worker.py`
- `frontend/apps/web/src/components/tabs/TranslationTab.tsx`
- `frontend/apps/web/src/__tests__/components/TranslationTab.test.tsx`
- `frontend/packages/types/src/models.ts`
- `frontend/packages/i18n/src/locales/{en,zh-CN}/settings.json`

The original six user-owned dirty reader/deployment-document files were not edited by this generator.

## Verification run

Backend tests ran with `TEST_DATABASE_URL=postgresql+asyncpg://glean:devpassword@localhost:5433/glean_test`, `UV_CACHE_DIR=/private/tmp/glean-uv-cache`, `uv run --no-sync`, `-o addopts='' --import-mode=importlib`.

- RED: five provider failures proved wrong default choice, silent MTran switching, missing Google cooldown/concurrency control and MTran outage fanout; two more tests proved missing paid keys silently switched to Google.
- RED: four API failures proved Google rate limiting became 502, provider-factory exceptions escaped as 500 and malformed result shape/count escaped as 500.
- RED: worker missing-key test reproduced a pending record being abandoned before guarded status handling. MTran 429 test reproduced a generic 502. Google lost-separator test reproduced empty-result success.
- RED: Automatic settings UI was absent; saving another setting wrote Google instead of null. Saving an explicit MTran account's unrelated setting wrote an OpenAI model.
- RED: two automatic-factory cases (missing/null preference plus stale paid-provider URL/key/model) resolved the old paid-provider URL instead of the configured MTran URL; the fix ignores those fields without changing stored preferences.
- GREEN final: `pytest packages/core/tests/test_translation_providers.py apps/api/tests/test_translation_reliability.py apps/worker/tests/test_translation_worker.py`: **60 passed**. Includes previous MTran byte-boundary/UTF-8/escaping/splitting/language/order regressions and cache-only, cache-hit/duplicate/empty-input, malformed-cache-write and retry-amplification checks.
- `pnpm --filter @glean/web exec vitest run src/__tests__/components/TranslationTab.test.tsx`: **4 passed**.
- `pnpm --filter @glean/api-client test`: **105 passed**. The SDK already retries only idempotent GET 429; translation POST requests are not retried automatically, and article translation displays returned detail strings.
- `pnpm exec turbo run typecheck --force`: **7 packages passed, all freshly executed**.
- `pnpm --filter @glean/web build`: **passed** (existing chunk-size warning).
- Targeted backend Ruff and format checks: **passed**; targeted frontend ESLint and Prettier: **passed**.
- Targeted backend Pyright over provider/API/worker modules: **0 errors, 25 existing unknown-type warnings**.
- `git diff --check`: **passed**.

## Rollout verification and limits

- After root rollout, require an authenticated actual `/api/entries/translate-texts` POST for the automatic account with fixed non-sensitive text plus an empty item. Verify HTTP 200, result count/order, changed/nonempty Chinese output and preserved empty result; return booleans/counts only. The pre-rollout canary proves the MTran provider works but is not a claim that the new API code is already deployed.
- Verify explicit provider selections/user settings counts are unchanged. No provider preference needs a database write for this repair.
- Google remains externally limited; explicit Google should return controlled 429/cooldown when limited. This repair does not bypass Google's limits or automatically switch an explicit Google choice.
- Cooldown/serialization is per Python process, not a distributed source-IP limiter across API/worker/other applications. Each process allows at most one concurrent Google call and suppresses new calls for 60 seconds after its own limit response.
- MTran remains subject to upstream availability/model support. Batch compatibility fallback remains for parseable non-outage situations, but network/429/5xx failures do not fan out.
- Root owns documentation of the new server default and deployment markers, plus the independent evaluator's acceptance and final online checks.
